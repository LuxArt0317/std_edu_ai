- STU Nexus all-in-one school operating platform.
-- The platform owner is a protected identity. All other capabilities are
-- enforced by trusted app metadata plus row-level security.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists employee_number text,
  add column if not exists is_platform_owner boolean not null default false,
  add constraint profiles_role_check check (role in (
    'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
    'department_head', 'faculty', 'advisor', 'admissions', 'finance',
    'support', 'librarian', 'student'
  ));

create unique index profiles_single_platform_owner_idx
on public.profiles (is_platform_owner)
where is_platform_owner;

create or replace function private.has_role(allowed_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select private.current_role()) = 'owner'
    or (select private.current_role()) = any(allowed_roles);
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := new.raw_app_meta_data ->> 'role';
  if requested_role is null or requested_role not in (
    'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
    'department_head', 'faculty', 'advisor', 'admissions', 'finance',
    'support', 'librarian', 'student'
  ) then
    requested_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'STU user'
    ),
    requested_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

do $$
declare
  owner_id uuid;
begin
  select id into owner_id
  from auth.users
  where lower(email) = 'winsonbaring10@gmail.com'
  limit 1;

  if owner_id is null then
    raise exception 'The required STU Nexus owner account is missing';
  end if;

  update public.profiles
  set role = 'owner',
      is_platform_owner = true,
      job_title = coalesce(job_title, 'Platform Owner'),
      updated_at = now()
  where id = owner_id;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'owner', 'platform_owner', true)
  where id = owner_id;
end;
$$;

create or replace function private.protect_platform_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_platform_owner then
      raise exception 'The platform owner profile cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_platform_owner and (not new.is_platform_owner or new.role <> 'owner' or new.id <> old.id) then
      raise exception 'The platform owner identity and role are protected' using errcode = '42501';
    end if;
    if not old.is_platform_owner and new.is_platform_owner then
      raise exception 'A second platform owner cannot be assigned' using errcode = '42501';
    end if;
    if new.role = 'owner' and not new.is_platform_owner then
      raise exception 'The owner role is reserved for the protected platform owner' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_platform_owner() from public, anon, authenticated;
create trigger profiles_protect_platform_owner
before update or delete on public.profiles
for each row execute function private.protect_platform_owner();

