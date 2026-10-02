-- Audit log: records sign-ins and create/update/delete actions across the
-- app, for the admin-only Audit Log page.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  event_type text not null check (event_type in ('login', 'create', 'update', 'delete')),
  entity_type text not null,
  entity_id text,
  entity_label text,
  details text
);

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_user_id_idx on audit_log (user_id);
create index if not exists audit_log_entity_type_idx on audit_log (entity_type);

alter table audit_log enable row level security;

-- Any signed-in user can write their own audit entries (so Office/Installer
-- actions get logged too, not just admin's) — but they can only ever log
-- events attributed to themselves.
drop policy if exists "audit_log: signed-in users insert their own events" on audit_log;
create policy "audit_log: signed-in users insert their own events" on audit_log
  for insert with check (user_id = auth.uid());

-- Only admins can read the log.
drop policy if exists "audit_log: admin reads all" on audit_log;
create policy "audit_log: admin reads all" on audit_log
  for select using (is_admin());
