-- Customer address (where the customer / builder is located). Run once in Supabase -> SQL Editor.
alter table customers add column if not exists address text;
notify pgrst, 'reload schema';
