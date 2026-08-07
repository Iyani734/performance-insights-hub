ALTER TYPE public.report_kind ADD VALUE IF NOT EXISTS 'ticket_quality';

UPDATE public.kpi_targets
SET
  label = 'Ticket Quality',
  owner = 'Dispatch/Drivers',
  cadence = 'Monthly',
  unit = '%',
  direction = 'lower_is_better',
  green_min = 3,
  yellow_min = 5,
  target_display = '< 3%',
  auto = true,
  sort_order = 3
WHERE kpi_key = 'ticket_quality';
