# Brief for Claude Code — Build & Deploy "Coverage"

**Goal:** Turn the working prototype into a real, multi-user, hosted web app — on free or near-free infrastructure, not a big-budget rebuild.

**Give Claude Code these three files when you start:**
1. `coverage-quoting-v3.jsx` — the working prototype (the UI/UX and business-logic spec)
2. `coverage-technical-handover.md` — the data model, real pricing formulas, and open questions
3. This brief

---

## Before you start: two free accounts (you do this part, ~10 minutes)

1. **[supabase.com](https://supabase.com)** — free tier. This gives you a real Postgres database, user logins, and file storage in one place. Create a new project, note down the **Project URL** and **API keys** it gives you.
2. **[vercel.com](https://vercel.com)** — free tier. This is what will actually host the app so it's reachable from any device. Sign up with GitHub (easiest).

Have both open/logged in before starting the Claude Code session — it will ask for these keys to connect the real app to them.

---

## Instructions for Claude Code

You are building a production version of an insulation supply & install business management tool called **Coverage**, replacing an existing prototype. The prototype (`coverage-quoting-v3.jsx`) is a single-file React app with **no backend** — it stores data in a per-browser key-value store. Your job is to rebuild its functionality on real infrastructure while keeping its UI, workflow, and business logic **identical** unless this brief says otherwise.

### Stack
- **Framework:** Next.js (App Router), TypeScript
- **Database + Auth + File Storage:** Supabase (Postgres, Supabase Auth, Supabase Storage)
- **Hosting:** Vercel
- **Styling:** keep the existing design system — the colour tokens, layout, and component patterns in the prototype (`C` object, `Modal`, `Button`, table components) should carry over faithfully, not be redesigned

### Build order (do not skip ahead — each phase should be usable before starting the next)

**Phase 1 — Foundation**
1. Scaffold the Next.js project, connect it to the Supabase project using the keys the user provides.
2. Build the database schema in Supabase from §2 of `coverage-technical-handover.md` — every table listed there (Customers, Subcontractors, Suppliers, Parts/Inventory, Labour Items, Purchase Orders, Projects/Quotes, Work Orders, Attachments), with proper foreign keys.
3. Set up Supabase Auth with two roles: **admin/office staff** (full access) and a **read-limited role** for installers/contractors (their own work orders and task completion only) — ask the user to confirm this split before building permission rules, since it wasn't fully specified.
4. Deploy an empty shell to Vercel so the pipeline (code → Supabase → live URL) is proven working before building features.

**Phase 2 — Core workflow**
5. Customers, Subcontractors, Suppliers, Inventory (Parts), Labour Items — CRUD screens, matching the prototype's fields and the inline-editable Inventory table behaviour exactly.
6. Quotes/Projects — the quote builder with line items, the real pricing formula in §2.3/§2.5 of the handover doc (packs = ROUNDUP, GST 10%, markup), quote numbers, categories, contact fields, the printable customer-facing PDF.
7. Work Orders — PO header + task lines, the quote-accepted auto-generation logic, the "split across two contractors" picker, JSA tracking, printable PDF, the "email to contractor" helper.
8. Purchase Orders — supplier ordering, the split multi/loose-pack receiving flow that updates inventory stock.

**Phase 3 — Everything else**
9. Calendar (weekly view, 1/2/3-week span, colour-coded by customer category), Contractor Pay (weekly/monthly/yearly + the payment-run report with GST), Reports (Job P&L, Excel export), Photos & SWMS attachments (**use real Supabase Storage here, not embedded files** — this is the one place the prototype's approach must not carry over as-is).

### Non-functional requirements
- **PDF generation and email should move server-side** in the real build — replace the prototype's "print-to-PDF then manually attach" workaround with the app actually generating a PDF and sending it, since a real backend can finally do that properly.
- **Migrate the real historical data** — the business has ~14,000 historical job records in Access; don't let this get lost. Ask the user for the exported CSVs referenced in the handover doc's §5 and write a one-time import script.
- Keep hosting/DB costs on the free tiers as long as realistically possible; flag clearly if a feature (e.g. file storage volume) is about to push into paid usage.

### What to ask the user before proceeding, not guess
- The exact permission split for installer/contractor logins (Phase 1, step 3)
- Whether the 4-supplier price comparison tool (flagged as a gap in the handover doc) should be built now or later
- Whether they want email sending wired to their existing business email or a new transactional email service (this has a small ongoing cost — a few dollars/month at low volume — worth flagging explicitly since the brief promises low cost)

---

*Once Phase 1 deploys successfully, stop and show the user the live URL before continuing — that's the point where "is this actually working" gets confirmed cheaply, before more is built on top of it.*
