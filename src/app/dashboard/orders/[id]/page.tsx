"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, OrderItem, Product } from "@/lib/supabase/types";

type FullOrder = {
  id: string;
  customer_phone: string;
  status: string;
  delivery_address: string | null;
  total_price: number;
  created_at: string;
  updated_at: string;
  order_items: (OrderItem & { products: Product | null })[];
  conversations: Conversation[];
};

const STATUS_OPTIONS = [
  "pending",
  "awaiting_address",
  "confirmed",
  "dispatched",
  "cancelled",
];

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadOrder() {
    const res = await fetch(`/api/orders/${params.id}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setOrder(data);
    setLoading(false);
  }

  async function updateStatus(newStatus: string) {
    if (!order) return;
    setUpdatingStatus(true);
    await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadOrder();
    setUpdatingStatus(false);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" /> Loading order…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page-body" style={{ paddingTop: "4rem" }}>
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">Order not found</div>
          <button className="btn-secondary" onClick={() => router.back()} style={{ marginTop: "1rem" }}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn-icon" onClick={() => router.back()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <div className="page-title">Order Detail</div>
            <div className="page-subtitle" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
              {order.id}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            value={order.status}
            onChange={(e) => updateStatus(e.target.value)}
            disabled={updatingStatus}
            style={{
              padding: "0.6rem 0.85rem",
              background: "rgba(0,32,50,0.8)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              color: "var(--color-text)",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <span className={`badge badge-${order.status}`}>
            <span className="badge-dot" />
            {order.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          {/* Order info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Customer & Delivery</span>
              </div>
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <InfoRow label="WhatsApp" value={order.customer_phone} mono />
                <InfoRow
                  label="Delivery Address"
                  value={order.delivery_address ?? "Not provided yet"}
                  italic={!order.delivery_address}
                />
                <InfoRow
                  label="Created"
                  value={`${new Date(order.created_at).toLocaleDateString()} at ${new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                />
                <InfoRow
                  label="Last Updated"
                  value={`${new Date(order.updated_at).toLocaleDateString()} at ${new Date(order.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Order Items</span>
                <span style={{ fontWeight: 700, color: "#fff" }}>
                  GHS {Number(order.total_price).toFixed(2)}
                </span>
              </div>
              <div style={{ padding: "0.5rem 0" }}>
                {order.order_items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.9rem 1.25rem",
                      borderBottom: "1px solid rgba(102,155,188,0.07)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, color: "#fff", fontSize: "0.9rem" }}>
                        {item.products?.name ?? "Unknown product"}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", marginTop: "0.2rem" }}>
                        GHS {Number(item.unit_price).toFixed(2)} × {item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, color: "#fff" }}>
                      GHS {(Number(item.unit_price) * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Conversation thread */}
          <div className="card" style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-header">
              <span className="card-title">💬 WhatsApp Conversation</span>
              <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>
                {order.conversations.length} messages
              </span>
            </div>
            {order.conversations.length === 0 ? (
              <div className="empty-state" style={{ padding: "2rem" }}>
                <div className="empty-state-icon" style={{ fontSize: "2rem" }}>💬</div>
                <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No messages yet</div>
              </div>
            ) : (
              <div className="conversation-thread">
                {order.conversations.map((msg) => (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      className={`message-bubble ${
                        msg.role === "customer" ? "message-customer" : "message-agent"
                      }`}
                    >
                      {msg.message}
                    </div>
                    <div
                      className="message-meta"
                      style={{
                        alignSelf: msg.role === "customer" ? "flex-start" : "flex-end",
                        marginLeft: msg.role === "customer" ? "0.25rem" : undefined,
                        marginRight: msg.role === "agent" ? "0.25rem" : undefined,
                      }}
                    >
                      {msg.role === "customer" ? "📱 Customer" : "🤖 PackBot"} ·{" "}
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
  mono,
  italic,
}: {
  label: string;
  value: string;
  mono?: boolean;
  italic?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-muted)" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "0.875rem",
          color: italic ? "rgba(122,172,204,0.5)" : "var(--color-text)",
          fontFamily: mono ? "monospace" : undefined,
          fontStyle: italic ? "italic" : undefined,
          lineHeight: 1.5,
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
