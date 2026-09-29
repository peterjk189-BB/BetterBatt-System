-- Coverage — initial schema
-- Derived from coverage-technical-handover.md §2 (data model) and §3 (workflows).
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Profiles & roles
-- One row per authenticated user. Created automatically on signup (trigger
-- below). role defaults to 'installer' — promote the office/admin account(s)
-- to 'admin' manually after they first sign up:
--   update profiles set role = 'admin' where id = '<their auth user id>';
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'installer' check (role in ('admin', 'installer')),
  subcontractor_id uuid, -- set after subcontractors table exists (FK added below)
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function my_subcontractor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select subcontractor_id from profiles where id = auth.uid();
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

alter table profiles enable row level security;

drop policy if exists "profiles: read own or admin reads all" on profiles;
create policy "profiles: read own or admin reads all" on profiles
  for select using (id = auth.uid() or is_admin());

drop policy if exists "profiles: admin manages all" on profiles;
create policy "profiles: admin manages all" on profiles
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- App settings (e.g. GST rate) — keep magic numbers out of the app code
-- ============================================================================

create table if not exists app_settings (
  key text primary key,
  value text not null
);

insert into app_settings (key, value) values ('gst_rate', '0.10')
  on conflict (key) do nothing;

alter table app_settings enable row level security;

drop policy if exists "app_settings: anyone signed in can read" on app_settings;
create policy "app_settings: anyone signed in can read" on app_settings
  for select using (auth.uid() is not null);

drop policy if exists "app_settings: admin writes" on app_settings;
create policy "app_settings: admin writes" on app_settings
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Customers  (handover §2.1)
-- ============================================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Private' check (category in ('Builder', 'Retro Fit', 'Private')),
  discount_pct numeric(5,2) not null default 0,
  payment_terms text not null default '7 Days' check (payment_terms in ('7 Days', 'COD', '30 Days')),
  contact_name text,
  contact_phone text,
  contact_email text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at before update on customers
  for each row execute procedure set_updated_at();

alter table customers enable row level security;
drop policy if exists "customers: admin full access" on customers;
create policy "customers: admin full access" on customers
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Subcontractors  (handover §2.2)
-- ============================================================================

