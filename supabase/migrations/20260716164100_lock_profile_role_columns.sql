-- Role and ownership fields may change only through trusted governance flows.
-- Authenticated users retain profile-edit access only to non-authorization data.

revoke insert, update on public.profiles from authenticated;
grant update (full_name, department, employee_number, job_title) on public.profiles to authenticated;

comment on column public.profiles.role is
'Authorization mirror managed only by trusted Auth provisioning and assign_platform_role; direct authenticated updates are not granted.';
comment on column public.profiles.is_platform_owner is
'Protected single-owner marker; direct authenticated updates are not granted.';
