UPDATE public.kpi_targets
SET
  label = 'Tickets QC''d - Review to Final Edit',
  unit = '%',
  direction = 'higher_is_better',
  green_min = 95,
  yellow_min = 85,
  target_display = '>= 95%',
  auto = true
WHERE kpi_key = 'review_to_final_edit';
