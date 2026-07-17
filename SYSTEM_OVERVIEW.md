# Performance Tracker — System Overview

A web-based operations dashboard that replaces the weekly Excel-based KPI reporting process. Managers upload two exports each week; the app parses them, calculates KPIs, tracks trends over time, and sends per-customer Open Jobs reports.

---

## 1. High-level flow

```
 ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
 │  User uploads │ ─▶ │  Parse & store │ ─▶ │  Auto-compute KPIs │ ─▶ │  Dashboard  │
 │  XLSX exports │    │  (tickets,     │    │  (server + client) │    │  + History  │
 └──────────────┘    │   open_jobs)   │    └──────────────────┘    │  + Analytics │
                     └──────────────┘                              └──────────────┘
                              │                                            │
                              ▼                                            ▼
                     ┌──────────────────┐                        ┌──────────────────┐
                     │  Group by         │                        │  Manager enters   │
                     │  customer (open   │─▶ Emails page ─────▶ │  manual KPIs      │
                     │  jobs)            │   (preview + send)     │  (safety, missed) │
                     └──────────────────┘                        └──────────────────┘
```

## 2. Roles & access

- **Admin** — first account created; can approve/reject upload delete requests and manage everything.
- **User** — uploads reports, edits customers, sends emails, requests deletes.
- **Demo viewer** — anonymous visitor who clicks "Explore the demo" on the landing page; auto-signed into a shared demo workspace with 6 months of seed data. No login screen.

Roles live in the `user_roles` table with a `has_role()` security-definer function used by all RLS policies.

## 3. Weekly workflow

1. **Sign in** (`/auth`) or click *Explore the demo* on `/`.
2. **Uploads** (`/uploads`) — drag in the weekly XLSX files:
   - **Total Tickets** — every ticket created for the week.
   - **Total Invoiced** — every ticket invoiced.
   - **Open Jobs** — outstanding jobs grouped by customer.
   Each upload records: uploader, row counts (imported / skipped / errors), processing time, and the original file (stored in the `report-files` bucket).
3. **Dashboard** (`/dashboard`) — the app automatically calculates the KPIs for the selected week and shows:
   - Executive summary card (overall score, on-target / watch / critical counts, last upload, email pipeline).
   - Weekly Operational Summary — one card per KPI with WoW delta, colour band, and one-line commentary.
   - Focus Areas — worst three KPIs.
   - KPI table and trend chart.
4. **Manual KPIs** — a manager updates safety, missed jobs, and dispatch responsiveness inline (only non-auto KPIs show an "Update value" button; auto-calculated KPIs are read-only).
5. **Open Jobs** (`/open-jobs`) — CRM-style view with filters (customer, status, technician, ageing bucket).
6. **Customers** (`/customers`) — maintain primary + CC recipients, toggle enabled, send test emails.
7. **Emails** (`/emails`) — per-customer preview and send of the current week's Open Jobs report; log of all attempts.
8. **History** (`/history`) — KPI trends, week-vs-week and month-vs-month comparisons, and downloadable original uploads.
9. **Analytics** (`/analytics`) — per-KPI trend chart, heatmap, and smart insights across the selected window.

## 4. KPI calculation reference

`/how-it-works` (public page) contains the authoritative per-KPI formulas. Summary:

| KPI | Source | Formula | Type |
|---|---|---|---|
| Review → Final Edit % | Total Tickets | `count(Final Edited By set) / count(all) × 100` | Auto |
| Ticket Quality % | Total Invoiced | `count(Void Reason set) / count(all) × 100` | Auto |
| Invoice Cycle Time | Total Invoiced | `avg(end_of_week − Date Recv)` days | Auto |
| Dispatch Completion % | Total Tickets | `count(no Void Reason) / count(all) × 100` | Auto |
| Incomplete Tickets % | Derived | `100 − Dispatch Completion` | Auto |
| Quality Issues % | Total Invoiced | same as Ticket Quality (separate target) | Auto |
| Driver Safety Violations | Manual | Entered by manager | Manual |
| Missed Jobs | Manual | Entered by manager | Manual |
| Dispatch Responsiveness (h) | Manual | Entered by manager | Manual |

