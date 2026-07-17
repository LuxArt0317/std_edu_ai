create index if not exists account_access_audit_actor_idx
  on public.account_access_audit (acted_by);
create index if not exists account_lifecycle_audit_actor_idx
  on public.account_lifecycle_audit (changed_by);
create index if not exists profiles_status_changed_by_idx
  on public.profiles (status_changed_by)
  where status_changed_by is not null;

drop policy if exists cases_insert_staff on public.cases;
drop policy if exists cases_insert_student_self_service on public.cases;
create policy cases_insert_authorized
on public.cases for insert to authenticated
with check (
  (select private.has_role(array['admin', 'advisor', 'support']))
  or (
    owner_id is null
    and status = 'open'
    and priority in ('low', 'medium', 'high')
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.profile_id = (select auth.uid())
    )
  )
);
