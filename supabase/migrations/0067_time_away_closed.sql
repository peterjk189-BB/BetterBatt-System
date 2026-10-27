-- Closed dates: a "Closed" entry for the whole business (public holiday, shutdown) that shows across the Calendar
-- and warns when anything is booked on it. Run once in Supabase -> SQL Editor, after 0064. Safe to re-run.
alter table time_away add column if not exists all_staff boolean not null default false;

-- Replace the old "kind" and "exactly one person" checks (their auto-generated names vary).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.time_away'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%kind%' or pg_get_constraintdef(oid) ilike '%user_id%')
  loop
    execute format('alter table time_away drop constraint %I', c.conname);
  end loop;
end $$;

alter table time_away add constraint time_away_kind_ck
  check (kind in ('Holiday', 'Appointment', 'Sick', 'Training', 'Other', 'Closed'));
alter table time_away add constraint time_away_who_ck
  check (
    (all_staff and user_id is null and subcontractor_id is null)
    or (not all_staff and ((user_id is not null) <> (subcontractor_id is not null)))
  );

notify pgrst, 'reload schema';
