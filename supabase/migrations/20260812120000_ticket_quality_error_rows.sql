ALTER TYPE public.ticket_kind ADD VALUE IF NOT EXISTS 'quality_error';

CREATE INDEX IF NOT EXISTS tickets_quality_error_date_idx
ON public.tickets (kind, date_recv);
