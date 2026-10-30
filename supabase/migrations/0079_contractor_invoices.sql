-- Contractor tax invoices: an optional way for a contractor to turn a finished work order into a tax invoice
-- for Better Batt. Only possible once the SWMS is signed and the inspection has passed. Extras the contractor
-- added stay "unapproved" (shown on the invoice, left out of the total) until the office approves them.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table subcontractors add column if not exists invoicing_enabled boolean not null default false;

create table if not exists contractor_invoices (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references subcontractors(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  seq integer not null,
  invoice_number text not null,
  status text not null default 'Submitted' check (status in ('Submitted', 'Approved', 'Rejected', 'Paid')),
  -- what the invoice said when it was submitted (so later changes never alter it)
  contractor_name text not null,
  contractor_abn text,
  gst_registered boolean not null default false,
  bank_account_name text,
  bank_bsb text,
  bank_account_number text,
  site text,
  wo_number text,
  completed_date date,
  lines jsonb not null default '[]',               -- [{description, qty, unit, rate, amount}]
  line_ids uuid[] not null default '{}',           -- work order lines billed on this invoice
  unapproved_extras jsonb not null default '[]',   -- [{description, qty}] shown on the invoice, not in the total
  subtotal_ex numeric(12,2) not null default 0,
  gst numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  note text,
  swms_ok boolean not null default false,
  inspection_ok boolean not null default false,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  reject_reason text,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (subcontractor_id, seq)
);

-- Data API access (Supabase no longer auto-grants new tables from 2026-10-30).
-- No anon grant: Coverage never reads tables without a login.
grant select, insert, update, delete on public.contractor_invoices to authenticated;
grant select, insert, update, delete on public.contractor_invoices to service_role;

create index if not exists idx_contractor_invoices_wo on contractor_invoices (work_order_id);
create index if not exists idx_contractor_invoices_sub on contractor_invoices (subcontractor_id);
create index if not exists idx_contractor_invoices_status on contractor_invoices (status);

alter table contractor_invoices enable row level security;

drop policy if exists "contractor_invoices: staff full access" on contractor_invoices;
create policy "contractor_invoices: staff full access" on contractor_invoices
  for all using (is_staff()) with check (is_staff());

-- Contractors read their own invoices. They are created through the app's server route, which checks the SWMS
-- and inspection first, so contractors have no direct insert/update access.
drop policy if exists "contractor_invoices: contractor reads own" on contractor_invoices;
create policy "contractor_invoices: contractor reads own" on contractor_invoices
  for select using (subcontractor_id = my_subcontractor_id());
