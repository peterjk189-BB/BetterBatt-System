-- Regular site contacts for purchase orders (pick a name and the phone number fills in). Run once in Supabase -> SQL Editor.
create table if not exists site_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.site_contacts to authenticated;
grant select, insert, update, delete on public.site_contacts to service_role;

alter table site_contacts enable row level security;
drop policy if exists "site_contacts: staff full access" on site_contacts;
create policy "site_contacts: staff full access" on site_contacts for all using (is_staff()) with check (is_staff());

insert into site_contacts (name, phone)
select 'Better Batt Office', '9729 1755'
where not exists (select 1 from site_contacts where name ilike 'Better Batt Office');

notify pgrst, 'reload schema';
