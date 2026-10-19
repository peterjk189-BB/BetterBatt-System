-- Optional extras on a quote ("Option A", "Option B", ...).
-- Lines with option_key NULL are the main quote. Lines with a key belong to that option and only
-- count towards totals, work orders and invoices once the option is accepted.
alter table project_lines add column if not exists option_key text;
alter table projects add column if not exists option_titles jsonb not null default '{}'::jsonb;
alter table projects add column if not exists option_accepted text[] not null default '{}';
