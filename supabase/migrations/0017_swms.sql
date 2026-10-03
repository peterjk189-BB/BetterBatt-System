-- SWMS / JSA: Better Batt's own digital Safe Work Method Statement /
-- Job Safety Analysis, filled in by the installer on site before starting
-- work. Replaces the paper CSR/Bradford SWMS form, covering our 4 job
-- types: wall wrap (retrofit), ceiling, walls and ceiling, and underfloor.
--
-- The scope-of-work ticks, hazard/control-measures table, site report
-- checklist and photos-taken checklist all live in jsonb columns so the
-- form can gain or reword items without a migration each time. The fields
-- the office searches and sorts on (date, job, status) are real columns.
--
-- Photos reuse the existing `attachments` table and private `attachments`
-- storage bucket, under the path swms/<swms id>/.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create sequence if not exists swms_number_seq start 1;

create table if not exists swms (
  id uuid primary key default gen_random_uuid(),
  swms_number integer not null unique default nextval('swms_number_seq'),
  job_date date not null default current_date,
  time_in time,
  time_out time,
  job_type text not null default 'Ceiling' check (job_type in ('Wall wrap (retrofit)', 'Ceiling', 'Walls and ceiling', 'Underfloor')),
  status text not null default 'Draft' check (status in ('Draft', 'Completed')),
  builder_name text,
  site_address text,
  suburb text,
  customer_id uuid references customers(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  work_order_id uuid references work_orders(id) on delete set null,
  scope jsonb not null default '{}'::jsonb,
  hazards jsonb not null default '[]'::jsonb,
  site_report jsonb not null default '{}'::jsonb,
  photos_checklist jsonb not null default '{}'::jsonb,
  installers jsonb not null default '[]'::jsonb,
  comments text,
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_swms_updated_at on swms;
create trigger trg_swms_updated_at before update on swms
  for each row execute procedure set_updated_at();

create index if not exists idx_swms_date on swms (job_date desc);
create index if not exists idx_swms_work_order on swms (work_order_id);
create index if not exists idx_swms_project on swms (project_id);

-- Who may use SWMS/JSA: admin/office (is_staff), plus any other user an
-- admin has given the "SWMS / JSA" tab on the Users page — normally every
-- installer, since this is filled in on site before starting work.
create or replace function can_do_swms()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_staff() or exists (
    select 1 from profiles
    where id = auth.uid() and allowed_tabs is not null and 'swms' = any (allowed_tabs)
  );
$$;

alter table swms enable row level security;
drop policy if exists "swms: swms users full access" on swms;
create policy "swms: swms users full access" on swms
  for all using (can_do_swms()) with check (can_do_swms());

-- Attachments: hang photos off a SWMS record too (category 'SWMS' already
-- allowed by the check constraint from the Site Visits migration).
alter table attachments add column if not exists swms_id uuid references swms(id) on delete cascade;
create index if not exists idx_attachments_swms on attachments (swms_id);

drop policy if exists "attachments: swms users manage swms photos" on attachments;
create policy "attachments: swms users manage swms photos" on attachments
  for all using (swms_id is not null and can_do_swms())
  with check (swms_id is not null and can_do_swms());

drop policy if exists "attachments bucket: swms photos" on storage.objects;
create policy "attachments bucket: swms photos" on storage.objects
  for all using (bucket_id = 'attachments' and name like 'swms/%' and can_do_swms())
  with check (bucket_id = 'attachments' and name like 'swms/%' and can_do_swms());
