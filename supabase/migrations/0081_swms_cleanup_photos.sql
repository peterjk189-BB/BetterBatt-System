-- SWMS site clean-up: photos of leftover insulation packs and rubbish left on site.
-- The yes/no answers and notes are stored inside swms.site_report (no new column needed).
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table attachments drop constraint if exists attachments_swms_section_check;
alter table attachments add constraint attachments_swms_section_check
  check (swms_section is null or swms_section in ('removal_before', 'removal_after', 'leftover_packs', 'rubbish'));

notify pgrst, 'reload schema';
