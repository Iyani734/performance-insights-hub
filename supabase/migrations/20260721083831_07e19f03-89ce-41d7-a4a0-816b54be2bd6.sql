UPDATE public.tickets SET week_start = week_start - INTERVAL '1 year', rental_start = CASE WHEN rental_start IS NOT NULL THEN rental_start - INTERVAL '1 year' ELSE NULL END, date_recv = CASE WHEN date_recv IS NOT NULL THEN date_recv - INTERVAL '1 year' ELSE NULL END WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.kpi_values SET week_start = week_start - INTERVAL '1 year' WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.open_jobs SET week_start = week_start - INTERVAL '1 year' WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.report_uploads SET week_start = week_start - INTERVAL '1 year' WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.report_uploads SET effective_from = effective_from - INTERVAL '1 year' WHERE effective_from IS NOT NULL AND EXTRACT(YEAR FROM effective_from) = 2027;
UPDATE public.report_uploads SET effective_to = effective_to - INTERVAL '1 year' WHERE effective_to IS NOT NULL AND EXTRACT(YEAR FROM effective_to) = 2027;
UPDATE public.email_jobs SET week_start = week_start - INTERVAL '1 year' WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.kpi_notes SET week_start = week_start - INTERVAL '1 year' WHERE EXTRACT(YEAR FROM week_start) = 2027;
UPDATE public.customers SET last_email_sent_at = last_email_sent_at - INTERVAL '1 year' WHERE last_email_sent_at IS NOT NULL AND EXTRACT(YEAR FROM last_email_sent_at) = 2027;

CREATE OR REPLACE FUNCTION public.ensure_demo_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return;
end;
$function$;