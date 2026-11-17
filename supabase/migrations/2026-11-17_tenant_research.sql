-- Deal type and research fields already applied in production.
-- Idempotent so a fresh database and the live project both end in the same shape.
-- Depends on public.tenants from 2026-11-17_demand.sql.

begin;

alter table tenants add column if not exists deal_lease boolean;
alter table tenants add column if not exists deal_buy boolean;
alter table tenants add column if not exists deal_ground_lease boolean;
alter table tenants add column if not exists deal_bts boolean;
alter table tenants add column if not exists freestanding boolean;
alter table tenants add column if not exists inline boolean;
alter table tenants add column if not exists deal_types_source text;
alter table tenants add column if not exists deal_types_confidence text;
alter table tenants add column if not exists research_status text default 'pending';
alter table tenants add column if not exists research_priority integer;
alter table tenants add column if not exists last_researched timestamptz;

-- CHECK constraints treat NULL as passing, so unknown stays allowed.
do $$ begin
  alter table tenants add constraint tenants_deal_types_confidence_check
    check (deal_types_confidence = any (array['High', 'Medium', 'Low']));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table tenants add constraint tenants_research_status_check
    check (research_status = any (array['pending', 'in_progress', 'researched', 'needs_review']));
exception when duplicate_object then null;
end $$;

create table if not exists tenant_research_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  field text,
  old_value text,
  new_value text,
  source text,
  confidence text,
  researched_at timestamptz default now(),
  researched_by text default 'CRE8 research agent'
);

create index if not exists tenant_research_log_researched_at_idx
  on tenant_research_log (researched_at desc);

alter table tenant_research_log enable row level security;

drop policy if exists "Service role full access on tenant_research_log" on tenant_research_log;
create policy "Service role full access on tenant_research_log" on tenant_research_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
