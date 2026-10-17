-- Suppliers: more contact detail.
--   Accounts contact (name, email, phone)
--   Sales rep (name, phone, email)
--   Purchase orders: the email POs are sent to, an accounts email to copy
--   POs to, and whether the supplier is included in bulk PO emails.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table suppliers add column if not exists accounts_contact_name text;
alter table suppliers add column if not exists accounts_contact_email text;
alter table suppliers add column if not exists accounts_contact_phone text;
alter table suppliers add column if not exists rep_name text;
alter table suppliers add column if not exists rep_phone text;
alter table suppliers add column if not exists rep_email text;
alter table suppliers add column if not exists po_email text;
alter table suppliers add column if not exists po_cc_email text;
alter table suppliers add column if not exists po_bulk_email boolean not null default false;

notify pgrst, 'reload schema';
