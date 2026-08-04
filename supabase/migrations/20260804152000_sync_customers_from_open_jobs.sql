CREATE OR REPLACE FUNCTION public.sync_customer_from_open_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customers (key, name, updated_at)
  VALUES (btrim(NEW.customer_key), btrim(NEW.customer_name), now())
  ON CONFLICT (key) DO UPDATE
  SET
    name = EXCLUDED.name,
    updated_at = now()
  WHERE public.customers.name IS DISTINCT FROM EXCLUDED.name;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS open_jobs_sync_customer ON public.open_jobs;

CREATE TRIGGER open_jobs_sync_customer
AFTER INSERT OR UPDATE OF customer_key, customer_name
ON public.open_jobs
FOR EACH ROW
WHEN (
  NEW.customer_key IS NOT NULL
  AND btrim(NEW.customer_key) <> ''
  AND NEW.customer_name IS NOT NULL
  AND btrim(NEW.customer_name) <> ''
)
EXECUTE FUNCTION public.sync_customer_from_open_job();
