-- Certificates report: record when the insulation certificate was emailed to the customer.
-- Set from the certificate page ("Mark certificate sent") or the Reports > Certificates tab.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections add column if not exists certificate_sent_at timestamptz;

notify pgrst, 'reload schema';
