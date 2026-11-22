-- Which pay week (Monday date) a contractor line was paid in, so the weekly summary only lists what was paid that week.
alter table work_order_lines add column if not exists pay_week date;
-- Existing paid lines: assume the week the work was done.
update work_order_lines
   set pay_week = date_trunc('week', task_date::timestamp)::date
 where paid and pay_week is null and task_date is not null;
notify pgrst, 'reload schema';