Auto KPIs are recomputed on every dashboard load from the `tickets` table for the selected week — no cron job needed.

## 5. Status thresholds

Each row in `kpi_targets` stores `direction` (higher-is-better / lower-is-better), `green_min`, and `yellow_min`. `computeStatus()` maps the actual value to green / yellow / red / none. Overall score weights green=100, yellow=60, red=20.

## 6. Data model (key tables)

| Table | Purpose |
|---|---|
| `profiles` | Display info for each auth user (used to attribute uploads). |
| `user_roles` | Role assignments; queried through `has_role()`. |
| `report_uploads` | One row per uploaded file — kind, week, uploader, counts, storage path. |
| `tickets` | Parsed rows from Total Tickets and Total Invoiced (`kind` distinguishes them). |
| `open_jobs` | Parsed Open Jobs rows grouped by customer. |
| `kpi_targets` | KPI catalogue (label, target, direction, thresholds, auto flag). |
| `kpi_values` | Manual overrides / non-auto KPI entries per week. |
| `kpi_notes` | Manager commentary attached to a week. |
| `customers` | Recipient list — primary email, CC array, enabled flag. |
| `email_jobs` | Per-customer email pipeline (pending / sent / failed) with attachment name and error. |
| `upload_delete_requests` | Delete requests raised by users; admins approve or reject. |

All public tables have RLS enabled and explicit `GRANT`s to `authenticated` (+ `service_role`).

## 7. Delete workflow (auditable)

1. A user opens **Uploads** and clicks *Request delete* on any row.
2. A row is inserted into `upload_delete_requests` with `status = pending`.
3. Admins see the pending list at the top of Uploads and click **Approve** or **Reject**.
4. Approving deletes the linked `report_uploads` row (and cascades tickets/open jobs); rejecting leaves the upload intact.
5. Every request keeps a record of *who requested*, *who approved*, and *when* — so errors can be traced back to the user who uploaded the bad file.

## 8. Automation targets

- **Automatic KPI calculation** — no spreadsheet formulas; every auto KPI recomputes on view.
- **Customer emails** — Open Jobs → grouped per customer → preview → send (or "send all"). Sent status and errors logged to `email_jobs`.
- **Historical continuity** — every week's uploaded file is retained in Lovable Cloud Storage and can be re-downloaded from History → Uploads.

## 9. Tech stack (for reference)

- **Frontend**: TanStack Start (React 19, Vite 7) + TanStack Router + TanStack Query, Tailwind v4, shadcn/ui, Recharts.
- **Backend**: Lovable Cloud (Postgres + Auth + Storage + RLS).
- **Server logic**: TanStack `createServerFn` for authenticated mutations; public routes under `src/routes/api/public/*` for webhooks (not currently used).
- **Auth**: Email/password. First signup becomes admin. Anonymous demo account handled via a public sign-in with a shared demo user.

## 10. Where things live in the code

| Area | Path |
|---|---|
| KPI calculators + status | `src/lib/kpi.ts`, `src/lib/summary.ts` |
| XLSX parser + downloader | `src/lib/parse.ts` |
| Auth hook | `src/lib/useAuth.ts` |
| App shell (sidebar) | `src/components/AppShell.tsx` |
| Public how-it-works page | `src/routes/how-it-works.tsx` |
| Dashboard | `src/routes/_authenticated/dashboard.tsx` |
| Analytics | `src/routes/_authenticated/analytics.tsx` |
| History | `src/routes/_authenticated/history.tsx` |
| Uploads (+ delete workflow) | `src/routes/_authenticated/uploads.tsx` |
| Open Jobs / Customers / Emails | corresponding files under `_authenticated/` |

---

**Bottom line:** managers do one thing each week — upload the two exports. Everything else (KPIs, trends, executive summary, customer emails, historical archive) is generated for them.
