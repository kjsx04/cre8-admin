-- Undo 2026-11-24_assistant_usage.sql. Run by hand only.
-- Drops the usage log, so the monthly total starts again from zero.

drop table if exists assistant_usage;
