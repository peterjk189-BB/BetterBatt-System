-- Supplier address. Run once in Supabase -> SQL Editor.
alter table suppliers add column if not exists address text;
notify pgrst, 'reload schema';
