-- Regular delivery addresses for purchase orders (pick from a list instead of typing). Run once in Supabase -> SQL Editor.
create table if not exists delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  address text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.delivery_addresses to authenticated;
grant select, insert, update, delete on public.delivery_addresses to service_role;

alter table delivery_addresses enable row level security;
drop policy if exists "delivery_addresses: staff full access" on delivery_addresses;
create policy "delivery_addresses: staff full access" on delivery_addresses for all using (is_staff()) with check (is_staff());

insert into delivery_addresses (label, address)
select 'Warehouse', '23 Newcastle Road, Bayswater VIC'
where not exists (select 1 from delivery_addresses where address ilike '23 Newcastle Road%');

notify pgrst, 'reload schema';
