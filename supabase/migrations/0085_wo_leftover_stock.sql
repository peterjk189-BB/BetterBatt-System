-- Leftover stock from a job that was delivered by the supplier (nothing picked from our shelves).
-- The office records the packs that came back; they go onto the shelf and come off the job's material cost.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table work_order_lines
  add column if not exists leftover_multi numeric(10,2) not null default 0,
  add column if not exists leftover_packs numeric(10,2) not null default 0,
  add column if not exists leftover_at timestamptz,
  add column if not exists leftover_by uuid;

-- Sets the leftover for a line (replaces any earlier entry) and puts the difference on the shelf.
create or replace function leftover_wo_line(p_line_id uuid, p_multi numeric, p_pks numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_old_multi numeric;
  v_old_pks numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_multi, 0) < 0 or coalesce(p_pks, 0) < 0 then
    raise exception 'Enter zero or more';
  end if;
  select part_id, coalesce(leftover_multi, 0), coalesce(leftover_packs, 0)
    into v_part_id, v_old_multi, v_old_pks from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;
  update parts
    set multi = coalesce(multi, 0) + (coalesce(p_multi, 0) - v_old_multi),
        pks = coalesce(pks, 0) + (coalesce(p_pks, 0) - v_old_pks)
    where id = v_part_id;
  update work_order_lines
    set leftover_multi = coalesce(p_multi, 0), leftover_packs = coalesce(p_pks, 0),
        leftover_at = case when coalesce(p_multi, 0) = 0 and coalesce(p_pks, 0) = 0 then null else now() end,
        leftover_by = case when coalesce(p_multi, 0) = 0 and coalesce(p_pks, 0) = 0 then null else auth.uid() end
    where id = p_line_id;
end;
$$;
grant execute on function leftover_wo_line(uuid, numeric, numeric) to authenticated;
notify pgrst, 'reload schema';
