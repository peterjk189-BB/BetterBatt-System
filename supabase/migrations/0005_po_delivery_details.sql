-- Adds delivery details to purchase orders: where the order should be delivered, who to
-- contact on site, and when it's expected to arrive.
alter table purchase_orders
  add column if not exists delivery_address text,
  add column if not exists site_contact_name text,
  add column if not exists site_contact_phone text,
  add column if not exists delivery_date date,
  add column if not exists delivery_time time;
