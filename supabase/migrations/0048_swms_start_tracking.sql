-- SWMS start tracking: when (and where) a contractor started and completed their SWMS, and whether
-- the office alerts for those two events have been sent.
alter table swms add column if not exists started_at timestamptz;
alter table swms alter column started_at set default now();
alter table swms add column if not exists start_lat double precision;
alter table swms add column if not exists start_lng double precision;
alter table swms add column if not exists start_accuracy_m numeric;
alter table swms add column if not exists completed_at timestamptz;
alter table swms add column if not exists start_notified_at timestamptz;
alter table swms add column if not exists completed_notified_at timestamptz;
-- Existing SWMS: treat creation time as the start time.
update swms set started_at = created_at where started_at is null;
