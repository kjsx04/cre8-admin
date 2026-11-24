-- Undo 2026-11-24_assistant_functions_harden_execute.sql. Run by hand only.
-- Puts back Postgres's default (anyone may execute). Not recommended.

grant execute on function assistant_can_see_deal(uuid) to public;
grant execute on function assistant_claim(text)        to public;
