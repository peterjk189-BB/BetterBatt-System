-- Lets an open site visit show photos/plans added by someone else straight away.
-- (site_visits itself was switched on in 0036.) Run once in Supabase -> SQL Editor. Safe to re-run.

do $$
begin
  begin
    alter publication supabase_realtime add table public.attachments;
  exception when duplicate_object then
    null;
  end;
end $$;

notify pgrst, 'reload schema';
