-- Extra items a contractor adds to a work order (e.g. a call-out, extra bays). They can't change the product
-- lines or m2 the office set. Each request stays "Pending" until the office approves it when processing
-- contractor payments; approving turns it into a normal work order line (so pay, reports etc. just work).
create table if not exists work_order_extras (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  subcontractor_id uuid references subcontractors(id) on delete set null,
  description text not null,
  qty numeric(10,2) not null default 1,
  note text,
  work_date date,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  part_id uuid references parts(id) on delete set null,   -- product chosen by the office on approval
  rate numeric(10,2),                                      -- contractor pay per unit, set on approval
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_wo_extras_wo on work_order_extras (work_order_id);
create index if not exists idx_wo_extras_status on work_order_extras (status);

alter table work_order_extras enable row level security;

drop policy if exists "work_order_extras: staff full access" on work_order_extras;
create policy "work_order_extras: staff full access" on work_order_extras
  for all using (is_staff()) with check (is_staff());

-- Contractors: read their own job's requests; add new ones; withdraw one that is still pending.
drop policy if exists "work_order_extras: contractor reads own" on work_order_extras;
create policy "work_order_extras: contractor reads own" on work_order_extras
  for select using (subcontractor_id = my_subcontractor_id() and wo_is_authorised(work_order_id));

drop policy if exists "work_order_extras: contractor adds own" on work_order_extras;
create policy "work_order_extras: contractor adds own" on work_order_extras
  for insert with check (
    subcontractor_id = my_subcontractor_id()
    and status = 'Pending'
    and part_id is null and rate is null
    and wo_is_authorised(work_order_id)
    and (
      exists (select 1 from work_orders w where w.id = work_order_id and w.contractor_id = my_subcontractor_id())
      or exists (select 1 from work_order_lines l where l.work_order_id = work_order_extras.work_order_id and l.subcontractor_id = my_subcontractor_id())
    )
  );

drop policy if exists "work_order_extras: contractor withdraws pending" on work_order_extras;
create policy "work_order_extras: contractor withdraws pending" on work_order_extras
  for delete using (subcontractor_id = my_subcontractor_id() and status = 'Pending');
