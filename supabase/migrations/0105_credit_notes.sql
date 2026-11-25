-- Credit notes (adjustment notes): a refund or credit for returned stock or an overcharge.
-- Stored as an invoice with kind 'Credit' and negative amounts, linked to the original invoice.
-- Refunds paid out are recorded as negative payments on the credit note.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table invoices drop constraint if exists invoices_kind_check;
alter table invoices add constraint invoices_kind_check check (kind in ('Deposit', 'Balance', 'Full', 'Progress', 'Other', 'Items', 'Credit'));
alter table invoices add column if not exists credit_of uuid references invoices(id) on delete set null;
create index if not exists idx_invoices_credit_of on invoices (credit_of);
notify pgrst, 'reload schema';
