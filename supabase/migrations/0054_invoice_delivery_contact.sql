-- Site contact and time for invoice deliveries (used on the invoice picking slip).
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table invoices
  add column if not exists delivery_contact_name text,
  add column if not exists delivery_contact_phone text,
  add column if not exists delivery_time text;

notify pgrst, 'reload schema';
