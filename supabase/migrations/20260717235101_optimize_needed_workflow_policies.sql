create index if not exists profile_section_assignments_assigned_by_idx on public.profile_section_assignments(assigned_by);
create index if not exists attendance_correction_requests_decided_by_idx on public.attendance_correction_requests(decided_by);

drop policy if exists profile_section_assignments_manage on public.profile_section_assignments;
create policy profile_section_assignments_insert on public.profile_section_assignments for insert to authenticated
with check ((select private.has_role(array['admin','registrar','dean','department_head'])) and assigned_by = (select auth.uid()));
create policy profile_section_assignments_update on public.profile_section_assignments for update to authenticated
using ((select private.has_role(array['admin','registrar','dean','department_head'])))
with check ((select private.has_role(array['admin','registrar','dean','department_head'])) and assigned_by = (select auth.uid()));
create policy profile_section_assignments_delete on public.profile_section_assignments for delete to authenticated
using ((select private.has_role(array['admin','registrar','dean','department_head'])));
