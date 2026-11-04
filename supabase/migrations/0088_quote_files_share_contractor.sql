-- Quote attachments: tick "Show to contractor" to make a file visible on the contractor's work order.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
alter table attachments add column if not exists share_with_contractor boolean not null default false;

-- Contractors can read shared quote files for jobs they are authorised on.
drop policy if exists "attachments: contractors read shared quote files" on attachments;
create policy "attachments: contractors read shared quote files" on attachments
  for select using (
    share_with_contractor
    and project_id is not null
    and exists (
      select 1 from work_orders w
      where w.project_id = attachments.project_id
        and wo_is_authorised(w.id)
        and (
          w.contractor_id = my_subcontractor_id()
          or exists (select 1 from work_order_lines l where l.work_order_id = w.id and l.subcontractor_id = my_subcontractor_id())
        )
    )
  );

drop policy if exists "attachments bucket: contractors read shared quote files" on storage.objects;
create policy "attachments bucket: contractors read shared quote files" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and name like 'quotes/%'
    and exists (select 1 from attachments a where a.storage_path = storage.objects.name and a.share_with_contractor)
  );
notify pgrst, 'reload schema';
