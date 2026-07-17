-- Integrated LMS: modules, materials, submissions, attendance, progress, and private files.

create table public.learning_modules (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  position integer not null check (position > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  unlocks_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, position)
);

create table public.learning_materials (
  id uuid primary key default extensions.gen_random_uuid(),
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  material_type text not null check (material_type in ('lesson', 'file', 'link', 'video', 'activity')),
  content_markdown text not null default '' check (char_length(content_markdown) <= 100000),
  external_url text check (external_url is null or external_url ~ '^https://'),
  storage_path text,
  position integer not null check (position > 0),
  estimated_minutes integer not null default 15 check (estimated_minutes between 1 and 1440),
  is_required boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position),
  constraint material_payload_present check (
    material_type = 'activity' or content_markdown <> '' or external_url is not null or storage_path is not null
  )
);

create table public.learning_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  material_id uuid not null references public.learning_materials(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_viewed_at timestamptz not null default now(),
  unique (material_id, student_profile_id)
);

create table public.assignment_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  submission_text text not null default '' check (char_length(submission_text) <= 100000),
  storage_path text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'graded')),
  submitted_at timestamptz,
  score numeric(8,2) check (score is null or score >= 0),
  feedback text not null default '' check (char_length(feedback) <= 10000),
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_profile_id),
  constraint submission_payload_present check (status = 'draft' or submission_text <> '' or storage_path is not null)
);

create table public.attendance_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.attendance_records (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  notes text not null default '' check (char_length(notes) <= 2000),
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (session_id, student_profile_id)
);

create index learning_modules_section_status_idx on public.learning_modules(section_id, status, position);
create index learning_materials_module_status_idx on public.learning_materials(module_id, status, position);
create index learning_progress_student_idx on public.learning_progress(student_profile_id, status);
create index assignment_submissions_assessment_status_idx on public.assignment_submissions(assessment_id, status);
create index assignment_submissions_student_idx on public.assignment_submissions(student_profile_id, status);
create index attendance_sessions_section_start_idx on public.attendance_sessions(section_id, starts_at desc);
create index attendance_records_student_idx on public.attendance_records(student_profile_id, status);

alter table public.learning_modules enable row level security;
alter table public.learning_materials enable row level security;
alter table public.learning_progress enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

create policy modules_read on public.learning_modules for select to authenticated
using ((status = 'published' and (unlocks_at is null or unlocks_at <= now()) and (select private.can_access_section(section_id))) or (select private.can_manage_section(section_id)));
create policy modules_insert on public.learning_modules for insert to authenticated with check ((select private.can_manage_section(section_id)));
create policy modules_update on public.learning_modules for update to authenticated using ((select private.can_manage_section(section_id))) with check ((select private.can_manage_section(section_id)));
create policy modules_delete on public.learning_modules for delete to authenticated using ((select private.can_manage_section(section_id)));

create policy materials_read on public.learning_materials for select to authenticated
using (exists (select 1 from public.learning_modules m where m.id = module_id and (((status = 'published' and m.status = 'published') and (select private.can_access_section(m.section_id))) or (select private.can_manage_section(m.section_id)))));
create policy materials_insert on public.learning_materials for insert to authenticated
with check (exists (select 1 from public.learning_modules m where m.id = module_id and (select private.can_manage_section(m.section_id))));
create policy materials_update on public.learning_materials for update to authenticated
using (exists (select 1 from public.learning_modules m where m.id = module_id and (select private.can_manage_section(m.section_id))))
with check (exists (select 1 from public.learning_modules m where m.id = module_id and (select private.can_manage_section(m.section_id))));
create policy materials_delete on public.learning_materials for delete to authenticated
using (exists (select 1 from public.learning_modules m where m.id = module_id and (select private.can_manage_section(m.section_id))));

create policy progress_read on public.learning_progress for select to authenticated
using (student_profile_id = (select auth.uid()) or exists (select 1 from public.learning_materials lm join public.learning_modules m on m.id = lm.module_id where lm.id = material_id and (select private.can_manage_section(m.section_id))));
create policy progress_insert on public.learning_progress for insert to authenticated with check (student_profile_id = (select auth.uid()));
create policy progress_update on public.learning_progress for update to authenticated using (student_profile_id = (select auth.uid())) with check (student_profile_id = (select auth.uid()));

