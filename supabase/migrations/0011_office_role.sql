-- Adds an "office" role: full day-to-day access like admin (quotes, work
-- orders, contractor payments, purchase orders, customers, suppliers,
-- subcontractors, labour items, inventory) but cannot manage other users
-- (the Users page and its API routes stay admin-only).

-- Widen the role check constraint to allow 'office'.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'office', 'installer'));

-- is_admin() stays as-is (true admin only — used to gate user management).
-- New helper: true for admin OR office, used everywhere else that used to
-- be admin-only full access.
create or replace function is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'office')
  );
$$;

-- app_settings
drop policy if exists "app_settings: admin writes" on app_settings;
create policy "app_settings: admin writes" on app_settings
  for all using (is_staff()) with check (is_staff());

-- customers
drop policy if exists "customers: admin full access" on customers;
create policy "customers: admin full access" on customers
  for all using (is_staff()) with check (is_staff());

-- subcontractors
drop policy if exists "subcontractors: admin full access" on subcontractors;
create policy "subcontractors: admin full access" on subcontractors
  for all using (is_staff()) with check (is_staff());

-- suppliers
drop policy if exists "suppliers: admin full access" on suppliers;
create policy "suppliers: admin full access" on suppliers
  for all using (is_staff()) with check (is_staff());

-- parts
drop policy if exists "parts: admin full access" on parts;
create policy "parts: admin full access" on parts
  for all using (is_staff()) with check (is_staff());

-- labour_items
drop policy if exists "labour_items: admin full access" on labour_items;
create policy "labour_items: admin full access" on labour_items
  for all using (is_staff()) with check (is_staff());

-- projects
drop policy if exists "projects: admin full access" on projects;
create policy "projects: admin full access" on projects
  for all using (is_staff()) with check (is_staff());

-- project_lines
drop policy if exists "project_lines: admin full access" on project_lines;
create policy "project_lines: admin full access" on project_lines
  for all using (is_staff()) with check (is_staff());

-- work_orders
drop policy if exists "work_orders: admin full access" on work_orders;
create policy "work_orders: admin full access" on work_orders
  for all using (is_staff()) with check (is_staff());

-- work_order_lines
drop policy if exists "work_order_lines: admin full access" on work_order_lines;
create policy "work_order_lines: admin full access" on work_order_lines
  for all using (is_staff()) with check (is_staff());

-- purchase_orders
drop policy if exists "purchase_orders: admin full access" on purchase_orders;
create policy "purchase_orders: admin full access" on purchase_orders
  for all using (is_staff()) with check (is_staff());

-- purchase_order_lines
drop policy if exists "purchase_order_lines: admin full access" on purchase_order_lines;
create policy "purchase_order_lines: admin full access" on purchase_order_lines
  for all using (is_staff()) with check (is_staff());

-- attachments
drop policy if exists "attachments: admin full access" on attachments;
create policy "attachments: admin full access" on attachments
  for all using (is_staff()) with check (is_staff());

-- attachments storage bucket
drop policy if exists "attachments bucket: admin full access" on storage.objects;
create policy "attachments bucket: admin full access" on storage.objects
  for all using (bucket_id = 'attachments' and is_staff())
  with check (bucket_id = 'attachments' and is_staff());

-- profiles: deliberately left on is_admin() (not is_staff()) — only true
-- admins can read/manage other users' profiles or see the Users page.
