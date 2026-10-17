-- Suppliers: several email addresses per supplier.
-- email_contacts: [{"label": "Orders", "email": "orders@x.com.au", "po": true}, ...]
--   label = what the address is for, po = send purchase orders to it.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table suppliers add column if not exists email_contacts jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
