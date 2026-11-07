-- Default price level for a customer when selling inventory (Retail / Trade / Regency).
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table customers add column if not exists price_tier text;
alter table customers drop constraint if exists customers_price_tier_check;
alter table customers add constraint customers_price_tier_check check (price_tier is null or price_tier in ('retail','trade','regency'));
notify pgrst, 'reload schema';
