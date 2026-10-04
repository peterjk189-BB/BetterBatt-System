-- Tracks which staff member is doing a given site visit (e.g. a supervisor
-- who does most site visits but is not the person who booked it), so the
-- Calendar can show whose visit it is, not just that a visit exists.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table site_visits
  add column if not exists assigned_to uuid references profiles(id) on delete set null;

create index if not exists idx_site_visits_assigned_to on site_visits (assigned_to);

-- profiles select was admin-only (own row, or admin reads all) — widen it so
-- anyone who can do site visits can also see the staff list, needed to pick
-- who a visit is assigned to. Still excludes plain installers, who have no
-- reason to see the full user list.
drop policy if exists "profiles: read own or admin reads all" on profiles;
create policy "profiles: read own or admin reads all" on profiles
  for select using (id = auth.uid() or is_admin() or can_do_site_visits());
