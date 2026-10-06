-- CRM (phase 1): enquiries pipeline, follow-up tasks, activity log and
-- repeat-work check-ins for customers / builders.
--
--   crm_leads      one row per enquiry (call / email / builder / repeat work)
--   crm_tasks      follow-ups, each assigned to a named office user
--   crm_activity   notes, calls and emails logged against a lead or customer
--   customers      gains check-in settings (how often to touch base)
--
-- Office and admin users only (is_staff()). Run once in Supabase -> SQL
-- Editor. Safe to re-run.

create sequence if not exists crm_lead_number_seq start 1;

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  lead_number integer not null unique default nextval('crm_lead_number_seq'),
  name text not null,
  phone text,
  email text,
  address text,
  suburb text,
  source text not null default 'Call'
    check (source in ('Call', 'Email', 'Website', 'Builder', 'Repeat customer', 'Referral', 'Other')),
  enquiry_note text,
  stage text not null default 'New enquiry'
    check (stage in ('New enquiry', 'Site visit booked', 'Quote sent', 'Following up', 'Won', 'Lost')),
  lost_reason text,
  customer_id uuid references customers(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  site_visit_id uuid references site_visits(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  est_value numeric(10,2),
  archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_crm_leads_updated_at on crm_leads;
create trigger trg_crm_leads_updated_at before update on crm_leads
  for each row execute procedure set_updated_at();

create index if not exists idx_crm_leads_stage on crm_leads (stage) where not archived;
create index if not exists idx_crm_leads_customer on crm_leads (customer_id);
create index if not exists idx_crm_leads_phone on crm_leads (phone);

create table if not exists crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'Call' check (kind in ('Call', 'Email', 'Visit', 'Other')),
  due_date date not null default current_date,
  assigned_to uuid not null references profiles(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  note text,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references profiles(id) on delete set null,
  auto boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_tasks_open on crm_tasks (assigned_to, due_date) where not done;
create index if not exists idx_crm_tasks_lead on crm_tasks (lead_id);
create index if not exists idx_crm_tasks_customer on crm_tasks (customer_id);

create table if not exists crm_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'Note' check (kind in ('Note', 'Call', 'Email', 'Meeting')),
  note text not null,
  lead_id uuid references crm_leads(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_activity_lead on crm_activity (lead_id, created_at desc);
create index if not exists idx_crm_activity_customer on crm_activity (customer_id, created_at desc);

-- Repeat work: how often to touch base with a customer / builder, who owns
-- the relationship, and when we last spoke (updated whenever an activity is logged).
alter table customers
  add column if not exists checkin_every_days integer,
  add column if not exists crm_owner_id uuid references profiles(id) on delete set null,
  add column if not exists last_contact_at timestamptz;

alter table crm_leads enable row level security;
alter table crm_tasks enable row level security;
alter table crm_activity enable row level security;

drop policy if exists "crm_leads: staff full access" on crm_leads;
create policy "crm_leads: staff full access" on crm_leads
  for all using (is_staff()) with check (is_staff());

drop policy if exists "crm_tasks: staff full access" on crm_tasks;
create policy "crm_tasks: staff full access" on crm_tasks
  for all using (is_staff()) with check (is_staff());

drop policy if exists "crm_activity: staff full access" on crm_activity;
create policy "crm_activity: staff full access" on crm_activity
  for all using (is_staff()) with check (is_staff());
