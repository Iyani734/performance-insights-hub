UPDATE public.kpi_targets
SET
  direction = 'higher_is_better',
  green_min = 95,
  yellow_min = 85,
  target_display = '>= 95%'
WHERE kpi_key = 'ticket_quality';

UPDATE public.kpi_values
SET actual = 100 - actual
WHERE kpi_key = 'ticket_quality'
  AND source = 'auto'
  AND actual BETWEEN 0 AND 100;

UPDATE public.kpi_targets
SET
  label = 'Quality Issues',
  unit = 'count',
  direction = 'lower_is_better',
  green_min = 0,
  yellow_min = 5,
  target_display = '<= 0'
WHERE kpi_key = 'quality_issues';

WITH quality_counts AS (
  SELECT
    week_start,
    COUNT(*) FILTER (WHERE void_reason IS NOT NULL AND BTRIM(void_reason) <> '') AS quality_issues
  FROM public.tickets
  WHERE kind = 'invoiced'
    AND COALESCE(raw->>'demo', 'false') <> 'true'
  GROUP BY week_start
)
UPDATE public.kpi_values AS value
SET actual = quality_counts.quality_issues
FROM quality_counts
WHERE value.kpi_key = 'quality_issues'
  AND value.source = 'auto'
  AND value.week_start = quality_counts.week_start;
