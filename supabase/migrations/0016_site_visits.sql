-- Site visits: the on-site checklist (roof, truss, access, m² measured,
-- products, notes and photos) the estimator fills in on a phone or iPad
-- before a quote is built. Replaces the paper/PDF "Site Visit Checklist".
--
-- The tick-boxes and measurements live in one `checklist` jsonb column so
-- the form can gain or rename options without a migration each time. The
-- fields the office searches and sorts on (date, customer, address, status)
-- are real columns.
--
-- Photos and site-plan sketches reuse the existing `attachments` table and
-- private `attachments` storage bucket, under the path site-visits/<visit id>/.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

create sequence if not exists site_visit_number_seq start 1;

create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  visit_number integer not null unique default nextval('site_visit_number_seq'),
  visit_date date not null default current_date,
  visit_time time,
  status text not null default 'Booked' check (status in ('Booked', 'Visited', 'Quoted', 'Cancelled')),
  visit_type text not null default 'Retro fit' check (visit_type in ('Retro fit', 'Building site')),
  customer_id uuid references customers(id) on delete set null,
  customer_name text,
  phone text,
  email text,
  address text,
  suburb text,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  project_id uuid references projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_visits_updated_at on site_visits;
create trigger trg_site_visits_updated_at before update on site_visits
  for each row execute procedure set_updated_at();

create index if not exists idx_site_visits_date on site_visits (visit_date desc);
create index if not exists idx_site_visits_project on site_visits (project_id);

-- Who may use site visits: admin/office (is_staff), plus any other user an
-- admin has given the "Site Visits" tab on the Users page — e.g. an
-- estimator or installer who does the visits but shouldn't see pricing.
create or replace function can_do_site_visits()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_staff() or exists (
    select 1 from profiles
    where id = auth.uid() and allowed_tabs is not null and 'site-visits' = any (allowed_tabs)
  );
$$;

alter table site_visits enable row level security;
drop policy if exists "site_visits: site visit users full access" on site_visits;
create policy "site_visits: site visit users full access" on site_visits
  for all using (can_do_site_visits()) with check (can_do_site_visits());

-- Attachments: hang photos off a site visit, with a caption and order.
alter table attachments
  add column if not exists site_visit_id uuid references site_visits(id) on delete cascade,
  add column if not exists caption text,
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_attachments_site_visit on attachments (site_visit_id);

alter table attachments drop constraint if exists attachments_category_check;
alter table attachments add constraint attachments_category_check check (
  category in ('Photo', 'SWMS', 'Other document', 'White Card', 'Photo ID', 'Driver''s Licence', 'Site plan')
);

drop policy if exists "attachments: site visit users manage site visit photos" on attachments;
create policy "attachments: site visit users manage site visit photos" on attachments
  for all using (site_visit_id is not null and can_do_site_visits())
  with check (site_visit_id is not null and can_do_site_visits());

drop policy if exists "attachments bucket: site visit photos" on storage.objects;
create policy "attachments bucket: site visit photos" on storage.objects
  for all using (bucket_id = 'attachments' and name like 'site-visits/%' and can_do_site_visits())
  with check (bucket_id = 'attachments' and name like 'site-visits/%' and can_do_site_visits());
