create index learning_modules_created_by_idx on public.learning_modules(created_by);
create index learning_materials_created_by_idx on public.learning_materials(created_by);
create index assignment_submissions_graded_by_idx on public.assignment_submissions(graded_by);
create index attendance_sessions_created_by_idx on public.attendance_sessions(created_by);
create index attendance_records_marked_by_idx on public.attendance_records(marked_by);

drop policy submissions_update_student on public.assignment_submissions;
drop policy submissions_update_teacher on public.assignment_submissions;
create policy submissions_update on public.assignment_submissions for update to authenticated
using (
  (student_profile_id = (select auth.uid()) and status in ('draft','returned','submitted'))
  or exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id)))
)
with check (
  (student_profile_id = (select auth.uid()) and status in ('draft','submitted'))
  or exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id)))
);
