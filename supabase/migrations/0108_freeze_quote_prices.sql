-- Freeze quote prices once a quote has gone to the customer.
-- Line charges were worked out from the product's current Inventory price, so a price change on the
-- Inventory page changed quotes already emailed. From now on each line keeps a copy of the product's
-- sell prices (price_snapshot) taken when the quote is first emailed or accepted, and the app prices
-- the line from that copy. Run once in Supabase -> SQL Editor. Safe to re-run.

alter table project_lines add column if not exists price_snapshot jsonb;

-- The product's sell prices right now.
create or replace function part_price_snapshot(p_part uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'part_id', p.id,
    'supply_install_rate_per_m2', p.supply_install_rate_per_m2,
    'supply_charge_per_pack', p.supply_charge_per_pack,
    'price_retail', p.price_retail,
    'price_trade', p.price_trade,
    'price_regency', p.price_regency,
    'frozen_at', now()
  )
  from parts p where p.id = p_part
$$;

-- First time a quote is emailed or accepted: freeze every line that isn't frozen yet.
create or replace function freeze_quote_prices() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.emailed_at is null and new.emailed_at is not null) or (old.accepted_at is null and new.accepted_at is not null) then
    update project_lines set price_snapshot = part_price_snapshot(part_id)
    where project_id = new.id and price_snapshot is null and part_id is not null;
  end if;
  return new;
end $$;

drop trigger if exists trg_freeze_quote_prices on projects;
create trigger trg_freeze_quote_prices after update of emailed_at, accepted_at on projects
  for each row execute procedure freeze_quote_prices();

-- A line added to a quote that has already gone out (admin unlock, revision copy) is frozen as it is saved.
create or replace function freeze_new_quote_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.price_snapshot is null and new.part_id is not null and exists (
    select 1 from projects where id = new.project_id and (emailed_at is not null or accepted_at is not null)
  ) then
    new.price_snapshot := part_price_snapshot(new.part_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_freeze_new_quote_line on project_lines;
create trigger trg_freeze_new_quote_line before insert on project_lines
  for each row execute procedure freeze_new_quote_line();

-- Quotes already emailed or accepted: freeze them at today's prices so they stop moving.
-- (A quote whose price already moved, like Q1095, is put back with the quote's "set it to $" box.)
update project_lines pl set price_snapshot = part_price_snapshot(pl.part_id)
from projects p
where p.id = pl.project_id and pl.price_snapshot is null and pl.part_id is not null
  and (p.emailed_at is not null or p.accepted_at is not null);

notify pgrst, 'reload schema';
