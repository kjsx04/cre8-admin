-- Two changes from the first real 860-person send (2026-09-23).
--
-- 1. Automatic list hygiene.
--    That send bounced 17%: 112 dead addresses and 53 temporary failures.
--    Resend does NOT suppress bounced contacts — every one of the 112 was still
--    marked subscribed afterwards and would have gone out again. A second send
--    at that rate starts pushing CRE8 mail into spam folders.
--
--    The webhook now applies a policy on every delivery event. Hard bounces and
--    spam complaints suppress at once; soft bounces take three strikes in a row,
--    because 24 of the 53 soft bounces were delivered to anyway and retiring on
--    one failure would have cost ~29 real brokers. Any delivery resets the count.
--
--    Keyed by a hash so no recipient addresses are stored, matching the existing
--    choice in the webhook to strip `to` from email_events.

create table if not exists email_contact_health (
  email_hash          text primary key,
  soft_streak         integer not null default 0,
  last_soft_bounce_at timestamptz,
  last_delivered_at   timestamptz,
  last_bounce_kind    text,
  suppressed_at       timestamptz,
  suppress_reason     text,
  updated_at          timestamptz not null default now()
);

create index if not exists email_contact_health_suppressed_idx
  on email_contact_health (suppressed_at) where suppressed_at is not null;

comment on table email_contact_health is
  'Per-contact delivery health, keyed by sha256 of the lowercased email so no addresses are stored. Drives automatic suppression: a hard bounce suppresses immediately, three soft bounces in a row retire the address, and any delivery resets the streak.';

-- 2. The two lines an inbox shows.
--    The Blossom Rock send went out with the subject "<label>: <listing>" and a
--    preheader of "<label>: <heading>", so a phone showed the same 56 characters
--    twice and wasted both lines. Both are now editable in the composer, and the
--    preview falls back to the opening of the body copy so it can never echo the
--    subject.

alter table email_campaigns add column if not exists email_subject text;
alter table email_campaigns add column if not exists preview_text text;

comment on column email_campaigns.email_subject is
  'Custom subject line. Blank falls back to "<label>: <listing name>".';
comment on column email_campaigns.preview_text is
  'The grey line under the subject in an inbox and on a phone lock screen. Blank falls back to the opening of the body text, never a repeat of the subject.';
