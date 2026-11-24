-- Undo 2026-11-24_assistant_readonly_role.sql. Run by hand only.
-- The assistant stops being able to read the database until the role is recreated.

drop policy if exists assistant_read on listings;
drop policy if exists assistant_read on listing_spaces;
drop policy if exists assistant_read on listing_parcels;
drop policy if exists assistant_read on listing_internal_notes;
drop policy if exists assistant_read on listing_checklists;
drop policy if exists assistant_read on listing_priorities;
drop policy if exists assistant_read on brokers;
drop policy if exists assistant_read on deals;
drop policy if exists assistant_read on deal_dates;
drop policy if exists assistant_read on deal_members;
drop policy if exists assistant_read on lease_payments;

drop function if exists assistant_can_see_deal(uuid);
drop function if exists assistant_claim(text);

revoke all on listings, listing_spaces, listing_parcels, listing_internal_notes,
  listing_checklists, listing_priorities, brokers, deals, deal_dates, deal_members,
  lease_payments from assistant_readonly;
revoke usage on schema public from assistant_readonly;
revoke assistant_readonly from authenticator;

drop role if exists assistant_readonly;
notify pgrst, 'reload schema';
