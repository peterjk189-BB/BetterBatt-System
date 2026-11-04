-- Invoice picks (warehouse items): whole multis out, spare packs back; open a multi when loose packs run short.
-- e.g. customer buys 14 packs, 5 per multi: pick 3 multis, put 1 pack back -> stock down by exactly 14.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table invoice_lines add column if not exists packs_returned numeric(10,2) not null default 0;

create or replace function pick_invoice_line(p_line_id uuid, p_multi numeric, p_pks numeric)
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
  select part_id, picked into v_part_id, v_picked from invoice_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product to pick';
  end if;
  if v_picked then
    raise exception 'Already picked — undo it first to change the quantity';
  end if;

  update parts set multi = coalesce(multi, 0) - coalesce(p_multi, 0), pks = coalesce(pks, 0) - coalesce(p_pks, 0) where id = v_part_id;
  -- Short of loose packs? Open as many multis as needed (never more than are on the shelf).
  select coalesce(pack_per_multi, 0), coalesce(multi, 0), coalesce(pks, 0) into v_ppm, v_multi, v_pks from parts where id = v_part_id;
  if v_pks < 0 and v_ppm > 0 and v_multi > 0 then
    v_open := least(ceil(-v_pks / v_ppm), v_multi);
    update parts set multi = multi - v_open, pks = pks + v_open * v_ppm where id = v_part_id;
  end if;

  update invoice_lines
    set picked = true, picked_at = now(), picked_by = auth.uid(),
        multi_picked = coalesce(p_multi, 0), packs_picked = coalesce(p_pks, 0), packs_returned = 0
    where id = p_line_id;
end;
$$;

-- Spare loose packs from the multis picked go back on the shelf.
create or replace function return_invoice_line(p_line_id uuid, p_pks numeric)
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
  if coalesce(p_pks, 0) <= 0 then
    raise exception 'Enter how many packs came back';
  end if;
  select part_id, picked into v_part_id, v_picked from invoice_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;
  if not v_picked then
    raise exception 'Nothing has been picked for this line yet';
  end if;
  update parts set pks = coalesce(pks, 0) + p_pks where id = v_part_id;
  update invoice_lines set packs_returned = coalesce(packs_returned, 0) + p_pks where id = p_line_id;
end;
$$;

create or replace function unpick_invoice_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part_id uuid;
  v_multi numeric;
  v_packs numeric;
  v_back numeric;
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;
  select part_id, multi_picked, packs_picked, coalesce(packs_returned, 0) into v_part_id, v_multi, v_packs, v_back from invoice_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;
  update parts set multi = coalesce(multi, 0) + coalesce(v_multi, 0), pks = coalesce(pks, 0) + coalesce(v_packs, 0) - v_back where id = v_part_id;
  update invoice_lines
    set picked = false, picked_at = null, picked_by = null, multi_picked = null, packs_picked = null, packs_returned = 0
    where id = p_line_id;
end;
$$;
grant execute on function pick_invoice_line(uuid, numeric, numeric) to authenticated;
grant execute on function return_invoice_line(uuid, numeric) to authenticated;
grant execute on function unpick_invoice_line(uuid) to authenticated;
notify pgrst, 'reload schema';
