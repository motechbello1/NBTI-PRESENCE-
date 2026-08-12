-- ============================================================
-- NBTI PRESENCE — Database Schema
-- Run this whole file in Supabase → SQL Editor → New Query
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- DEPARTMENTS
-- ------------------------------------------------------------
create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text unique,
  created_at  timestamptz not null default now()
);

insert into departments (name, code) values
  ('ICT Department', 'ICT'),
  ('Human Resource Management', 'HRM'),
  ('Finance and Accounts', 'FIN'),
  ('Technology Acquisition and Development', 'TAD'),
  ('Incubation and Enterprise Development', 'IED'),
  ('Planning, Research and Statistics', 'PRS'),
  ('Procurement', 'PRO'),
  ('Legal Services', 'LEG'),
  ('Internal Audit', 'AUD'),
  ('Public Relations', 'PRU'),
  ('SERVICOM', 'SVC'),
  ('Anti-Corruption and Transparency Unit', 'ACTU')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- PROFILES  (extends auth.users)
-- ------------------------------------------------------------
create table if not exists profiles (
  id             uuid primary key references auth.users on delete cascade,
  full_name      text not null,
  staff_id       text unique,
  email          text,
  phone          text,
  department_id  uuid references departments(id),
  grade_level    text,
  role           text not null default 'staff' check (role in ('staff','admin')),
  is_active      boolean not null default true,
  face_enrolled  boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- FACE ENROLLMENTS
-- One row per captured face descriptor. Multiple rows per user
-- improves matching accuracy across lighting conditions.
-- ------------------------------------------------------------
create table if not exists face_enrollments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  descriptor  double precision[] not null,   -- 128-dimension face vector
  quality     double precision,              -- sharpness score at capture
  pose_label  text,                          -- 'center' | 'left' | 'right' | 'up'
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_face_user on face_enrollments(user_id) where is_active;

-- ------------------------------------------------------------
-- ATTENDANCE
-- ------------------------------------------------------------
create table if not exists attendance (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references profiles(id) on delete cascade,
  work_date              date not null,

  sign_in_at             timestamptz,
  sign_in_lat            double precision,
  sign_in_lng            double precision,
  sign_in_accuracy       double precision,
  sign_in_distance_m     double precision,
  sign_in_liveness       double precision,
  sign_in_match_distance double precision,

  sign_out_at            timestamptz,
  sign_out_lat           double precision,
  sign_out_lng           double precision,
  sign_out_distance_m    double precision,

  status                 text not null default 'present'
                         check (status in ('present','late','absent','excused')),
  late_reason            text,
  early_departure        boolean not null default false,
  early_reason           text,
  hours_worked           double precision,

  device_fingerprint     text,
  marked_by              uuid references profiles(id),   -- set when an admin signs on behalf
  admin_note             text,
  created_at             timestamptz not null default now(),

  unique (user_id, work_date)
);
create index if not exists idx_att_date on attendance(work_date desc);
create index if not exists idx_att_user_date on attendance(user_id, work_date desc);

-- ------------------------------------------------------------
-- SECURITY FLAGS
-- Every rejected or suspicious attempt lands here with evidence.
-- ------------------------------------------------------------
create table if not exists security_flags (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles(id) on delete set null, -- claimed identity
  matched_user_id    uuid references profiles(id) on delete set null, -- who the face actually matched
  flag_type          text not null,
  -- device_in_frame | screen_replay | flat_surface | multiple_faces
  -- outside_geofence | face_mismatch | liveness_failed | shared_device
  -- location_unavailable | low_gps_accuracy | no_face_detected
  severity           text not null default 'high' check (severity in ('low','medium','high','critical')),
  evidence_path      text,          -- Storage path of the captured frame
  detail             jsonb,         -- raw scores, detected labels, coords
  device_fingerprint text,
  lat                double precision,
  lng                double precision,
  user_agent         text,
  resolved           boolean not null default false,
  resolved_by        uuid references profiles(id),
  resolution_note    text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_flag_created on security_flags(created_at desc);
create index if not exists idx_flag_unresolved on security_flags(resolved, created_at desc);

-- ------------------------------------------------------------
-- SETTINGS  (single row, id = 1)
-- ------------------------------------------------------------
create table if not exists settings (
  id                  int primary key default 1 check (id = 1),
  site_lat            double precision not null default 9.0765,
  site_lng            double precision not null default 7.3986,
  geofence_radius_m   integer not null default 150,
  max_gps_accuracy_m  integer not null default 100,
  work_start          time not null default '08:00',
  grace_minutes       integer not null default 15,
  work_end            time not null default '16:00',
  min_hours           double precision not null default 7,
  face_match_threshold double precision not null default 0.48,
  liveness_threshold  double precision not null default 0.75,
  updated_at          timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- AUDIT LOG
-- ------------------------------------------------------------
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references profiles(id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_log(created_at desc);

-- ============================================================
-- HELPER: is the current user an admin?
-- ============================================================
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, staff_id, phone, department_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed Staff'),
    new.email,
    nullif(new.raw_user_meta_data->>'staff_id',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    (new.raw_user_meta_data->>'department_id')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles         enable row level security;
alter table face_enrollments enable row level security;
alter table attendance       enable row level security;
alter table security_flags   enable row level security;
alter table settings         enable row level security;
alter table departments      enable row level security;
alter table audit_log        enable row level security;

-- PROFILES ---------------------------------------------------
drop policy if exists p_read_own on profiles;
create policy p_read_own on profiles
  for select using (id = auth.uid() or is_admin());

drop policy if exists p_update_own on profiles;
create policy p_update_own on profiles
  for update using (id = auth.uid() or is_admin());

drop policy if exists p_admin_insert on profiles;
create policy p_admin_insert on profiles
  for insert with check (is_admin() or id = auth.uid());

drop policy if exists p_admin_delete on profiles;
create policy p_admin_delete on profiles
  for delete using (is_admin());

-- FACE ENROLLMENTS -------------------------------------------
-- Staff may enrol their own face and read their own vectors.
-- Attendance matching happens against the caller's own record only,
-- so no user can download the biometric data of another user.
drop policy if exists f_own on face_enrollments;
create policy f_own on face_enrollments
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- ATTENDANCE -------------------------------------------------
drop policy if exists a_read on attendance;
create policy a_read on attendance
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists a_insert on attendance;
create policy a_insert on attendance
  for insert with check (user_id = auth.uid() or is_admin());

drop policy if exists a_update on attendance;
create policy a_update on attendance
  for update using (user_id = auth.uid() or is_admin());

drop policy if exists a_delete on attendance;
create policy a_delete on attendance
  for delete using (is_admin());

-- SECURITY FLAGS ---------------------------------------------
-- Anyone signed in can write a flag against themselves (the client
-- records its own rejection). Only admins can read the full register.
drop policy if exists s_insert on security_flags;
create policy s_insert on security_flags
  for insert with check (auth.uid() is not null);

drop policy if exists s_read on security_flags;
create policy s_read on security_flags
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists s_update on security_flags;
create policy s_update on security_flags
  for update using (is_admin());

-- SETTINGS ---------------------------------------------------
drop policy if exists st_read on settings;
create policy st_read on settings for select using (auth.uid() is not null);

drop policy if exists st_write on settings;
create policy st_write on settings for update using (is_admin());

-- DEPARTMENTS ------------------------------------------------
drop policy if exists d_read on departments;
create policy d_read on departments for select using (true);

drop policy if exists d_write on departments;
create policy d_write on departments for all using (is_admin()) with check (is_admin());

-- AUDIT LOG --------------------------------------------------
drop policy if exists al_insert on audit_log;
create policy al_insert on audit_log for insert with check (auth.uid() is not null);

drop policy if exists al_read on audit_log;
create policy al_read on audit_log for select using (is_admin());

-- ============================================================
-- STORAGE BUCKET FOR EVIDENCE PHOTOS  (private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

drop policy if exists ev_upload on storage.objects;
create policy ev_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    -- Evidence is written to a folder named for the uploader, so nobody can
    -- write frames into another person's incident history.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists ev_read on storage.objects;
create policy ev_read on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and is_admin());


-- ============================================================
-- SHARED HANDSET CHECK
--
-- A member of staff cannot read anyone else's attendance, which is correct,
-- but it means they cannot discover that their handset already signed in a
-- colleague today. This function answers that one narrow question on the
-- server, returning a count and nothing identifying, so the check works
-- without opening up other people's records.
-- ============================================================
create or replace function shared_device_count(fp text)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)::integer
  from attendance
  where work_date = current_date
    and device_fingerprint = fp
    and user_id <> auth.uid()
    and auth.uid() is not null;
$$;

revoke all on function shared_device_count(text) from public;
grant execute on function shared_device_count(text) to authenticated;

-- ============================================================
-- REPORTING VIEW
-- ============================================================
-- IMPORTANT: security_invoker makes the view run with the permissions of
-- whoever queries it, so the row level security on the underlying tables
-- still applies. Without it a view runs as its owner and hands every row
-- to any signed-in user, which would expose the whole Board's attendance
-- to every member of staff.
create or replace view attendance_report
with (security_invoker = true) as
select
  a.id,
  a.work_date,
  a.sign_in_at,
  a.sign_out_at,
  a.status,
  a.hours_worked,
  a.early_departure,
  a.late_reason,
  a.early_reason,
  a.marked_by is not null as marked_by_admin,
  p.id   as user_id,
  p.full_name,
  p.staff_id,
  p.grade_level,
  d.name as department,
  d.code as department_code
from attendance a
join profiles p on p.id = a.user_id
left join departments d on d.id = p.department_id;

-- ============================================================
-- PROMOTE YOURSELF TO ADMIN
-- After you sign up through the app, run this once with your email:
--
--   update profiles set role = 'admin' where email = 'you@nbti.gov.ng';
-- ============================================================
