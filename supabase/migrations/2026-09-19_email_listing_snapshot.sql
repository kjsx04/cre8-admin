-- When a campaign is scheduled, listing photos/fields freeze on the row.
-- Drafts stay live. Refresh listing is the explicit un-freeze.
alter table public.email_campaigns
  add column if not exists listing_synced_at timestamptz;

update public.email_campaigns
set listing_synced_at = coalesce(listing_synced_at, template_synced_at, updated_at)
where status in ('scheduled', 'active', 'paused', 'completed', 'cancelled')
  and listing_synced_at is null;
