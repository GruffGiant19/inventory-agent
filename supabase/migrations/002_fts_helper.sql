-- ============================================================
-- 002_fts_helper.sql
-- Run this in your Supabase SQL Editor AFTER 001_schema.sql
-- ============================================================

-- Full-text search helper function for products
CREATE OR REPLACE FUNCTION search_products_fts(query_text TEXT)
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM products
  WHERE
    to_tsvector('english',
      name || ' ' || description || ' ' || array_to_string(tags, ' ')
    ) @@ to_tsquery('english', query_text)
    AND quantity_available > 0
  ORDER BY
    ts_rank(
      to_tsvector('english', name || ' ' || description || ' ' || array_to_string(tags, ' ')),
      to_tsquery('english', query_text)
    ) DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;
