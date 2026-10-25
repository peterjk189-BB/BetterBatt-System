-- Fuel levy on purchase orders: a dollar amount (ex GST) or a % of the subtotal. Run once in Supabase -> SQL Editor.
alter table purchase_orders add column if not exists fuel_levy_type text not null default 'amount';
alter table purchase_orders add column if not exists fuel_levy_value numeric(12,3) not null default 0;
notify pgrst, 'reload schema';
