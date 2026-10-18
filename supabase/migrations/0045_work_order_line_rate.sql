-- Contractor pay now comes from the product's installer rate (inventory page) instead of the
-- Labour Items (Task) list. Each work order line stores the rate it was saved with, so later
-- changes to the inventory rate don't change what a contractor was already told or paid.
alter table work_order_lines add column if not exists rate numeric(10,2);

-- Re-price every existing line from its product's installer rate (all current data is test data).
update work_order_lines l
set rate = p.installer_rate_per_m2
from parts p
where l.part_id = p.id;

-- Lines with no product: keep whatever the old Task paid.
update work_order_lines l
set rate = li.contractor_rate
from labour_items li
where l.rate is null and l.labour_item_id = li.id;

update work_order_lines set rate = 0 where rate is null;

-- The Task link is no longer used.
update work_order_lines set labour_item_id = null;
