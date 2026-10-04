-- Picking slips: a reserve-and-pick workflow for materials on a work order.
-- Every work order line already says which product and how much (m²) is
-- needed — this adds the state to track whether that requirement has been
-- reserved against stock ("allocated", so a second job picking slip shows
-- it is no longer available) and whether it has actually been pulled off the
-- shelf ("picked", which is what decrements the real stock count).
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table work_order_lines
  add column if not exists allocated boolean not null default false,
  add column if not exists allocated_at timestamptz,
  add column if not exists picked boolean not null default false,
  add column if not exists picked_at timestamptz,
  add column if not exists picked_by uuid references auth.users(id) on delete set null,
  add column if not exists packs_picked numeric(10,2);

create index if not exists idx_wo_lines_part_allocated on work_order_lines (part_id, allocated, picked);

-- Allocate: reserve this line requirement against stock without touching
-- the physical count yet, so another job picking slip correctly shows
-- reduced availability instead of two jobs quietly claiming the same stock.
create or replace function allocate_wo_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;
  update work_order_lines
    set allocated = true, allocated_at = now()
    where id = p_line_id and not picked;
end;
$$;

-- Deallocate: release a reservation that was made in error, or no longer needed.
create or replace function deallocate_wo_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;
  update work_order_lines
    set allocated = false, allocated_at = null
    where id = p_line_id and not picked;
end;
$$;

-- Pick: actually pull p_packs packs off the shelf for this line. Decrements
-- the part loose-pack count (pks) — the same field used at stocktake — and
-- marks the line picked (and allocated, if not already set), with an audit
-- trail of who, when and how many packs.
create or replace function pick_wo_line(p_line_id uuid, p_packs numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_picked boolean;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;

  select part_id, picked into v_part_id, v_picked from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product to pick';
  end if;
  if v_picked then
    raise exception 'Already picked — undo it first to change the quantity';
  end if;

  update parts set pks = pks - p_packs where id = v_part_id;
  update work_order_lines
    set picked = true, picked_at = now(), picked_by = auth.uid(), packs_picked = p_packs,
        allocated = true, allocated_at = coalesce(allocated_at, now())
    where id = p_line_id;
end;
$$;

-- Undo a pick: puts the packs back on the shelf and clears the picked state
-- (a mis-pick, wrong quantity, or a cancelled job).
create or replace function unpick_wo_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_packs numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;

  select part_id, packs_picked into v_part_id, v_packs from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;

  update parts set pks = pks + coalesce(v_packs, 0) where id = v_part_id;
  update work_order_lines
    set picked = false, picked_at = null, picked_by = null, packs_picked = null
    where id = p_line_id;
end;
$$;
