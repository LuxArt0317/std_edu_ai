-- A registrar may create an institutional student record before the learner has
-- a portal identity. Roster and grade rows therefore support either the stable
-- SIS student record, the linked Auth profile, or both.

alter table public.section_enrollments
  alter column student_profile_id drop not null,
  add column student_id uuid references public.students(id) on delete cascade,
  add constraint section_enrollment_has_student_identity check (student_profile_id is not null or student_id is not null);

alter table public.section_enrollments drop constraint if exists section_enrollments_section_id_student_profile_id_key;
drop index if exists section_enrollments_student_idx;
create index section_enrollments_profile_idx on public.section_enrollments (student_profile_id, status) where student_profile_id is not null;
create index section_enrollments_student_idx on public.section_enrollments (student_id, status) where student_id is not null;
create unique index section_enrollments_unique_profile_idx on public.section_enrollments (section_id, student_profile_id) where student_profile_id is not null;
create unique index section_enrollments_unique_student_idx on public.section_enrollments (section_id, student_id) where student_id is not null;

alter table public.grades
  alter column student_profile_id drop not null,
  add column student_id uuid references public.students(id) on delete cascade,
  add constraint grade_has_student_identity check (student_profile_id is not null or student_id is not null);

alter table public.grades drop constraint if exists grades_grade_item_id_student_profile_id_key;
drop index if exists grades_student_status_idx;
create index grades_profile_status_idx on public.grades (student_profile_id, status, updated_at desc) where student_profile_id is not null;
create index grades_student_status_idx on public.grades (student_id, status, updated_at desc) where student_id is not null;
create unique index grades_unique_profile_idx on public.grades (grade_item_id, student_profile_id) where student_profile_id is not null;
create unique index grades_unique_student_idx on public.grades (grade_item_id, student_id) where student_id is not null;

drop policy if exists enrollments_read_authorized on public.section_enrollments;
create policy enrollments_read_authorized on public.section_enrollments for select to authenticated
using (
  student_profile_id = (select auth.uid())
  or exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
  or (select private.can_manage_section(section_id))
  or (select private.has_role(array['advisor', 'support']))
);

drop policy if exists grades_read_authorized on public.grades;
create policy grades_read_authorized on public.grades for select to authenticated
using (
  (
    status = 'published'
    and (
      student_profile_id = (select auth.uid())
      or exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    )
  )
  or exists (
    select 1 from public.grade_items gi
    where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))
  )
);

insert into public.section_enrollments (id, section_id, student_id, status) values
  ('5c000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'enrolled'),
  ('5c000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'enrolled'),
  ('5c000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'enrolled'),
  ('5c000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'enrolled'),
  ('5c000000-0000-4000-8000-000000000005', '54000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'enrolled')
on conflict (id) do nothing;

insert into public.grades (id, grade_item_id, student_id, score, letter_grade, feedback, status, graded_by, published_at)
select seed.id, seed.grade_item_id, seed.student_id, seed.score, seed.letter_grade, seed.feedback, seed.status, p.id,
  case when seed.status = 'published' then now() else null end
from public.profiles p
cross join (values
  ('5d000000-0000-4000-8000-000000000001'::uuid, '59000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 5.0::numeric, 'A+', 'Excellent grasp of systems and security foundations.', 'published'),
  ('5d000000-0000-4000-8000-000000000002'::uuid, '59000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, 3.0::numeric, 'C', 'Review authentication and least-privilege concepts before the next attempt.', 'reviewed'),
  ('5d000000-0000-4000-8000-000000000003'::uuid, '59000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, 4.0::numeric, 'B+', 'Strong result; revisit the incident-reporting workflow.', 'published')
) as seed(id, grade_item_id, student_id, score, letter_grade, feedback, status)
where p.is_platform_owner
on conflict (id) do nothing;

comment on column public.section_enrollments.student_id is 'Stable SIS record for learners who may not yet have a portal login.';
comment on column public.grades.student_id is 'Stable SIS student record; student RLS resolves through students.profile_id after account provisioning.';
