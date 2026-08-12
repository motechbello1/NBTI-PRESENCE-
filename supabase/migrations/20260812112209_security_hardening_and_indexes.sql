-- Trigger functions are not public RPC endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Cover foreign keys used by deletion checks, scoped joins and audit lookups.
create index if not exists idx_profiles_department on public.profiles(department_id);
create index if not exists idx_attendance_marked_by on public.attendance(marked_by);
create index if not exists idx_audit_actor on public.audit_log(actor_id);
create index if not exists idx_security_flags_user on public.security_flags(user_id);
create index if not exists idx_security_flags_matched_user on public.security_flags(matched_user_id);
create index if not exists idx_security_flags_resolved_by on public.security_flags(resolved_by);
create index if not exists idx_report_authorities_requested_by on public.report_authorities(requested_by);
create index if not exists idx_report_authorities_decided_by on public.report_authorities(decided_by);
create index if not exists idx_notifications_created_by on public.notifications(created_by);
create index if not exists idx_absence_requests_decided_by on public.absence_requests(decided_by);
