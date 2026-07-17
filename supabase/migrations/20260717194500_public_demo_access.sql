grant usage on schema public to anon;

grant select on public.customers to anon;
grant select on public.email_jobs to anon;
grant select on public.kpi_notes to anon;
grant select on public.kpi_targets to anon;
grant select on public.kpi_values to anon;
grant select on public.open_jobs to anon;
grant select on public.report_uploads to anon;
grant select on public.tickets to anon;

grant execute on function public.ensure_demo_data() to anon;
grant execute on function public.ensure_demo_data() to authenticated;

drop policy if exists "demo customers read anon" on public.customers;
create policy "demo customers read anon"
on public.customers
for select
to anon
using (key in ('ACMEHEALTH', 'NORTHSTAR', 'MERIDIAN', 'HARBOR', 'SUMMIT', 'VERDANT'));

drop policy if exists "demo email jobs read anon" on public.email_jobs;
create policy "demo email jobs read anon"
on public.email_jobs
for select
to anon
using (
  customer_id in (
    select id
    from public.customers
    where key in ('ACMEHEALTH', 'NORTHSTAR', 'MERIDIAN', 'HARBOR', 'SUMMIT', 'VERDANT')
  )
);

drop policy if exists "demo kpi notes read anon" on public.kpi_notes;
create policy "demo kpi notes read anon"
on public.kpi_notes
for select
to anon
using (author_name = 'Demo Operations Manager');

drop policy if exists "demo kpi targets read anon" on public.kpi_targets;
create policy "demo kpi targets read anon"
on public.kpi_targets
for select
to anon
using (true);

drop policy if exists "demo kpi values read anon" on public.kpi_values;
create policy "demo kpi values read anon"
on public.kpi_values
for select
to anon
using (source = 'demo');

drop policy if exists "demo open jobs read anon" on public.open_jobs;
create policy "demo open jobs read anon"
on public.open_jobs
for select
to anon
using (details ->> 'demo' = 'true');

drop policy if exists "demo report uploads read anon" on public.report_uploads;
create policy "demo report uploads read anon"
on public.report_uploads
for select
to anon
using (file_name in ('demo-total-tickets.xlsx', 'demo-total-invoiced.xlsx', 'demo-open-jobs.xlsx'));

drop policy if exists "demo tickets read anon" on public.tickets;
create policy "demo tickets read anon"
on public.tickets
for select
to anon
using (raw ->> 'demo' = 'true');

select public.ensure_demo_data();
