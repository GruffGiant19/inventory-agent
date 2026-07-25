import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/orders/[id] — single order with items + conversations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;

  const [orderResult, conversationsResult] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        *,
        order_items (
          *,
          products ( id, name, price, photo_url )
        )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("conversations")
      .select("*")
      .eq("customer_phone", (
        await supabase.from("orders").select("customer_phone").eq("id", id).single()
      ).data?.customer_phone ?? "")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  if (orderResult.error) {
    return NextResponse.json({ error: orderResult.error.message }, { status: 404 });
  }

  return NextResponse.json({
    ...orderResult.data,
    conversations: conversationsResult.data ?? [],
  });
}

// PATCH /api/orders/[id] — update order status or address
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await supabase
    .from("orders")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
