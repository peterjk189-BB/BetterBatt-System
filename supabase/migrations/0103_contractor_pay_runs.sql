-- Contractor pay runs: the office chooses which jobs go into each payment run,
-- rather than the weekly summary being built from a date range.
-- Ticking a line on Contractor Payments now only marks it "checked"; lines become paid
-- when the pay run they're in is marked paid.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists contractor_pay_runs (
  id uuid primary key default gen_random_uuid(),
  pay_date date not null default current_date,
  status text not null default 'Open' check (status in ('Open', 'Paid')),
  paid_at timestamptz,
  emailed_at timestamptz,
  emailed_to text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contractor_pay_runs to authenticated;
grant select, insert, update, delete on public.contractor_pay_runs to service_role;
create index if not exists idx_contractor_pay_runs_date on contractor_pay_runs (pay_date desc);
alter table contractor_pay_runs enable row level security;
drop policy if exists "contractor_pay_runs: staff full access" on contractor_pay_runs;
create policy "contractor_pay_runs: staff full access" on contractor_pay_runs
  for all using (is_staff()) with check (is_staff());

alter table work_order_lines add column if not exists checked boolean not null default false;
alter table work_order_lines add column if not exists pay_run_id uuid references contractor_pay_runs(id) on delete set null;
create index if not exists idx_work_order_lines_pay_run on work_order_lines (pay_run_id);
-- Lines already paid count as checked.
update work_order_lines set checked = true where paid and not checked;

notify pgrst, 'reload schema';
