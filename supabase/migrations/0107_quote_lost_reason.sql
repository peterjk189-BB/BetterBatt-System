-- Why a quote was lost (if known), picked under Outcome on the quote, plus a short note (e.g. the winning price).
-- Feeds the "why quotes were lost" figures in Reports. Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists lost_reason text;
alter table projects add column if not exists lost_note text;

notify pgrst, 'reload schema';
