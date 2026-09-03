-- Email campaigns: switch from SendGrid to Resend + recurring-send tracking
-- Run via Supabase Management API (see memory note) or the SQL editor.
--
-- provider_send_id : Resend broadcast id for the PENDING send (null once sent/cancelled)
-- last_sent_at     : when the most recent send actually went out (recurring cadence anchor)
--
-- The old sendgrid_single_send_id column is kept until the new code is deployed,
-- then can be dropped with the statement at the bottom.

alter table public.email_campaigns
  add column if not exists provider_send_id text,
  add column if not exists last_sent_at timestamptz;

-- Carry over any existing ids (there shouldn't be real ones — SendGrid was never fully set up)
update public.email_campaigns
  set provider_send_id = sendgrid_single_send_id
  where provider_send_id is null and sendgrid_single_send_id is not null;

-- Recurring campaigns: keep next_send_date == scheduled_date (pending send time)
update public.email_campaigns
  set next_send_date = scheduled_date
  where campaign_type = 'recurring' and scheduled_date is not null;

-- Speeds up the daily cron query
create index if not exists email_campaigns_recurring_due_idx
  on public.email_campaigns (next_send_date)
  where status = 'active' and campaign_type = 'recurring';

-- AFTER the Resend code is live on Vercel, run this to remove the old column:
-- alter table public.email_campaigns drop column if exists sendgrid_single_send_id;
