-- Itemised invoices: sell inventory items on an invoice (and allow invoices with no quote).
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  description text not null default '',
  qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0, -- ex GST
  line_ex numeric(12,2) not null default 0,
  sort_order integer not null default 0
);
create index if not exists idx_invoice_lines_invoice on invoice_lines (invoice_id);

alter table invoice_lines enable row level security;
drop policy if exists "invoice_lines: staff full access" on invoice_lines;
create policy "invoice_lines: staff full access" on invoice_lines for all using (is_staff()) with check (is_staff());

alter table invoices drop constraint if exists invoices_kind_check;
alter table invoices add constraint invoices_kind_check check (kind in ('Deposit', 'Balance', 'Full', 'Progress', 'Other', 'Items'));

notify pgrst, 'reload schema';
