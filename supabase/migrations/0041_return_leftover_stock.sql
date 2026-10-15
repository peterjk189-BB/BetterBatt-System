-- Leftover stock coming back from a job: record what was returned against the picked line,
-- put it back into Inventory (Multi / Pks), and let the job's real material cost be
-- (picked - returned) x pack cost.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table work_order_lines
  add column if not exists multi_returned numeric(10,2) not null default 0,
  add column if not exists packs_returned numeric(10,2) not null default 0,
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid;

-- Return leftover stock: adds to what has already been returned on this line (so it can be
-- done in more than one go) and puts it back on the shelf. Can't return more than was picked.
create or replace function return_wo_line(p_line_id uuid, p_multi numeric, p_pks numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_picked boolean;
  v_multi_picked numeric;
  v_packs_picked numeric;
  v_multi_ret numeric;
  v_packs_ret numeric;
  v_ppm numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_multi, 0) < 0 or coalesce(p_pks, 0) < 0 then
    raise exception 'Enter zero or more';
  end if;
  if coalesce(p_multi, 0) = 0 and coalesce(p_pks, 0) = 0 then
    raise exception 'Enter how many multis and/or packs came back';
  end if;

  select l.part_id, l.picked, coalesce(l.multi_picked, 0), coalesce(l.packs_picked, 0),
         coalesce(l.multi_returned, 0), coalesce(l.packs_returned, 0), coalesce(p.pack_per_multi, 0)
    into v_part_id, v_picked, v_multi_picked, v_packs_picked, v_multi_ret, v_packs_ret, v_ppm
    from work_order_lines l left join parts p on p.id = l.part_id
    where l.id = p_line_id;

  if v_part_id is null then
    raise exception 'This line has no product';
  end if;
  if not v_picked then
    raise exception 'Nothing has been picked for this line yet';
  end if;
  if (v_multi_ret + coalesce(p_multi, 0)) * v_ppm + (v_packs_ret + coalesce(p_pks, 0))
       > v_multi_picked * v_ppm + v_packs_picked + 0.0001 then
    raise exception 'That is more than was picked for this job';
  end if;

  update parts set multi = multi + coalesce(p_multi, 0), pks = pks + coalesce(p_pks, 0) where id = v_part_id;
  update work_order_lines
    set multi_returned = v_multi_ret + coalesce(p_multi, 0),
        packs_returned = v_packs_ret + coalesce(p_pks, 0),
        returned_at = now(), returned_by = auth.uid()
    where id = p_line_id;
end;
$$;

-- Undo returns: takes the returned stock back off the shelf and clears the returned amounts.
create or replace function unreturn_wo_line(p_line_id uuid)
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
  select part_id, coalesce(multi_returned, 0), coalesce(packs_returned, 0)
    into v_part_id, v_multi, v_packs from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;
  update parts set multi = multi - v_multi, pks = pks - v_packs where id = v_part_id;
  update work_order_lines
    set multi_returned = 0, packs_returned = 0, returned_at = null, returned_by = null
    where id = p_line_id;
end;
$$;

-- Undo a pick: puts back what is still out on the job (picked minus anything already returned)
-- and clears the returns along with the pick.
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
  v_multi_ret numeric;
  v_packs_ret numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;

  select part_id, multi_picked, packs_picked, coalesce(multi_returned, 0), coalesce(packs_returned, 0)
    into v_part_id, v_multi, v_packs, v_multi_ret, v_packs_ret from work_order_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;

  update parts
    set multi = multi + coalesce(v_multi, 0) - v_multi_ret,
        pks = pks + coalesce(v_packs, 0) - v_packs_ret
    where id = v_part_id;
  update work_order_lines
    set picked = false, picked_at = null, picked_by = null, packs_picked = null, multi_picked = null,
        multi_returned = 0, packs_returned = 0, returned_at = null, returned_by = null
    where id = p_line_id;
end;
$$;

notify pgrst, 'reload schema';
