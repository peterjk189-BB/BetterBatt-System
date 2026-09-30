alter table subcontractors
  add column if not exists address text,
  add column if not exists postcode text,
  add column if not exists home_phone text,
  add column if not exists commencement_date date,
  add column if not exists finished_date date,
  add column if not exists notes text;
