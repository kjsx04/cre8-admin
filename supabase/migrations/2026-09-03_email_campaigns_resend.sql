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

-- 2026-09-08: ranked listing priorities (one row per listing; rank 1 = most important).
-- Feeds the AI scheduler and the week optimizer. Only listings with campaigns on the schedule get a row.
create table if not exists public.listing_priorities (
  listing_id   text primary key,
  listing_name text,
  rank         integer not null,
  updated_at   timestamptz not null default now()
);
create index if not exists listing_priorities_rank_idx on public.listing_priorities (rank);

-- 2026-09-08: scheduler settings (single row), alerts, send history, tracking events, pin + cadence tracking
create table if not exists public.email_settings (
  id          text primary key default 'default',
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.email_campaigns
  add column if not exists pinned boolean not null default false,          -- exempt from freshness decay
  add column if not exists cadence_changed_at timestamptz;                  -- when frequency last changed (decay clock)
create table if not exists public.email_alerts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references public.email_campaigns(id) on delete cascade,
  type            text not null,             -- 'stale' | 'decay'
  message         text not null,
  created_at      timestamptz not null default now(),
  dismissed_until timestamptz,
  unique (campaign_id, type)
);
create table if not exists public.email_sends (
  broadcast_id  text primary key,            -- Resend broadcast id
  campaign_id   uuid references public.email_campaigns(id) on delete cascade,
  scheduled_at  timestamptz,
  created_at    timestamptz not null default now()
);
create table if not exists public.email_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,               -- email.sent | email.delivered | email.opened | email.clicked | email.bounced | email.complained
  broadcast_id  text,
  campaign_id   uuid,
  email_id      text,
  occurred_at   timestamptz not null,
  payload       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists email_events_campaign_idx on public.email_events (campaign_id, event_type);
create index if not exists email_events_occurred_idx on public.email_events (occurred_at);

-- 2026-09-09: group (digest) campaigns — several listings in one email.
-- campaign_kind 'single' | 'group'. Groups use listing_id = 'group:<uuid>' so every
-- schedule/priority feature keys off one id, and group_listings holds the ordered cards.
alter table public.email_campaigns
  add column if not exists campaign_kind text not null default 'single',
  add column if not exists group_listings jsonb not null default '[]'::jsonb;
create index if not exists email_campaigns_group_listings_idx on public.email_campaigns using gin (group_listings);
