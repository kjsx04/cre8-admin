-- Demand — tenant requirements, listing spaces, and who to call.
--
-- Depends on public.listings (uuid id) and public.update_updated_at()
-- from the baseline / listings mirror. Idempotent: safe to run twice.
-- Do not load supabase/seed/demand_example.sql here. That file is fake
-- data for local testing and is not part of this migration.
--
-- Matching itself lives in src/lib/demand/match.ts so it can be unit tested.
-- Size-tier max_value is exclusive: 1.5 ac belongs to "1.5-2.5 ac", not "0-1.5 ac".

begin;

-- ============================================================
-- Firms that represent tenants
-- ============================================================

create table if not exists rep_firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rep_firms_name_key unique (name)
);

-- ============================================================
-- Tenants
-- ============================================================

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  category text not null default 'other',
  subcategory text,
  formats text[] not null default '{}',
  sf_min integer,
  sf_max integer,
  acres_min numeric,
  acres_max numeric,
  drive_thru_required boolean,
  az_markets text[] not null default '{}',
  spacing_miles numeric,
  requirement_source text,
  requirement_date date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_brand_name_key unique (brand_name),
  constraint tenants_formats_ok check (
    formats <@ array['pad','inline','endcap','junior box','big box','ground lease','BTS']::text[]
  ),
  constraint tenants_sf_range check (sf_min is null or sf_max is null or sf_min <= sf_max),
  constraint tenants_acres_range check (acres_min is null or acres_max is null or acres_min <= acres_max),
  constraint tenants_spacing_nonneg check (spacing_miles is null or spacing_miles >= 0)
);

create table if not exists tenant_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contact_type text not null,
  firm_id uuid references rep_firms (id) on delete set null,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  source text,
  confidence text,
  last_verified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_contacts_type_ok check (contact_type in ('in_house', 'broker')),
  constraint tenant_contacts_confidence_ok check (confidence is null or confidence in ('High', 'Medium', 'Low'))
);

create index if not exists tenant_contacts_tenant_idx on tenant_contacts (tenant_id);

create table if not exists tenant_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text,
  address text,
  lat numeric,
  lng numeric,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists tenant_locations_tenant_idx on tenant_locations (tenant_id);

create table if not exists tenant_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  related_tenant_id uuid not null references tenants (id) on delete cascade,
  relation text not null,
  created_at timestamptz not null default now(),
  constraint tenant_relationships_kind_ok check (relation in ('competitor', 'similar', 'co_tenant')),
  constraint tenant_relationships_not_self check (tenant_id <> related_tenant_id),
  constraint tenant_relationships_unique unique (tenant_id, related_tenant_id, relation)
);

create index if not exists tenant_relationships_related_idx on tenant_relationships (related_tenant_id);

-- ============================================================
-- Category defaults and size tiers
-- ============================================================

create table if not exists category_defaults (
  category text primary key,
  formats text[] not null default '{}',
  sf_min integer,
  sf_max integer,
  acres_min numeric,
  acres_max numeric,
  drive_thru_typical boolean,
  spacing_miles numeric,
  updated_at timestamptz not null default now(),
  constraint category_defaults_formats_ok check (
    formats <@ array['pad','inline','endcap','junior box','big box','ground lease','BTS']::text[]
  )
);

create table if not exists size_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  min_value numeric,
  max_value numeric,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint size_tiers_name_key unique (name),
  constraint size_tiers_kind_ok check (kind in ('sf', 'acres')),
  constraint size_tiers_bounds check (min_value is null or max_value is null or min_value < max_value)
);

comment on column size_tiers.max_value is 'Exclusive upper bound. 1.5 belongs to the tier whose min_value is 1.5.';

create table if not exists tenant_size_tiers (
  tenant_id uuid not null references tenants (id) on delete cascade,
  size_tier_id uuid not null references size_tiers (id) on delete cascade,
  primary key (tenant_id, size_tier_id)
);

create table if not exists category_size_tiers (
  category text not null references category_defaults (category) on delete cascade,
  size_tier_id uuid not null references size_tiers (id) on delete cascade,
  primary key (category, size_tier_id)
);

-- ============================================================
-- Spaces on a listing. Editable from Demand, not the listing form.
-- geometry is optional GeoJSON for a pad outline. Null until someone has it.
-- ============================================================

create table if not exists listing_spaces (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  label text not null,
  space_type text not null,
  acres numeric,
  sf integer,
  drive_thru boolean,
  deal text not null default 'both',
  price_rate text,
  status text,
  notes text,
  geometry jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_spaces_type_ok check (space_type in ('pad', 'inline', 'endcap', 'land parcel')),
  constraint listing_spaces_deal_ok check (deal in ('sale', 'lease', 'both'))
);

