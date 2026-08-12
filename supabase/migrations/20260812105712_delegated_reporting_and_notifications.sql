-- Department-scoped reporting authority and staff notifications.
-- Existing attendance policies and the security-invoker report view are
-- intentionally untouched. Department access is mediated by the authenticated
-- Edge Function, which returns aggregates only after checking these records.

alter table public.profiles
  add column if not exists authority_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_authority_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_authority_level_check
      check (authority_level is null or authority_level in ('super_admin', 'dg', 'director', 'hod'));
  end if;
end $$;

alter table public.departments
  add column if not exists description text,
  add column if not exists functions text[] not null default '{}',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.report_authorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'refused', 'revoked')),
  request_note text,
  decision_note text,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  decided_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz,
  expires_at timestamptz,
  decided_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, department_id)
);

create index if not exists idx_report_authorities_department_status
  on public.report_authorities(department_id, status, updated_at desc);
create index if not exists idx_report_authorities_user_status
  on public.report_authorities(user_id, status);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'system'
    check (category in ('system', 'attendance', 'report_access', 'absence', 'security')),
  action_url text,
  created_by uuid references public.profiles(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  from_date date not null,
  to_date date not null,
  reason_category text not null default 'other'
    check (reason_category in ('medical', 'official_assignment', 'family', 'other')),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'refused', 'cancelled')),
  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_date <= to_date)
);

create index if not exists idx_absence_requests_department_status
  on public.absence_requests(department_id, status, from_date);
create index if not exists idx_absence_requests_user_created
  on public.absence_requests(user_id, created_at desc);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_recipient_unread
  on public.notifications(recipient_id, read_at, created_at desc);

alter table public.report_authorities enable row level security;
alter table public.notifications enable row level security;
alter table public.absence_requests enable row level security;

create policy report_authority_read on public.report_authorities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.is_active
        and (
          viewer.authority_level = 'dg'
          or (
            viewer.authority_level in ('director', 'hod')
            and viewer.department_id = report_authorities.department_id
          )
        )
    )
  );

create policy report_authority_request on public.report_authorities
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and requested_by = (select auth.uid())
    and status = 'requested'
    and department_id = (
      select requester.department_id
      from public.profiles requester
      where requester.id = (select auth.uid()) and requester.is_active
    )
  );

create policy notification_read_own on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin());

create policy notification_mark_own on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy absence_request_read on public.absence_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.is_active
        and (
          viewer.authority_level = 'dg'
          or (
            viewer.authority_level in ('director', 'hod')
            and viewer.department_id = absence_requests.department_id
          )
        )
    )
  );

create policy absence_request_submit on public.absence_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and department_id = (
      select requester.department_id
      from public.profiles requester
      where requester.id = (select auth.uid()) and requester.is_active
    )
  );

grant select, insert on public.report_authorities to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert on public.absence_requests to authenticated;

create or replace function public.apply_absence_decision(
  request_id uuid,
  decision text,
  decision_note text,
  actor_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.absence_requests%rowtype;
  written_days integer := 0;
begin
  if decision not in ('approved', 'refused') then
    raise exception 'Invalid absence decision';
  end if;

  select * into request_row
  from public.absence_requests
  where id = request_id
  for update;

  if not found then raise exception 'Absence request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'Absence request already decided'; end if;

  if decision = 'approved' then
    insert into public.attendance (user_id, work_date, status, marked_by, admin_note)
    select
      request_row.user_id,
      day::date,
      'excused',
      actor_id,
      'Approved absence permission ' || request_id::text || ': ' || decision_note
    from generate_series(request_row.from_date, request_row.to_date, interval '1 day') day
    where extract(isodow from day) between 1 and 5
    on conflict (user_id, work_date) do update
      set status = 'excused',
          marked_by = excluded.marked_by,
          admin_note = excluded.admin_note
      where public.attendance.sign_in_at is null;
    get diagnostics written_days = row_count;
  end if;

  update public.absence_requests
  set status = decision,
      decision_note = apply_absence_decision.decision_note,
      decided_by = actor_id,
      decided_at = now(),
      updated_at = now()
  where id = request_id;

  return written_days;
end;
$$;

revoke all on function public.apply_absence_decision(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_absence_decision(uuid, text, text, uuid) to service_role;

-- Staff previously had a broad own-profile update path. Preserve legitimate
-- self-service fields while preventing a caller from assigning their own role,
-- authority, grade or department through a crafted Data API request.
create or replace function public.guard_profile_privilege_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) = old.id and old.role <> 'admin' then
    new.role := old.role;
    new.authority_level := old.authority_level;
    new.department_id := old.department_id;
    new.grade_level := old.grade_level;
    new.staff_id := old.staff_id;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privilege_fields on public.profiles;
create trigger guard_profile_privilege_fields
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_fields();