create table public.role_definitions (
  role_code text primary key,
  display_name text not null,
  hierarchy_level smallint not null check (hierarchy_level between 1 and 100),
  category text not null check (category in ('ownership', 'leadership', 'academic', 'operations', 'learner')),
  description text not null,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  head_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_programs (
  id uuid primary key default extensions.gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code text not null unique,
  name text not null,
  level text not null check (level in ('certificate', 'bachelor', 'master', 'doctorate')),
  duration_years numeric(3,1) not null check (duration_years > 0),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_terms (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  enrollment_starts_on date,
  enrollment_ends_on date,
  status text not null default 'planning' check (status in ('planning', 'enrollment', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_terms_dates_valid check (ends_on > starts_on)
);

create table public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  program_id uuid references public.academic_programs(id) on delete set null,
  code text not null unique,
  title text not null,
  description text not null default '',
  credits numeric(3,1) not null default 3 check (credits > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id uuid not null references public.academic_terms(id) on delete restrict,
  section_code text not null,
  faculty_id uuid references public.profiles(id) on delete set null,
  modality text not null default 'onsite' check (modality in ('onsite', 'online', 'hybrid')),
  room text,
  capacity integer not null default 40 check (capacity > 0),
  status text not null default 'planning' check (status in ('planning', 'open', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, term_id, section_code)
);

create table public.section_enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'enrolled' check (status in ('waitlisted', 'enrolled', 'dropped', 'completed')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (section_id, student_profile_id)
);

create table public.course_topics (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  title text not null,
  summary text not null default '',
  content_markdown text not null default '',
  position integer not null check (position > 0),
  estimated_minutes integer not null default 30 check (estimated_minutes > 0),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, position)
);

create table public.assessments (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  assessment_type text not null default 'quiz' check (assessment_type in ('quiz', 'exam', 'assignment', 'project')),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  opens_at timestamptz,
  due_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  attempt_limit integer not null default 1 check (attempt_limit > 0),
  max_score numeric(8,2) not null default 0 check (max_score >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  prompt text not null,
  question_type text not null check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  points numeric(7,2) not null default 1 check (points > 0),
  position integer not null check (position > 0),
  explanation text not null default '',
  unique (assessment_id, position)
);

create table public.assessment_options (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  label text not null,
  position integer not null check (position > 0),
  unique (question_id, position)
);

create table public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_option_id uuid references public.assessment_options(id) on delete cascade,
  acceptable_answers text[] not null default '{}',
  grading_notes text not null default '',
  constraint answer_key_has_answer check (correct_option_id is not null or cardinality(acceptable_answers) > 0)
);

create table public.assessment_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded', 'needs_review')),
  score numeric(8,2),
  max_score numeric(8,2) not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  unique (assessment_id, student_profile_id, attempt_number)
);

create table public.assessment_answers (
  id uuid primary key default extensions.gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  selected_option_id uuid references public.assessment_options(id) on delete set null,
  response_text text,
  is_correct boolean,
  points_awarded numeric(7,2),
  teacher_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.grade_items (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  title text not null,
  category text not null default 'Coursework',
  max_score numeric(8,2) not null check (max_score > 0),
  weight_percent numeric(5,2) not null default 0 check (weight_percent between 0 and 100),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grades (
  id uuid primary key default extensions.gen_random_uuid(),
  grade_item_id uuid not null references public.grade_items(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(8,2) not null check (score >= 0),
  letter_grade text,
  feedback text,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (grade_item_id, student_profile_id)
);

create table public.schedule_events (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid references public.course_sections(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  event_type text not null check (event_type in ('class', 'exam', 'deadline', 'meeting', 'campus', 'personal')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  audience_roles text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_event_dates_valid check (ends_at > starts_at),
  constraint schedule_event_has_audience check (section_id is not null or owner_profile_id is not null or cardinality(audience_roles) > 0)
);

create table public.announcements (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid references public.course_sections(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  audience_roles text[] not null default '{}',
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'system',
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.grade_scan_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  grade_item_id uuid references public.grade_items(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  source_name text not null,
  status text not null default 'processing' check (status in ('processing', 'needs_review', 'approved', 'rejected', 'failed')),
  extracted_payload jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_threads (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation',
  context_type text not null default 'general' check (context_type in ('general', 'student', 'course', 'assessment', 'case', 'admissions')),
  context_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  author_role text not null check (author_role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 10000),
  citations text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.ai_audit_logs drop constraint if exists ai_audit_logs_use_case_check;
alter table public.ai_audit_logs add constraint ai_audit_logs_use_case_check
check (use_case in ('answer', 'brief', 'draft', 'chat', 'grade_scan', 'quiz_feedback'));

create index academic_programs_department_idx on public.academic_programs (department_id, status);
create index courses_department_program_idx on public.courses (department_id, program_id, status);
create index course_sections_term_faculty_idx on public.course_sections (term_id, faculty_id, status);
create index section_enrollments_student_idx on public.section_enrollments (student_profile_id, status);
create index course_topics_section_position_idx on public.course_topics (section_id, position);
create index assessments_section_due_idx on public.assessments (section_id, status, due_at);
create index assessment_questions_assessment_position_idx on public.assessment_questions (assessment_id, position);
create index assessment_options_question_position_idx on public.assessment_options (question_id, position);
create index assessment_attempts_student_idx on public.assessment_attempts (student_profile_id, submitted_at desc);
create index assessment_answers_attempt_idx on public.assessment_answers (attempt_id);
create index grade_items_section_due_idx on public.grade_items (section_id, due_at);
create index grades_student_status_idx on public.grades (student_profile_id, status, updated_at desc);
create index grades_item_status_idx on public.grades (grade_item_id, status);
create index schedule_events_section_starts_idx on public.schedule_events (section_id, starts_at);
create index schedule_events_owner_starts_idx on public.schedule_events (owner_profile_id, starts_at);
create index announcements_section_published_idx on public.announcements (section_id, published_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc) where read_at is null;
create index grade_scan_jobs_uploader_created_idx on public.grade_scan_jobs (uploaded_by, created_at desc);
create index chat_threads_owner_updated_idx on public.chat_threads (owner_id, updated_at desc);
create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at);

create or replace function private.can_manage_section(target_section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    (select private.has_role(array['admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head']))
    or exists (
      select 1 from public.course_sections cs
      where cs.id = target_section and cs.faculty_id = (select auth.uid())
    )
  );
$$;

create or replace function private.can_access_section(target_section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    (select private.can_manage_section(target_section))
    or exists (
      select 1 from public.section_enrollments se
      where se.section_id = target_section
        and se.student_profile_id = (select auth.uid())
        and se.status in ('enrolled', 'completed')
    )
    or (select private.has_role(array['advisor', 'support', 'librarian']))
  );
$$;

revoke all on function private.can_manage_section(uuid) from public, anon;
revoke all on function private.can_access_section(uuid) from public, anon;
grant execute on function private.can_manage_section(uuid) to authenticated;
grant execute on function private.can_access_section(uuid) to authenticated;

create or replace function public.submit_assessment(p_assessment_id uuid, p_answers jsonb)
returns table (attempt_id uuid, score numeric, max_score numeric, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_attempt uuid;
  next_attempt integer;
  allowed_attempts integer;
  computed_score numeric(8,2);
  possible_score numeric(8,2);
  needs_review boolean;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be an array' using errcode = '22023';
  end if;

  select a.attempt_limit, a.max_score
  into allowed_attempts, possible_score
  from public.assessments a
  where a.id = p_assessment_id
    and a.status = 'published'
    and (a.opens_at is null or a.opens_at <= now())
    and (a.due_at is null or a.due_at >= now())
    and (select private.can_access_section(a.section_id));

  if allowed_attempts is null then
    raise exception 'Assessment is not available' using errcode = '42501';
  end if;

  select coalesce(max(aa.attempt_number), 0) + 1
  into next_attempt
  from public.assessment_attempts aa
  where aa.assessment_id = p_assessment_id and aa.student_profile_id = actor_id;

  if next_attempt > allowed_attempts then
    raise exception 'Attempt limit reached' using errcode = '23514';
  end if;

  insert into public.assessment_attempts (assessment_id, student_profile_id, attempt_number, max_score)
  values (p_assessment_id, actor_id, next_attempt, possible_score)
  returning id into created_attempt;

  insert into public.assessment_answers (attempt_id, question_id, selected_option_id, response_text)
  select
    created_attempt,
    q.id,
    case when answer.value ? 'optionId' and nullif(answer.value ->> 'optionId', '') is not null
      then (answer.value ->> 'optionId')::uuid else null end,
    nullif(trim(answer.value ->> 'text'), '')
  from jsonb_array_elements(p_answers) answer(value)
  join public.assessment_questions q
    on q.id = (answer.value ->> 'questionId')::uuid
   and q.assessment_id = p_assessment_id;

  update public.assessment_answers aa
  set is_correct = case
        when key.correct_option_id is not null then aa.selected_option_id = key.correct_option_id
        when cardinality(key.acceptable_answers) > 0 then lower(trim(coalesce(aa.response_text, ''))) = any(key.acceptable_answers)
        else null
      end,
      points_awarded = case
        when key.correct_option_id is not null and aa.selected_option_id = key.correct_option_id then q.points
        when cardinality(key.acceptable_answers) > 0 and lower(trim(coalesce(aa.response_text, ''))) = any(key.acceptable_answers) then q.points
        when key.correct_option_id is not null or cardinality(key.acceptable_answers) > 0 then 0
        else null
      end,
      updated_at = now()
  from public.assessment_questions q
  left join public.assessment_answer_keys key on key.question_id = q.id
  where aa.attempt_id = created_attempt and aa.question_id = q.id;

  select coalesce(sum(aa.points_awarded), 0), bool_or(aa.is_correct is null)
  into computed_score, needs_review
  from public.assessment_answers aa
  where aa.attempt_id = created_attempt;

  update public.assessment_attempts aa
  set score = computed_score,
      status = case when coalesce(needs_review, false) then 'needs_review' else 'graded' end,
      submitted_at = now(),
      graded_at = case when coalesce(needs_review, false) then null else now() end
  where aa.id = created_attempt;

  return query
  select aa.id, aa.score, aa.max_score, aa.status
  from public.assessment_attempts aa
  where aa.id = created_attempt;
end;
$$;

revoke all on function public.submit_assessment(uuid, jsonb) from public, anon;
grant execute on function public.submit_assessment(uuid, jsonb) to authenticated;

create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger academic_programs_set_updated_at before update on public.academic_programs for each row execute function public.set_updated_at();
create trigger academic_terms_set_updated_at before update on public.academic_terms for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger course_sections_set_updated_at before update on public.course_sections for each row execute function public.set_updated_at();
create trigger course_topics_set_updated_at before update on public.course_topics for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at before update on public.assessments for each row execute function public.set_updated_at();
create trigger assessment_answers_set_updated_at before update on public.assessment_answers for each row execute function public.set_updated_at();
create trigger grade_items_set_updated_at before update on public.grade_items for each row execute function public.set_updated_at();
create trigger grades_set_updated_at before update on public.grades for each row execute function public.set_updated_at();
create trigger schedule_events_set_updated_at before update on public.schedule_events for each row execute function public.set_updated_at();
create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger grade_scan_jobs_set_updated_at before update on public.grade_scan_jobs for each row execute function public.set_updated_at();
create trigger chat_threads_set_updated_at before update on public.chat_threads for each row execute function public.set_updated_at();

alter table public.role_definitions enable row level security;
alter table public.departments enable row level security;
alter table public.academic_programs enable row level security;
alter table public.academic_terms enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.section_enrollments enable row level security;
alter table public.course_topics enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_options enable row level security;
alter table public.assessment_answer_keys enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.grade_items enable row level security;
alter table public.grades enable row level security;
alter table public.schedule_events enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.grade_scan_jobs enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create policy role_definitions_read_authenticated on public.role_definitions for select to authenticated using (true);
create policy role_definitions_insert_owner on public.role_definitions for insert to authenticated
with check ((select private.current_role()) = 'owner');
create policy role_definitions_update_owner on public.role_definitions for update to authenticated
using ((select private.current_role()) = 'owner') with check ((select private.current_role()) = 'owner');
create policy role_definitions_delete_owner on public.role_definitions for delete to authenticated
using ((select private.current_role()) = 'owner');

create policy departments_read_authenticated on public.departments for select to authenticated using (true);
create policy departments_insert_leadership on public.departments for insert to authenticated
with check ((select private.has_role(array['admin', 'president', 'vice_president', 'dean'])));
create policy departments_update_leadership on public.departments for update to authenticated
using ((select private.has_role(array['admin', 'president', 'vice_president', 'dean'])))
with check ((select private.has_role(array['admin', 'president', 'vice_president', 'dean'])));
create policy departments_delete_leadership on public.departments for delete to authenticated
using ((select private.has_role(array['admin', 'president', 'vice_president', 'dean'])));
create policy programs_read_authenticated on public.academic_programs for select to authenticated using (true);
create policy programs_insert_leadership on public.academic_programs for insert to authenticated
with check ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy programs_update_leadership on public.academic_programs for update to authenticated
using ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])))
with check ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy programs_delete_leadership on public.academic_programs for delete to authenticated
using ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy terms_read_authenticated on public.academic_terms for select to authenticated using (true);
create policy terms_insert_registrar on public.academic_terms for insert to authenticated
with check ((select private.has_role(array['admin', 'registrar'])));
create policy terms_update_registrar on public.academic_terms for update to authenticated
using ((select private.has_role(array['admin', 'registrar'])))
with check ((select private.has_role(array['admin', 'registrar'])));
create policy terms_delete_registrar on public.academic_terms for delete to authenticated
using ((select private.has_role(array['admin', 'registrar'])));
create policy courses_read_authenticated on public.courses for select to authenticated using (true);
create policy courses_insert_academic_staff on public.courses for insert to authenticated
with check ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy courses_update_academic_staff on public.courses for update to authenticated
using ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])))
with check ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy courses_delete_academic_staff on public.courses for delete to authenticated
using ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));

create policy sections_read_authorized on public.course_sections for select to authenticated
using ((select private.can_access_section(id)));
create policy sections_insert_academic_staff on public.course_sections for insert to authenticated
with check ((select private.has_role(array['admin', 'dean', 'registrar', 'department_head'])));
create policy sections_update_authorized on public.course_sections for update to authenticated
using ((select private.can_manage_section(id))) with check ((select private.can_manage_section(id)));

create policy enrollments_read_authorized on public.section_enrollments for select to authenticated
using (student_profile_id = (select auth.uid()) or (select private.can_manage_section(section_id)) or (select private.has_role(array['advisor', 'support'])));
create policy enrollments_insert_registrar on public.section_enrollments for insert to authenticated
with check ((select private.has_role(array['admin', 'registrar'])));
create policy enrollments_update_registrar on public.section_enrollments for update to authenticated
using ((select private.has_role(array['admin', 'registrar'])))
with check ((select private.has_role(array['admin', 'registrar'])));
create policy enrollments_delete_registrar on public.section_enrollments for delete to authenticated
using ((select private.has_role(array['admin', 'registrar'])));

create policy topics_read_authorized on public.course_topics for select to authenticated
using ((published_at is not null and (select private.can_access_section(section_id))) or (select private.can_manage_section(section_id)));
create policy topics_insert_teacher on public.course_topics for insert to authenticated
with check ((select private.can_manage_section(section_id)));
create policy topics_update_teacher on public.course_topics for update to authenticated
using ((select private.can_manage_section(section_id))) with check ((select private.can_manage_section(section_id)));
create policy topics_delete_teacher on public.course_topics for delete to authenticated
using ((select private.can_manage_section(section_id)));
create policy assessments_read_authorized on public.assessments for select to authenticated
using ((status = 'published' and (select private.can_access_section(section_id))) or (select private.can_manage_section(section_id)));
create policy assessments_insert_teacher on public.assessments for insert to authenticated
with check ((select private.can_manage_section(section_id)));
create policy assessments_update_teacher on public.assessments for update to authenticated
using ((select private.can_manage_section(section_id))) with check ((select private.can_manage_section(section_id)));
create policy assessments_delete_teacher on public.assessments for delete to authenticated
using ((select private.can_manage_section(section_id)));

create policy questions_read_authorized on public.assessment_questions for select to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and ((a.status = 'published' and (select private.can_access_section(a.section_id))) or (select private.can_manage_section(a.section_id)))));
create policy questions_insert_teacher on public.assessment_questions for insert to authenticated
with check (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy questions_update_teacher on public.assessment_questions for update to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy questions_delete_teacher on public.assessment_questions for delete to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy options_read_authorized on public.assessment_options for select to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and ((a.status = 'published' and (select private.can_access_section(a.section_id))) or (select private.can_manage_section(a.section_id)))));
create policy options_insert_teacher on public.assessment_options for insert to authenticated
with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))));
create policy options_update_teacher on public.assessment_options for update to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))));
create policy options_delete_teacher on public.assessment_options for delete to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))));
create policy answer_keys_teacher_only on public.assessment_answer_keys for all to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id and (select private.can_manage_section(a.section_id))));

