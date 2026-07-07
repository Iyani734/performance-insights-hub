
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles readable by auth" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Auto profile + first-user-is-admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Report uploads
CREATE TYPE public.report_kind AS ENUM ('total_tickets','total_invoiced','open_jobs');

CREATE TABLE public.report_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.report_kind NOT NULL,
  week_start DATE NOT NULL,
  file_name TEXT,
  file_path TEXT,
  row_count INT DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.report_uploads (kind, week_start DESC);
GRANT SELECT, INSERT ON public.report_uploads TO authenticated;
GRANT ALL ON public.report_uploads TO service_role;
ALTER TABLE public.report_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uploads read auth" ON public.report_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "uploads insert auth" ON public.report_uploads FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "uploads delete admin" ON public.report_uploads FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Tickets
CREATE TYPE public.ticket_kind AS ENUM ('tickets','invoiced');
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.report_uploads(id) ON DELETE CASCADE,
  kind public.ticket_kind NOT NULL,
  week_start DATE NOT NULL,
  ticket_no TEXT,
  ticket_id TEXT,
  customer_id_ext TEXT,
  customer TEXT,
  status TEXT,
  order_type TEXT,
  order_category TEXT,
  job_no TEXT,
  type TEXT,
  city TEXT,
  rental_start DATE,
  date_recv TIMESTAMPTZ,
  final_edited_by TEXT,
  void_reason TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.tickets (kind, week_start);
CREATE INDEX ON public.tickets (customer);
GRANT SELECT, INSERT ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets read auth" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets insert auth" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets delete admin" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Open jobs
CREATE TABLE public.open_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.report_uploads(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  job_no TEXT,
  ticket_no TEXT,
  order_type TEXT,
  last_activity TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.open_jobs (week_start, customer_key);
GRANT SELECT, INSERT ON public.open_jobs TO authenticated;
GRANT ALL ON public.open_jobs TO service_role;
ALTER TABLE public.open_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_jobs read auth" ON public.open_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "open_jobs insert auth" ON public.open_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "open_jobs delete admin" ON public.open_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  cc_emails TEXT[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read auth" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers admin write" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "customers admin update" ON public.customers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "customers admin delete" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.customers TO authenticated;

-- KPI targets
CREATE TABLE public.kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  owner TEXT,
  cadence TEXT DEFAULT 'Weekly',
  unit TEXT DEFAULT '%',
  direction TEXT NOT NULL DEFAULT 'higher_is_better',
  green_min NUMERIC NOT NULL,
  yellow_min NUMERIC NOT NULL,
  target_display TEXT,
  auto BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kpi_targets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;
GRANT ALL ON public.kpi_targets TO service_role;
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_targets read auth" ON public.kpi_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_targets admin write" ON public.kpi_targets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "kpi_targets admin update" ON public.kpi_targets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "kpi_targets admin delete" ON public.kpi_targets FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- KPI values (manual overrides / actuals)
CREATE TABLE public.kpi_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key TEXT NOT NULL,
  week_start DATE NOT NULL,
  actual NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual',
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kpi_key, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_values TO authenticated;
GRANT ALL ON public.kpi_values TO service_role;
ALTER TABLE public.kpi_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_values read auth" ON public.kpi_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_values insert auth" ON public.kpi_values FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kpi_values update auth" ON public.kpi_values FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kpi_values delete admin" ON public.kpi_values FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- KPI notes
CREATE TABLE public.kpi_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key TEXT NOT NULL,
  week_start DATE NOT NULL,
  note TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.kpi_notes (kpi_key, week_start);
GRANT SELECT, INSERT, DELETE ON public.kpi_notes TO authenticated;
GRANT ALL ON public.kpi_notes TO service_role;
ALTER TABLE public.kpi_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes read auth" ON public.kpi_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes insert auth" ON public.kpi_notes FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "notes delete own or admin" ON public.kpi_notes FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Email jobs
CREATE TABLE public.email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  week_start DATE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  job_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_jobs (batch_id);
CREATE INDEX ON public.email_jobs (week_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_jobs TO authenticated;
GRANT ALL ON public.email_jobs TO service_role;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_jobs read auth" ON public.email_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_jobs insert auth" ON public.email_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "email_jobs update admin" ON public.email_jobs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "email_jobs delete admin" ON public.email_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Seed default KPI targets
INSERT INTO public.kpi_targets (kpi_key,label,owner,cadence,unit,direction,green_min,yellow_min,target_display,auto,sort_order) VALUES
('review_to_final_edit','Review → Final Edit %','Dispatch','Weekly','%','higher_is_better',95,85,'≥ 95%',true,1),
('ticket_quality','Ticket Quality %','QA','Weekly','%','lower_is_better',2,5,'≤ 2%',true,2),
('invoice_cycle_time','Invoice Cycle Time (days)','Billing','Weekly','days','lower_is_better',3,5,'≤ 3 days',true,3),
('dispatch_completion','Dispatch Completion %','Dispatch','Weekly','%','higher_is_better',95,85,'≥ 95%',true,4);