create index if not exists listing_spaces_listing_idx on listing_spaces (listing_id, sort_order);

-- Overrides and interest are per space so grouped pads can still diverge.
create table if not exists demand_overrides (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  listing_space_id uuid not null references listing_spaces (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  decision text not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint demand_overrides_decision_ok check (decision in ('include', 'exclude')),
  constraint demand_overrides_space_tenant_key unique (listing_space_id, tenant_id)
);

create index if not exists demand_overrides_listing_idx on demand_overrides (listing_id);

create table if not exists demand_interest (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  listing_space_id uuid not null references listing_spaces (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  status text not null,
  notes text,
  updated_at timestamptz not null default now(),
  constraint demand_interest_status_ok check (status in ('submitted', 'interested', 'touring', 'LOI', 'passed')),
  constraint demand_interest_space_tenant_key unique (listing_space_id, tenant_id)
);

create index if not exists demand_interest_listing_idx on demand_interest (listing_id);

-- ============================================================
-- updated_at
-- ============================================================

drop trigger if exists set_updated_at_rep_firms on rep_firms;
create trigger set_updated_at_rep_firms before update on rep_firms
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_tenants on tenants;
create trigger set_updated_at_tenants before update on tenants
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_tenant_contacts on tenant_contacts;
create trigger set_updated_at_tenant_contacts before update on tenant_contacts
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_category_defaults on category_defaults;
create trigger set_updated_at_category_defaults before update on category_defaults
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_size_tiers on size_tiers;
create trigger set_updated_at_size_tiers before update on size_tiers
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_listing_spaces on listing_spaces;
create trigger set_updated_at_listing_spaces before update on listing_spaces
  for each row execute function update_updated_at();

drop trigger if exists set_updated_at_demand_interest on demand_interest;
create trigger set_updated_at_demand_interest before update on demand_interest
  for each row execute function update_updated_at();

-- ============================================================
-- Seed size tiers and category defaults. Do not overwrite later edits.
-- ============================================================

insert into size_tiers (name, kind, min_value, max_value, sort_order) values
  ('<1,500 SF', 'sf', null, 1500, 10),
  ('1,500-3,000 SF', 'sf', 1500, 3000, 20),
  ('3,000-6,000 SF', 'sf', 3000, 6000, 30),
  ('6,000-15,000 SF', 'sf', 6000, 15000, 40),
  ('15,000+ SF', 'sf', 15000, null, 50),
  ('0-1.5 ac', 'acres', 0, 1.5, 110),
  ('1.5-2.5 ac', 'acres', 1.5, 2.5, 120),
  ('2.5-5 ac', 'acres', 2.5, 5, 130),
  ('5-10 ac', 'acres', 5, 10, 140),
  ('10+ ac', 'acres', 10, null, 150)
on conflict (name) do nothing;

insert into category_defaults (category, formats, sf_min, sf_max, acres_min, acres_max, drive_thru_typical, spacing_miles) values
  ('QSR w/ drive-thru', array['pad','ground lease','BTS','endcap'], 1800, 3200, 0.7, 1.5, true, 1),
  ('coffee drive-thru', array['pad','ground lease','endcap'], 1500, 2500, 0.5, 1.2, true, 1),
  ('fast casual', array['inline','endcap'], 2000, 4000, null, null, false, null),
  ('casual dining', array['inline','endcap'], 3500, 7000, null, null, false, 1),
  ('c-store/fuel', array['pad','ground lease'], 4000, 6000, 1.0, 2.0, false, 1),
  ('car wash', array['pad','ground lease','BTS'], null, null, 0.8, 1.5, false, 2),
  ('auto service', array['pad','inline'], 4000, 8000, 0.6, 1.2, false, 2),
  ('medical/dental', array['inline','endcap'], 1500, 5000, null, null, false, null),
  ('fitness', array['inline','junior box'], 4000, 25000, null, null, false, 3),
  ('grocery', array['junior box','big box'], 15000, 60000, 1.5, 6, false, 3),
  ('junior box', array['junior box'], 15000, 35000, null, null, false, 3),
  ('big box', array['big box'], 35000, 120000, null, null, false, 5),
  ('bank', array['inline','endcap','pad'], 2000, 4500, 0.7, 1.2, true, 1),
  ('daycare', array['inline','pad'], 6000, 12000, 1.0, 2.0, false, 2),
  ('hotel', array['pad','BTS'], null, null, 1.5, 3.5, false, 2),
  ('self storage', array['pad','BTS','ground lease'], null, null, 2, 8, false, 3),
  ('other', array['inline'], null, null, null, null, null, null)
on conflict (category) do nothing;

insert into category_size_tiers (category, size_tier_id)
select c.category, t.id
from (values
  ('QSR w/ drive-thru', '0-1.5 ac'),
  ('QSR w/ drive-thru', '1,500-3,000 SF'),
  ('coffee drive-thru', '0-1.5 ac'),
  ('coffee drive-thru', '1,500-3,000 SF'),
  ('fast casual', '1,500-3,000 SF'),
  ('fast casual', '3,000-6,000 SF'),
  ('casual dining', '3,000-6,000 SF'),
  ('casual dining', '6,000-15,000 SF'),
  ('c-store/fuel', '0-1.5 ac'),
  ('c-store/fuel', '1.5-2.5 ac'),
  ('c-store/fuel', '3,000-6,000 SF'),
  ('car wash', '0-1.5 ac'),
  ('auto service', '0-1.5 ac'),
  ('auto service', '3,000-6,000 SF'),
  ('auto service', '6,000-15,000 SF'),
  ('medical/dental', '1,500-3,000 SF'),
  ('medical/dental', '3,000-6,000 SF'),
  ('fitness', '3,000-6,000 SF'),
  ('fitness', '6,000-15,000 SF'),
  ('fitness', '15,000+ SF'),
  ('grocery', '15,000+ SF'),
  ('grocery', '1.5-2.5 ac'),
  ('grocery', '2.5-5 ac'),
  ('grocery', '5-10 ac'),
  ('junior box', '6,000-15,000 SF'),
  ('junior box', '15,000+ SF'),
  ('big box', '15,000+ SF'),
  ('bank', '0-1.5 ac'),
  ('bank', '1,500-3,000 SF'),
  ('bank', '3,000-6,000 SF'),
  ('daycare', '0-1.5 ac'),
  ('daycare', '1.5-2.5 ac'),
  ('daycare', '6,000-15,000 SF'),
  ('hotel', '1.5-2.5 ac'),
  ('hotel', '2.5-5 ac'),
  ('self storage', '2.5-5 ac'),
  ('self storage', '5-10 ac'),
  ('self storage', '10+ ac')
) as c(category, tier)
join size_tiers t on t.name = c.tier
on conflict do nothing;

-- ============================================================
-- RLS. Same shape as deal_members and the other private admin tables:
-- the service role (used by the API routes) can do everything, and the
-- anon / authenticated roles get no policy, so the Data API stays closed.
-- Demand holds phone numbers and emails. There is no public read.
-- ============================================================

alter table rep_firms enable row level security;
alter table tenants enable row level security;
alter table tenant_contacts enable row level security;
alter table tenant_locations enable row level security;
alter table tenant_relationships enable row level security;
alter table category_defaults enable row level security;
alter table size_tiers enable row level security;
alter table tenant_size_tiers enable row level security;
alter table category_size_tiers enable row level security;
alter table listing_spaces enable row level security;
alter table demand_overrides enable row level security;
alter table demand_interest enable row level security;

drop policy if exists "Service role full access on rep_firms" on rep_firms;
create policy "Service role full access on rep_firms" on rep_firms
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on tenants" on tenants;
create policy "Service role full access on tenants" on tenants
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on tenant_contacts" on tenant_contacts;
create policy "Service role full access on tenant_contacts" on tenant_contacts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on tenant_locations" on tenant_locations;
create policy "Service role full access on tenant_locations" on tenant_locations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on tenant_relationships" on tenant_relationships;
create policy "Service role full access on tenant_relationships" on tenant_relationships
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on category_defaults" on category_defaults;
create policy "Service role full access on category_defaults" on category_defaults
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on size_tiers" on size_tiers;
create policy "Service role full access on size_tiers" on size_tiers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on tenant_size_tiers" on tenant_size_tiers;
create policy "Service role full access on tenant_size_tiers" on tenant_size_tiers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on category_size_tiers" on category_size_tiers;
create policy "Service role full access on category_size_tiers" on category_size_tiers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on listing_spaces" on listing_spaces;
create policy "Service role full access on listing_spaces" on listing_spaces
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on demand_overrides" on demand_overrides;
create policy "Service role full access on demand_overrides" on demand_overrides
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role full access on demand_interest" on demand_interest;
create policy "Service role full access on demand_interest" on demand_interest
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
