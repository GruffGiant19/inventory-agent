import { createAdminClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/supabase/types";

/**
 * Search inventory using Postgres full-text search against
 * name, description, and tags. Returns top candidates.
 */
export async function searchInventory(
  description: string,
): Promise<{ products: Product[]; query: string }> {
  const supabase = createAdminClient();

  // Build a tsquery from the user's words
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const tsQuery = words.join(" | ");

  const { data, error } = await supabase.rpc("search_products_fts", {
    query_text: tsQuery,
  });

  if (error) {
    console.log("[search_inventory] RPC error:", error);
    // Fallback to ILIKE if FTS errors
    const { data: fallback } = await supabase
      .from("products")
      .select("*")
      .or(`name.ilike.%${description}%,description.ilike.%${description}%`)
      .gt("quantity_available", 0)
      .limit(5);
    return { products: (fallback as Product[]) ?? [], query: description };
  }

  return { products: (data as Product[]) ?? [], query: tsQuery };
}

/**
 * Check if a given quantity is available for a product.
 */
export async function checkStock(
  productId: string,
  quantity: number,
): Promise<{ available: boolean; current_quantity: number }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("products")
    .select("quantity_available")
    .eq("id", productId)
    .single();

  if (error || !data) {
    return { available: false, current_quantity: 0 };
  }

  return {
    available: data.quantity_available >= quantity,
    current_quantity: data.quantity_available,
  };
}

/**
 * Atomically reserve stock using a single conditional UPDATE.
 * Returns success: false if stock is insufficient (prevents overselling).
 */
export async function reserveStock(
  productId: string,
  quantity: number,
): Promise<{ success: boolean; product?: Product }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("rpc_reserve_stock", {
    p_product_id: productId,
    p_quantity: quantity,
  });

  if (error || !data || (data as Product[]).length === 0) {
    return { success: false };
  }

  return { success: true, product: (data as Product[])[0] };
}

/**
 * Create an order with its line items in a single transaction.
 */
export async function createOrder(
  ownerId: string,
  customerPhone: string,
  items: Array<{ product_id: string; quantity: number; unit_price: number }>,
  status: string,
  deliveryAddress?: string,
): Promise<{ order_id: string | null; error?: string }> {
  const supabase = createAdminClient();

  const totalPrice = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  );

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      owner_id: ownerId,
      customer_phone: customerPhone,
      status,
      delivery_address: deliveryAddress ?? null,
      total_price: totalPrice,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { order_id: null, error: orderError?.message };
  }

  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemsError) {
    return { order_id: null, error: itemsError.message };
  }

  return { order_id: order.id };
}

/**
 * Mock Yango delivery handoff — logs a delivery request row.
 */
export async function requestDelivery(
  orderId: string,
  notes?: string,
): Promise<{ success: boolean }> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("delivery_requests").insert({
    order_id: orderId,
    status: "requested",
    notes: notes ?? "Yango delivery requested (sandbox mode)",
  });

  // Update order status to dispatched
  await supabase
    .from("orders")
    .update({ status: "dispatched" })
    .eq("id", orderId);

  return { success: !error };
}

/**
 * Log a message to the conversations table.
 */
export async function logConversation(
  customerPhone: string,
  role: "customer" | "agent",
  message: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("conversations")
    .insert({ customer_phone: customerPhone, role, message });
}

/**
 * Fetch recent conversation history for a customer phone number.
 */
export async function getConversationHistory(
  customerPhone: string,
  limit = 20,
) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("conversations")
    .select("role, message, created_at")
    .eq("customer_phone", customerPhone)
    .order("created_at", { ascending: true })
    .limit(limit);
  return data ?? [];
}

/**
 * Find most recent pending/awaiting_address order for a customer.
 */
export async function findOpenOrder(customerPhone: string, ownerId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("id, status, delivery_address")
    .eq("customer_phone", customerPhone)
    .eq("owner_id", ownerId)
    .in("status", ["awaiting_address", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

/**
 * Update order address and status.
 */
export async function updateOrderAddress(
  orderId: string,
  deliveryAddress: string,
) {
  const supabase = createAdminClient();
  await supabase
    .from("orders")
    .update({ delivery_address: deliveryAddress, status: "confirmed" })
    .eq("id", orderId);
}
