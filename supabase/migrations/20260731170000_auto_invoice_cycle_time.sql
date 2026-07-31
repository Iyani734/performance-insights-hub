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
