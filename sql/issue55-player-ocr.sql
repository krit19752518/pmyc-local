-- Explicit additive migration. Apply only to an authorized Local database first.
-- No startup migration, player update, historical rewrite, DROP or DELETE.
BEGIN;
CREATE TABLE IF NOT EXISTS football_player_ocr_cache (
  cache_key char(64) PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('RUNNING','SUCCEEDED','FAILED')),
  lease_id uuid,
  analysis jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS football_player_ocr_usage (
  id uuid PRIMARY KEY,
  budget_id varchar(80) NOT NULL,
  cache_key char(64) NOT NULL,
  page_count integer NOT NULL CHECK (page_count > 0 AND page_count <= 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS football_player_ocr_usage_budget_time
  ON football_player_ocr_usage(budget_id, created_at);
COMMENT ON TABLE football_player_ocr_cache IS
  'Private four-field OCR assistance only; no source images, raw OCR text, face data or authoritative player updates. Scoped backend access required.';
COMMENT ON TABLE football_player_ocr_usage IS
  'Conservative paid-attempt reservations shared across processes; failures/timeouts are not automatically refunded or retried.';
COMMIT;
