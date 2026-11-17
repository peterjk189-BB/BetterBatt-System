-- Picking slip: remember how a pick was physically taken (e.g. "2 multis, 1 pack put back on shelf")
-- so the split is shown as a note, not recorded as a stock return.
alter table work_order_lines add column if not exists pick_note text;
