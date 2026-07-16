-- The Auth identities are created through GoTrue before this migration. This
-- migration assigns trusted roles and links the student portal identity to the
-- existing SIS record; no credentials are stored in SQL.

do $$
declare
  faculty_profile uuid;
  student_profile uuid;
begin
  select id into faculty_profile from auth.users where lower(email) = 'winsonbaring10+faculty@gmail.com';
  select id into student_profile from auth.users where lower(email) = 'winsonbaring10+student@gmail.com';
  if faculty_profile is null or student_profile is null then
    raise exception 'Faculty and student validation Auth identities must exist before role linkage';
  end if;

  update auth.users
  set raw_app_meta_data = (coalesce(raw_app_meta_data, '{}'::jsonb) - 'platform_owner') || jsonb_build_object('role', 'faculty'),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = faculty_profile;

  update auth.users
  set raw_app_meta_data = (coalesce(raw_app_meta_data, '{}'::jsonb) - 'platform_owner') || jsonb_build_object('role', 'student'),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = student_profile;

  update public.profiles
  set full_name = 'Demo Faculty', role = 'faculty', job_title = 'Information Management Faculty', department = 'Information Management', updated_at = now()
  where id = faculty_profile;

  update public.profiles
  set full_name = 'Demo Student A', role = 'student', job_title = null, department = 'Information Management', updated_at = now()
  where id = student_profile;

  update public.students
  set profile_id = student_profile, email = 'winsonbaring10+student@gmail.com', updated_at = now()
  where id = '10000000-0000-4000-8000-000000000001';

  update public.section_enrollments
  set student_profile_id = student_profile
  where student_id = '10000000-0000-4000-8000-000000000001';

  update public.course_sections
  set faculty_id = faculty_profile, updated_at = now()
  where id in ('54000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000002');

  insert into public.notifications (recipient_id, title, body, kind, action_url) values
    (faculty_profile, 'Teaching workspace activated', 'Your IM101 and IM203 validation sections are ready for content, assessment, schedule, gradebook, and AI grade-scan review.', 'academic', '/crm'),
    (student_profile, 'Student workspace activated', 'Your courses, topics, quiz, published grade, schedule, and Nexus AI learning assistant are ready.', 'academic', '/crm');
end;
$$;
