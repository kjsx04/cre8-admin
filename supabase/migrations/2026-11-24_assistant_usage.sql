-- ============================================================
-- Assistant usage log (Nov 24 2026)
--
-- One row per model call the staff assistant makes. It is what the monthly
-- dollar cap and the per-person rate limit are computed from, so it is written
-- on EVERY call, including ones that fail.
--
-- Written and read only by the server with the service-role key. Nobody else
-- needs it: RLS is on, there are no policies, and the public roles have no
-- grants. Undo with 2026-11-24_assistant_usage_rollback.sql.
-- ============================================================

create table if not exists assistant_usage (
  id                  bigserial primary key,
  occurred_at         timestamptz not null default now(),
  user_email          text        not null,
  model               text        not null,
  reasoning_effort    text,
  input_tokens        integer     not null default 0,
  cached_tokens       integer     not null default 0,
  output_tokens       integer     not null default 0,
  reasoning_tokens    integer     not null default 0,
  estimated_cost_usd  numeric(12, 6) not null default 0,
  route               text        not null default 'chat',
  ok                  boolean     not null default true
);

-- Month total for the cap, and per-person counts for the rate limit.
create index if not exists assistant_usage_occurred_idx
  on assistant_usage (occurred_at);
create index if not exists assistant_usage_user_idx
  on assistant_usage (user_email, occurred_at);

alter table assistant_usage enable row level security;
revoke all on assistant_usage from anon, authenticated;
