-- Phone / iPad / computer push notifications. One row per device a person has switched
-- notifications on for. Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Each person manages only their own devices. (The server sends using the service role.)
drop policy if exists "push_subscriptions: own rows" on push_subscriptions;
create policy "push_subscriptions: own rows" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
