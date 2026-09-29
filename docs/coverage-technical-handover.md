# Coverage — Technical Handover Specification

**Prepared for:** developer or dev shop taking this from working prototype to production
**Business:** insulation supply & install company, currently running on a Microsoft Access system ("Better Batt Jobs")
**Reference build:** a working React prototype (`coverage-quoting-v3.jsx`) implements everything below and can be used as a living UI/UX spec — every screen, field, and calculation in this document is already built and testable there. It is **not** production infrastructure: it runs single-user, in-browser, with no login system and a 5MB-per-key storage cap. This document specifies what a real, multi-user, hosted version needs to be.

---

## 1. Why this document exists

The business's system of record is a Microsoft Access database (`BetterBattJobSytem`) that has run since 2016. Rather than guess at a schema, the actual Access tables, a live pricing/quoting Excel workbook (with formulas intact), and screenshots of the real Access forms were reviewed directly. Every data model and formula below is derived from that real data, not assumed. Sections are flagged **[VALIDATED]** where confirmed against real records, and **[DESIGN DECISION]** where the prototype introduced a simplification the business explicitly agreed to.

---

## 2. Data model

### 2.1 Customers
**[VALIDATED against 602 real records]**

| Field | Notes |
|---|---|
| `name` | Free text in the legacy system; 499 distinct customer names seen across 14,030 historical jobs |
| `category` | **[DESIGN DECISION]** New field — `Builder`, `Retro Fit`, or `Private`. Did not exist in Access; added so jobs can be colour-coded and grouped by customer type. Drives the calendar's colour scheme. |
| `discount_pct` | Standing discount %. In the real data, 597 of 602 customers were 0 — this field exists but is barely used operationally. Keep it, don't build extra workflow around it. |
| `payment_terms` | Enum: `7 Days` (428 of 602 — the default), `COD`, `30 Days` |
| `contact_name`, `contact_phone`, `contact_email` | **Important:** in the real Access Customers table, only 1 of 602 records had these filled in. The business does *not* currently maintain contact details at the customer level — contact info is captured **per quote** instead (see 2.5). Don't force this data to be re-entered at the customer level; the per-quote fields are the real source of truth. |

### 2.2 Subcontractors
**[VALIDATED against 13 real records]**

| Field | Notes |
|---|---|
| `name` | Mix of individual names and business names (e.g. "T.Y INT CONSTRUCTION") |
| `phone`, `email` | |
| `abn` | Only 5 of 13 had an ABN — the rest are paid as individuals, not registered businesses. This matters for how payments/compliance are handled; don't assume every contractor has one. |
| `active` | **⚠️ Flag for the business, not a design decision:** all 13 real records had `Active = False`. Confirm with the client whether this field is genuinely unmaintained in Access (likely) before carrying it into the new system as-is. |

### 2.3 Parts catalogue (materials pricing)
**[VALIDATED against 195 real records + live pricing workbook formulas]**

This is used for **customer-facing quoting**. Material and installation cost are combined per part — this matches the business's real Access "Access Data" pricing sheet, where each part carries both a material cost and an installer rate together.

