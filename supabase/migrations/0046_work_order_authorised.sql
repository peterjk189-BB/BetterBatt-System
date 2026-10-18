-- Contractors are only alerted about a work order's job dates once the office authorises it.
alter table work_orders add column if not exists authorised_at timestamptz;

-- Work orders that already exist keep behaving as before (treated as authorised).
update work_orders set authorised_at = coalesce(created_at, now()) where authorised_at is null;
