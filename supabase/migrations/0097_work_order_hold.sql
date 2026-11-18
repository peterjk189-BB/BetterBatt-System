-- Work orders can be put on hold: they leave the calendar grid and appear in an "On hold" bar until resumed.
alter table work_orders add column if not exists on_hold boolean not null default false;
alter table work_orders add column if not exists hold_reason text;
alter table work_orders add column if not exists held_at timestamptz;
