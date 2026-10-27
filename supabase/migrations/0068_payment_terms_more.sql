-- Customer payment terms: add "Payment in advance" and "Deposit Account". Run once in Supabase -> SQL Editor. Safe to re-run.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.customers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_terms%'
  loop
    execute format('alter table customers drop constraint %I', c.conname);
  end loop;
end $$;

alter table customers add constraint customers_payment_terms_check
  check (payment_terms in ('7 Days', 'COD', '30 Days', 'Payment in advance', 'Deposit Account'));

notify pgrst, 'reload schema';
