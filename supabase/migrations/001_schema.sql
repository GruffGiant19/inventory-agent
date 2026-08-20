-- ============================================================
-- 001_schema.sql
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  tags               TEXT[] NOT NULL DEFAULT '{}',
  price              NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  photo_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remove the old failing functional index attempt if it partially ran
DROP INDEX IF EXISTS products_fts_idx;

-- Add a dedicated tsvector column
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger function to keep it in sync on insert/update
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      COALESCE(NEW.name, '') || ' ' ||
      COALESCE(NEW.description, '') || ' ' ||
      COALESCE(array_to_string(NEW.tags, ' '), '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_vector_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- Now index the plain column — no expression, no IMMUTABLE issue
CREATE INDEX products_fts_idx ON products USING gin(search_vector);

-- ─── ORDERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_phone   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','awaiting_address','dispatched','cancelled')),
  delivery_address TEXT,
  total_price      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ORDER ITEMS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL
);

-- ─── CONVERSATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_phone TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('customer', 'agent')),
  message        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DELIVERY REQUESTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_requests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'requested',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── ATOMIC RESERVE STOCK (prevents overselling) ─────────────────────────────
-- Returns the updated product row if successful, empty if not enough stock.
CREATE OR REPLACE FUNCTION rpc_reserve_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  UPDATE products
  SET quantity_available = quantity_available - p_quantity,
      updated_at         = NOW()
  WHERE id = p_product_id
    AND quantity_available >= p_quantity
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;

-- Owners can only see their own products/orders
CREATE POLICY "Owners see own products"
  ON products FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners see own orders"
  ON orders FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners see own order items"
  ON order_items FOR ALL
  USING (
    order_id IN (SELECT id FROM orders WHERE owner_id = auth.uid())
  );

CREATE POLICY "Owners see own delivery requests"
  ON delivery_requests FOR ALL
  USING (
    order_id IN (SELECT id FROM orders WHERE owner_id = auth.uid())
  );

-- Conversations are open (agent uses service role key, not subject to RLS)
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
