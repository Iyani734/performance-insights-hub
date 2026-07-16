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
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles read all auth') then
    create policy "profiles read all auth" on public.profiles for select to authenticated using (true);
  end if;
end $$;