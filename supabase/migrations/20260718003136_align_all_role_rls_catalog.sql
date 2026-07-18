drop policy if exists students_insert_staff on public.students;
drop policy if exists students_update_staff on public.students;
create policy students_insert_registrar on public.students for insert to authenticated with check ((select private.has_role(array['admin','registrar'])));
create policy students_update_registrar on public.students for update to authenticated using ((select private.has_role(array['admin','registrar']))) with check ((select private.has_role(array['admin','registrar'])));

drop policy if exists cases_read_authorized on public.cases;
drop policy if exists cases_insert_authorized on public.cases;
drop policy if exists cases_update_staff on public.cases;
drop policy if exists cases_delete_staff on public.cases;
create policy cases_read_authorized on public.cases for select to authenticated using (
 (select private.has_role(array['admin','president','vice_president','dean','registrar','department_head','advisor','finance','support']))
 or (owner_id=(select auth.uid()))
 or ((select private.current_role())='faculty' and exists(select 1 from public.students s join public.section_enrollments se on se.student_id=s.id join public.course_sections cs on cs.id=se.section_id where s.id=cases.student_id and cs.faculty_id=(select auth.uid())))
 or exists(select 1 from public.students s where s.id=cases.student_id and s.profile_id=(select auth.uid()))
);
create policy cases_insert_authorized on public.cases for insert to authenticated with check (
 (select private.has_role(array['admin','department_head','faculty','advisor','finance','support']))
 or (owner_id is null and status='open' and priority=any(array['low','medium','high']) and exists(select 1 from public.students s where s.id=student_id and s.profile_id=(select auth.uid())))
);
create policy cases_update_staff on public.cases for update to authenticated using ((select private.has_role(array['admin','vice_president','department_head','advisor','finance','support'])) or owner_id=(select auth.uid())) with check ((select private.has_role(array['admin','vice_president','department_head','advisor','finance','support'])) or owner_id=(select auth.uid()));

drop policy if exists campaigns_manage_enrollment_staff on public.campaigns;
create policy campaigns_read_authorized on public.campaigns for select to authenticated using ((select private.has_role(array['admin','president','vice_president','dean','admissions','advisor','support'])));
create policy campaigns_insert_staff on public.campaigns for insert to authenticated with check ((select private.has_role(array['admin','admissions','advisor','support'])) and created_by=(select auth.uid()));
create policy campaigns_update_staff on public.campaigns for update to authenticated using ((select private.has_role(array['admin','admissions','advisor','support']))) with check ((select private.has_role(array['admin','admissions','advisor','support'])));

drop policy if exists knowledge_read_verified_or_staff on public.knowledge_articles;
drop policy if exists knowledge_insert_staff on public.knowledge_articles;
drop policy if exists knowledge_update_staff on public.knowledge_articles;
drop policy if exists knowledge_delete_staff on public.knowledge_articles;
create policy knowledge_read_verified_or_staff on public.knowledge_articles for select to authenticated using (status='verified' or (select private.has_role(array['admin','advisor','admissions','support','faculty','librarian'])));
create policy knowledge_insert_staff on public.knowledge_articles for insert to authenticated with check ((select private.has_role(array['admin','advisor','admissions','support','librarian'])) and owner_id=(select auth.uid()));
create policy knowledge_update_staff on public.knowledge_articles for update to authenticated using ((select private.has_role(array['admin','advisor','admissions','support','librarian']))) with check ((select private.has_role(array['admin','advisor','admissions','support','librarian'])));

drop policy if exists interactions_insert_staff on public.interactions;
drop policy if exists interactions_read_authorized on public.interactions;
drop policy if exists interactions_update_staff on public.interactions;
create policy interactions_insert_staff on public.interactions for insert to authenticated with check ((select private.has_role(array['admin','advisor','admissions','finance','support','faculty'])) and actor_id=(select auth.uid()));
create policy interactions_read_authorized on public.interactions for select to authenticated using ((select private.has_role(array['admin','advisor','admissions','finance','support','faculty'])) or exists(select 1 from public.students s where s.id=student_id and s.profile_id=(select auth.uid())));
create policy interactions_update_staff on public.interactions for update to authenticated using (actor_id=(select auth.uid()) or (select private.has_role(array['admin','support']))) with check (actor_id=(select auth.uid()) or (select private.has_role(array['admin','support'])));

drop policy if exists signals_insert_staff on public.student_signals;
drop policy if exists signals_read_authorized on public.student_signals;
drop policy if exists signals_update_staff on public.student_signals;
create policy signals_insert_staff on public.student_signals for insert to authenticated with check ((select private.has_role(array['admin','advisor','finance','support','faculty'])));
create policy signals_read_authorized on public.student_signals for select to authenticated using ((select private.has_role(array['admin','department_head','advisor','finance','support','faculty'])) or exists(select 1 from public.students s where s.id=student_id and s.profile_id=(select auth.uid())));
create policy signals_update_staff on public.student_signals for update to authenticated using ((select private.has_role(array['admin','advisor','finance','support','faculty']))) with check ((select private.has_role(array['admin','advisor','finance','support','faculty'])));

drop policy if exists announcements_insert_authorized on public.announcements;
drop policy if exists announcements_update_authorized on public.announcements;
drop policy if exists announcements_delete_authorized on public.announcements;
create policy announcements_insert_authorized on public.announcements for insert to authenticated with check (author_id=(select auth.uid()) and (((section_id is not null) and (select private.can_manage_section(section_id))) or ((section_id is null) and (select private.has_role(array['admin','president','vice_president','dean','registrar','department_head','finance','support','librarian'])))));
create policy announcements_update_authorized on public.announcements for update to authenticated using (author_id=(select auth.uid()) or ((section_id is not null) and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin']))) with check (author_id=(select auth.uid()) or ((section_id is not null) and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin'])));
