-- EXAMPLE DATA for local testing. Not a migration. Do not run this against
-- production unless you intend to insert fictional tenants.
-- Safe to re-run: existing example rows are left alone.
--
-- Requires supabase/migrations/2026-11-17_demand.sql first.
-- No tenant_locations rows — the map fills those in later.

begin;

insert into rep_firms (id, name, website, notes) values
  ('00000000-0000-4000-8000-0000000000f1', 'EXAMPLE — Sonoran Retail Group', 'https://example.test', 'EXAMPLE DATA. Not a real firm.')
on conflict (name) do nothing;

insert into tenants (
  id, brand_name, category, subcategory, formats, sf_min, sf_max, acres_min, acres_max,
  drive_thru_required, az_markets, spacing_miles, requirement_source, requirement_date, notes, active
) values
  ('00000000-0000-4000-8000-0000000000d1', 'EXAMPLE — Desert Burger Co', 'QSR', 'burger',
    array['pad','ground lease','BTS'], 2200, 3200, 0.8, 1.5, true,
    array['Mesa','Chandler','Gilbert','Queen Creek'], 3, 'EXAMPLE seed', '2026-11-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d2', 'EXAMPLE — Canyon Chicken', 'QSR', 'chicken',
    array['pad','ground lease'], 2400, 3500, 0.9, 1.5, true,
    array['Phoenix','Mesa','Scottsdale'], 2, 'EXAMPLE seed', '2026-11-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d3', 'EXAMPLE — Saguaro Coffee', 'Coffee', null,
    array['pad','endcap'], 1600, 2200, 0.5, 1.1, true,
    array['Phoenix','Scottsdale','Tempe'], 1, 'EXAMPLE seed', '2026-10-15',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d4', 'EXAMPLE — Mesa Bowl Co', 'Fast Casual', 'bowl',
    array['inline','endcap'], 2000, 4000, null, null, false,
    array['Mesa','Chandler','Gilbert'], null, 'EXAMPLE seed', '2026-09-01',
    'EXAMPLE DATA — SF only, so this is inline shop space. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d5', 'EXAMPLE — Cactus Dental', 'Medical/Dental', 'dental',
    array['inline','endcap'], 1800, 4500, null, null, false,
    array['Phoenix','Mesa','Chandler'], null, 'EXAMPLE seed', '2026-08-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d6', 'EXAMPLE — Valley Wash', 'Car Wash', 'express',
    array['pad','ground lease'], null, null, 0.8, 1.5, false,
    array['Maricopa'], 2, 'EXAMPLE seed', '2026-07-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d7', 'EXAMPLE — Iron Gym', 'Fitness', null,
    array['inline','junior box'], 8000, 20000, null, null, false,
    array['Phoenix metro'], 3, 'EXAMPLE seed', '2026-06-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d8', 'EXAMPLE — Palo Verde Market', 'Grocery', null,
    array['junior box','big box'], 18000, 45000, null, null, false,
    array['Mesa','Gilbert','Queen Creek'], 3, 'EXAMPLE seed', '2026-05-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true),
  ('00000000-0000-4000-8000-0000000000d9', 'EXAMPLE — Red Mesa Bank', 'Bank/Credit Union', null,
    array['pad','inline','endcap'], 2500, 4000, 0.7, 1.2, true,
    array['Mesa','Chandler'], 1, 'EXAMPLE seed', '2026-04-01',
    'EXAMPLE DATA — not a real tenant. Safe to delete.', true)
on conflict (brand_name) do nothing;

-- Example rows inserted before the category rename keep their old labels.
-- Only these fictional ids are updated.
update tenants as t
set category = v.category
from (values
  ('00000000-0000-4000-8000-0000000000d1', 'QSR'),
  ('00000000-0000-4000-8000-0000000000d2', 'QSR'),
  ('00000000-0000-4000-8000-0000000000d3', 'Coffee'),
  ('00000000-0000-4000-8000-0000000000d4', 'Fast Casual'),
  ('00000000-0000-4000-8000-0000000000d5', 'Medical/Dental'),
  ('00000000-0000-4000-8000-0000000000d6', 'Car Wash'),
  ('00000000-0000-4000-8000-0000000000d7', 'Fitness'),
  ('00000000-0000-4000-8000-0000000000d8', 'Grocery'),
  ('00000000-0000-4000-8000-0000000000d9', 'Bank/Credit Union')
) as v(id, category)
where t.id = v.id::uuid
  and t.brand_name like 'EXAMPLE — %';

insert into tenant_size_tiers (tenant_id, size_tier_id)
select t.id, s.id
from (values
  ('EXAMPLE — Desert Burger Co', '0-1.5 ac'),
  ('EXAMPLE — Canyon Chicken', '0-1.5 ac'),
  ('EXAMPLE — Saguaro Coffee', '0-1.5 ac'),
  ('EXAMPLE — Mesa Bowl Co', '1,500-3,000 SF'),
  ('EXAMPLE — Mesa Bowl Co', '3,000-6,000 SF'),
  ('EXAMPLE — Cactus Dental', '1,500-3,000 SF'),
  ('EXAMPLE — Cactus Dental', '3,000-6,000 SF'),
  ('EXAMPLE — Valley Wash', '0-1.5 ac'),
  ('EXAMPLE — Iron Gym', '6,000-15,000 SF'),
  ('EXAMPLE — Iron Gym', '15,000+ SF'),
  ('EXAMPLE — Palo Verde Market', '15,000+ SF'),
  ('EXAMPLE — Red Mesa Bank', '0-1.5 ac'),
  ('EXAMPLE — Red Mesa Bank', '3,000-6,000 SF')
) as link(brand, tier)
join tenants t on t.brand_name = link.brand
join size_tiers s on s.name = link.tier
on conflict do nothing;

insert into tenant_contacts (tenant_id, contact_type, firm_id, name, title, email, phone, is_primary, source, confidence, last_verified)
select t.id, c.contact_type, f.id, c.name, c.title, c.email, c.phone, c.is_primary, 'EXAMPLE seed', 'High', '2026-11-01'::date
from (values
  ('EXAMPLE — Desert Burger Co', 'broker', 'EXAMPLE — Sonoran Retail Group', 'Jane Doe', 'Associate', 'jane@example.test', '602-555-0101', true),
  ('EXAMPLE — Desert Burger Co', 'in_house', null, 'Sam Lee', 'VP Real Estate', 'sam@example.test', '602-555-0102', true),
  ('EXAMPLE — Canyon Chicken', 'broker', 'EXAMPLE — Sonoran Retail Group', 'Alex Rivera', 'Broker', 'alex@example.test', '602-555-0103', true),
  ('EXAMPLE — Saguaro Coffee', 'in_house', null, 'Riley Chen', 'Real Estate Manager', 'riley@example.test', '602-555-0104', true),
  ('EXAMPLE — Mesa Bowl Co', 'broker', 'EXAMPLE — Sonoran Retail Group', 'Jordan Hale', 'Agent', 'jordan@example.test', '602-555-0105', true)
) as c(brand, contact_type, firm, name, title, email, phone, is_primary)
join tenants t on t.brand_name = c.brand
left join rep_firms f on f.name = c.firm
where not exists (
  select 1 from tenant_contacts existing
  where existing.tenant_id = t.id and existing.email = c.email
);

insert into tenant_relationships (tenant_id, related_tenant_id, relation)
select a.id, b.id, 'competitor'
from tenants a
join tenants b on b.brand_name = 'EXAMPLE — Canyon Chicken'
where a.brand_name = 'EXAMPLE — Desert Burger Co'
on conflict do nothing;

commit;
