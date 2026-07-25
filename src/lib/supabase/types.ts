export type OrderStatus =
  | "pending"
  | "confirmed"
  | "awaiting_address"
  | "dispatched"
  | "cancelled";

export interface Product {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  tags: string[];
  price: number;
  quantity_available: number;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  owner_id: string;
  customer_phone: string;
  status: OrderStatus;
  delivery_address: string | null;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface Conversation {
  id: string;
  customer_phone: string;
  role: "customer" | "agent";
  message: string;
  created_at: string;
}

export interface DeliveryRequest {
  id: string;
  order_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

// Joined types for dashboard views
export interface OrderWithItems extends Order {
  order_items: (OrderItem & { products: Product | null })[];
}

export interface OrderWithConversations extends OrderWithItems {
  conversations: Conversation[];
}
