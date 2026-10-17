-- SWMS / JSA: "Insulation removal" section.
-- When ticked on a SWMS it opens a checklist (access via ceiling, manhole,
-- tile lift) plus two photo areas: the area for removal (before) and
-- completion photos (after).
--
-- removal: {"enabled": bool, "items": {"Access ceiling": bool, ...}, "other_note": ""}
-- attachments.swms_section: null = general site photo,
--   'removal_before' | 'removal_after' = the insulation-removal photo areas.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table swms add column if not exists removal jsonb not null default '{}'::jsonb;
alter table attachments add column if not exists swms_section text;

alter table attachments drop constraint if exists attachments_swms_section_check;
alter table attachments add constraint attachments_swms_section_check
  check (swms_section is null or swms_section in ('removal_before', 'removal_after'));

notify pgrst, 'reload schema';
