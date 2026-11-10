-- Low stock report: the pack count at (or below) which a product should be re-ordered.
alter table parts add column if not exists reorder_level numeric(12,2);
