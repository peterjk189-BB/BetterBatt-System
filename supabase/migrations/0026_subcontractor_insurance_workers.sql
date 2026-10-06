-- Subcontractors: public liability insurance (certificate of currency + expiry)
-- and the installers who work for each contractor (photo ID + White Card).
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table subcontractors
  add column if not exists insurance_insurer text,
  add column if not exists insurance_policy text,
  add column if not exists insurance_cover numeric(14,2),
  add column if not exists insurance_expiry date;

create table if not exists subcontractor_workers (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references subcontractors(id) on delete cascade,
  name text not null,
  phone text,
  whitecard_number text,
  notes text,
  active boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subcontractor_workers_updated_at on subcontractor_workers;
create trigger trg_subcontractor_workers_updated_at before update on subcontractor_workers
  for each row execute procedure set_updated_at();

create index if not exists idx_sub_workers_sub on subcontractor_workers (subcontractor_id);

alter table subcontractor_workers enable row level security;
drop policy if exists "subcontractor_workers: staff full access" on subcontractor_workers;
create policy "subcontractor_workers: staff full access" on subcontractor_workers
  for all using (is_staff()) with check (is_staff());

-- Documents can hang off a worker (photo ID, White Card) as well as a subcontractor.
alter table attachments
  add column if not exists worker_id uuid references subcontractor_workers(id) on delete cascade;
create index if not exists idx_attachments_worker on attachments (worker_id);

alter table attachments drop constraint if exists attachments_category_check;
alter table attachments add constraint attachments_category_check check (
  category in ('Photo', 'SWMS', 'Other document', 'White Card', 'Photo ID', 'Driver''s Licence', 'Profile Photo', 'Site plan', 'Insurance Certificate')
);
