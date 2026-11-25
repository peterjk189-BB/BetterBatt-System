-- Who an insulation certificate was emailed to, who sent it, and whether it arrived
-- (delivery reports come back from Resend through the email webhook).
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table inspections add column if not exists certificate_sent_to text;
alter table inspections add column if not exists certificate_sent_by text;
alter table inspections add column if not exists certificate_delivery text;
alter table inspections add column if not exists certificate_delivery_at timestamptz;
notify pgrst, 'reload schema';
