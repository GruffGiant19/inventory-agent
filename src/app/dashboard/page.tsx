"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order, Product } from "@/lib/supabase/types";

type Stats = {
  totalOrders: number;
  pendingOrders: number;
  totalProducts: number;
  lowStockProducts: number;
  revenue: number;
};

const LOW_STOCK_THRESHOLD = 5;

export default function DashboardOverview() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: orders }, { data: products }] = await Promise.all([
        supabase.from("orders").select("*").eq("owner_id", user.id),
        supabase.from("products").select("*").eq("owner_id", user.id),
      ]);

      const orderList = (orders as Order[]) ?? [];
      const productList = (products as Product[]) ?? [];

      setStats({
        totalOrders: orderList.length,
        pendingOrders: orderList.filter(
          (o) => o.status === "pending" || o.status === "awaiting_address"
        ).length,
        totalProducts: productList.length,
        lowStockProducts: productList.filter(
          (p) => p.quantity_available <= LOW_STOCK_THRESHOLD
        ).length,
        revenue: orderList
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + Number(o.total_price), 0),
      });

      setRecentOrders(
        orderList
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )
          .slice(0, 5)
      );
      setLoading(false);
    }
    loadData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        Loading dashboard…
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-subtitle">
            Your business at a glance
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Orders</div>
            <div className="stat-value">{stats?.totalOrders ?? 0}</div>
            <div className="stat-change">All time</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending / Awaiting</div>
            <div className="stat-value" style={{ color: "#fbbf24" }}>
              {stats?.pendingOrders ?? 0}
            </div>
            <div className="stat-change">Needs action</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Products</div>
            <div className="stat-value">{stats?.totalProducts ?? 0}</div>
            <div className="stat-change">In catalogue</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Low Stock</div>
            <div
              className="stat-value"
              style={{ color: stats?.lowStockProducts ? "#ff8080" : "#34d399" }}
            >
              {stats?.lowStockProducts ?? 0}
            </div>
            <div className="stat-change">Below {LOW_STOCK_THRESHOLD} units</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value" style={{ fontSize: "1.5rem" }}>
              GHS {(stats?.revenue ?? 0).toFixed(2)}
            </div>
            <div className="stat-change">Excluding cancelled</div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Orders</span>
            <a
              href="/dashboard/orders"
              style={{ fontSize: "0.8rem", color: "var(--color-blue-light)", textDecoration: "none" }}
            >
              View all →
            </a>
          </div>
          <div className="table-wrapper">
            {recentOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <div className="empty-state-title">No orders yet</div>
                <div className="empty-state-text">
                  Orders placed via WhatsApp will appear here.
                </div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() =>
                        (window.location.href = `/dashboard/orders/${order.id}`)
                      }
                    >
                      <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                        {order.customer_phone}
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>GHS {Number(order.total_price).toFixed(2)}</td>
                      <td style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
                        {new Date(order.created_at).toLocaleDateString()}
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
