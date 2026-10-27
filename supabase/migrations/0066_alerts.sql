-- Alerts inbox: every site visit booked/done, SWMS started/completed, inspection booked/failed is saved here
-- so nothing is missed when a push notification is swiped away. Run once in Supabase -> SQL Editor. Safe to re-run.
--
-- status: new   = nobody has acknowledged it yet (shows as a pop-up you have to close)
--         later = acknowledged, still needs following up
--         done  = finished (one person marking it done clears it for everyone)
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  path text,
  dedupe_key text unique,
  for_staff boolean not null default true,
  for_users uuid[] not null default '{}',
  actor uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'later', 'done')),
  acted_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, update on public.alerts to authenticated;
grant select, insert, update, delete on public.alerts to service_role;

create index if not exists idx_alerts_status on alerts (status, created_at desc);

alter table alerts enable row level security;
drop policy if exists "alerts: staff and recipients read" on alerts;
create policy "alerts: staff and recipients read" on alerts
  for select using ((for_staff and is_staff()) or auth.uid() = any (for_users));
drop policy if exists "alerts: staff and recipients update" on alerts;
create policy "alerts: staff and recipients update" on alerts
  for update using ((for_staff and is_staff()) or auth.uid() = any (for_users))
  with check ((for_staff and is_staff()) or auth.uid() = any (for_users));

notify pgrst, 'reload schema';
