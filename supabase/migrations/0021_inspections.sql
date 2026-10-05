-- Inspections: Better Batt's own site inspection report, replacing the
-- Bradford "Inspection Report" PDF. One report can cover any mix of
-- Foil, Wall batt and Ceiling inspections — the include_* ticks decide
-- which sections appear on screen and on the printed report.
--
-- Each section's tick-boxes and Yes/No/NA checks live in a jsonb column so
-- the checklist can gain or reword items without a migration each time.
-- The fields the office searches and sorts on are real columns.
--
-- Photos reuse the existing `attachments` table (category 'Photo', with a
-- caption) and the private `attachments` storage bucket, under the path
-- inspections/<inspection id>/.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create sequence if not exists inspection_number_seq start 1;

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_number integer not null unique default nextval('inspection_number_seq'),
  inspection_date date not null default current_date,
  inspection_time time,
  status text not null default 'Draft' check (status in ('Draft', 'Completed')),
  builder_name text,
  site_address text,
  suburb text,
  contractor text,
  sales_order text,
  audit_region text,
  include_foil boolean not null default false,
  include_wall boolean not null default false,
  include_ceiling boolean not null default false,
  result text check (result in ('PASS', 'FAIL')),
  maintenance text check (maintenance in ('Yes', 'No')),
  rectifications text,
  foil jsonb not null default '{}'::jsonb,
  wall jsonb not null default '{}'::jsonb,
  ceiling jsonb not null default '{}'::jsonb,
  inspector_name text,
  installer_name text,
  inspector_signature text,
  signed_at timestamptz,
  customer_id uuid references customers(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  work_order_id uuid references work_orders(id) on delete set null,
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inspections_updated_at on inspections;
create trigger trg_inspections_updated_at before update on inspections
  for each row execute procedure set_updated_at();

create index if not exists idx_inspections_date on inspections (inspection_date desc);
create index if not exists idx_inspections_work_order on inspections (work_order_id);
create index if not exists idx_inspections_project on inspections (project_id);

-- Who may use Inspections: admin/office (is_staff), plus any other user an
-- admin has given the "Inspections" tab on the Users page.
create or replace function can_do_inspections()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_staff() or exists (
    select 1 from profiles
    where id = auth.uid() and allowed_tabs is not null and 'inspections' = any (allowed_tabs)
  );
$$;

alter table inspections enable row level security;
drop policy if exists "inspections: inspection users full access" on inspections;
create policy "inspections: inspection users full access" on inspections
  for all using (can_do_inspections()) with check (can_do_inspections());

-- Attachments: hang captioned photos off an inspection.
alter table attachments add column if not exists inspection_id uuid references inspections(id) on delete cascade;
create index if not exists idx_attachments_inspection on attachments (inspection_id);

drop policy if exists "attachments: inspection users manage inspection photos" on attachments;
create policy "attachments: inspection users manage inspection photos" on attachments
  for all using (inspection_id is not null and can_do_inspections())
  with check (inspection_id is not null and can_do_inspections());

drop policy if exists "attachments bucket: inspection photos" on storage.objects;
create policy "attachments bucket: inspection photos" on storage.objects
  for all using (bucket_id = 'attachments' and name like 'inspections/%' and can_do_inspections())
  with check (bucket_id = 'attachments' and name like 'inspections/%' and can_do_inspections());
