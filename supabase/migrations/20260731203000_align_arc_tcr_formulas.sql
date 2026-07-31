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
  auto = true,
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
