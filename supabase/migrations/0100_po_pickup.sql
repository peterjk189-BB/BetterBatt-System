-- Purchase orders: collect the stock from the supplier (pickup) instead of having it delivered.
alter table purchase_orders add column if not exists pickup boolean not null default false;
