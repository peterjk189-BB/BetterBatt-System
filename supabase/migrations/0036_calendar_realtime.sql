-- Lets the Calendar update live when anyone changes a site visit, inspection, job or PO.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

do $$
declare t text;
begin
  foreach t in array array['site_visits', 'inspections', 'work_orders', 'work_order_lines', 'purchase_orders'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- already switched on
    end;
  end loop;
end $$;
