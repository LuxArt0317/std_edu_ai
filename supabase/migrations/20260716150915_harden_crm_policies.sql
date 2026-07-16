create index bootstrap_settings_claimed_by_idx
on private.bootstrap_settings (claimed_by)
where claimed_by is not null;

create policy bootstrap_settings_deny_direct_access
on private.bootstrap_settings
for all
to authenticated
using (false)
with check (false);

drop policy profiles_update_self on public.profiles;
drop policy profiles_update_admin on public.profiles;
create policy profiles_update_authorized
on public.profiles
for update
to authenticated
using (
  (select private.has_role(array['admin']))
  or (select auth.uid()) = id
)
with check (
  (select private.has_role(array['admin']))
  or ((select auth.uid()) = id and role = (select private.current_role()))
);

drop policy students_manage_staff on public.students;
create policy students_insert_staff
on public.students for insert to authenticated
with check ((select private.has_role(array['admin', 'advisor', 'support'])));
create policy students_update_staff
on public.students for update to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'support'])));

drop policy signals_manage_staff on public.student_signals;
create policy signals_insert_staff
on public.student_signals for insert to authenticated
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));
create policy signals_update_staff
on public.student_signals for update to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])))
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));

drop policy interactions_manage_staff on public.interactions;
create policy interactions_insert_staff
on public.interactions for insert to authenticated
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));
create policy interactions_update_staff
on public.interactions for update to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])))
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));

drop policy cases_manage_staff on public.cases;
create policy cases_insert_staff
on public.cases for insert to authenticated
with check ((select private.has_role(array['admin', 'advisor', 'support'])));
create policy cases_update_staff
on public.cases for update to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'support'])));

drop policy knowledge_manage_staff on public.knowledge_articles;
create policy knowledge_insert_staff
on public.knowledge_articles for insert to authenticated
with check ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])));
create policy knowledge_update_staff
on public.knowledge_articles for update to authenticated
using ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])));
