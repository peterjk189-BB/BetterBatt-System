-- Inspection workflow: links inspections into the job flow
--   Work order -> installer completes SWMS -> inspection -> PASS, or FAIL -> re-inspection
--
-- * parent_inspection_id: a re-inspection points back at the FAILed
--   inspection it follows up, so the before/after history stays together.
-- * swms.inspection_notified_at: stamped when the "inspection due" email
--   has gone out for a completed SWMS, so it's only ever sent once.
-- * company_settings.inspection_notify_emails: who gets that email
--   (comma-separated), edited on the Settings page.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections
  add column if not exists parent_inspection_id uuid references inspections(id) on delete set null;
create index if not exists idx_inspections_parent on inspections (parent_inspection_id);

alter table swms add column if not exists inspection_notified_at timestamptz;

alter table company_settings add column if not exists inspection_notify_emails text;
