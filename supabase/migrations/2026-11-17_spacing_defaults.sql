-- Category spacing defaults for the Demand map.
--
-- Rings use a tenant's spacing_miles when it is set, otherwise the category
-- default. Most tenants have no override, and several categories were seeded
-- with a null (or, for QSR and c-store, a 1-mile placeholder).
--
-- This file only fills gaps. A category that already has a number is left
-- alone, except the two placeholders called out for this change:
--   QSR w/ drive-thru  1 → 1.5   (only while it is still exactly 1)
--   c-store/fuel       1 → 2     (only while it is still exactly 1)
-- Running it twice does not change a value a person has since edited.
-- It does not rename categories and does not write tenants.spacing_miles.
--
-- Miles, by category:
--   coffee drive-thru              1
--   dessert                        1     impulse, same idea as coffee
--   QSR w/ drive-thru              1.5
--   fast casual                    1.5   between coffee and a full restaurant
--   casual dining                  1     already set; not overwritten
--   bank                           1     already set; not overwritten
--   c-store/fuel                   2
--   Fuel/C-store jobber            2     same trade as c-store
--   auto service                   2     already set; not overwritten
--   car wash                       2     already set; not overwritten
--   daycare                        2     already set; not overwritten
--   childcare                      2     same as daycare
--   hotel                          2     already set; not overwritten
--   medical/dental                 2
--   medical                        2     same as medical/dental
--   other                          2     so the catch-all still draws a ring
--   grocery                        3
--   fitness                        3     already set; not overwritten
--   junior box                     3     already set; not overwritten
--   self storage                   3     already set; not overwritten
--   self-storage / truck rental    3     same as self storage
--   entertainment                  3     a destination draw
--   big box                        5     already set; not overwritten
--
-- Idempotent. Depends on category_defaults from 2026-11-17_demand.sql.
-- Data only: no new columns, so the baseline schema capture stays as it is.

begin;

insert into category_defaults (category, spacing_miles) values
  ('coffee drive-thru', 1),
  ('dessert', 1),
  ('QSR w/ drive-thru', 1.5),
  ('fast casual', 1.5),
  ('casual dining', 1),
  ('bank', 1),
  ('c-store/fuel', 2),
  ('Fuel/C-store jobber', 2),
  ('auto service', 2),
  ('car wash', 2),
  ('daycare', 2),
  ('childcare', 2),
  ('hotel', 2),
  ('medical/dental', 2),
  ('medical', 2),
  ('other', 2),
  ('grocery', 3),
  ('fitness', 3),
  ('junior box', 3),
  ('self storage', 3),
  ('self-storage / truck rental', 3),
  ('entertainment', 3),
  ('big box', 5)
on conflict (category) do update
set spacing_miles = excluded.spacing_miles
where category_defaults.spacing_miles is null;

update category_defaults
set spacing_miles = 1.5
where category = 'QSR w/ drive-thru' and spacing_miles = 1;

update category_defaults
set spacing_miles = 2
where category = 'c-store/fuel' and spacing_miles = 1;

commit;
