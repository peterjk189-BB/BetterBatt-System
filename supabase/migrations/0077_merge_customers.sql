-- Merge a duplicate customer into another: every record pointing at the duplicate (quotes, invoices,
-- site visits, CRM, statements...) is moved to the customer being kept, then the duplicate is archived.
create or replace function merge_customers(keep_id uuid, dup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not is_admin() then raise exception 'Only admins can merge customers'; end if;
  if keep_id = dup_id then raise exception 'Pick two different customers'; end if;
  if not exists (select 1 from customers where id = keep_id) or not exists (select 1 from customers where id = dup_id) then
    raise exception 'Customer not found';
  end if;
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'customer_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('update public.%I set customer_id = $1 where customer_id = $2', r.table_name) using keep_id, dup_id;
  end loop;
  update customers set archived = true where id = dup_id;
end;
$$;

grant execute on function merge_customers(uuid, uuid) to authenticated;
