"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OrderWithItems } from "@/lib/supabase/types";

const STATUS_OPTIONS = [
  "all",
  "pending",
  "awaiting_address",
  "confirmed",
  "dispatched",
  "cancelled",
];

export default function OrdersPage() {
  const supabase = createClient();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          *,
          products ( id, name, price, photo_url )
        )
      `)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    setOrders((data as OrderWithItems[]) ?? []);
    setLoading(false);
  }

  const filtered = orders.filter((o) => {
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const matchesSearch =
      o.customer_phone.includes(search) ||
      o.id.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" /> Loading orders…
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Orders</div>
          <div className="page-subtitle">{orders.length} orders total</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="search-bar">
            <div className="search-input-wrapper">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="search-input"
                placeholder="Search phone or order ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <div className="empty-state-title">No orders found</div>
                <div className="empty-state-text">
                  {search || statusFilter !== "all"
                    ? "Try adjusting your filters."
                    : "Orders placed via WhatsApp will appear here."}
                </div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Address</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                    >
                      <td>
                        <div style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "var(--color-blue-light)" }}>
                          {order.customer_phone}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                          {order.order_items
                            .map(
                              (item) =>
                                `${item.quantity}× ${item.products?.name ?? "Unknown"}`
                            )
                            .join(", ")}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        GHS {Number(order.total_price).toFixed(2)}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "var(--color-muted)", maxWidth: "180px" }}>
                        {order.delivery_address ? (
                          <span style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}>
                            {order.delivery_address}
                          </span>
                        ) : (
                          <span style={{ color: "rgba(122,172,204,0.4)", fontStyle: "italic" }}>
                            Not provided
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--color-muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {new Date(order.created_at).toLocaleDateString()}{" "}
                        <span style={{ opacity: 0.6 }}>
                          {new Date(order.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {status.replace("_", " ")}
    </span>
  );
}
