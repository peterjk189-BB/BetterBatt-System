-- Quote outcome "Complete": the job has been finished. Counts as won/accepted everywhere; no more work orders can be created.
alter table projects drop constraint if exists projects_outcome_check;
alter table projects
  add constraint projects_outcome_check check (outcome in ('Open', 'Accepted', 'Complete', 'Lost', 'Cancelled'));
