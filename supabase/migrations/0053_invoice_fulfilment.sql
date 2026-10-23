-- Fulfilment for itemised invoices: each item line is either picked from our warehouse or ordered from the
-- supplier, and the invoice carries delivery / pick-up details (shown on the Calendar).
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table invoice_lines
  add column if not exists fulfilment text not null default 'warehouse',
  add column if not exists picked boolean not null default false,
  add column if not exists picked_at timestamptz,
  add column if not exists picked_by uuid references auth.users(id) on delete set null,
  add column if not exists multi_picked numeric(10,2),
  add column if not exists packs_picked numeric(10,2),
  add column if not exists po_id uuid references purchase_orders(id) on delete set null;

alter table invoice_lines drop constraint if exists invoice_lines_fulfilment_check;
alter table invoice_lines add constraint invoice_lines_fulfilment_check check (fulfilment in ('warehouse', 'supplier'));

alter table invoices
  add column if not exists delivery_method text not null default 'delivery',
  add column if not exists delivery_date date,
  add column if not exists delivery_note text;

alter table invoices drop constraint if exists invoices_delivery_method_check;
alter table invoices add constraint invoices_delivery_method_check check (delivery_method in ('delivery', 'pickup'));

-- Pick an invoice line off the shelf: takes the multis and loose packs off inventory (same as a work order pick).
create or replace function pick_invoice_line(p_line_id uuid, p_multi numeric, p_pks numeric)
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

  select part_id, picked into v_part_id, v_picked from invoice_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product to pick';
  end if;
  if v_picked then
    raise exception 'Already picked — undo it first to change the quantity';
  end if;

  update parts set multi = multi - coalesce(p_multi, 0), pks = pks - coalesce(p_pks, 0) where id = v_part_id;
  update invoice_lines
    set picked = true, picked_at = now(), picked_by = auth.uid(),
        multi_picked = coalesce(p_multi, 0), packs_picked = coalesce(p_pks, 0)
    where id = p_line_id;
end;
$$;

-- Undo a pick: puts the multis and loose packs back on the shelf.
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
begin
  if not is_staff() then
    raise exception 'Not authorized';
  end if;

  select part_id, multi_picked, packs_picked into v_part_id, v_multi, v_packs from invoice_lines where id = p_line_id;
  if v_part_id is null then
    raise exception 'This line has no product';
  end if;

  update parts set multi = multi + coalesce(v_multi, 0), pks = pks + coalesce(v_packs, 0) where id = v_part_id;
  update invoice_lines
    set picked = false, picked_at = null, picked_by = null, multi_picked = null, packs_picked = null
    where id = p_line_id;
end;
$$;

notify pgrst, 'reload schema';
