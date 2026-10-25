-- Purchase orders now number as BB18143, BB18144, ... (continuing the old system's numbering).
-- Existing POs (PO1001 etc.) keep their numbers. Run once in Supabase -> SQL Editor.
-- To start at a different number, change 18143 below before running.

alter sequence po_number_seq restart with 18143;

alter table purchase_orders
  alter column po_number set default ('BB' || nextval('po_number_seq')::text);

notify pgrst, 'reload schema';
