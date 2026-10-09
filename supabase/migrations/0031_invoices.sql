-- Invoicing: deposit / balance / full invoices raised from accepted quotes, with payments
-- and a QuickBooks Desktop (IIF) export flag. Run once in Supabase -> SQL Editor. Safe to re-run.

create sequence if not exists invoice_number_seq start 1001;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer not null unique default nextval('invoice_number_seq'),
  project_id uuid references projects(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  kind text not null default 'Deposit' check (kind in ('Deposit', 'Balance', 'Full', 'Progress', 'Other')),
  description text,
  amount_ex_gst numeric(12,2) not null default 0,
  gst numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  invoice_date date not null default current_date,
  due_date date,
  terms text,
  customer_po text,
  notes text,
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Void')),
  sent_at timestamptz,
  qb_exported_at timestamptz,
  qb_ref text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at before update on invoices
  for each row execute procedure set_updated_at();

create index if not exists idx_invoices_project on invoices (project_id);
create index if not exists idx_invoices_customer on invoices (customer_id);

create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  paid_on date not null default current_date,
  amount numeric(12,2) not null,
  method text,
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_payments_invoice on invoice_payments (invoice_id);

alter table invoices enable row level security;
alter table invoice_payments enable row level security;
drop policy if exists "invoices: staff full access" on invoices;
create policy "invoices: staff full access" on invoices for all using (is_staff()) with check (is_staff());
drop policy if exists "invoice_payments: staff full access" on invoice_payments;
create policy "invoice_payments: staff full access" on invoice_payments for all using (is_staff()) with check (is_staff());

-- Details printed on invoices + the account names QuickBooks needs for the import file.
alter table company_settings
  add column if not exists invoice_bank_details text,
  add column if not exists invoice_footer text,
  add column if not exists qb_ar_account text,
  add column if not exists qb_income_account text,
  add column if not exists qb_gst_account text;

notify pgrst, 'reload schema';
