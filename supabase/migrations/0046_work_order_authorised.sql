-- Contractors are only alerted about a work order's job dates once the office authorises it.
alter table work_orders add column if not exists authorised_at timestamptz;

-- Work orders that already exist keep behaving as before (treated as authorised).
update work_orders set authorised_at = coalesce(created_at, now()) where authorised_at is null;

-- Contractors only see a work order (and its job dates on their schedule) once it is authorised.
create or replace function wo_is_authorised(wo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from work_orders where id = wo and authorised_at is not null);
$$;

drop policy if exists "work_orders: installer reads own jobs" on work_orders;
create policy "work_orders: installer reads own jobs" on work_orders
  for select using (contractor_id = my_subcontractor_id() and authorised_at is not null);

drop policy if exists "work_order_lines: installer reads own lines" on work_order_lines;
create policy "work_order_lines: installer reads own lines" on work_order_lines
  for select using (subcontractor_id = my_subcontractor_id() and wo_is_authorised(work_order_id));
