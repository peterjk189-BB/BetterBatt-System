-- Sales Report: the annual sales target (ex GST) shown on the directors' weekly Sales Report.
-- Run once in Supabase -> SQL Editor. Safe to re-run. Until it is run the report uses $2,750,000.
alter table company_settings add column if not exists annual_sales_target numeric;
update company_settings set annual_sales_target = 2750000 where id = true and annual_sales_target is null;
notify pgrst, 'reload schema';
