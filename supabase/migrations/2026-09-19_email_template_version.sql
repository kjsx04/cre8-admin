-- Pin which HTML chrome a campaign last synced. Sent mail is never rewritten.
alter table public.email_campaigns
  add column if not exists template_version text,
  add column if not exists template_synced_at timestamptz;

-- Existing rows are already on today's shell; pin them so listing re-push stays live.
update public.email_campaigns
set
  template_version = '2026-09-19',
  template_synced_at = coalesce(template_synced_at, now())
where template_version is null;
