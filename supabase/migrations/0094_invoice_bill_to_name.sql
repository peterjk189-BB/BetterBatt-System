-- Name printed on one invoice (e.g. a cash sale to a named person) without renaming the shared customer.
alter table invoices add column if not exists bill_to_name text;
