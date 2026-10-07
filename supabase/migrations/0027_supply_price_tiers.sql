-- Supply-only price points: three extra sell prices per pack on each inventory item,
-- and a price point chosen on each quote.
alter table parts
  add column if not exists price_retail numeric(10,2) not null default 0,
  add column if not exists price_trade numeric(10,2) not null default 0,
  add column if not exists price_regency numeric(10,2) not null default 0;

-- null = "Standard" (the existing supply_charge_per_pack), so old quotes don't change.
alter table projects
  add column if not exists price_tier text;

notify pgrst, 'reload schema';
