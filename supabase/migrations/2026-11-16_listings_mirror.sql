-- ═══════════════════════════════════════════════════════════════════
-- Listings mirror — makes the Supabase `listings` table a complete,
-- always-current copy of the Webflow CMS (step 1 of leaving Webflow).
--
-- Everything here is ADDITIVE. No column is renamed or removed, so the
-- one live reader of this table (cre8-map's Site Intelligence report)
-- keeps working unchanged.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE listings
  -- Fields added to the Webflow CMS after the February copy
  ADD COLUMN IF NOT EXISTS under_contract      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS floorplan_url       text,          -- the marketing/card image
  -- Raw Webflow option IDs, kept next to the display strings so the admin
  -- can push a listing back to Webflow without a lookup table
  ADD COLUMN IF NOT EXISTS listing_type_id     text,
  ADD COLUMN IF NOT EXISTS property_type_id    text,
  ADD COLUMN IF NOT EXISTS webflow_broker_ids  text[]  NOT NULL DEFAULT '{}',
  -- Webflow's own timestamps — used to tell which listings changed
  ADD COLUMN IF NOT EXISTS webflow_created_at  timestamptz,
  ADD COLUMN IF NOT EXISTS webflow_updated_at  timestamptz,
  -- The untouched Webflow record. Nothing can be lost in translation
  -- because the original is always sitting right here.
  ADD COLUMN IF NOT EXISTS webflow_field_data  jsonb,
  ADD COLUMN IF NOT EXISTS synced_at           timestamptz;

-- Acres was capped at 2 decimals (0.125 ac became 0.13). Widen it.
ALTER TABLE listings ALTER COLUMN acres TYPE numeric;

-- One row per Webflow item — this is what the mirror upserts on.
CREATE UNIQUE INDEX IF NOT EXISTS listings_webflow_id_key ON listings (webflow_id);
