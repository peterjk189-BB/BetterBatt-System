-- Tag each purchase order line with the work order (job) it is for, so one PO delivery
-- can cover two or three jobs and the lines still show which job they belong to.
alter table purchase_order_lines
  add column if not exists work_order_id uuid references work_orders(id) on delete set null;

create index if not exists idx_po_lines_work_order on purchase_order_lines (work_order_id);

notify pgrst, 'reload schema';
