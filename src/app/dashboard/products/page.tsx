"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/supabase/types";

const LOW_STOCK_THRESHOLD = 5;

type ProductFormData = {
  name: string;
  description: string;
  tags: string;
  price: string;
  quantity_available: string;
  photo_url: string;
};

const EMPTY_FORM: ProductFormData = {
  name: "",
  description: "",
  tags: "",
  price: "",
  quantity_available: "",
  photo_url: "",
};

export default function ProductsPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }

  function openAdd() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description,
      tags: product.tags.join(", "),
      price: String(product.price),
      quantity_available: String(product.quantity_available),
      photo_url: product.photo_url ?? "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      price: parseFloat(form.price),
      quantity_available: parseInt(form.quantity_available, 10),
      photo_url: form.photo_url || null,
      owner_id: userId,
    };

    if (editingProduct) {
      await supabase
        .from("products")
        .update(payload)
        .eq("id", editingProduct.id);
    } else {
      await supabase.from("products").insert(payload);
    }

    setShowModal(false);
    await loadProducts();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    await supabase.from("products").delete().eq("id", id);
    await loadProducts();
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" /> Loading products…
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-subtitle">
            {products.length} items in catalogue
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="search-bar">
            <div className="search-input-wrapper">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="search-input"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ width: "auto", padding: "0.65rem 1.25rem" }}
            onClick={openAdd}
          >
            + Add Product
          </button>
        </div>
      </div>

      <div className="page-body">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">
              {search ? "No products match your search" : "No products yet"}
            </div>
            <div className="empty-state-text">
              {search
                ? "Try a different search term."
                : "Add your first product to get started."}
            </div>
          </div>
        ) : (
          <div className="products-grid">
            {filtered.map((product) => {
              const isLow = product.quantity_available <= LOW_STOCK_THRESHOLD;
              return (
                <div
                  key={product.id}
                  className={`product-card ${isLow ? "low-stock" : ""}`}
                >
                  {/* Image */}
                  <div className="product-image">
                    {product.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.photo_url}
                        alt={product.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      "📦"
                    )}
                  </div>

                  {/* Info */}
                  <div className="product-info">
                    <div className="product-name">{product.name}</div>
                    <div className="product-desc">{product.description}</div>
                    {product.tags.length > 0 && (
                      <div className="product-tags">
                        {product.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="product-meta">
                      <div className="product-price">
                        GHS {Number(product.price).toFixed(2)}
                      </div>
                      <div className={`product-stock ${isLow ? "low" : ""}`}>
                        {isLow && "⚠️ "}
                        {product.quantity_available} in stock
                        {isLow && (
                          <span
                            className="badge badge-low-stock"
                            style={{ marginLeft: "0.4rem" }}
                          >
                            Low
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="product-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => openEdit(product)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(product.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingProduct ? "Edit Product" : "Add New Product"}
              </span>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Gold Trim Small Cake Box"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Describe the product for the AI agent…"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (comma-separated)</label>
                  <input
                    className="form-input"
                    placeholder="gold, small, cake box, clear"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div className="form-group">
                    <label className="form-label">Price (GHS)</label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.price}
                      onChange={(e) =>
                        setForm({ ...form, price: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.quantity_available}
                      onChange={(e) =>
                        setForm({ ...form, quantity_available: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Photo URL (optional)</label>
                  <input
                    className="form-input"
                    placeholder="https://…"
                    value={form.photo_url}
                    onChange={(e) =>
                      setForm({ ...form, photo_url: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "auto", padding: "0.65rem 1.5rem" }}
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editingProduct
                      ? "Save Changes"
                      : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
