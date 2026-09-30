-- Auto-generates the purchase order number (e.g. PO1001), the same way quote numbers are
-- auto-generated, instead of it being typed in by hand.
create sequence if not exists po_number_seq start 1001;

alter table purchase_orders
  alter column po_number set default ('PO' || nextval('po_number_seq')::text);
