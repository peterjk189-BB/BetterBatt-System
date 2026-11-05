-- Manual return to stock against a work order (office enters multis + loose packs, optionally marked "estimated").
-- Stock goes back on the shelf and the job's material cost drops by the same amount in Profit & Loss.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
create table if not exists wo_stock_returns (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  part_id uuid not null references parts(id),
  multi numeric(10,2) not null default 0,
  packs numeric(10,2) not null default 0,
  estimated boolean not null default true,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists wo_stock_returns_wo_idx on wo_stock_returns(work_order_id);
alter table wo_stock_returns enable row level security;
drop policy if exists "wo_stock_returns: staff read" on wo_stock_returns;
create policy "wo_stock_returns: staff read" on wo_stock_returns for select using (is_staff());

create or replace function add_wo_stock_return(p_wo uuid, p_part uuid, p_multi numeric, p_pks numeric, p_estimated boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not authorized'; end if;
  if coalesce(p_multi, 0) < 0 or coalesce(p_pks, 0) < 0 or (coalesce(p_multi, 0) = 0 and coalesce(p_pks, 0) = 0) then
    raise exception 'Enter how many multis or packs came back';
  end if;
  update parts set multi = coalesce(multi, 0) + coalesce(p_multi, 0), pks = coalesce(pks, 0) + coalesce(p_pks, 0) where id = p_part;
  insert into wo_stock_returns (work_order_id, part_id, multi, packs, estimated, note)
    values (p_wo, p_part, coalesce(p_multi, 0), coalesce(p_pks, 0), coalesce(p_estimated, true), nullif(trim(p_note), ''));
end; $$;
grant execute on function add_wo_stock_return(uuid, uuid, numeric, numeric, boolean, text) to authenticated;

create or replace function delete_wo_stock_return(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r wo_stock_returns%rowtype;
begin
  if not is_staff() then raise exception 'Not authorized'; end if;
  select * into r from wo_stock_returns where id = p_id;
  if not found then return; end if;
  update parts set multi = coalesce(multi, 0) - r.multi, pks = coalesce(pks, 0) - r.packs where id = r.part_id;
  delete from wo_stock_returns where id = p_id;
end; $$;
grant execute on function delete_wo_stock_return(uuid) to authenticated;
notify pgrst, 'reload schema';
