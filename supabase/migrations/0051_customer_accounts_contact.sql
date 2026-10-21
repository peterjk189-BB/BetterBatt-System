-- Customers: an accounts contact so we know where to send invoices.
-- Invoices default their "Email to" address to the accounts email when it is set.
alter table customers add column if not exists accounts_contact_name text;
alter table customers add column if not exists accounts_contact_email text;
alter table customers add column if not exists accounts_contact_phone text;
