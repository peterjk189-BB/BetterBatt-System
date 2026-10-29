-- Per-product unit names: pack_unit is the single unit ("pack", "roll", "box"), multi_unit is the bulk unit ("multi", "carton").
-- A product with no bulk unit (or "pack per multi" of 0 or 1) is counted in single units only.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table parts
  add column if not exists pack_unit text not null default 'pack',
  add column if not exists multi_unit text not null default 'multi';
notify pgrst, 'reload schema';
