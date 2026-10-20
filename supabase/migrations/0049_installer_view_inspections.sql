-- Contractors don't carry out inspections, but they can READ the inspection reports (PASS / FAIL, notes
-- and photos) for their own authorised jobs so they can learn from them. Read-only: the existing
-- "inspection users full access" policies still decide who can create or change inspections.
drop policy if exists "inspections: contractors read own jobs" on inspections;
create policy "inspections: contractors read own jobs" on inspections
  for select using (
    work_order_id is not null
    and wo_is_authorised(work_order_id)
    and (
      exists (select 1 from work_orders w where w.id = inspections.work_order_id and w.contractor_id = my_subcontractor_id())
      or exists (select 1 from work_order_lines l where l.work_order_id = inspections.work_order_id and l.subcontractor_id = my_subcontractor_id())
    )
  );

drop policy if exists "attachments: contractors read own inspection photos" on attachments;
create policy "attachments: contractors read own inspection photos" on attachments
  for select using (
    inspection_id is not null
    and exists (select 1 from inspections i where i.id = attachments.inspection_id)
  );

drop policy if exists "attachments bucket: contractors read inspection photos" on storage.objects;
create policy "attachments bucket: contractors read inspection photos" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and name like 'inspections/%'
    and exists (select 1 from attachments a where a.storage_path = storage.objects.name and a.inspection_id is not null)
  );
