-- Internal travel allowance on quotes: [{"note":"Yea","amount":80}]. Costed into contractor labour, never shown to the customer.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists travel_allowance jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
