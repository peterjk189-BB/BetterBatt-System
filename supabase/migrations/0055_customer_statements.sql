-- Customer statements: which customers are account holders (get statements), and a log of statements sent.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table customers add column if not exists statement_account boolean not null default false;

create table if not exists customer_statements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  statement_date date not null,
  total_owing numeric(12,2) not null default 0,
  sent_to text,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null
);

grant select, insert, update, delete on public.customer_statements to authenticated;
grant select, insert, update, delete on public.customer_statements to service_role;

create index if not exists idx_customer_statements_customer on customer_statements (customer_id, sent_at desc);

alter table customer_statements enable row level security;
drop policy if exists "customer_statements: staff full access" on customer_statements;
create policy "customer_statements: staff full access" on customer_statements for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
