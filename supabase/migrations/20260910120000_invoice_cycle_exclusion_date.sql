ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS invoice_cycle_exclude_from date;

COMMENT ON COLUMN public.report_uploads.invoice_cycle_exclude_from IS
  'First Deliver/Pickup date excluded from Invoice Cycle Time calculations.';
