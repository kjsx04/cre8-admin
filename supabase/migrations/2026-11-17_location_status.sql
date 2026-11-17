-- Document store-location status. The column already exists (nullable text).
-- Null means open, which is how every row loaded before this note behaved.
-- Values written by Demand:
--   open                 operating store (Glenwood custom_sites.status = active)
--   under_construction   being built (Glenwood pending)
--   signed               committed, not built yet
-- Pins added from the Demand map use source = manual.

comment on column tenant_locations.status is
  'open, under_construction, or signed. Null means open. Glenwood active maps to open and Glenwood pending maps to under_construction.';