create policy submissions_read on public.assignment_submissions for select to authenticated
using (student_profile_id = (select auth.uid()) or exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy submissions_insert on public.assignment_submissions for insert to authenticated
with check (student_profile_id = (select auth.uid()) and exists (select 1 from public.assessments a where a.id = assessment_id and a.assessment_type in ('assignment','project') and a.status = 'published' and (select private.can_access_section(a.section_id))));
create policy submissions_update_student on public.assignment_submissions for update to authenticated
using (student_profile_id = (select auth.uid()) and status in ('draft','returned'))
with check (student_profile_id = (select auth.uid()) and status in ('draft','submitted'));
create policy submissions_update_teacher on public.assignment_submissions for update to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));

create policy attendance_sessions_read on public.attendance_sessions for select to authenticated using ((select private.can_access_section(section_id)));
create policy attendance_sessions_insert on public.attendance_sessions for insert to authenticated with check ((select private.can_manage_section(section_id)));
create policy attendance_sessions_update on public.attendance_sessions for update to authenticated using ((select private.can_manage_section(section_id))) with check ((select private.can_manage_section(section_id)));
create policy attendance_sessions_delete on public.attendance_sessions for delete to authenticated using ((select private.can_manage_section(section_id)));
create policy attendance_records_read on public.attendance_records for select to authenticated
using (student_profile_id = (select auth.uid()) or exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.can_manage_section(s.section_id))));
create policy attendance_records_insert on public.attendance_records for insert to authenticated
with check (exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.can_manage_section(s.section_id))));
create policy attendance_records_update on public.attendance_records for update to authenticated
using (exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.can_manage_section(s.section_id))))
with check (exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.can_manage_section(s.section_id))));
create policy attendance_records_delete on public.attendance_records for delete to authenticated
using (exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.can_manage_section(s.section_id))));

revoke all on public.learning_modules, public.learning_materials, public.learning_progress, public.assignment_submissions, public.attendance_sessions, public.attendance_records from public, anon;
grant select, insert, update, delete on public.learning_modules, public.learning_materials, public.assignment_submissions, public.attendance_sessions, public.attendance_records to authenticated;
grant select, insert, update on public.learning_progress to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('lms-files', 'lms-files', false, 52428800, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','video/mp4','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_lms_object(object_name text, write_access boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[]; target_section uuid; actor uuid := (select auth.uid());
begin
  if actor is null then return false; end if;
  parts := string_to_array(object_name, '/');
  if cardinality(parts) < 3 then return false; end if;
  begin target_section := parts[1]::uuid; exception when invalid_text_representation then return false; end;
  if (select private.can_manage_section(target_section)) then return true; end if;
  if write_access then return parts[2] = 'submissions' and parts[3] = actor::text and (select private.can_access_section(target_section)); end if;
  return (parts[2] = 'materials' or (parts[2] = 'submissions' and parts[3] = actor::text)) and (select private.can_access_section(target_section));
end; $$;
revoke all on function private.can_access_lms_object(text, boolean) from public, anon;
grant execute on function private.can_access_lms_object(text, boolean) to authenticated;

create policy lms_files_select on storage.objects for select to authenticated using (bucket_id = 'lms-files' and (select private.can_access_lms_object(name, false)));
create policy lms_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'lms-files' and (select private.can_access_lms_object(name, true)));
create policy lms_files_update on storage.objects for update to authenticated using (bucket_id = 'lms-files' and (select private.can_access_lms_object(name, true))) with check (bucket_id = 'lms-files' and (select private.can_access_lms_object(name, true)));
create policy lms_files_delete on storage.objects for delete to authenticated using (bucket_id = 'lms-files' and (select private.can_access_lms_object(name, true)));

comment on table public.learning_modules is 'Ordered publishable LMS modules within an existing course section.';
comment on table public.assignment_submissions is 'Student-owned assignment/project submissions with teacher grading and feedback.';
