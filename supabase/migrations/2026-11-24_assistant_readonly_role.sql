-- ============================================================
-- Read-only database role for the staff assistant (Nov 24 2026)
--
-- The assistant never uses the service-role key to read company data. The
-- server signs a short-lived token that says "role: assistant_readonly" plus the
-- asker's email, and PostgREST runs the query as this role. The role can only
-- SELECT, only from the tables listed here, and the deal tables also check the
-- asker's email in the database, so a bug in the server code cannot show one
-- broker another broker's deals.
--
-- Tables NOT granted on purpose: contacts, subscribers, form_submissions,
-- email_contacts and email_events (personal data and recipient lists), every
-- *_backup_* table, caches, logs and map-pipeline tables.
--
-- Undo with 2026-11-24_assistant_readonly_role_rollback.sql.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'assistant_readonly') then
    create role assistant_readonly nologin noinherit;
  end if;
end
$$;

-- PostgREST connects as `authenticator` and switches to the role in the token.
grant assistant_readonly to authenticator;
grant usage on schema public to assistant_readonly;

-- A runaway query is cut off. (The anonymous role is 3 seconds; this is a bit more.)
alter role assistant_readonly set statement_timeout = '8s';

-- ── Listings and what hangs off them ─────────────────────────
-- Table-level grants, so a column added later is visible without another change.
grant select on listings, listing_spaces, listing_parcels, listing_internal_notes,
  listing_checklists, listing_priorities to assistant_readonly;

create policy assistant_read on listings                for select to assistant_readonly using (true);
create policy assistant_read on listing_spaces          for select to assistant_readonly using (true);
create policy assistant_read on listing_parcels         for select to assistant_readonly using (true);
create policy assistant_read on listing_internal_notes  for select to assistant_readonly using (true);
create policy assistant_read on listing_checklists      for select to assistant_readonly using (true);
create policy assistant_read on listing_priorities      for select to assistant_readonly using (true);

-- ── Brokers: names and contact details only ──────────────────
-- Column-level grant. Commission defaults and splits are not readable.
grant select (id, name, email, phone, title, bio, years_experience, transactions_count, sort_order, webflow_id)
  on brokers to assistant_readonly;
create policy assistant_read on brokers for select to assistant_readonly using (true);

-- ── Deals: only the asker's own, unless the asker is the owner ──
-- The signed token carries `email` and `cre8_owner`. This is the same rule Flow
-- uses: a broker sees the deals they are a member of.
grant select on deals, deal_dates, deal_members, lease_payments to assistant_readonly;

create or replace function assistant_claim(name text) returns text
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> name, '') $$;

create or replace function assistant_can_see_deal(p_deal_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select assistant_claim('cre8_owner') = 'true'
      or exists (
        select 1
        from deal_members dm
        join brokers b on b.id = dm.broker_id
        where dm.deal_id = p_deal_id
          and lower(b.email) = lower(assistant_claim('email'))
          and assistant_claim('email') <> ''
      )
$$;
grant execute on function assistant_claim(text), assistant_can_see_deal(uuid) to assistant_readonly;

create policy assistant_read on deals          for select to assistant_readonly using (assistant_can_see_deal(id));
create policy assistant_read on deal_dates     for select to assistant_readonly using (assistant_can_see_deal(deal_id));
create policy assistant_read on deal_members   for select to assistant_readonly using (assistant_can_see_deal(deal_id));
create policy assistant_read on lease_payments for select to assistant_readonly using (assistant_can_see_deal(deal_id));

notify pgrst, 'reload schema';
