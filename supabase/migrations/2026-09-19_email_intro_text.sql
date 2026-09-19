-- Multiple-type emails: intro sits under the heading and above listing cards.
-- Body stays under the cards. Single-type emails ignore this column.
alter table public.email_campaigns
  add column if not exists intro_text text;
