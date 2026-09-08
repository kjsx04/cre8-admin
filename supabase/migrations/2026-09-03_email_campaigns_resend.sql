-- Email campaigns: switch from SendGrid to Resend + recurring-send tracking
-- Run via Supabase Management API (see memory note) or the SQL editor.
--
-- provider_send_id : Resend broadcast id for the PENDING send (null once sent/cancelled)
-- last_sent_at     : when the most recent send actually went out (recurring cadence anchor)
--
-- The old sendgrid_single_send_id column was dropped once the new code deployed.

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

-- Ran after the Resend code went live on Vercel (2026-09-03):
alter table public.email_campaigns drop column if exists sendgrid_single_send_id;

-- 2026-09-07: multiple brokers per campaign. broker_id stays the primary (From address);
-- broker_ids lists everyone shown on the email, primary first.
alter table public.email_campaigns
  add column if not exists broker_ids jsonb not null default '[]'::jsonb;
update public.email_campaigns
  set broker_ids = jsonb_build_array(broker_id)
  where (broker_ids = '[]'::jsonb or broker_ids is null) and broker_id is not null;

-- 2026-09-07: user-chosen scheduling priority ("high" = best slot, "normal" = fit anywhere)
alter table public.email_campaigns
  add column if not exists priority text not null default 'normal';

-- 2026-09-08: optional partner logo in the email header (hosted in Supabase Storage bucket "email-assets")
alter table public.email_campaigns
  add column if not exists partner_logo_url text,
  add column if not exists partner_logo_width integer,
  add column if not exists partner_logo_height integer;
