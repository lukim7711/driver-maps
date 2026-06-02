-- Schema untuk D1 database (SQLite)
-- Jalankan: wrangler d1 execute driver-maps-cache --file=./schema.sql

CREATE TABLE IF NOT EXISTS address_cache (
  normalized_query  TEXT PRIMARY KEY,
  source            TEXT,
  lat               REAL,
  lng               REAL,
  formatted_address TEXT,
  place_id          TEXT,
  confidence        TEXT,
  is_accurate       INTEGER DEFAULT 0,
  clean_query       TEXT,
  warning           TEXT,
  cached_at         INTEGER,
  hit_count         INTEGER DEFAULT 0,
  last_used         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cached_at ON address_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_last_used ON address_cache(last_used);