create policy attempts_read_authorized on public.assessment_attempts for select to authenticated
using (student_profile_id = (select auth.uid()) or exists (select 1 from public.assessments a where a.id = assessment_id and (select private.can_manage_section(a.section_id))));
create policy answers_read_authorized on public.assessment_answers for select to authenticated
using (exists (select 1 from public.assessment_attempts aa join public.assessments a on a.id = aa.assessment_id where aa.id = attempt_id and (aa.student_profile_id = (select auth.uid()) or (select private.can_manage_section(a.section_id)))));
create policy answers_update_teacher on public.assessment_answers for update to authenticated
using (exists (select 1 from public.assessment_attempts aa join public.assessments a on a.id = aa.assessment_id where aa.id = attempt_id and (select private.can_manage_section(a.section_id))))
with check (exists (select 1 from public.assessment_attempts aa join public.assessments a on a.id = aa.assessment_id where aa.id = attempt_id and (select private.can_manage_section(a.section_id))));

create policy grade_items_read_authorized on public.grade_items for select to authenticated
using ((select private.can_access_section(section_id)));
create policy grade_items_insert_teacher on public.grade_items for insert to authenticated
with check ((select private.can_manage_section(section_id)));
create policy grade_items_update_teacher on public.grade_items for update to authenticated
using ((select private.can_manage_section(section_id))) with check ((select private.can_manage_section(section_id)));
create policy grade_items_delete_teacher on public.grade_items for delete to authenticated
using ((select private.can_manage_section(section_id)));
create policy grades_read_authorized on public.grades for select to authenticated
using ((student_profile_id = (select auth.uid()) and status = 'published') or exists (select 1 from public.grade_items gi where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))));
create policy grades_insert_teacher on public.grades for insert to authenticated
with check (exists (select 1 from public.grade_items gi where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))));
create policy grades_update_teacher on public.grades for update to authenticated
using (exists (select 1 from public.grade_items gi where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))))
with check (exists (select 1 from public.grade_items gi where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))));
create policy grades_delete_teacher on public.grades for delete to authenticated
using (exists (select 1 from public.grade_items gi where gi.id = grade_item_id and (select private.can_manage_section(gi.section_id))));

