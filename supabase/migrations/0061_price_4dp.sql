-- Store sell prices to 4 decimals so a whole-dollar GST-inclusive price (e.g. $46.00 inc GST = $41.8182 ex GST)
-- is exact on quotes and invoices. Run once in Supabase -> SQL Editor.
alter table parts alter column price_retail type numeric(12,4);
alter table parts alter column price_trade type numeric(12,4);
alter table parts alter column price_regency type numeric(12,4);
notify pgrst, 'reload schema';
