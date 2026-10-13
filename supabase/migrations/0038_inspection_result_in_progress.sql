-- Allow "IN PROGRESS" as an inspection result, between PASS and FAIL.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections drop constraint if exists inspections_result_check;
alter table inspections
  add constraint inspections_result_check check (result in ('PASS', 'IN PROGRESS', 'FAIL'));

notify pgrst, 'reload schema';
