-- Builder contract pricing (e.g. Maple Living).
-- A builder's agreed supply & install $/m², in their own wording, linked to an existing Inventory item.
-- Rates are grouped by "effective_from" date so a new year's rates can be loaded without changing old quotes.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists customer_contract_rates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  builder_description text not null,
  rate_per_m2 numeric(10,2) not null default 0,
  effective_from date not null default current_date,
  sort_order integer not null default 0,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Data API access (Supabase no longer auto-grants new tables from 2026-10-30).
-- No anon grant: Coverage never reads tables without a login.
grant select, insert, update, delete on public.customer_contract_rates to authenticated;
grant select, insert, update, delete on public.customer_contract_rates to service_role;

create index if not exists idx_contract_rates_customer on customer_contract_rates (customer_id, effective_from desc);

drop trigger if exists trg_contract_rates_updated_at on customer_contract_rates;
create trigger trg_contract_rates_updated_at before update on customer_contract_rates
  for each row execute procedure set_updated_at();

alter table customer_contract_rates enable row level security;
drop policy if exists "customer_contract_rates: staff full access" on customer_contract_rates;
create policy "customer_contract_rates: staff full access" on customer_contract_rates
  for all using (is_staff()) with check (is_staff());

-- Quote lines picked from a contract keep a copy of the rate + wording used at the time.
alter table project_lines add column if not exists contract_rate_id uuid references customer_contract_rates(id) on delete set null;
alter table project_lines add column if not exists contract_rate numeric(10,2);
alter table project_lines add column if not exists contract_description text;
