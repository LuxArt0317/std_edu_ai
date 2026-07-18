drop policy if exists leads_manage_enrollment_staff on public.admission_leads;
create policy leads_read_enrollment_staff on public.admission_leads for select to authenticated using ((select private.has_role(array['admin','admissions','registrar'])));
create policy leads_insert_enrollment_staff on public.admission_leads for insert to authenticated with check ((select private.has_role(array['admin','admissions'])));
create policy leads_update_enrollment_staff on public.admission_leads for update to authenticated using ((select private.has_role(array['admin','admissions']))) with check ((select private.has_role(array['admin','admissions'])));

drop policy if exists tasks_manage_assignee_or_admin on public.crm_tasks;
create policy tasks_read_assignee_or_admin on public.crm_tasks for select to authenticated using (assigned_to=(select auth.uid()) or (select private.has_role(array['admin'])));
create policy tasks_insert_assignee_or_admin on public.crm_tasks for insert to authenticated with check (assigned_to=(select auth.uid()) or (select private.has_role(array['admin'])));
create policy tasks_update_assignee_or_admin on public.crm_tasks for update to authenticated using (assigned_to=(select auth.uid()) or (select private.has_role(array['admin']))) with check (assigned_to=(select auth.uid()) or (select private.has_role(array['admin'])));

drop policy if exists signals_delete_admin on public.student_signals;
drop policy if exists interactions_delete_admin on public.interactions;
revoke delete on public.cases,public.admission_leads,public.crm_tasks,public.campaigns,public.student_signals,public.interactions,public.knowledge_articles from authenticated;
