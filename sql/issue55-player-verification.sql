-- Explicit operator migration only. Never called by application startup.
-- Apply to an authorized Local database first; Production requires separate approval.
BEGIN;
CREATE TABLE IF NOT EXISTS football_player_ai_verification (
  id uuid PRIMARY KEY,
  player_id text NOT NULL,
  source_hash char(64) NOT NULL,
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  result jsonb,
  error_code text,
  review jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS football_player_ai_verification_lookup
  ON football_player_ai_verification(player_id, created_at DESC);
COMMENT ON TABLE football_player_ai_verification IS
  'Private OCR/face assistance, never authoritative player identity; access through scoped admin API only. No raw source files or face embeddings.';
COMMIT;
