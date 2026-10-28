-- Purchase orders delivered straight to a job site (no stock receipt): a flag + delivered date on the PO,
-- and "materials delivered" on the work order. Run once in Supabase -> SQL Editor. Safe to re-run.
alter table purchase_orders add column if not exists site_delivery boolean not null default false;
alter table purchase_orders add column if not exists delivered_at timestamptz;
alter table work_orders add column if not exists materials_delivered_at timestamptz;
notify pgrst, 'reload schema';
