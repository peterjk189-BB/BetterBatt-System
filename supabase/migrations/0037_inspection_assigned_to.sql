-- Who is scheduled to do an inspection, so they can be alerted when it is booked for them.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections
  add column if not exists assigned_to uuid references profiles(id) on delete set null;

create index if not exists idx_inspections_assigned_to on inspections (assigned_to);

notify pgrst, 'reload schema';
