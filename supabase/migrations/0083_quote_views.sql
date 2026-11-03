-- Track when a customer opens the emailed quote link: first/last time and how many times.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists first_viewed_at timestamptz;
alter table projects add column if not exists last_viewed_at timestamptz;
alter table projects add column if not exists view_count integer not null default 0;
