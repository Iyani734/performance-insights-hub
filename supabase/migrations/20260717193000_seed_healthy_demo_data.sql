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

  delete from public.email_jobs
  where created_by is null
    and customer_id in (
      select id from public.customers
      where key in ('ACMEHEALTH', 'NORTHSTAR', 'MERIDIAN', 'HARBOR', 'SUMMIT', 'VERDANT')
    )
    and (week_start < date '2027-05-01' or week_start > date '2027-05-31');

  delete from public.kpi_notes
  where author_name = 'Demo Operations Manager'
    and (week_start < date '2027-05-01' or week_start > date '2027-05-31');

  delete from public.kpi_values
  where source = 'demo'
    and (week_start < date '2027-05-01' or week_start > date '2027-05-31');

  delete from public.report_uploads
  where file_name in ('demo-total-tickets.xlsx', 'demo-total-invoiced.xlsx', 'demo-open-jobs.xlsx')
    and (week_start < date '2027-05-01' or week_start > date '2027-05-31');

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
    row_count = excluded.row_count,
    rows_skipped = excluded.rows_skipped,
    errors_count = excluded.errors_count,
    processing_ms = excluded.processing_ms,
    error_details = excluded.error_details,
    status = excluded.status,
    created_at = excluded.created_at,
    file_name = excluded.file_name,
    file_path = excluded.file_path;

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
  on conflict (id) do update set
    upload_id = excluded.upload_id,
    customer_id_ext = excluded.customer_id_ext,
    customer = excluded.customer,
    status = excluded.status,
    order_type = excluded.order_type,
    order_category = excluded.order_category,
    job_no = excluded.job_no,
    type = excluded.type,
    city = excluded.city,
    rental_start = excluded.rental_start,
    date_recv = excluded.date_recv,
    final_edited_by = excluded.final_edited_by,
    void_reason = excluded.void_reason,
    raw = excluded.raw,
    created_at = excluded.created_at;

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
    case j.j
      when 1 then 'Technician assigned and arrival window confirmed'
      when 2 then 'Parts staged for same-week completion'
      when 3 then 'Customer confirmed site access'
      when 4 then 'Follow-up visit scheduled'
      else 'Billing packet being finalized'
    end,
    jsonb_build_object('demo', true, 'priority', case when j.j = 1 then 'high' else 'normal' end),
    j.week_start::timestamptz + interval '4 days' + ((j.ord + j.j) * interval '18 minutes'),
    j.address || ', Suite ' || (100 + (j.j * 10))::text,
    case j.j
      when 1 then 'Scheduled'
      when 2 then 'In Progress'
      when 3 then 'Customer Confirmed'
      when 4 then 'Awaiting Parts'
      else 'Ready for Billing'
    end,
    case
      when j.j = 5 then 10 + j.week_age
      when j.j = 4 then 8 + j.week_age
      else j.j + 1 + least(j.week_age, 2)
    end,
    case (j.ord + j.j) % 5
      when 0 then 'A. Patel'
      when 1 then 'M. Rivera'
      when 2 then 'J. Brooks'
      when 3 then 'S. Chen'
      else 'T. Morgan'
    end,
    case
      when j.j = 4 then 'Waiting on stocked part confirmation'
      else 'On track for the weekly customer update'
    end
  from jobs j
  on conflict (id) do update set
    upload_id = excluded.upload_id,
    customer_name = excluded.customer_name,
    job_no = excluded.job_no,
    ticket_no = excluded.ticket_no,
    order_type = excluded.order_type,
    last_activity = excluded.last_activity,
    details = excluded.details,
    created_at = excluded.created_at,
    address = excluded.address,
    status = excluded.status,
    age_days = excluded.age_days,
    technician = excluded.technician,
    notes = excluded.notes;

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
  on conflict (kpi_key, week_start) do update set
    actual = excluded.actual,
    source = excluded.source,
    created_at = excluded.created_at;

  with params as (
    select date '2027-05-24' as current_week
  ),
  customers as (
    select row_number() over (order by name) as ord, id, key, name, email, cc_emails
    from public.customers
    where key in ('ACMEHEALTH', 'NORTHSTAR', 'MERIDIAN', 'HARBOR', 'SUMMIT', 'VERDANT')
  ),
  job_counts as (
    select customer_key, count(*)::int as job_count
    from public.open_jobs, params
    where week_start = params.current_week
    group by customer_key
  )
  insert into public.email_jobs (
    id, batch_id, week_start, customer_id, customer_name, customer_email, job_count,
    status, error, sent_at, created_by, created_at, subject, attachment_name,
    scheduled_for, cc_emails
  )
  select
    pg_temp.demo_seed_uuid('demo-email:' || params.current_week::text || ':' || c.key),
    pg_temp.demo_seed_uuid('demo-email-batch:' || params.current_week::text),
    params.current_week,
    c.id,
    c.name,
    c.email,
    coalesce(j.job_count, 1),
    case when c.ord <= 4 then 'sent' else 'pending' end,
    null,
    case when c.ord <= 4 then params.current_week::timestamptz + interval '3 days' + (c.ord * interval '75 minutes') else null end,
    null,
    params.current_week::timestamptz + interval '2 days' + (c.ord * interval '45 minutes'),
    'Open Jobs Report - ' || c.name || ' - Week of ' || to_char(params.current_week, 'Mon DD, YYYY'),
    replace(c.name, ' ', '_') || '-open-jobs-' || params.current_week::text || '.xlsx',
    case when c.ord > 4 then params.current_week::timestamptz + interval '4 days' + ((c.ord - 4) * interval '2 hours') else null end,
    c.cc_emails
  from params
  cross join customers c
  left join job_counts j on j.customer_key = c.key
  on conflict (id) do update set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    customer_email = excluded.customer_email,
    job_count = excluded.job_count,
    status = excluded.status,
    error = excluded.error,
    sent_at = excluded.sent_at,
    created_at = excluded.created_at,
    subject = excluded.subject,
    attachment_name = excluded.attachment_name,
    scheduled_for = excluded.scheduled_for,
    cc_emails = excluded.cc_emails;

  with params as (
    select date '2027-05-24' as current_week
  ),
  notes as (
    select * from (values
      ('general', 'Healthy demo week: dispatch completion, invoice cycle, and ticket quality are all tracking on target.'),
      ('dispatch_completion', 'Recovery work is limited to a few same-week follow-ups; no ageing backlog is building.'),
      ('invoice_cycle_time', 'Billing handoff is staying under the three-day target with clean invoice packets.')
    ) as n(kpi_key, note)
  )
  insert into public.kpi_notes (id, kpi_key, week_start, note, author_id, author_name, created_at)
  select
    pg_temp.demo_seed_uuid('demo-note:' || params.current_week::text || ':' || n.kpi_key),
    n.kpi_key,
    params.current_week,
    n.note,
    null,
    'Demo Operations Manager',
    params.current_week::timestamptz + interval '4 days'
  from params
  cross join notes n
  on conflict (id) do update set
    note = excluded.note,
    author_name = excluded.author_name,
    created_at = excluded.created_at;
end;
$$;

grant execute on function public.ensure_demo_data() to authenticated;

select public.ensure_demo_data();