create table if not exists subcontractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  abn text,
  active boolean not null default true,
  linked_user_id uuid references auth.users(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subcontractors_updated_at on subcontractors;
create trigger trg_subcontractors_updated_at before update on subcontractors
  for each row execute procedure set_updated_at();

alter table profiles
  add constraint profiles_subcontractor_id_fkey
  foreign key (subcontractor_id) references subcontractors(id) on delete set null;

alter table subcontractors enable row level security;
drop policy if exists "subcontractors: admin full access" on subcontractors;
create policy "subcontractors: admin full access" on subcontractors
  for all using (is_admin()) with check (is_admin());
drop policy if exists "subcontractors: installer reads own record" on subcontractors;
create policy "subcontractors: installer reads own record" on subcontractors
  for select using (id = my_subcontractor_id());

-- ============================================================================
-- Suppliers
-- ============================================================================

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute procedure set_updated_at();

alter table suppliers enable row level security;
drop policy if exists "suppliers: admin full access" on suppliers;
create policy "suppliers: admin full access" on suppliers
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Parts / inventory  (handover §2.3)
-- ============================================================================

create table if not exists parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  coverage_m2 numeric(10,3) not null default 0,
  pack_cost_ex_gst numeric(10,2) not null default 0,
  installer_rate_per_m2 numeric(10,2) not null default 0,
  supply_charge_per_pack numeric(10,2) not null default 0,
  supply_install_rate_per_m2 numeric(10,2) not null default 0,
  pack_per_multi numeric(10,2) not null default 0,
  multi numeric(10,2) not null default 0,
  pks numeric(10,2) not null default 0,
  stock_on_hand numeric(12,2) generated always as (pack_per_multi * multi + pks) stored,
  is_stock_item boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_parts_updated_at on parts;
create trigger trg_parts_updated_at before update on parts
  for each row execute procedure set_updated_at();

alter table parts enable row level security;
drop policy if exists "parts: admin full access" on parts;
create policy "parts: admin full access" on parts
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Labour items — contractor pay rate schedule  (handover §2.4)
-- ============================================================================

create table if not exists labour_items (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null,
  contractor_rate numeric(10,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_labour_items_updated_at on labour_items;
create trigger trg_labour_items_updated_at before update on labour_items
  for each row execute procedure set_updated_at();

alter table labour_items enable row level security;
drop policy if exists "labour_items: admin full access" on labour_items;
create policy "labour_items: admin full access" on labour_items
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Projects / quotes  (handover §2.5)
-- ============================================================================

create sequence if not exists quote_number_seq start 1001;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  quote_number integer not null unique default nextval('quote_number_seq'),
  customer_id uuid references customers(id) on delete set null,
  contact_name text,
  contact_phone text,
  contact_email text,
  job_type text not null default 'SUPPLY & INSTALL'
    check (job_type in ('S+F QUOTE', 'SUPPLY & INSTALL', 'SUPPLY ONLY', 'MATERIAL QUOTE', 'OPTION QUOTE')),
  category text check (category in ('Builder', 'Retro Fit', 'Private')),
  outcome text not null default 'Open' check (outcome in ('Open', 'Accepted', 'Lost', 'Cancelled')),
  lot_no text,
  address text,
  suburb text,
  entry_date date not null default current_date,
  notes text,
  quote_markup numeric(10,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at before update on projects
  for each row execute procedure set_updated_at();

alter table projects enable row level security;
drop policy if exists "projects: admin full access" on projects;
create policy "projects: admin full access" on projects
  for all using (is_admin()) with check (is_admin());

create table if not exists project_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  qty_m2 numeric(10,2) not null default 0,
  note text,
  sort_order integer not null default 0
);

alter table project_lines enable row level security;
drop policy if exists "project_lines: admin full access" on project_lines;
create policy "project_lines: admin full access" on project_lines
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Work orders  (handover §2.6)
-- ============================================================================

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_number text not null unique,
  project_id uuid references projects(id) on delete set null,
  contractor_id uuid references subcontractors(id) on delete set null,
  po_number text,
  po_value numeric(10,2),
  entry_date date,
  completed_date date,
  jsa_received boolean not null default false,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_work_orders_updated_at on work_orders;
create trigger trg_work_orders_updated_at before update on work_orders
  for each row execute procedure set_updated_at();

alter table work_orders enable row level security;
drop policy if exists "work_orders: admin full access" on work_orders;
create policy "work_orders: admin full access" on work_orders
  for all using (is_admin()) with check (is_admin());
drop policy if exists "work_orders: installer reads own jobs" on work_orders;
create policy "work_orders: installer reads own jobs" on work_orders
  for select using (contractor_id = my_subcontractor_id());

create table if not exists work_order_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  task_date date,
  completed boolean not null default false,
  labour_item_id uuid references labour_items(id) on delete set null,
  part_id uuid references parts(id) on delete set null,
  qty numeric(10,2) not null default 0,
  subcontractor_id uuid references subcontractors(id) on delete set null,
  paid boolean not null default false,
  note text,
  sort_order integer not null default 0
);

alter table work_order_lines enable row level security;
drop policy if exists "work_order_lines: admin full access" on work_order_lines;
create policy "work_order_lines: admin full access" on work_order_lines
  for all using (is_admin()) with check (is_admin());
drop policy if exists "work_order_lines: installer reads own lines" on work_order_lines;
create policy "work_order_lines: installer reads own lines" on work_order_lines
  for select using (subcontractor_id = my_subcontractor_id());

-- NOTE (open question, see handover §6 — "what level of permissions do
-- installers actually need?"): installers currently get READ-ONLY access to
-- their own work orders and task lines. Letting them tick off "completed"
-- themselves is a one-line policy addition once that's confirmed with the
-- business — deliberately not guessed here.

-- ============================================================================
-- Purchase orders
-- ============================================================================

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text,
  supplier_id uuid references suppliers(id) on delete set null,
  status text not null default 'Draft' check (status in ('Draft', 'Ordered', 'Received')),
  order_date date,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_purchase_orders_updated_at on purchase_orders;
create trigger trg_purchase_orders_updated_at before update on purchase_orders
  for each row execute procedure set_updated_at();

alter table purchase_orders enable row level security;
drop policy if exists "purchase_orders: admin full access" on purchase_orders;
create policy "purchase_orders: admin full access" on purchase_orders
  for all using (is_admin()) with check (is_admin());

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  qty_multi numeric(10,2) not null default 0,
  qty_pks numeric(10,2) not null default 0,
  received_multi numeric(10,2) not null default 0,
  received_pks numeric(10,2) not null default 0,
  unit_cost numeric(10,2)
);

alter table purchase_order_lines enable row level security;
drop policy if exists "purchase_order_lines: admin full access" on purchase_order_lines;
create policy "purchase_order_lines: admin full access" on purchase_order_lines
  for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- Attachments — photos & SWMS  (handover §2.7)
-- Files themselves live in Supabase Storage; this table stores the pointer.
-- ============================================================================

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  work_order_id uuid references work_orders(id) on delete cascade,
  category text not null check (category in ('Photo', 'SWMS', 'Other document')),
  storage_path text not null,
  file_name text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table attachments enable row level security;
drop policy if exists "attachments: admin full access" on attachments;
create policy "attachments: admin full access" on attachments
  for all using (is_admin()) with check (is_admin());
drop policy if exists "attachments: installer reads own job attachments" on attachments;
create policy "attachments: installer reads own job attachments" on attachments
  for select using (
    work_order_id in (
      select id from work_orders where contractor_id = my_subcontractor_id()
    )
  );

-- ============================================================================
-- Storage bucket for attachments
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments bucket: admin full access" on storage.objects;
create policy "attachments bucket: admin full access" on storage.objects
  for all using (bucket_id = 'attachments' and is_admin())
  with check (bucket_id = 'attachments' and is_admin());

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_projects_customer on projects(customer_id);
create index if not exists idx_projects_outcome on projects(outcome) where not archived;
create index if not exists idx_project_lines_project on project_lines(project_id);
create index if not exists idx_work_orders_project on work_orders(project_id);
create index if not exists idx_work_orders_contractor on work_orders(contractor_id) where not archived;
create index if not exists idx_work_order_lines_wo on work_order_lines(work_order_id);
create index if not exists idx_work_order_lines_date on work_order_lines(task_date);
create index if not exists idx_purchase_order_lines_po on purchase_order_lines(purchase_order_id);
create index if not exists idx_attachments_project on attachments(project_id);
create index if not exists idx_attachments_wo on attachments(work_order_id);
