-- Per-person home page layout (tile order, hidden tiles) and pinned favourite tabs. Office and admin only.
-- Run once in Supabase -> SQL Editor.
alter table profiles add column if not exists home_layout jsonb;
