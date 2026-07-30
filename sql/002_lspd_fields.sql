-- ============================================================================
--  Migration 002 — LSPD roster import support
--  Adds fields needed to faithfully import the uploaded roster (badge codes,
--  Discord IDs, administrative titles distinct from the rank ladder, and a
--  free-text duty note for statuses like "Vacations"/"Unactive").
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS duty_note VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_title_ar VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_title_en VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_login BOOLEAN NOT NULL DEFAULT true;

-- Allow a user record to exist without ever having logged in / been issued
-- real credentials yet (pure roster entry). Frontend must never expose
-- password hashes; this flag just tells the UI "no account provisioned".
