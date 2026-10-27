-- Per-option discount/markup ($ amount per option key, e.g. {"A": -50}). Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists option_adjust jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
