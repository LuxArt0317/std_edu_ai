create table if not exists public.account_access_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  acted_by uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('sessions_revoked', 'credentials_rotated', 'bulk_provisioned')),
  reason text not null check (char_length(reason) between 12 and 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_access_audit_target_created_idx
  on public.account_access_audit (target_profile_id, created_at desc);

alter table public.account_access_audit enable row level security;

create policy account_access_audit_read_owner
  on public.account_access_audit for select to authenticated
  using ((select private.current_role()) = 'owner');

revoke all on public.account_access_audit from public, anon, authenticated;
grant select on public.account_access_audit to authenticated;

create or replace function public.revoke_platform_sessions(
  p_target_profile_id uuid,
  p_acted_by uuid,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if char_length(trim(p_reason)) not between 12 and 500 then
    raise exception 'A reason between 12 and 500 characters is required.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_acted_by and role = 'owner' and is_platform_owner
  ) then
    raise exception 'Only the protected owner can revoke sessions.';
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_target_profile_id and is_platform_owner
  ) then
    raise exception 'The protected owner sessions cannot be revoked here.';
  end if;

  delete from auth.sessions where user_id = p_target_profile_id;
  get diagnostics v_deleted = row_count;

  insert into public.account_access_audit (
    target_profile_id, acted_by, action, reason, details
  ) values (
    p_target_profile_id,
    p_acted_by,
    'sessions_revoked',
    trim(p_reason),
    jsonb_build_object('session_count', v_deleted)
  );
  return v_deleted;
end;
$$;

revoke all on function public.revoke_platform_sessions(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_platform_sessions(uuid, uuid, text)
  to service_role;

comment on table public.account_access_audit is
  'Immutable protected-owner audit for session, credential, and bulk account operations.';
