-- Adds a per-quote toggle for whether the printable, customer-facing quote
-- shows the m² quantity per line. Defaults to hidden — showing exact
-- measurements lets a customer shop the same quote around without doing
-- their own measuring.
alter table projects
  add column if not exists show_qty_on_quote boolean not null default false;
