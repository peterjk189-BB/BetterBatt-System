-- Builder rating: a log of notes about a customer (late payment, disputes, extras demanded...) and a manual grade override.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  category text not null default 'Other',
  severity text not null default 'low' check (severity in ('low', 'med', 'high', 'good')),
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

-- Data API access (Supabase no longer auto-grants new tables from 2026-10-30).
-- No anon grant: Coverage never reads tables without a login.
grant select, insert, update, delete on public.customer_notes to authenticated;
grant select, insert, update, delete on public.customer_notes to service_role;

create index if not exists idx_customer_notes_customer on customer_notes (customer_id, created_at desc);

alter table customer_notes enable row level security;
drop policy if exists "customer_notes: staff full access" on customer_notes;
create policy "customer_notes: staff full access" on customer_notes
  for all using (is_staff()) with check (is_staff());

alter table customers add column if not exists rating_override text check (rating_override in ('A', 'B', 'C', 'D'));
