create table public.role_change_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  previous_role text not null,
  new_role text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index role_change_audit_target_created_idx on public.role_change_audit (target_profile_id, created_at desc);
create index role_change_audit_actor_created_idx on public.role_change_audit (changed_by, created_at desc);
alter table public.role_change_audit enable row level security;
create policy role_change_audit_read_admin on public.role_change_audit for select to authenticated
using ((select private.has_role(array['admin'])));
grant select on public.role_change_audit to authenticated;

create or replace function public.assign_platform_role(p_profile_id uuid, p_new_role text, p_reason text)
returns table (profile_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := (select private.current_role());
  old_role text;
  target_is_owner boolean;
begin
  if actor_id is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an administrator can assign school roles' using errcode = '42501';
  end if;
  if p_new_role not in (
    'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head',
    'faculty', 'advisor', 'admissions', 'finance', 'support', 'librarian', 'student'
  ) then
    raise exception 'The requested role is invalid or protected' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A meaningful role-change reason is required' using errcode = '22023';
  end if;

  select p.role, p.is_platform_owner into old_role, target_is_owner
  from public.profiles p where p.id = p_profile_id for update;
  if old_role is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if target_is_owner then
    raise exception 'The protected platform owner role cannot be changed' using errcode = '42501';
  end if;

  update auth.users
  set raw_app_meta_data = (coalesce(raw_app_meta_data, '{}'::jsonb) - 'platform_owner') || jsonb_build_object('role', p_new_role)
  where id = p_profile_id;

  update public.profiles
  set role = p_new_role, updated_at = now()
  where id = p_profile_id;

  insert into public.role_change_audit (target_profile_id, changed_by, previous_role, new_role, reason)
  values (p_profile_id, actor_id, old_role, p_new_role, trim(p_reason));

  return query select p_profile_id, p_new_role;
end;
$$;

revoke all on function public.assign_platform_role(uuid, text, text) from public, anon;
grant execute on function public.assign_platform_role(uuid, text, text) to authenticated;

create policy attempts_update_teacher on public.assessment_attempts for update to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy attempts_delete_teacher on public.assessment_attempts for delete to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));

grant update, delete on public.assessment_attempts to authenticated;

comment on function public.assign_platform_role(uuid, text, text) is 'Audited role assignment. The protected owner cannot be changed and roles are synchronized to trusted Auth app metadata.';
comment on table public.role_change_audit is 'Immutable audit trail for privileged school-role changes.';
