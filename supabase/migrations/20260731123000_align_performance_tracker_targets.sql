UPDATE public.kpi_targets
SET
  label = 'Invoice Cycle Time (Final Edit to Invoice)',
  owner = 'Invoicing',
  cadence = 'Weekly',
  unit = 'days',
  direction = 'lower_is_better',
  green_min = 3,
  yellow_min = 3,
  target_display = '<= 3 days',
  auto = false,
  sort_order = 1
WHERE kpi_key = 'invoice_cycle_time';

UPDATE public.kpi_targets
SET
  label = 'Tickets Moving Through - Review to Final Edit',
  owner = 'Dispatch',
  cadence = 'Weekly',
  unit = '%',
  direction = 'higher_is_better',
  green_min = 95,
  yellow_min = 85,
  target_display = '>= 95%',
  auto = true,
  sort_order = 2
WHERE kpi_key = 'review_to_final_edit';

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

UPDATE public.kpi_targets
SET
  label = 'Team Responsiveness (within 1 hour)',
  owner = 'Dispatch Service Quality',
  cadence = 'Daily',
  unit = '%',
  direction = 'higher_is_better',
  green_min = 95,
  yellow_min = 85,
  target_display = '>= 95%',
  auto = false,
  sort_order = 4
WHERE kpi_key = 'dispatch_responsiveness';

UPDATE public.kpi_targets
SET
  label = 'Safety',
  owner = 'Drivers',
  cadence = 'Monthly',
  unit = 'count',
  direction = 'lower_is_better',
  green_min = 20,
  yellow_min = 20,
  target_display = '<= 20',
  auto = false,
  sort_order = 5
WHERE kpi_key = 'driver_safety';

UPDATE public.kpi_targets
SET
  label = 'Incomplete Tickets',
  owner = 'Drivers',
  cadence = 'Monthly',
  unit = 'count',
  direction = 'lower_is_better',
  green_min = 10,
  yellow_min = 10,
  target_display = '<= 10',
  auto = false,
  sort_order = 6
WHERE kpi_key = 'incomplete_tickets';

UPDATE public.kpi_targets
SET
  label = 'Missed Jobs / Late Jobs / Client Callbacks / Reworks',
  owner = 'Job Service Quality',
  cadence = 'Monthly',
  unit = 'count',
  direction = 'lower_is_better',
  green_min = 1,
  yellow_min = 1,
  target_display = '<= 1',
  auto = false,
  sort_order = 7
WHERE kpi_key = 'missed_jobs';

DELETE FROM public.kpi_targets
WHERE kpi_key IN ('dispatch_completion', 'quality_issues');

UPDATE public.kpi_values
SET actual = 100 - actual
WHERE kpi_key = 'ticket_quality'
  AND source = 'auto'
  AND actual BETWEEN 0 AND 100;

UPDATE public.kpi_values
SET actual = NULL
WHERE kpi_key IN ('invoice_cycle_time', 'incomplete_tickets')
  AND source = 'auto';
