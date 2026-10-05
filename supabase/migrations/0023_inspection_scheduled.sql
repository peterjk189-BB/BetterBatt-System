-- Inspections get booked onto the Calendar automatically: when an installer
-- completes their SWMS, an inspection is created with status 'Scheduled'
-- for the next weekday, shown in bold red on the Calendar and movable to
-- whatever day suits. It turns into a 'Draft' once the inspection is filled
-- in, and 'Completed' when finished.
--
-- (swms.inspection_notified_at, added in 0022, now records when that
-- inspection was booked, so it only ever happens once per SWMS.)
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections drop constraint if exists inspections_status_check;
alter table inspections add constraint inspections_status_check
  check (status in ('Scheduled', 'Draft', 'Completed'));

create index if not exists idx_inspections_status_date on inspections (status, inspection_date);
