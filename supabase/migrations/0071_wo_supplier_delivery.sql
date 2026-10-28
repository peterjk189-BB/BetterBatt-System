-- Work orders: "Supplier delivery" flag (materials ordered from the supplier and delivered, not picked from stock). Run once in Supabase -> SQL Editor. Safe to re-run.
alter table work_orders add column if not exists supplier_delivery boolean not null default false;
notify pgrst, 'reload schema';
