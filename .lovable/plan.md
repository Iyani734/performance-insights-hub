# Performance Tracking Dashboard — MVP Plan

## Stack
- TanStack Start + Lovable Cloud (Postgres, Auth, Storage).
- shadcn/ui + Tailwind, Recharts for visualizations, TanStack Query.
- Excel parsing in-browser with SheetJS on upload; server-side validation and persistence via server functions.

## Design
Executive-friendly, modern. Deep navy `#0B1220` sidebar, off-white canvas `#F7F8FB`, cards white with subtle shadow, accent teal `#0EA5A4`, status pills Green `#16A34A` / Amber `#F59E0B` / Red `#DC2626`. Typography: Outfit (headings), Inter (body). Compact, data-dense but airy.

## Data Model (Lovable Cloud)
- `profiles(id, full_name, email)` + `user_roles(user_id, role: admin|user)` + `has_role()` RPC.
- `report_uploads(id, kind: total_tickets|total_invoiced|open_jobs, week_start, uploaded_by, file_path, row_count, created_at)`.
- `tickets(id, upload_id, ticket_no, ticket_id, customer_id_ext, customer, status, order_type, order_category, job_no, rental_start, date_recv, final_edited_by, void_reason, kind: tickets|invoiced, week_start, raw jsonb)` — one row per ticket per upload, preserving history.
- `open_jobs(id, upload_id, week_start, customer_key, customer_name, job_no, ticket_no, last_activity, details jsonb)`.
- `customers(id, key, name, email, cc_emails text[], active)`.
- `kpi_targets(id, kpi_key, green_min, yellow_min, unit, direction)` — editable in-app.
- `kpi_values(id, kpi_key, week_start, actual numeric, source: auto|manual, entered_by)`.
- `kpi_notes(id, kpi_key, week_start, note, author_id, created_at)`.
- `email_jobs(id, batch_id, customer_id, week_start, status: pending|sent|failed, error, sent_at, attachment_path)`.
- Storage buckets: `reports` (private), `customer-reports` (private).
- RLS: authenticated read on shared operational tables; writes gated by `has_role('admin')` where destructive; notes writable by any authenticated user.

## KPI Engine (auto)
Computed per `week_start` from tickets:
- **Review → Final Edit %** = tickets with `FinalEditedBy` not null ÷ total tickets in Total Tickets upload.
- **Ticket Quality %** = quality issues ÷ total invoiced (quality flag inferred from `Void Reason` present or a manual quality-flag table; user can override manually per week).
- **Invoice Cycle Time** = avg days between `Date Recv` and invoiced date on Total Invoiced upload.
Manual KPIs: authorized users enter actuals + notes per week.
Status derived from `kpi_targets` thresholds.

## Screens
1. **Auth** (`/auth`) — email/password sign-in/up (Cloud).
2. **Dashboard** (`/`) — summary cards (Active, In Review, Final Edit, Invoiced), KPI table (Owner/Cadence/Metric/Target/Actual/Status/Notes), trend charts (line: Review→Final Edit %, Ticket Quality %, Invoice Cycle Time; bar: weekly ticket volume). Week picker.
3. **Uploads** (`/uploads`) — drag-drop for Total Tickets, Total Invoiced, Open Jobs. Preview parsed rows, choose week_start, submit → server function validates + inserts. Upload history list with re-download.
4. **History** (`/history`) — week/month comparison table, filters, CSV/PDF export.
5. **Open Jobs** (`/open-jobs`) — customer sidebar list, detail pane with that customer's jobs; per-customer download (Excel/PDF).
6. **Customers** (`/customers`) — CRUD (name, email, cc[], active).
7. **Emails** (`/emails`) — generate batch from latest Open Jobs upload, per-customer status table, "Send one" / "Send all", logs. Provider hookup deferred; jobs sit in `pending` and UI shows a banner "Email provider not configured".
8. **Settings** (`/settings`) — KPI targets editor, user role management (admin only).

## Roles
- `admin`: everything, incl. user role assignment and deletes.
- `user`: uploads, view dashboard, add notes.
Enforced client-side (route guards under `_authenticated`, admin-only routes gated by role check) AND server-side (RLS + server function role checks).

## Reporting/Export
- PDF via `@react-pdf/renderer` server-side; Excel via SheetJS.
- Weekly/Monthly/Custom range report downloads on Dashboard + History.

## Notifications
In-app toast + dashboard banners: missing weekly upload (based on latest `week_start`), email failures, KPI red, customers missing email.

## Out of scope (v1)
Actual email provider send (UI + queue built, sending stubbed until provider chosen), SSO, mobile-native app.

## Implementation order
1. Enable Lovable Cloud; migrations + RLS + seed KPI targets and admin role for first signup.
2. Auth + `_authenticated` layout + role helpers.
3. Uploads module (parse + persist) for the 3 report kinds.
4. KPI engine server functions + Dashboard.
5. Open Jobs + Customers CRUD.
6. Email batch UI + queue (stubbed sender).
7. History, exports, notifications, settings.

Approve to proceed; I'll build it in that order.