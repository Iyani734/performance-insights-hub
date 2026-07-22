
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read auth" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers admin write" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "customers admin update" ON public.customers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "customers admin delete" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;
GRANT ALL ON public.kpi_targets TO service_role;
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_targets read auth" ON public.kpi_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_targets admin write" ON public.kpi_targets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "kpi_targets admin update" ON public.kpi_targets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "kpi_targets admin delete" ON public.kpi_targets FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

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

INSERT INTO public.kpi_targets (kpi_key,label,owner,cadence,unit,direction,green_min,yellow_min,target_display,auto,sort_order) VALUES
('review_to_final_edit','Review → Final Edit %','Dispatch','Weekly','%','higher_is_better',95,85,'≥ 95%',true,1),
('ticket_quality','Ticket Quality %','QA','Weekly','%','lower_is_better',2,5,'≤ 2%',true,2),
('invoice_cycle_time','Invoice Cycle Time (days)','Billing','Weekly','days','lower_is_better',3,5,'≤ 3 days',true,3),
('dispatch_completion','Dispatch Completion %','Dispatch','Weekly','%','higher_is_better',95,85,'≥ 95%',true,4);

ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS rows_skipped int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_ms int,
  ADD COLUMN IF NOT EXISTS error_details jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

ALTER TABLE public.open_jobs
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS age_days int,
  ADD COLUMN IF NOT EXISTS technician text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz;

ALTER TABLE public.email_jobs
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS cc_emails text[];

INSERT INTO public.kpi_targets (kpi_key, label, owner, cadence, unit, direction, green_min, yellow_min, target_display, auto, sort_order)
VALUES
  ('driver_safety',          'Driver Safety Violations', 'Operations', 'Weekly', 'count', 'lower_is_better',  10, 25, '≤ 10',  false, 50),
  ('incomplete_tickets',     'Incomplete Tickets %',     'Dispatch',   'Weekly', '%',     'lower_is_better',   2,  5, '≤ 2%',  true,  60),
  ('missed_jobs',            'Missed Jobs',              'Dispatch',   'Weekly', 'count', 'lower_is_better',   0,  3, '0',     false, 70),
  ('quality_issues',         'Quality Issues %',         'QC',         'Weekly', '%',     'lower_is_better',   2,  5, '≤ 2%',  true,  80),
  ('dispatch_responsiveness','Dispatch Responsiveness',  'Dispatch',   'Weekly', 'hours', 'lower_is_better',   2,  6, '≤ 2 h', false, 90)
ON CONFLICT (kpi_key) DO NOTHING;

DROP POLICY IF EXISTS "report-files read" ON storage.objects;
CREATE POLICY "report-files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'report-files');
DROP POLICY IF EXISTS "report-files write" ON storage.objects;
CREATE POLICY "report-files write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'report-files');
DROP POLICY IF EXISTS "report-files delete" ON storage.objects;
CREATE POLICY "report-files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'report-files' AND public.has_role(auth.uid(), 'admin'));

