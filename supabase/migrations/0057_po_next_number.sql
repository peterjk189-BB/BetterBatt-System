-- Lets the New purchase order screen show the number the order is about to get (without using it up).
create or replace function next_po_number_preview() returns text
language plpgsql security definer set search_path = public as $$
declare
  lv bigint;
  called boolean;
begin
  select last_value, is_called into lv, called from po_number_seq;
  return 'BB' || (case when called then lv + 1 else lv end)::text;
end;
$$;
grant execute on function next_po_number_preview() to authenticated;
notify pgrst, 'reload schema';
