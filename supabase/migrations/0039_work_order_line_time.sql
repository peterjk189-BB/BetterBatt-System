-- Start time for a scheduled work order task, so jobs can be ordered through the day on the Calendar.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table work_order_lines add column if not exists task_time time;

notify pgrst, 'reload schema';
