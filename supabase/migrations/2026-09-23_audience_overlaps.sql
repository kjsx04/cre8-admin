-- Recipient counts for multi-list sends.
--
-- Buyers holds 2,616 and Sellers 2,440, but 883 people are on both, so a send to
-- "Buyers + Sellers" reaches 4,173 — not 5,056. Adding the list sizes together
-- made the composer overstate every multi-list send.
--
-- This groups contacts by the EXACT set of lists they belong to. Those groups are
-- disjoint (a contact is in exactly one), so the union of any selection is simply
-- the sum of the groups that touch it. No inclusion-exclusion, exact for any
-- number of lists, and only a handful of groups exist across 5,000 contacts.
--
-- Read by loadAudienceOverlaps() in src/lib/email/contact-mirror.ts.

create or replace function audience_overlaps()
returns table (segment_ids text[], total bigint, subscribed bigint)
language sql
stable
as $$
  select
    array(select unnest(c.segment_ids) order by 1)::text[] as segment_ids,
    count(*)::bigint as total,
    count(*) filter (where not c.unsubscribed)::bigint as subscribed
  from email_contacts c
  where array_length(c.segment_ids, 1) > 0
  group by 1
$$;