| Field | Notes |
|---|---|
| `name` | e.g. "R6.0 Gold Ceiling Batts 1160x580" |
| `coverage_m2` | m² covered per pack |
| `pack_cost_ex_gst` | Cost to the business per pack |
| `installer_rate_per_m2` | Labour cost, folded into the quote |
| `supply_charge_per_pack` | Customer sell price, **supply-only** jobs — note this is priced **per pack**, not per m² (confirmed from real formulas) |
| `supply_install_rate_per_m2` | Customer sell price, **supply+install** jobs — priced **per m²** (different unit basis to the line above — this is exactly how the business's real spreadsheet works, not an error) |

**Real pricing formula, confirmed against the business's live Excel workbook (`Access_pricing_quotes_margins_2021.xlsm`):**

```
packs           = ROUNDUP(qty_m2 / coverage_m2)      // always rounds up — partial packs aren't sold
used_for_calc   = packs * coverage_m2                // actual m² covered, usually > requested qty
material_cost   = packs * pack_cost_ex_gst
labour_cost     = qty_m2 * installer_rate_per_m2
supply_only_charge    = packs * supply_charge_per_pack
supply_install_charge = used_for_calc * supply_install_rate_per_m2
```

**⚠️ Not yet built, flag for the business:** the real workbook prices the *same* line items against **four suppliers simultaneously** (CSR Bradford, Fletcher Insulation, PGF, Earthwool) with a side-by-side cost/margin comparison. The prototype only supports one supplier per part. If staff currently use that comparison to pick suppliers per job, this is a real feature gap worth discussing — it wasn't built due to scope, not because it's unimportant.

### 2.4 Labour items (contractor pay rate schedule)
**[VALIDATED against 76 real records, then deliberately simplified]**

This is a **separate concern from Parts** — it's used to price and pay **contractors**, not to bill customers. This distinction is real and confirmed directly from the live Access Work Orders screen.

| Field | Notes |
|---|---|
| `code` | e.g. "1.16" |
| `description` | e.g. "Party Wall Sealer install" |
| `contractor_rate` | $ per unit paid to the subcontractor |

**[DESIGN DECISION, explicitly requested]** The real Access rate schedule also had a `Customer Rate` and a `CSR Charge Rate` column. Both were deliberately dropped from this system: customer billing is handled entirely at the quote/Parts level, and the business does not need a separate CSR-specific rate distinction (their words: *"don't worry about CSR, we know long work with them"*). Do not resurrect these columns unless the business asks.

### 2.5 Projects / Quotes
**[VALIDATED against 13,985 real records from the live Projects table + form screenshots]**

| Field | Notes |
|---|---|
| `quote_number` | Sequential, starting at 1001, shown to users as `Q1001` |
| `customer_id` | FK to Customers |
| `contact_name`, `contact_phone`, `contact_email` | **Captured here, not on Customer** — see 2.1 |
| `job_type` | Enum, real values seen: `S+F QUOTE` (1,410), `SUPPLY & INSTALL` (4,631), `SUPPLY ONLY` (38), `MATERIAL QUOTE` (4), `OPTION QUOTE` (21). (`CSR CONTRACTING` at 6,067 was the single largest category in the real data but is out of scope per the business's instruction — see 2.4.) |
| `category` | Inherited default from the selected Customer, editable per quote |
| `outcome` | **[DESIGN DECISION, confirmed acceptable]** Enum: `Open`, `Accepted`, `Lost`, `Cancelled`. The real Access table tracked this as **three independent booleans** — `Closed`, `QuoteAccepted`, `QuoteLost` — which in principle allows states like "accepted AND closed" as separate milestones. This was collapsed into one field with the business's explicit sign-off. If a developer finds this too limiting in practice, the three-boolean model is the documented fallback. |
| `lot_no`, `address`, `suburb` | |
| `entry_date` | |
| `notes` | Free text, general job notes |
| `quote_markup` | **$ amount, can be negative.** Real examples seen: -$400, -$200 — this is a manual discretionary adjustment applied on top of the calculated subtotal, not a percentage. |
| `line_items[]` | See below |
| `archived` | Soft-delete flag — see 4.4 |

**`line_items[]` shape:**
```
{ part_id, qty_m2, note }
```
Each line carries its own free-text `note` (e.g. site access instructions). This is deliberately per-line, not one big text block — the business asked for this specifically so a note reads as attached to the relevant product.

**Quote total formula:**
```
charge_before_markup = sum of each line's supply_install_charge (or supply_only_charge if job_type == SUPPLY ONLY)
subtotal  = charge_before_markup + quote_markup
gst       = subtotal * 0.10
total     = subtotal + gst
profit    = subtotal - sum(material_cost) - sum(labour_cost)     // labour_cost excluded entirely for SUPPLY ONLY jobs
margin_pct = profit / subtotal
```

### 2.6 Work Orders
**[VALIDATED directly against a screenshot of the live Access "Work Orders" tab]**

A Work Order is a **two-level structure**, not a flat record — confirmed directly from the real screen (tabs: Project Details / Material Costs / Quote Set Up / Work Orders / Admin-Reports).

**Header:**
| Field | Notes |
|---|---|
| `wo_number` | Format `QW{quote_number}` — e.g. quote `Q1001` → work order `QW1001` |
| `project_id` | FK to the originating quote |
| `contractor_id` | FK to Subcontractors |
| `po_number` | e.g. `VERH1750/390` — free text, contractor/lot-encoded convention, not auto-generated |
| `po_value` | **Manually typed in, sourced from the quote's total.** This is *not* a calculated field — confirmed directly by the business. When generating a work order from an accepted quote, pre-fill this from the quote total as a starting point, but it must remain editable. |
| `entry_date`, `completed_date` | |
| `jsa_received` | Boolean — Job Safety Analysis sign-off, a real compliance field from the Access screen |
| `notes` | Free text |
| `archived` | Soft-delete flag |

**Task lines (`lines[]`):**
```
{ id, date, completed (bool), labour_item_id, part_id, qty, subcontractor_id, paid (bool), note }
```
Confirmed directly from the real "WorkorderLabor" grid: each task is dated individually, has its own completion checkbox, its own paid checkbox, and its own subcontractor assignment (rare, but the real system does allow a line's contractor to differ from the header — the prototype simplified this so changing the header contractor updates every line, since there's no UI need yet for genuine per-line divergence).

`part_id` links back to which quoted product this task fulfils — this is **not** in the original Access schema; it was added so a work order visibly traces back to what was quoted, avoiding re-typing product/quantity/note when a work order is generated from an accepted quote.

**Work order costing (informational, not billed — billing is locked in at the quote):**
```
contractor_cost = sum(qty * labour_item.contractor_rate) across lines
```

### 2.7 Attachments (photos & SWMS)
**[DESIGN DECISION — new, not in Access]**

Per-job file storage, categorised as `Photo`, `SWMS`, or `Other document`. In the prototype these are stored as base64 in browser storage (5MB cap per job) purely to prove the UI concept. **In production, replace this entirely with real object storage** (S3, Azure Blob, or similar) — store a URL/key per attachment record, not the file bytes. The UI (upload, category tag, thumbnail grid for photos, download list for documents) can stay identical.

---

## 3. Key workflows to preserve

1. **Quote → Accepted → Work Order automation.** When a quote's `outcome` is set to `Accepted` and saved, a Work Order is auto-created (if one doesn't already exist for that quote) with every line item's product, quantity, and note copied across. This was a specific pain point raised by the business — work orders were previously entered manually a second time.

2. **Splitting one quote across multiple contractors.** A single quote can have several product lines that need to go to two different contractors. The flow: open the quote → "Start a work order" → tick which product lines belong to Contractor A, choose them, create → repeat for Contractor B with the remaining lines. Each work order only contains its own contractor's lines.

3. **Printable, customer-facing quote.** A separate print view shows *only* what the customer should see — product, price, per-line notes, subtotal/GST/total — with **no** internal cost or margin data. This is a deliberately different view from the internal quote editor.

4. **Printable work order + "email to contractor."** Same pattern for work orders — a clean printable document, plus a `mailto:` link pre-addressed to the contractor. Note: browsers cannot attach files to an email programmatically for security reasons, so the real flow is print-to-PDF, save, then attach manually. A production build could improve this materially with a real backend that generates and emails the PDF server-side — worth prioritising.

5. **Soft delete / archive, not permanent delete.** Deleting a quote or work order asks for confirmation, then archives rather than removes the record. Archived items are hidden from normal views (including dashboards, calendar, reports, and contractor pay) but remain restorable.

6. **Weekly calendar, colour-coded by customer category.** Every work order task with a date shows on a 7-day week view, coloured by the customer's category (`Builder` / `Retro Fit` / `Private`), with double-click-to-open linking straight back to the work order.

7. **Contractor pay tracking.** Every task line's paid/unpaid status feeds a dedicated view groupable by week, month, or year, filterable by contractor, with quote number and customer visible per line — built specifically because the business needed to answer "who's owed what, and for which job."

---

## 4. Non-functional requirements for the production build

1. **Multi-user with real authentication.** Likely role split: office/admin staff (full access) vs. installers/contractors (limited — probably just their own work orders, task completion, maybe photo upload). Not designed in the prototype; needs proper scoping with the business.
2. **Real hosted relational database.** Postgres is a sensible default given the relational structure above (foreign keys throughout).
3. **Real file storage** for attachments (see 2.7) — S3-compatible storage, not embedded in the database.
4. **Server-side PDF generation and email sending** for quotes and work orders — removes the manual "save PDF, then attach it yourself" step.
5. **GST handling is currently hardcoded at 10%** — fine for Australia today, but don't bury it as a magic number; keep it a single configurable constant.
6. **Data migration** from the existing Access database — see §5.

---

## 5. Migration notes

The existing Access database (`BetterBattJobSytem`) could not be read directly in this environment (no `mdbtools`/ODBC access), so all validation here came from the business exporting tables to Excel/CSV and a text-print export of the Projects form. A developer with direct Access/ODBC access should be able to pull the underlying tables directly and cross-check against the field mappings in §2 — in particular:

- The **Projects** table maps closely to §2.5, including the three original booleans (`Closed`, `QuoteAccepted`, `QuoteLost`) that were simplified to `outcome`.
- Several dollar fields on the original Access quote form were still labelled with generic Access control names (`Text48`, `Text91`, `Text68`) at the time of review — their exact formula wasn't fully decoded. If exact parity with 10+ years of historical figures matters, check each control's **Control Source** property directly in Access.
- 14,030 historical project records (`JobID` 5–14213, Feb 2016 – Aug 2026) exist and should be migrated, not discarded — this is a real, valuable business history.

---

## 6. Open questions for the business (not yet resolved)

- Is the Subcontractors `Active = False` on all 13 real records accurate, or stale/unmaintained data in Access?
- Does the 4-supplier price comparison (Bradford / Fletcher / PGF / Earthwool) from the pricing workbook need to be rebuilt into the live system, or was that a manual/occasional estimating tool?
- What level of user permissions is actually needed — do installers need app access at all, or just to receive a PDF/notification?
- Any requirement to integrate with accounting software (Xero/MYOB) for invoicing, given contractor payment tracking already exists?

---

*This document plus the working prototype (`coverage-quoting-v3.jsx`) together form the functional spec. The prototype is the authoritative reference for exact UI behaviour; this document is the authoritative reference for why each decision was made and what's still open.*
