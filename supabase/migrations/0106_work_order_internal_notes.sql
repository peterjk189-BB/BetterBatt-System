-- Internal notes on a work order: office use only, never shown to the contractor.
-- Kept in their own table (not a column on work_orders) because contractors can read their own
-- work_orders rows; this table is staff-only, so contractors can't see these notes at all.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
create table if not exists work_order_internal_notes (
  work_order_id uuid primary key references work_orders(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);

alter table work_order_internal_notes enable row level security;

drop policy if exists "work_order_internal_notes: staff full access" on work_order_internal_notes;
create policy "work_order_internal_notes: staff full access" on work_order_internal_notes
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
