-- Suspicious attempts are written only by signed-in users and reviewed only
-- through RLS. Remove the broad default Data API grants that are unnecessary
-- for this incident register.
revoke all on table public.security_flags from anon;
revoke all on table public.security_flags from authenticated;
grant select, insert, update on table public.security_flags to authenticated;

-- SECURITY DEFINER helpers must not be directly callable before sign-in.
revoke execute on function public.decide_early_departure(uuid, text, text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.shared_device_count(text) from public, anon;
revoke execute on function public.guard_role_escalation() from public, anon;

grant execute on function public.decide_early_departure(uuid, text, text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.shared_device_count(text) to authenticated, service_role;
grant execute on function public.guard_role_escalation() to authenticated, service_role;
