-- Remember when a quote was last emailed to the customer, and to which address.
alter table projects add column if not exists emailed_at timestamptz;
alter table projects add column if not exists emailed_to text;
