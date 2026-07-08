
DROP POLICY IF EXISTS "report-files read" ON storage.objects;
CREATE POLICY "report-files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'report-files');

DROP POLICY IF EXISTS "report-files write" ON storage.objects;
CREATE POLICY "report-files write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'report-files');

DROP POLICY IF EXISTS "report-files delete" ON storage.objects;
CREATE POLICY "report-files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'report-files' AND public.has_role(auth.uid(), 'admin'));
