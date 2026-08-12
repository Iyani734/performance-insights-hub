ALTER TABLE public.kpi_values
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_note TEXT;

CREATE INDEX IF NOT EXISTS kpi_values_manual_confirmation_idx
ON public.kpi_values (kpi_key, week_start, confirmed_at);

UPDATE public.kpi_targets
SET
  label = 'Ticket Quality',
  owner = 'Dispatch/Drivers',
  cadence = 'Monthly',
  unit = '%',
  direction = 'higher_is_better',
  green_min = 95,
  yellow_min = 90,
  target_display = '>= 95%',
  auto = true,
  sort_order = 3
WHERE kpi_key = 'ticket_quality';

UPDATE public.kpi_values
SET actual = 100 - actual
WHERE kpi_key = 'ticket_quality'
  AND actual IS NOT NULL
  AND actual BETWEEN 0 AND 50;
