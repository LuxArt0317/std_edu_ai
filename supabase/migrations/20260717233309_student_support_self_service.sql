create policy cases_insert_student_self_service
on public.cases for insert to authenticated
with check (
  owner_id is null
  and status = 'open'
  and priority in ('low', 'medium', 'high')
  and exists (
    select 1 from public.students s
    where s.id = student_id and s.profile_id = (select auth.uid())
  )
);

comment on policy cases_insert_student_self_service on public.cases is
  'Students may open a support request only for their own linked SIS identity; staff retain all triage and resolution authority.';
