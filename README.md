# Coverage — Better Batt Insulation

Production build of **Coverage**: quoting, work orders, inventory & purchasing,
contractor pay, and scheduling for Better Batt Insulation. Built on Next.js +
Supabase (Postgres, Auth, Storage) + Vercel, chosen to run at near-zero
hosting cost at this business's scale.

Reference material this build follows:
- `coverage-quoting-v3.jsx` — the working prototype (UI/UX spec)
- `coverage-technical-handover.md` — the data model, real pricing formulas, and open questions

## Phase 1 — Foundation (this commit)

- [x] Next.js project scaffolded, Supabase client wired up (`lib/supabase/`)
- [x] Database schema written (`supabase/migrations/0001_init.sql`)
- [x] Auth roles: `admin` (office/full access) and `installer` (read-only, own jobs)
- [x] Empty shell homepage that checks the Supabase connection live

### One manual step to finish Phase 1

The migration can't be run from here automatically (no database password was
shared, only the API keys — reasonably, since that password is more powerful
and shouldn't be pasted into chat). To finish the checkpoint:

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Click **Run**.
4. Reload the deployed site — the homepage should flip from "schema not
   created yet" to "Foundation is live".

### Environment variables (set in Vercel → Project Settings → Environment Variables)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oxkzmsvrckmgyfbgzkct.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key — server-only, never exposed to the browser |

After adding them, redeploy (Vercel does this automatically on the next push,
or click **Redeploy** manually once for these to take effect on the current
deployment).

### First admin user

Roles default to `installer` for anyone who signs up. To make the first
office/admin account:

1. Sign up once through the app (once auth screens exist in Phase 2), or
   create a user directly in Supabase → Authentication → Users → Add user.
2. In the SQL Editor, run:
   ```sql
   update profiles set role = 'admin' where id = '<their auth user id>';
   ```

## Phases 2 & 3

Not started yet — see `coverage-claude-code-brief.md` for the full build plan
(core quoting/work order/purchasing workflow, then calendar/contractor
pay/reports/attachments).
