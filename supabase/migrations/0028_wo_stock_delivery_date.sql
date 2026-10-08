-- Date the stock on a work order's picking slip is to be delivered.
alter table work_orders
  add column if not exists stock_delivery_date date;

notify pgrst, 'reload schema';
