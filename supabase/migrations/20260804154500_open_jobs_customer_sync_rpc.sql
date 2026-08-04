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

CREATE OR REPLACE FUNCTION public.sync_customers_from_open_jobs_upload(p_upload_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  synced_count integer := 0;
BEGIN
  WITH source_customers AS (
    SELECT DISTINCT ON (btrim(customer_key))
      btrim(customer_key) AS key,
      btrim(customer_name) AS name
    FROM public.open_jobs
    WHERE upload_id = p_upload_id
      AND customer_key IS NOT NULL
      AND btrim(customer_key) <> ''
      AND customer_name IS NOT NULL
      AND btrim(customer_name) <> ''
    ORDER BY btrim(customer_key), btrim(customer_name)
  ),
  upserted AS (
    INSERT INTO public.customers (key, name, updated_at)
    SELECT key, name, now()
    FROM source_customers
    ON CONFLICT (key) DO UPDATE
    SET
      name = EXCLUDED.name,
      updated_at = now()
    WHERE public.customers.name IS DISTINCT FROM EXCLUDED.name
    RETURNING 1
  )
  SELECT count(*)::integer INTO synced_count
  FROM upserted;

  RETURN synced_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_customers_from_open_jobs_upload(uuid) TO authenticated;