create table public.upload_delete_requests (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.report_uploads(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_by_name text,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.upload_delete_requests to authenticated;
grant all on public.upload_delete_requests to service_role;
alter table public.upload_delete_requests enable row level security;
create policy "delete_req read auth" on public.upload_delete_requests for select to authenticated using (true);
create policy "delete_req insert own" on public.upload_delete_requests for insert to authenticated with check (requested_by = auth.uid());
create policy "delete_req update admin" on public.upload_delete_requests for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "delete_req delete admin" on public.upload_delete_requests for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
create index upload_delete_requests_status_idx on public.upload_delete_requests(status, created_at desc);

create or replace function public.ensure_demo_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create or replace function pg_temp.demo_seed_uuid(seed text)
  returns uuid
  language sql
  immutable
  as $fn$
    select (
      substr(md5(seed), 1, 8) || '-' ||
      substr(md5(seed), 9, 4) || '-' ||
      '4' || substr(md5(seed), 14, 3) || '-' ||
      '8' || substr(md5(seed), 18, 3) || '-' ||
      substr(md5(seed), 21, 12)
    )::uuid;
  $fn$;

  insert into public.customers (id, key, name, email, cc_emails, active, enabled, last_email_sent_at, created_at, updated_at)
  values
    (pg_temp.demo_seed_uuid('demo-customer:acmehealth'), 'ACMEHEALTH', 'Acme Health Network', 'operations@acmehealth.example', array['dispatch@acmehealth.example','billing@acmehealth.example']::text[], true, true, timestamptz '2027-05-26 10:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-26 10:00:00+00'),
    (pg_temp.demo_seed_uuid('demo-customer:northstar'), 'NORTHSTAR', 'Northstar Facilities', 'service@northstar.example', array['ops@northstar.example']::text[], true, true, timestamptz '2027-05-25 14:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-25 14:00:00+00'),
    (pg_temp.demo_seed_uuid('demo-customer:meridian'), 'MERIDIAN', 'Meridian Retail Group', 'maintenance@meridian.example', array['regional@meridian.example','finance@meridian.example']::text[], true, true, timestamptz '2027-05-26 16:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-26 16:00:00+00'),
    (pg_temp.demo_seed_uuid('demo-customer:harbor'), 'HARBOR', 'Harbor Logistics', 'facilities@harbor.example', array['yardops@harbor.example']::text[], true, true, timestamptz '2027-05-24 11:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-24 11:00:00+00'),
    (pg_temp.demo_seed_uuid('demo-customer:summit'), 'SUMMIT', 'Summit Hospitality', 'engineering@summit.example', array['gm@summit.example']::text[], true, true, timestamptz '2027-05-23 13:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-23 13:00:00+00'),
    (pg_temp.demo_seed_uuid('demo-customer:verdant'), 'VERDANT', 'Verdant Public Works', 'publicworks@verdant.example', array['fieldops@verdant.example','procurement@verdant.example']::text[], true, true, timestamptz '2027-05-22 15:00:00+00', timestamptz '2027-05-01 09:00:00+00', timestamptz '2027-05-22 15:00:00+00')
  on conflict (key) do update set
    name = excluded.name,
    email = excluded.email,
    cc_emails = excluded.cc_emails,
    active = true,
    enabled = true,
    last_email_sent_at = excluded.last_email_sent_at,
    updated_at = excluded.updated_at;

  with params as (
    select date '2027-05-24' as current_week
  ),
  weeks as (
    select (p.current_week - (age.week_age * interval '7 days'))::date as week_start, age.week_age
    from params p
    cross join generate_series(0, 3) as age(week_age)
  ),
  upload_kinds as (
    select * from (values
      ('total_tickets', 'demo-total-tickets.xlsx', 126, 720),
      ('total_invoiced', 'demo-total-invoiced.xlsx', 118, 680),
      ('open_jobs', 'demo-open-jobs.xlsx', 26, 410)
    ) as k(kind, file_name, row_count, processing_ms)
  )
  insert into public.report_uploads (
    id, kind, week_start, file_name, file_path, row_count, uploaded_by,
    created_at, rows_skipped, errors_count, processing_ms, error_details, status
  )
  select
    pg_temp.demo_seed_uuid('demo-upload:' || w.week_start::text || ':' || k.kind),
    k.kind::public.report_kind,
    w.week_start,
    k.file_name,
    null,
    k.row_count,
    null,
    w.week_start::timestamptz + interval '4 days' + ((3 - w.week_age) * interval '11 minutes'),
    0,
    0,
    k.processing_ms + (w.week_age * 12),
    '[]'::jsonb,
    'success'
  from weeks w
  cross join upload_kinds k
  on conflict (id) do update set
    row_count = excluded.row_count;

  with params as (
    select date '2027-05-24' as current_week
  ),
  weeks as (
    select (p.current_week - (age.week_age * interval '7 days'))::date as week_start, age.week_age
    from params p
    cross join generate_series(0, 3) as age(week_age)
  ),
  customer_keys as (
    select * from (values
      (1, 'ACMEHEALTH', 'Acme Health Network', 'Austin'),
      (2, 'NORTHSTAR', 'Northstar Facilities', 'Denver'),
      (3, 'MERIDIAN', 'Meridian Retail Group', 'Phoenix'),
      (4, 'HARBOR', 'Harbor Logistics', 'Seattle'),
      (5, 'SUMMIT', 'Summit Hospitality', 'Orlando'),
      (6, 'VERDANT', 'Verdant Public Works', 'Portland')
    ) as c(ord, key, name, city)
  ),
  base as (
    select w.week_start, w.week_age, 'tickets'::public.ticket_kind as kind, 126 as row_total
    from weeks w
    union all
    select w.week_start, w.week_age, 'invoiced'::public.ticket_kind as kind, 118 as row_total
    from weeks w
  ),
  expanded as (
    select b.week_start, b.week_age, b.kind, n
    from base b
    cross join lateral generate_series(1, b.row_total) as n
  )
  insert into public.tickets (
    id, upload_id, kind, week_start, ticket_no, ticket_id, customer_id_ext, customer,
    status, order_type, order_category, job_no, type, city, rental_start, date_recv,
    final_edited_by, void_reason, raw, created_at
  )
  select
    pg_temp.demo_seed_uuid('demo-ticket:' || e.week_start::text || ':' || e.kind::text || ':' || e.n::text),
    pg_temp.demo_seed_uuid(
      'demo-upload:' || e.week_start::text || ':' ||
      case when e.kind = 'tickets'::public.ticket_kind then 'total_tickets' else 'total_invoiced' end
    ),
    e.kind,
    e.week_start,
    case when e.kind = 'tickets'::public.ticket_kind then 'TCK-' else 'INV-' end ||
      to_char(e.week_start, 'IYYYIW') || '-' || lpad(e.n::text, 4, '0'),
    'DEMO-' || e.week_start::text || '-' || e.kind::text || '-' || e.n::text,
    c.key,
    c.name,
    case
      when e.kind = 'tickets'::public.ticket_kind and e.n % 63 = 0 then 'Voided'
      when e.kind = 'invoiced'::public.ticket_kind then 'Invoiced'
      else 'Final Edited'
    end,
    case e.n % 4
      when 0 then 'Preventive Maintenance'
      when 1 then 'Repair'
      when 2 then 'Inspection'
      else 'Install'
    end,
    case e.n % 3
      when 0 then 'Priority'
      when 1 then 'Standard'
      else 'Warranty'
    end,
    'JOB-' || to_char(e.week_start, 'IYYYIW') || '-' || lpad(e.n::text, 4, '0'),
    case when e.kind = 'tickets'::public.ticket_kind then 'Work Order' else 'Invoice' end,
    c.city,
    (e.week_start - ((e.n % 18) * interval '1 day'))::date,
    case
      when e.kind = 'invoiced'::public.ticket_kind
        then e.week_start::timestamptz + interval '5 days' + ((e.n % 4) * interval '6 hours')
      else e.week_start::timestamptz + interval '2 days' + ((e.n % 5) * interval '10 hours')
    end,
    case when e.kind = 'tickets'::public.ticket_kind and e.n % 89 = 0 then null else 'Demo QA' end,
    case
      when e.kind = 'tickets'::public.ticket_kind and e.n % 63 = 0 then 'Duplicate dispatch closed'
      when e.kind = 'invoiced'::public.ticket_kind and e.n % 117 = 0 then 'Billing correction resolved'
      else null
    end,
    jsonb_build_object('demo', true, 'row', e.n, 'week_age', e.week_age, 'source', e.kind::text),
    e.week_start::timestamptz + interval '3 days' + ((e.n % 12) * interval '30 minutes')
  from expanded e
  join customer_keys c on c.ord = ((e.n - 1) % 6) + 1
  on conflict (id) do nothing;

  with params as (
    select date '2027-05-24' as current_week
  ),
  weeks as (
    select (p.current_week - (age.week_age * interval '7 days'))::date as week_start, age.week_age
    from params p
    cross join generate_series(0, 3) as age(week_age)
  ),
  customers as (
    select * from (values
      (1, 'ACMEHEALTH', 'Acme Health Network', '100 Lakeview Drive', 5),
      (2, 'NORTHSTAR', 'Northstar Facilities', '2200 Market Street', 5),
      (3, 'MERIDIAN', 'Meridian Retail Group', '18 West Retail Plaza', 4),
      (4, 'HARBOR', 'Harbor Logistics', '760 Portside Road', 4),
      (5, 'SUMMIT', 'Summit Hospitality', '400 Grand Avenue', 4),
      (6, 'VERDANT', 'Verdant Public Works', '55 Civic Center Way', 4)
    ) as c(ord, key, name, address, job_total)
  ),
  jobs as (
    select w.week_start, w.week_age, c.*, j
    from weeks w
    cross join customers c
    cross join lateral generate_series(1, c.job_total) as j
  )
  insert into public.open_jobs (
    id, upload_id, week_start, customer_key, customer_name, job_no, ticket_no,
    order_type, last_activity, details, created_at, address, status, age_days,
    technician, notes
  )
  select
    pg_temp.demo_seed_uuid('demo-open-job:' || j.week_start::text || ':' || j.key || ':' || j.j::text),
    pg_temp.demo_seed_uuid('demo-upload:' || j.week_start::text || ':open_jobs'),
    j.week_start,
    j.key,
    j.name,
    'OJ-' || to_char(j.week_start, 'IYYYIW') || '-' || j.ord || j.j,
    'TCK-' || to_char(j.week_start, 'IYYYIW') || '-' || lpad(((j.ord * 20) + j.j)::text, 4, '0'),
    case j.j % 4
      when 0 then 'Inspection'
      when 1 then 'Repair'
      when 2 then 'Preventive Maintenance'
      else 'Install'
    end,
    'Update ' || j.j::text,
    jsonb_build_object('demo', true, 'priority', case when j.j = 1 then 'high' else 'normal' end),
    j.week_start::timestamptz + interval '4 days' + ((j.ord + j.j) * interval '18 minutes'),
    j.address || ', Suite ' || (100 + (j.j * 10))::text,
    'In Progress',
    j.j + 1 + least(j.week_age, 2),
    'A. Patel',
    'On track'
  from jobs j
  on conflict (id) do nothing;

  with params as (
    select date '2027-05-24' as current_week
  ),
  weeks as (
    select (p.current_week - (age.week_age * interval '7 days'))::date as week_start, age.week_age
    from params p
    cross join generate_series(0, 3) as age(week_age)
  ),
  kpi_rows as (
    select week_start, 'review_to_final_edit' as kpi_key, round((97.8 - (week_age * 0.30))::numeric, 1) as actual from weeks
    union all select week_start, 'ticket_quality', round((1.1 + (week_age * 0.07))::numeric, 1) from weeks
    union all select week_start, 'invoice_cycle_time', round((2.0 + (week_age * 0.08))::numeric, 1) from weeks
    union all select week_start, 'dispatch_completion', round((98.5 - (week_age * 0.24))::numeric, 1) from weeks
    union all select week_start, 'driver_safety', (6 + floor(week_age / 3.0))::numeric from weeks
    union all select week_start, 'incomplete_tickets', round((1.2 + (week_age * 0.08))::numeric, 1) from weeks
    union all select week_start, 'missed_jobs', 1::numeric from weeks
    union all select week_start, 'quality_issues', round((1.1 + (week_age * 0.08))::numeric, 1) from weeks
    union all select week_start, 'dispatch_responsiveness', round((1.3 + (week_age * 0.06))::numeric, 1) from weeks
  )
  insert into public.kpi_values (id, kpi_key, week_start, actual, source, entered_by, created_at)
  select
    pg_temp.demo_seed_uuid('demo-kpi:' || k.week_start::text || ':' || k.kpi_key),
    k.kpi_key,
    k.week_start,
    k.actual,
    'demo',
    null,
    k.week_start::timestamptz + interval '5 days'
  from kpi_rows k
  on conflict (kpi_key, week_start) do nothing;
end;
$$;

grant execute on function public.ensure_demo_data() to authenticated;
grant execute on function public.ensure_demo_data() to anon;

select public.ensure_demo_data();

grant usage on schema public to anon;
grant select on public.customers to anon;
grant select on public.email_jobs to anon;
grant select on public.kpi_notes to anon;
grant select on public.kpi_targets to anon;
grant select on public.kpi_values to anon;
grant select on public.open_jobs to anon;
grant select on public.report_uploads to anon;
grant select on public.tickets to anon;

create policy "demo customers read anon" on public.customers for select to anon using (key in ('ACMEHEALTH','NORTHSTAR','MERIDIAN','HARBOR','SUMMIT','VERDANT'));
create policy "demo email jobs read anon" on public.email_jobs for select to anon using (customer_id in (select id from public.customers where key in ('ACMEHEALTH','NORTHSTAR','MERIDIAN','HARBOR','SUMMIT','VERDANT')));
create policy "demo kpi notes read anon" on public.kpi_notes for select to anon using (author_name = 'Demo Operations Manager');
create policy "demo kpi targets read anon" on public.kpi_targets for select to anon using (true);
create policy "demo kpi values read anon" on public.kpi_values for select to anon using (source = 'demo');
create policy "demo open jobs read anon" on public.open_jobs for select to anon using (details ->> 'demo' = 'true');
create policy "demo report uploads read anon" on public.report_uploads for select to anon using (file_name in ('demo-total-tickets.xlsx','demo-total-invoiced.xlsx','demo-open-jobs.xlsx'));
create policy "demo tickets read anon" on public.tickets for select to anon using (raw ->> 'demo' = 'true');
