-- Discount on an invoice: a dollar amount or a percentage of the items/amount, taken off before GST.
-- amount_ex_gst stays the final ex-GST figure (after the discount), so reports, QuickBooks export and
-- the profit panel keep working. discount_ex_gst is the dollar value taken off.
alter table invoices add column if not exists discount_type text not null default 'amount';
alter table invoices add column if not exists discount_value numeric not null default 0;
alter table invoices add column if not exists discount_ex_gst numeric not null default 0;
alter table invoices add column if not exists discount_label text;
alter table invoices drop constraint if exists invoices_discount_type_check;
alter table invoices add constraint invoices_discount_type_check check (discount_type in ('amount', 'percent'));
