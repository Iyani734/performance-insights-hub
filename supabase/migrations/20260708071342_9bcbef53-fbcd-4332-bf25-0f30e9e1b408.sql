
ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS rows_skipped int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_ms int,
  ADD COLUMN IF NOT EXISTS error_details jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

ALTER TABLE public.open_jobs
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS age_days int,
  ADD COLUMN IF NOT EXISTS technician text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz;

ALTER TABLE public.email_jobs
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS cc_emails text[];

INSERT INTO public.kpi_targets (kpi_key, label, owner, cadence, unit, direction, green_min, yellow_min, target_display, auto, sort_order)
VALUES
  ('driver_safety',          'Driver Safety Violations', 'Operations', 'Weekly', 'count', 'lower_is_better',  10, 25, '≤ 10',  false, 50),
  ('incomplete_tickets',     'Incomplete Tickets %',     'Dispatch',   'Weekly', '%',     'lower_is_better',   2,  5, '≤ 2%',  true,  60),
  ('missed_jobs',            'Missed Jobs',              'Dispatch',   'Weekly', 'count', 'lower_is_better',   0,  3, '0',     false, 70),
  ('quality_issues',         'Quality Issues %',         'QC',         'Weekly', '%',     'lower_is_better',   2,  5, '≤ 2%',  true,  80),
  ('dispatch_responsiveness','Dispatch Responsiveness',  'Dispatch',   'Weekly', 'hours', 'lower_is_better',   2,  6, '≤ 2 h', false, 90)
ON CONFLICT (kpi_key) DO NOTHING;
