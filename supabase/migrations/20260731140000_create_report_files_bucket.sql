INSERT INTO storage.buckets (id, name, public)
VALUES ('report-files', 'report-files', false)
ON CONFLICT (id) DO NOTHING;

UPDATE public.report_uploads
SET
  status = 'failed',
  errors_count = GREATEST(COALESCE(errors_count, 0), 1),
  error_details = COALESCE(error_details, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('row', 0, 'reason', 'Upload did not finish. Please upload the file again.'))
WHERE status = 'processing'
  AND created_at < now() - interval '5 minutes';