create policy schedules_read_authorized on public.schedule_events for select to authenticated
using (owner_profile_id = (select auth.uid()) or (section_id is not null and (select private.can_access_section(section_id))) or (select private.current_role()) = any(audience_roles));
create policy schedules_insert_authorized on public.schedule_events for insert to authenticated
with check (created_by = (select auth.uid()) or owner_profile_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin', 'registrar'])));
create policy schedules_update_authorized on public.schedule_events for update to authenticated
using (created_by = (select auth.uid()) or owner_profile_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin', 'registrar'])))
with check (created_by = (select auth.uid()) or owner_profile_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin', 'registrar'])));
create policy schedules_delete_authorized on public.schedule_events for delete to authenticated
using (created_by = (select auth.uid()) or owner_profile_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin', 'registrar'])));
create policy announcements_read_authorized on public.announcements for select to authenticated
using ((published_at is not null and (expires_at is null or expires_at > now()) and ((section_id is null and ((select private.current_role()) = any(audience_roles) or cardinality(audience_roles) = 0)) or (section_id is not null and (select private.can_access_section(section_id))))) or author_id = (select auth.uid()) or (select private.has_role(array['admin'])));
create policy announcements_insert_authorized on public.announcements for insert to authenticated
with check (author_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin'])));
create policy announcements_update_authorized on public.announcements for update to authenticated
using (author_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin'])))
with check (author_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin'])));
create policy announcements_delete_authorized on public.announcements for delete to authenticated
using (author_id = (select auth.uid()) or (section_id is not null and (select private.can_manage_section(section_id))) or (select private.has_role(array['admin'])));
create policy notifications_owner_only on public.notifications for all to authenticated
using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy grade_scans_teacher_only on public.grade_scan_jobs for all to authenticated
using (uploaded_by = (select auth.uid()) and (select private.can_manage_section(section_id)))
with check (uploaded_by = (select auth.uid()) and (select private.can_manage_section(section_id)));
create policy chat_threads_owner_only on public.chat_threads for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy chat_messages_owner_only on public.chat_messages for all to authenticated
using (exists (select 1 from public.chat_threads ct where ct.id = thread_id and ct.owner_id = (select auth.uid())))
with check (exists (select 1 from public.chat_threads ct where ct.id = thread_id and ct.owner_id = (select auth.uid())));

drop policy if exists profiles_update_authorized on public.profiles;
drop policy if exists profiles_read_self_or_staff on public.profiles;
create policy profiles_read_self_or_staff on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.has_role(array[
  'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head',
  'faculty', 'advisor', 'admissions', 'finance', 'support', 'librarian'
])));
create policy profiles_update_authorized on public.profiles for update to authenticated
using ((select private.has_role(array['admin'])) or (select auth.uid()) = id)
with check (
  (select private.has_role(array['admin']))
  or ((select auth.uid()) = id and role = (select private.current_role()) and not is_platform_owner)
);

drop policy if exists students_read_authorized on public.students;
create policy students_read_authorized on public.students for select to authenticated
using (profile_id = (select auth.uid()) or (select private.has_role(array[
  'admin', 'president', 'vice_president', 'dean', 'registrar', 'department_head',
  'faculty', 'advisor', 'admissions', 'finance', 'support'
])));

grant select, insert, update, delete on public.role_definitions, public.departments, public.academic_programs,
  public.academic_terms, public.courses, public.course_sections, public.section_enrollments, public.course_topics,
  public.assessments, public.assessment_questions, public.assessment_options, public.assessment_answer_keys,
  public.assessment_attempts, public.assessment_answers, public.grade_items, public.grades, public.schedule_events,
  public.announcements, public.notifications, public.grade_scan_jobs, public.chat_threads, public.chat_messages
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into public.role_definitions (role_code, display_name, hierarchy_level, category, description, capabilities) values
  ('owner', 'Platform Owner', 100, 'ownership', 'Protected root steward for the complete STU Nexus platform.', array['all_access', 'role_preview', 'owner_protection', 'audit']),
  ('president', 'University President', 95, 'leadership', 'Institution-wide executive oversight and outcomes.', array['executive_dashboard', 'institutional_analytics']),
  ('vice_president', 'Vice President', 90, 'leadership', 'Executive oversight for assigned university domains.', array['executive_dashboard', 'institutional_analytics']),
  ('admin', 'System Administrator', 88, 'operations', 'Platform configuration, people, and operational administration.', array['user_management', 'configuration', 'audit']),
  ('dean', 'Dean', 80, 'academic', 'College-level academic leadership and quality oversight.', array['academic_catalog', 'faculty_oversight', 'analytics']),
  ('registrar', 'Registrar', 78, 'operations', 'Terms, sections, enrollment, and academic record operations.', array['terms', 'enrollment', 'records']),
  ('department_head', 'Department Head', 72, 'academic', 'Department courses, faculty assignments, and curriculum oversight.', array['courses', 'sections', 'faculty_oversight']),
  ('faculty', 'Teacher / Faculty', 60, 'academic', 'Assigned classes, topics, assessments, schedules, and grading.', array['teaching', 'assessments', 'gradebook']),
  ('advisor', 'Academic Advisor', 55, 'academic', 'Student planning, success support, and case coordination.', array['student_360', 'success_radar', 'cases']),
  ('admissions', 'Admissions Officer', 50, 'operations', 'Applicant pipeline, outreach, and enrollment handoff.', array['admissions', 'campaigns']),
  ('finance', 'Finance Officer', 48, 'operations', 'Financial support routing and approved student-account workflows.', array['finance_cases', 'support']),
  ('support', 'Student Support', 45, 'operations', 'Student service cases, tasks, and coordinated support.', array['cases', 'tasks']),
  ('librarian', 'Librarian / Knowledge Manager', 44, 'academic', 'Verified institutional and learning knowledge stewardship.', array['knowledge', 'learning_resources']),
  ('student', 'Student', 10, 'learner', 'Own courses, topics, assessments, grades, schedule, and support.', array['learning', 'quizzes', 'own_grades', 'own_schedule'])
on conflict (role_code) do update set
  display_name = excluded.display_name,
  hierarchy_level = excluded.hierarchy_level,
  category = excluded.category,
  description = excluded.description,
  capabilities = excluded.capabilities;

insert into public.departments (id, code, name, description) values
  ('50000000-0000-4000-8000-000000000001', 'IM', 'Information Management', 'Digital systems, information strategy, data, and responsible AI.'),
  ('50000000-0000-4000-8000-000000000002', 'VCD', 'Visual Communication Design', 'Design communication, creative technology, and visual storytelling.')
on conflict (id) do nothing;

insert into public.academic_programs (id, department_id, code, name, level, duration_years, description) values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'BSIM', 'Bachelor of Information Management', 'bachelor', 4, 'Develops information systems, management, data, and responsible digital innovation capabilities.'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'BVCD', 'Bachelor of Visual Communication Design', 'bachelor', 4, 'Builds design thinking, communication, creative practice, and digital production capabilities.')
on conflict (id) do nothing;

insert into public.academic_terms (id, code, name, starts_on, ends_on, enrollment_starts_on, enrollment_ends_on, status) values
  ('52000000-0000-4000-8000-000000000001', '2026-FALL', 'Fall Semester 2026', '2026-09-07', '2027-01-15', '2026-07-20', '2026-08-28', 'enrollment')
on conflict (id) do nothing;

insert into public.courses (id, department_id, program_id, code, title, description, credits) values
  ('53000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'IM101', 'Digital Systems Foundations', 'A practical introduction to information systems, data, networks, security, and responsible digital citizenship.', 3),
  ('53000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'IM203', 'Data and AI Literacy', 'Data reasoning, model literacy, privacy, bias, verification, and human oversight in applied AI.', 3)
on conflict (id) do nothing;

insert into public.course_sections (id, course_id, term_id, section_code, faculty_id, modality, room, capacity, status)
select '54000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'A', p.id, 'hybrid', 'Innovation Hall 301', 40, 'active'
from public.profiles p where p.is_platform_owner
on conflict (id) do nothing;

insert into public.course_sections (id, course_id, term_id, section_code, faculty_id, modality, room, capacity, status)
select '54000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 'A', p.id, 'onsite', 'Data Lab 204', 36, 'active'
from public.profiles p where p.is_platform_owner
on conflict (id) do nothing;

insert into public.course_topics (id, section_id, title, summary, content_markdown, position, estimated_minutes, published_at, created_by)
select seed.id, seed.section_id, seed.title, seed.summary, seed.content, seed.position, seed.minutes, now(), p.id
from public.profiles p
cross join (values
  ('55000000-0000-4000-8000-000000000001'::uuid, '54000000-0000-4000-8000-000000000001'::uuid, 'How information systems create value', 'Connect people, process, data, and technology as one system.', E'# Information systems\n\nAn information system combines **people, processes, data, and technology** to achieve a useful outcome. Technology alone is not the system.\n\n## Learning goals\n- Identify each system component.\n- Explain inputs, processing, outputs, and feedback.\n- Evaluate who benefits and who carries risk.', 1, 35),
  ('55000000-0000-4000-8000-000000000002'::uuid, '54000000-0000-4000-8000-000000000001'::uuid, 'Networks, identity, and security basics', 'Understand safe access, authentication, authorization, and least privilege.', E'# Safe digital access\n\nAuthentication confirms identity. Authorization determines permitted actions. Least privilege gives each account only the access required for its role.\n\nNever share passwords, and always report unexpected access.', 2, 40),
  ('55000000-0000-4000-8000-000000000003'::uuid, '54000000-0000-4000-8000-000000000002'::uuid, 'Reading data with healthy skepticism', 'Ask where data came from, what it omits, and whether it supports the claim.', E'# Data literacy\n\nA responsible analysis checks provenance, definitions, missing values, sampling, and uncertainty before drawing conclusions. Correlation does not prove causation.', 1, 30),
  ('55000000-0000-4000-8000-000000000004'::uuid, '54000000-0000-4000-8000-000000000002'::uuid, 'Responsible AI and human oversight', 'Use AI as decision support with privacy, verification, and accountable review.', E'# Responsible AI\n\nAI outputs can be useful and still be wrong. Protect personal data, verify important claims, document the evidence used, test for unfair impact, and keep a responsible human in the decision loop.', 2, 45)
) as seed(id, section_id, title, summary, content, position, minutes)
where p.is_platform_owner
on conflict (id) do nothing;

insert into public.assessments (id, section_id, title, instructions, assessment_type, status, opens_at, due_at, duration_minutes, attempt_limit, max_score, created_by)
select '56000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', 'Systems and Security Check', 'Choose the best answer. Feedback appears after submission. You have two attempts.', 'quiz', 'published', now() - interval '1 day', now() + interval '60 days', 15, 2, 5, p.id
from public.profiles p where p.is_platform_owner
on conflict (id) do nothing;

insert into public.assessment_questions (id, assessment_id, prompt, question_type, points, position, explanation) values
  ('57000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Which combination best describes an information system?', 'multiple_choice', 1, 1, 'A complete system coordinates people, process, data, and technology.'),
  ('57000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000001', 'What is the primary purpose of authentication?', 'multiple_choice', 1, 2, 'Authentication confirms the identity of a user or system.'),
  ('57000000-0000-4000-8000-000000000003', '56000000-0000-4000-8000-000000000001', 'Least privilege means every user receives administrator access.', 'true_false', 1, 3, 'Least privilege limits access to what a role genuinely needs.'),
  ('57000000-0000-4000-8000-000000000004', '56000000-0000-4000-8000-000000000001', 'Which action is safest when an unexpected login request appears?', 'multiple_choice', 1, 4, 'Deny the request, secure the account, and report the event.'),
  ('57000000-0000-4000-8000-000000000005', '56000000-0000-4000-8000-000000000001', 'What must remain involved in high-impact AI-supported school decisions?', 'short_answer', 1, 5, 'A responsible human must review evidence and remain accountable.')
on conflict (id) do nothing;

insert into public.assessment_options (id, question_id, label, position) values
  ('58000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'Hardware only', 1),
  ('58000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', 'People, process, data, and technology', 2),
  ('58000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', 'A social media account', 3),
  ('58000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000002', 'Confirm identity', 1),
  ('58000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000002', 'Grant every permission', 2),
  ('58000000-0000-4000-8000-000000000006', '57000000-0000-4000-8000-000000000002', 'Encrypt every database', 3),
  ('58000000-0000-4000-8000-000000000007', '57000000-0000-4000-8000-000000000003', 'True', 1),
  ('58000000-0000-4000-8000-000000000008', '57000000-0000-4000-8000-000000000003', 'False', 2),
  ('58000000-0000-4000-8000-000000000009', '57000000-0000-4000-8000-000000000004', 'Approve it quickly', 1),
  ('58000000-0000-4000-8000-000000000010', '57000000-0000-4000-8000-000000000004', 'Ignore all future alerts', 2),
  ('58000000-0000-4000-8000-000000000011', '57000000-0000-4000-8000-000000000004', 'Deny, secure the account, and report it', 3)
on conflict (id) do nothing;

insert into public.assessment_answer_keys (question_id, correct_option_id, acceptable_answers, grading_notes) values
  ('57000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000002', '{}', 'Core system-components concept.'),
  ('57000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-000000000004', '{}', 'Authentication confirms identity.'),
  ('57000000-0000-4000-8000-000000000003', '58000000-0000-4000-8000-000000000008', '{}', 'Least privilege restricts access.'),
  ('57000000-0000-4000-8000-000000000004', '58000000-0000-4000-8000-000000000011', '{}', 'Unexpected access must be denied and reported.'),
  ('57000000-0000-4000-8000-000000000005', null, array['human','a human','responsible human','human review','human oversight'], 'Accept concise expressions of accountable human oversight.')
on conflict (question_id) do nothing;

insert into public.grade_items (id, section_id, assessment_id, title, category, max_score, weight_percent, due_at) values
  ('59000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Systems and Security Check', 'Quizzes', 5, 10, now() + interval '60 days'),
  ('59000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', null, 'Responsible AI Analysis', 'Projects', 100, 25, now() + interval '75 days')
on conflict (id) do nothing;

insert into public.schedule_events (id, section_id, title, description, event_type, starts_at, ends_at, location, audience_roles, created_by)
select seed.id, seed.section_id, seed.title, seed.description, seed.event_type, seed.starts_at, seed.ends_at, seed.location, seed.roles, p.id
from public.profiles p
cross join (values
  ('5a000000-0000-4000-8000-000000000001'::uuid, '54000000-0000-4000-8000-000000000001'::uuid, 'IM101 · Systems Foundations', 'Weekly hybrid class session.', 'class', '2026-09-08 01:00:00+00'::timestamptz, '2026-09-08 02:50:00+00'::timestamptz, 'Innovation Hall 301', array['faculty','student']),
  ('5a000000-0000-4000-8000-000000000002'::uuid, '54000000-0000-4000-8000-000000000002'::uuid, 'IM203 · Data and AI Literacy', 'Weekly class and applied lab.', 'class', '2026-09-09 05:00:00+00'::timestamptz, '2026-09-09 07:50:00+00'::timestamptz, 'Data Lab 204', array['faculty','student']),
  ('5a000000-0000-4000-8000-000000000003'::uuid, null::uuid, 'Fall 2026 orientation', 'University welcome and platform readiness session.', 'campus', '2026-09-04 01:00:00+00'::timestamptz, '2026-09-04 04:00:00+00'::timestamptz, 'STU Auditorium', array['faculty','student','advisor'])
) as seed(id, section_id, title, description, event_type, starts_at, ends_at, location, roles)
where p.is_platform_owner
on conflict (id) do nothing;

insert into public.announcements (id, section_id, author_id, title, body, audience_roles, priority, published_at)
select '5b000000-0000-4000-8000-000000000001', null, p.id, 'Welcome to the unified STU Nexus platform', 'Your courses, learning topics, assessments, grades, schedules, support, and AI assistant now live in one secure role-aware workspace.', array['owner','admin','faculty','advisor','admissions','finance','support','librarian','student'], 'important', now()
from public.profiles p where p.is_platform_owner
on conflict (id) do nothing;

comment on table public.assessment_answer_keys is 'Protected answer keys. Learners never receive this table through the Data API.';
comment on table public.grade_scan_jobs is 'Human-review queue for AI-extracted grade candidates. AI output never directly publishes grades.';
comment on function public.submit_assessment(uuid, jsonb) is 'Transactional objective assessment submission and deterministic scoring with protected answer keys.';
comment on column public.profiles.is_platform_owner is 'Immutable root ownership marker for the single STU Nexus platform owner.';
