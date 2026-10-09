-- Site address printed on an invoice (defaults from the quote, editable).
alter table invoices add column if not exists site_address text;
notify pgrst, 'reload schema';
