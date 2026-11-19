-- ============================================================
-- Internal-only listing notes (Nov 19 2026)
--
-- Private notes brokers keep on a listing: internal asking price,
-- zoning + allowed uses, and anything else. Shown ONLY in the admin
-- (Internal section at the top of the listing edit page).
--
-- Why a separate table instead of columns on `listings`:
--   * `listings` is read by the public site (cre8-site) and the map.
--     Keeping these notes out of that table means no public code path
--     can ever select them by accident.
--   * `listings` is a mirror that the hourly Webflow sync rewrites and
--     deletes from. These notes must never be touched by that sync.
--
-- Keyed by the Webflow item id, same as listing_checklists
-- (listings.webflow_id is the join).
-- ============================================================

create table if not exists listing_internal_notes (
  listing_id   text primary key,            -- Webflow CMS item id
  listing_name text,                        -- denormalized, for reading the table by hand
  asking_price text not null default '',    -- rich text (HTML): Internal Asking Price
  zoning_uses  text not null default '',    -- rich text (HTML): Zoning and Allowed Uses
  other        text not null default '',    -- rich text (HTML): Other
  updated_by   text,                        -- email of the last person to save
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Row Level Security ON with no policies = nobody can read or write this
-- table through the public (anon) API. Only the admin's server-side
-- service-role key gets in, and those routes require a signed-in user.
alter table listing_internal_notes enable row level security;

-- Belt and braces: remove the default table grants for the public roles too.
revoke all on listing_internal_notes from anon, authenticated;
