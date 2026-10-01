alter table subcontractors
  add column if not exists gst_registered boolean not null default false;
