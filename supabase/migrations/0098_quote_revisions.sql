-- Quote revisions: Q1125 stays as sent; "Revise" creates Q1125-A, Q1125-B ... as new quotes with their own customer link.
-- A revision shares the root quote's number (quote_number) and adds a letter, so the number is no longer unique on its own.
alter table projects add column if not exists revision_of uuid references projects(id) on delete set null;
alter table projects add column if not exists revision_letter text;
alter table projects drop constraint if exists projects_quote_number_key;
create unique index if not exists projects_quote_rev_idx on projects (quote_number, coalesce(revision_letter, ''));
-- Older versions get the outcome "Superseded".
alter table projects drop constraint if exists projects_outcome_check;
alter table projects
  add constraint projects_outcome_check check (outcome in ('Open', 'Accepted', 'Complete', 'Lost', 'Cancelled', 'Superseded'));
