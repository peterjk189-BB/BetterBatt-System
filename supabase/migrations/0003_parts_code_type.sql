-- Adds a supplier product code and a category ("WALLS", "CEILINGS", "UNDERFLOOR", etc.)
-- to each inventory item, to match the layout of the existing supplier price-list exports.
alter table parts
  add column if not exists code text,
  add column if not exists type text;
