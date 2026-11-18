-- Per-quote tick: show the price of each line on the customer's quote link (off by default: totals only).
alter table projects add column if not exists show_prices_on_quote boolean not null default false;
