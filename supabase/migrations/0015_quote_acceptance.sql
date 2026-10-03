-- Lets a customer accept/sign a quote from a public link, with no login.
-- share_token is the unguessable id used in that link
-- (/quote/<share_token>); the public page and its accept API both look the
-- quote up by this token using the service-role client, so no new RLS
-- policy is needed to expose quotes to anonymous visitors.

-- share_token is a volatile default (gen_random_uuid()), so Postgres fills
-- every existing row with its own fresh random value when this runs, not
-- one shared value — no separate backfill step needed.
alter table projects
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_name text,
  add column if not exists accepted_ip text;

create unique index if not exists projects_share_token_idx on projects (share_token);
