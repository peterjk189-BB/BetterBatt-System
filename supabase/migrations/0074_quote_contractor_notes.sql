-- Notes on a quote for the contractor: not shown to the customer, copied onto the work order. Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists contractor_notes text;
notify pgrst, 'reload schema';
