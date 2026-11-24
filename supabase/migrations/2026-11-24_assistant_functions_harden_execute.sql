-- ALREADY APPLIED to the database on Nov 24 2026 (as "assistant_functions_harden_execute").
-- This file records it in the repo. Safe to re-run: revoke and grant are idempotent.
--
-- Why: Postgres grants EXECUTE on new functions to PUBLIC by default, so anon and
-- authenticated could call the assistant's helpers. assistant_can_see_deal is
-- SECURITY DEFINER, so an outside caller could use it to probe which deal ids
-- exist. Only the assistant's own role needs these.

revoke execute on function assistant_can_see_deal(uuid) from public, anon, authenticated;
revoke execute on function assistant_claim(text)        from public, anon, authenticated;

grant execute on function assistant_can_see_deal(uuid) to assistant_readonly;
grant execute on function assistant_claim(text)        to assistant_readonly;
