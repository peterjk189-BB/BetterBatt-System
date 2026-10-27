-- Time away: holidays, appointments, sick days, training etc. for office staff and
-- contractors, shown as bars across the Calendar (admin/office only — contractors never see them).
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists time_away (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of these says who is away: an office/admin user, or a contractor.
  user_id uuid references profiles(id) on delete cascade,
  subcontractor_id uuid references subcontractors(id) on delete cascade,
  kind text not null default 'Holiday' check (kind in ('Holiday', 'Appointment', 'Sick', 'Training', 'Other')),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((user_id is not null) <> (subcontractor_id is not null))
);

grant select, insert, update, delete on public.time_away to authenticated;
grant select, insert, update, delete on public.time_away to service_role;

create index if not exists idx_time_away_dates on time_away (start_date, end_date);

alter table time_away enable row level security;
drop policy if exists "time_away: staff full access" on time_away;
create policy "time_away: staff full access" on time_away
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
