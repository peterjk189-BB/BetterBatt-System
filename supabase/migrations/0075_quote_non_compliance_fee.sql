-- Non-compliance fee on quotes: {"note":"No fall protection on site","amount":150}. Work order only: never shown to the customer, not added to the quote total.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table projects add column if not exists non_compliance_fee jsonb;
notify pgrst, 'reload schema';
