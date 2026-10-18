-- Contractor pay now comes from the product's installer rate (inventory page) instead of the
-- Labour Items (Task) list. Each work order line stores the rate it was saved with, so later
-- changes to the inventory rate don't change what a contractor was already told or paid.
alter table work_order_lines add column if not exists rate numeric(10,2);

-- Lock in the existing pay on historic lines that used a Task.
update work_order_lines l
set rate = li.contractor_rate
from labour_items li
where l.labour_item_id = li.id and l.rate is null;
