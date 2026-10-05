-- Picking stock often comes off the shelf as a mix of full multi-packs
-- (cartons/bales — the "Multi" count in Inventory) and loose individual
-- packs ("Pks"), same as how Purchase Orders already record received
-- stock as multi + pks. This lets a pick record that same split instead
-- of a single loose-pack number.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table work_order_lines
  add column if not exists multi_picked numeric(10,2);

-- Replace pick_wo_line: now takes both a multi-pack count and a loose-pack
-- count, and decrements each stock field separately (mirrors how receiving
-- a purchase order adds to parts.multi and parts.pks separately).
drop function if exists pick_wo_line(uuid, numeric);

create or replace function pick_wo_line(p_line_id uuid, p_multi numeric, p_pks numeric)
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

  update parts set multi = multi - coalesce(p_multi, 0), pks = pks - coalesce(p_pks, 0) where id = v_part_id;
  update work_order_lines
    set picked = true, picked_at = now(), picked_by = auth.uid(),
        multi_picked = coalesce(p_multi, 0), packs_picked = coalesce(p_pks, 0),
        allocated = true, allocated_at = coalesce(allocated_at, now())
    where id = p_line_id;
end;
$$;

-- Undo a pick: puts both the multis and loose packs back on the shelf.
create or replace function unpick_wo_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_multi numeric;
  v_packs numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;

  select part_id, multi_picked, packs_picked into v_part_id, v_multi, v_packs from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;

  update parts set multi = multi + coalesce(v_multi, 0), pks = pks + coalesce(v_packs, 0) where id = v_part_id;
  update work_order_lines
    set picked = false, picked_at = null, picked_by = null, packs_picked = null, multi_picked = null
    where id = p_line_id;
end;
$$;
