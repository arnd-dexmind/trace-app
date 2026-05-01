-- Enable pg_trgm extension for fuzzy/trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on InventoryItem names for fuzzy search
CREATE INDEX IF NOT EXISTS "InventoryItem_name_trgm_idx"
  ON "InventoryItem" USING GIN ("name" gin_trgm_ops);

-- Generated tsvector column for full-text search on name and description
ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- GIN index on the full-text search vector
CREATE INDEX IF NOT EXISTS "InventoryItem_searchVector_idx"
  ON "InventoryItem" USING GIN ("searchVector");

-- Efficient "last seen" index on ItemLocationHistory
CREATE INDEX IF NOT EXISTS "ItemLocationHistory_itemId_observedAt_idx"
  ON "ItemLocationHistory" ("itemId", "observedAt" DESC);
