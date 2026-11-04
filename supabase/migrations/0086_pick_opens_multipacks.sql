-- Picking loose packs when the shelf has none (or too few): open a full multi-pack automatically.
-- Before: the loose-pack count went negative (e.g. multis 3, loose -2). Now one multi is opened:
-- multis 2, loose (pack_per_multi - 2). Total stock on hand is the same either way.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
create or replace function pick_wo_line(p_line_id uuid, p_multi numeric, p_pks numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_picked boolean;
  v_ppm numeric;
  v_multi numeric;
  v_pks numeric;
  v_open numeric;
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

  update parts set multi = coalesce(multi, 0) - coalesce(p_multi, 0), pks = coalesce(pks, 0) - coalesce(p_pks, 0) where id = v_part_id;

  -- Not enough loose packs on the shelf? Break open as many multis as needed (never more than are on the shelf).
  select coalesce(pack_per_multi, 0), coalesce(multi, 0), coalesce(pks, 0) into v_ppm, v_multi, v_pks from parts where id = v_part_id;
  if v_pks < 0 and v_ppm > 0 and v_multi > 0 then
    v_open := least(ceil(-v_pks / v_ppm), v_multi);
    update parts set multi = multi - v_open, pks = pks + v_open * v_ppm where id = v_part_id;
  end if;

  update work_order_lines
    set picked = true, picked_at = now(), picked_by = auth.uid(),
        multi_picked = coalesce(p_multi, 0), packs_picked = coalesce(p_pks, 0),
        allocated = true, allocated_at = coalesce(allocated_at, now())
    where id = p_line_id;
end;
$$;
grant execute on function pick_wo_line(uuid, numeric, numeric) to authenticated;
notify pgrst, 'reload schema';
