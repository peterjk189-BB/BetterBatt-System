-- Let attachments hang off a subcontractor (White Card, photo ID, driver's licence, etc.),
-- not just a project/work order.

alter table attachments
  add column if not exists subcontractor_id uuid references subcontractors(id) on delete cascade;

alter table attachments
  drop constraint if exists attachments_category_check;

alter table attachments
  add constraint attachments_category_check check (
    category in ('Photo', 'SWMS', 'Other document', 'White Card', 'Photo ID', 'Driver''s Licence')
  );
