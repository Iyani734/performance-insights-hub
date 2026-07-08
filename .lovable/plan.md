# Performance Tracker v2 — Feedback Implementation Plan

Addressing your review across all six modules plus the two "biggest missing features" (automation workflow + executive summary).

## 1. Dashboard — Management-grade

**Executive Summary card (top of page)**
- Overall KPI Score (weighted %) with big number
- Counts: 🟢 On Target · 🟡 Watch · 🔴 Critical
- Last Upload timestamp
- Customer Emails snapshot (Ready / Sent / Pending) pulled from `email_jobs`
- Week-over-week delta arrows (↑ / ↓ / →) with % change on each KPI

**Weekly Operational Summary panel**
Card-per-KPI blocks styled like the executive report:
- Status color, trend arrow, one-line commentary
- Auto-generated commentary ("QC improved 3rd consecutive week", "Immediate attention required")
- "Focus Areas" list highlighting the worst 3 KPIs

**Expanded KPI set** (added to `kpi_targets` seed)
- Driver Safety (violations count, lower-is-better)
- Incomplete Tickets %
- Missed Jobs count
- Quality Issues %
- Dispatch Responsiveness (avg time to dispatch)
- Existing: Review→Final Edit, Ticket Quality, Invoice Cycle, Dispatch Completion

Manual-entry KPIs (Driver Safety, Missed Jobs, Speeding) get an inline "Update value" dialog on each row.

## 2. Uploads

Add columns to history table: **Rows Imported · Skipped · Errors · Status · Processing Time**. Persist these on `report_uploads` (add `rows_skipped`, `errors_count`, `processing_ms`, `error_details jsonb`). Show inline success banner "888 imported, 3 skipped".

## 3. Open Jobs — CRM feel

- Customer list keeps left rail; right pane becomes a rich table.
- Columns: **Job # · Address · Status · Age (days) · Assigned Driver · Notes**
- Add `address`, `status`, `age_days`, `technician`, `notes` fields to `open_jobs` (parsed from Excel where available).
- Toolbar filters: Search · Customer · Status · Technician · Aging bucket (0-7 / 8-14 / 15-30 / 30+).
- Age badge color-coded (green <7d, amber 8-14, red >14).

## 4. Customers

Redesign table: **Customer · Primary Email · CC Emails (chips) · Active Jobs · Last Email Sent · Actions**.
Actions: **Add · Edit · Delete · Test Email · Enable/Disable toggle**.
Support multiple CC emails (already `text[]`, expose chip input).
"Active Jobs" computed from latest open_jobs upload.
"Last Email Sent" from `email_jobs`.
"Test Email" queues a test row (stubbed until provider wired).

## 5. Emails — Per-customer workflow

Batch view becomes a table:
**Customer · Jobs · Recipient · Attachment · Preview · Send**
- Per-row Preview modal (rendered HTML of the customer's open-jobs report)
- Per-row Send (queues to `email_jobs`)
- Bulk actions: Generate Batch · Send All · Retry Failed · Send Later (schedule)
- Attachment auto-generated as XLSX using existing `downloadXlsx`

History table:
**Date · Customer · Recipient · Subject · Attachment · Status · Error**

## 6. History

Tabs: **KPI History · Weekly Reports · Monthly Reports · Uploads**
- Download previous uploaded files (store originals in Lovable Cloud Storage bucket `report-files`)
- Compare Weeks / Compare Months view — side-by-side KPI table with delta column

## Automation Workflow (the big one)

New "Distribute Open Jobs" flow on Open Jobs page:
1. Upload Open Jobs (existing)
2. **Auto-group by customer_key** (existing)
3. **Match to customers table by name/key** — flag unmatched
4. **Generate per-customer report** (XLSX attachment + HTML preview)
5. **Preview panel** — list every customer with status: Ready / Missing Email / No Jobs
6. **One-click "Send All"** → creates one `email_jobs` row per customer (status `pending` until provider is wired)
7. **Delivery log** appears in Emails → History

Wizard-style stepper at the top so it's visually obvious.

## Schema changes (one migration)

- `report_uploads`: + `rows_skipped int`, `errors_count int`, `processing_ms int`, `error_details jsonb`, `file_path text`
- `open_jobs`: + `address text`, `status text`, `age_days int`, `technician text`, `notes text`
- `kpi_targets`: seed 5 new KPI rows (Driver Safety, Incomplete Tickets, Missed Jobs, Quality Issues, Dispatch Responsiveness)
- `customers`: + `enabled boolean default true`, `last_email_sent_at timestamptz`
- `email_jobs`: + `subject text`, `attachment_name text`, `scheduled_for timestamptz`, `error text`
- Storage bucket `report-files` (private, admin-write)

## Out of scope for this pass (call out)

- Actual SMTP send (email provider still deferred — batches queue as `pending`)
- Automated commentary uses simple rules, not LLM
- Excel column mapping for the new open_jobs fields assumes headers like `Address`, `Status`, `Technician`, `Notes`; unmapped fields stay null

## Delivery order

1. Migration (schema + KPI seed + storage bucket)
2. Dashboard rebuild (Executive Summary + Weekly Summary + expanded KPIs + WoW deltas)
3. Uploads (import stats + file storage)
4. Open Jobs CRM view + filters
5. Customers redesign
6. Emails per-customer workflow + Distribute wizard
7. History tabs + compare view

Approve and I'll build it end-to-end.
