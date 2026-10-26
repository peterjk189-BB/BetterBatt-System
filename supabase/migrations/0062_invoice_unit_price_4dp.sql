-- Keep invoice unit prices to 4 decimals so whole-dollar GST-inclusive prices stay exact on multi-pack lines.
-- Run once in Supabase -> SQL Editor (after 0061).
alter table invoice_lines alter column unit_price type numeric(12,4);
notify pgrst, 'reload schema';
