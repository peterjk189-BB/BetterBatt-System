alter table invoices add column if not exists delivery_address text;

notify pgrst, 'reload schema';
