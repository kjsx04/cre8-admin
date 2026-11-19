-- ============================================================
-- Lock the deals table (Nov 19 2026)
--
-- `deals` had a policy called "Public read deals" (SELECT, using true).
-- That let anyone holding the project's public (anon) key read every
-- deal: price, commission rate, broker split, escrow number, notes.
-- Confirmed by reading a row with the anon key before this change.
--
-- Nothing needs it. The only code that reads `deals` is the admin's
-- Deal Tracker API (src/app/api/flow/deals/*), which uses the
-- server-side service-role key and requires a signed-in user.
-- The "Service role full access on deals" policy stays in place.
-- ============================================================

drop policy if exists "Public read deals" on deals;

-- Remove the table-level grants for the public roles as well, so a
-- future mistaken policy can't reopen it on its own.
revoke all on deals from anon, authenticated;
