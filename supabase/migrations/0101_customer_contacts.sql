-- Other contacts for a customer (supervisor, site manager, etc).
create table if not exists customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null default '',
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customer_contacts to authenticated;
grant select, insert, update, delete on public.customer_contacts to service_role;
create index if not exists idx_customer_contacts_customer on customer_contacts (customer_id, created_at);
alter table customer_contacts enable row level security;
drop policy if exists "customer_contacts: staff full access" on customer_contacts;
create policy "customer_contacts: staff full access" on customer_contacts
  for all using (is_staff()) with check (is_staff());
notify pgrst, 'reload schema';
