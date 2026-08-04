ALTER TYPE public.report_kind ADD VALUE IF NOT EXISTS 'active_review_final';
ALTER TYPE public.report_kind ADD VALUE IF NOT EXISTS 'ticket_qc';
ALTER TYPE public.report_kind ADD VALUE IF NOT EXISTS 'total_cycle_time';

UPDATE public.kpi_targets
SET
  label = 'Tickets QC''d - Review to Final Edit',
  unit = 'count',
  direction = 'higher_is_better',
  green_min = 1,
  yellow_min = 1,
  target_display = 'QC row count',
  auto = true
WHERE kpi_key = 'review_to_final_edit';

UPDATE public.kpi_targets
SET auto = false
WHERE kpi_key = 'ticket_quality';
