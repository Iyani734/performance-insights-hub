ALTER TABLE public.email_jobs
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS resend_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS email_jobs_one_sent_per_customer_week
ON public.email_jobs (week_start, customer_id)
WHERE status = 'sent' AND customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_jobs_one_sent_per_email_week
ON public.email_jobs (week_start, lower(customer_email))
WHERE status = 'sent' AND customer_email IS NOT NULL;

GRANT INSERT, UPDATE ON public.customers TO authenticated;

DROP POLICY IF EXISTS "customers admin write" ON public.customers;
DROP POLICY IF EXISTS "customers admin update" ON public.customers;
DROP POLICY IF EXISTS "customers authenticated insert" ON public.customers;
DROP POLICY IF EXISTS "customers authenticated update" ON public.customers;

CREATE POLICY "customers authenticated insert"
ON public.customers
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "customers authenticated update"
ON public.customers
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);
