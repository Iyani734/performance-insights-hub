-- Upload processing happens in the signed-in browser. The uploader must be
-- allowed to finish its own record after the rows have been imported.
GRANT UPDATE ON public.report_uploads TO authenticated;

DROP POLICY IF EXISTS "uploads update own or admin" ON public.report_uploads;
CREATE POLICY "uploads update own or admin"
ON public.report_uploads
FOR UPDATE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- There is no background import worker. Any processing record older than
-- thirty seconds was interrupted before the browser could finish it.
UPDATE public.report_uploads
SET
  status = 'failed',
  errors_count = GREATEST(COALESCE(errors_count, 0), 1),
  error_details = COALESCE(error_details, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'row', 0,
      'reason', 'Upload processing was interrupted before completion. Please upload the file again.'
    ))
WHERE status = 'processing'
  AND created_at < now() - interval '30 seconds';
