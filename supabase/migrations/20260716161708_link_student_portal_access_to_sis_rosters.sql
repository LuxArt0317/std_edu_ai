create or replace function private.can_access_section(target_section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    (select private.can_manage_section(target_section))
    or exists (
      select 1
      from public.section_enrollments se
      left join public.students s on s.id = se.student_id
      where se.section_id = target_section
        and se.status in ('enrolled', 'completed')
        and (
          se.student_profile_id = (select auth.uid())
          or s.profile_id = (select auth.uid())
        )
    )
    or (select private.has_role(array['advisor', 'support', 'librarian']))
  );
$$;

revoke all on function private.can_access_section(uuid) from public, anon;
grant execute on function private.can_access_section(uuid) to authenticated;
