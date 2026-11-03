-- Internal-only notes on a quote: office use only, never shown to the customer or the contractor. Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists internal_notes text;
notify pgrst, 'reload schema';
