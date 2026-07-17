create or replace function private.validate_assignment_submission()
returns trigger language plpgsql set search_path = '' as $$
declare assessment_row record;
begin
  select a.assessment_type, a.max_score, a.status, a.due_at, a.section_id into assessment_row
  from public.assessments a where a.id = new.assessment_id;
  if assessment_row.assessment_type not in ('assignment', 'project') then
    raise exception 'Submissions are available only for assignments and projects' using errcode = '23514';
  end if;
  if new.score is not null and new.score > assessment_row.max_score then
    raise exception 'Score cannot exceed the assessment maximum (%)', assessment_row.max_score using errcode = '23514';
  end if;
  if not exists (select 1 from public.section_enrollments se where se.section_id = assessment_row.section_id and se.student_profile_id = new.student_profile_id and se.status in ('enrolled','completed')) then
    raise exception 'The learner is not enrolled in this section' using errcode = '23514';
  end if;
  if new.status = 'submitted' and assessment_row.status <> 'published' then
    raise exception 'This assignment is not accepting submissions' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function private.validate_assignment_submission() from public, anon, authenticated;
create trigger assignment_submissions_validate before insert or update on public.assignment_submissions for each row execute function private.validate_assignment_submission();

create or replace function private.validate_attendance_record()
returns trigger language plpgsql set search_path = '' as $$
declare target_section uuid;
begin
  select section_id into target_section from public.attendance_sessions where id = new.session_id;
  if not exists (select 1 from public.section_enrollments se where se.section_id = target_section and se.student_profile_id = new.student_profile_id and se.status in ('enrolled','completed')) then
    raise exception 'Attendance can be recorded only for an enrolled learner' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function private.validate_attendance_record() from public, anon, authenticated;
create trigger attendance_records_validate before insert or update on public.attendance_records for each row execute function private.validate_attendance_record();

create or replace function private.validate_learning_progress()
returns trigger language plpgsql set search_path = '' as $$
declare target_section uuid;
begin
  select m.section_id into target_section from public.learning_materials lm join public.learning_modules m on m.id = lm.module_id where lm.id = new.material_id;
  if not exists (select 1 from public.section_enrollments se where se.section_id = target_section and se.student_profile_id = new.student_profile_id and se.status in ('enrolled','completed')) then
    raise exception 'Learning progress requires an active enrollment' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function private.validate_learning_progress() from public, anon, authenticated;
create trigger learning_progress_validate before insert or update on public.learning_progress for each row execute function private.validate_learning_progress();

drop policy submissions_update_student on public.assignment_submissions;
create policy submissions_update_student on public.assignment_submissions for update to authenticated
using (student_profile_id = (select auth.uid()) and status in ('draft','returned','submitted'))
with check (student_profile_id = (select auth.uid()) and status in ('draft','submitted'));
