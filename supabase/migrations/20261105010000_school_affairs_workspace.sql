-- Independent stu.best School Affairs records. These are site-owned sample data,
-- not university SIS records and never derived from the Nexus tables.
create table public.affairs_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.affairs_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  source_mode text not null default 'sample' check (source_mode in ('sample','verified')),
  check (ends_on >= starts_on)
);
create table public.affairs_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  department text not null,
  source_mode text not null default 'sample' check (source_mode in ('sample','verified'))
);
create table public.affairs_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  credits numeric(3,1) not null check (credits >= 0),
  program_id uuid not null references public.affairs_programs(id),
  source_mode text not null default 'sample' check (source_mode in ('sample','verified'))
);
create table public.affairs_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.affairs_courses(id),
  term_id uuid not null references public.affairs_terms(id),
  section_code text not null,
  instructor text not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  room text not null,
  source_mode text not null default 'sample' check (source_mode in ('sample','verified')),
  unique (course_id,term_id,section_code),
  check (ends_at > starts_at)
);
create table public.affairs_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.affairs_profiles(user_id) on delete cascade,
  student_number text not null unique,
  full_name text not null,
  program_id uuid not null references public.affairs_programs(id),
  year_level smallint not null check (year_level between 1 and 8),
  status text not null default 'active' check (status in ('active','inactive')),
  source_mode text not null default 'sample' check (source_mode in ('sample','verified')),
  created_at timestamptz not null default now()
);
create table public.affairs_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.affairs_students(id) on delete cascade,
  section_id uuid not null references public.affairs_sections(id),
  status text not null default 'enrolled' check (status in ('enrolled','withdrawn','completed')),
  source_mode text not null default 'sample' check (source_mode in ('sample','verified')),
  created_at timestamptz not null default now(),
  unique (student_id,section_id)
);
create table public.affairs_grade_items (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.affairs_enrollments(id) on delete cascade,
  label text not null,
  score numeric(5,2) not null check (score >= 0),
  maximum numeric(5,2) not null check (maximum > 0 and score <= maximum),
  released_at timestamptz,
  source_mode text not null default 'sample' check (source_mode in ('sample','verified'))
);
create table public.affairs_attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.affairs_enrollments(id) on delete cascade,
  meeting_on date not null,
  status text not null check (status in ('present','late','absent','excused')),
  source_mode text not null default 'sample' check (source_mode in ('sample','verified')),
  unique (enrollment_id,meeting_on)
);
create table public.affairs_charges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.affairs_students(id) on delete cascade,
  label text not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0 and amount_paid <= amount_due),
  currency text not null default 'TWD' check (currency = 'TWD'),
  due_on date,
  source_mode text not null default 'sample' check (source_mode in ('sample','verified'))
);
create table public.affairs_announcements (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all','students')),
  published_at timestamptz not null default now(),
  created_by uuid references public.affairs_profiles(user_id),
  source_mode text not null default 'sample' check (source_mode in ('sample','site','verified'))
);
create table public.affairs_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  due_at timestamptz,
  completed_at timestamptz,
  source_mode text not null default 'site' check (source_mode in ('sample','site')),
  created_at timestamptz not null default now()
);
create table public.affairs_service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_type text not null check (request_type in ('records','registration','general')),
  title text not null check (char_length(title) between 3 and 160),
  details text not null check (char_length(details) between 5 and 2000),
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.affairs_agent_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  action_kind text not null,
  target_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);
create index affairs_enrollments_student_idx on public.affairs_enrollments(student_id);
create index affairs_grade_items_enrollment_idx on public.affairs_grade_items(enrollment_id);
create index affairs_attendance_enrollment_idx on public.affairs_attendance(enrollment_id);
create index affairs_charges_student_idx on public.affairs_charges(student_id);
create index affairs_tasks_user_idx on public.affairs_tasks(user_id,created_at desc);
create index affairs_requests_user_idx on public.affairs_service_requests(user_id,created_at desc);
create index affairs_audit_user_idx on public.affairs_agent_audit(user_id,created_at desc);

insert into public.affairs_terms(code,label,starts_on,ends_on) values
  ('SAMPLE-2026-FALL','Sample Fall 2026','2026-09-07','2027-01-15');
insert into public.affairs_programs(code,name,department) values
  ('SAMPLE-GEN','Sample General Studies','Sample Academic Office');
insert into public.affairs_courses(code,title,credits,program_id)
select v.code,v.title,v.credits,p.id from (values
  ('SAMP101','Campus Orientation',2.0::numeric),
  ('SAMP102','Digital Learning Basics',3.0::numeric)
) v(code,title,credits) cross join public.affairs_programs p where p.code='SAMPLE-GEN';
insert into public.affairs_sections(course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
select c.id,t.id,'A','Sample instructor',v.weekday,v.starts_at::time,v.ends_at::time,v.room
from (values ('SAMP101',1,'09:00','10:30','Sample Room 101'),('SAMP102',3,'13:00','14:30','Sample Room 203')) v(code,weekday,starts_at,ends_at,room)
join public.affairs_courses c on c.code=v.code cross join public.affairs_terms t where t.code='SAMPLE-2026-FALL';
insert into public.affairs_announcements(slug,title,body,source_mode) values
  ('sample-welcome','Welcome to the sample School Affairs workspace','These records demonstrate the stu.best workspace. They are not official university enrollments, grades, fees, or announcements.','sample');

create function private.affairs_google_identity() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists
    (select 1 from auth.identities i where i.user_id=(select auth.uid()) and i.provider='google');
$$;
create function private.affairs_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.affairs_profiles p join auth.users u on u.id=p.user_id
    where p.user_id=(select auth.uid()) and p.role='admin'
      and lower(u.email)='luxart0317@gmail.com' and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
  );
$$;
revoke all on function private.affairs_google_identity() from public,anon;
revoke all on function private.affairs_is_admin() from public,anon;
grant execute on function private.affairs_google_identity(),private.affairs_is_admin() to authenticated;

create function public.affairs_initialize_account() returns public.affairs_profiles
language plpgsql security definer set search_path = '' as $$
declare v_user auth.users%rowtype; v_profile public.affairs_profiles%rowtype; v_student_id uuid;
begin
  select * into v_user from auth.users where id=(select auth.uid());
  if v_user.id is null or v_user.email_confirmed_at is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in is required' using errcode='42501';
  end if;
  insert into public.affairs_profiles(user_id,email,display_name,role)
  values(v_user.id,v_user.email,coalesce(nullif(v_user.raw_user_meta_data->>'full_name',''),split_part(v_user.email,'@',1)),
    case when lower(v_user.email)='luxart0317@gmail.com' then 'admin' else 'student' end)
  on conflict(user_id) do update set email=excluded.email, display_name=excluded.display_name,
    role=excluded.role,updated_at=now() returning * into v_profile;
  insert into public.affairs_students(user_id,student_number,full_name,program_id,year_level)
  select v_user.id,'SAMPLE-'||upper(left(replace(v_user.id::text,'-',''),12)),v_profile.display_name,p.id,1
  from public.affairs_programs p where p.code='SAMPLE-GEN'
  on conflict(user_id) do nothing;
  select id into v_student_id from public.affairs_students where user_id=v_user.id;
  insert into public.affairs_enrollments(student_id,section_id)
  select v_student_id,s.id from public.affairs_sections s join public.affairs_terms t on t.id=s.term_id
  where t.code='SAMPLE-2026-FALL' on conflict(student_id,section_id) do nothing;
  insert into public.affairs_grade_items(enrollment_id,label,score,maximum,released_at)
  select e.id,'Sample practice quiz',8,10,now() from public.affairs_enrollments e
  join public.affairs_sections s on s.id=e.section_id join public.affairs_courses c on c.id=s.course_id
  where e.student_id=v_student_id and c.code='SAMP101'
    and not exists(select 1 from public.affairs_grade_items g where g.enrollment_id=e.id and g.label='Sample practice quiz');
  insert into public.affairs_tasks(user_id,title,source_mode)
  select v_user.id,'Explore your sample School Affairs records','sample'
  where not exists(select 1 from public.affairs_tasks t where t.user_id=v_user.id and t.source_mode='sample');
  return v_profile;
end;
$$;
revoke all on function public.affairs_initialize_account() from public,anon;
grant execute on function public.affairs_initialize_account() to authenticated;

create function public.affairs_execute_action(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_title text; v_details text; v_type text; v_summary text;
begin
  if v_uid is null or not (select private.affairs_google_identity()) or not exists(select 1 from public.affairs_profiles where user_id=v_uid) then
    raise exception 'School Affairs sign-in is required' using errcode='42501';
  end if;
  if p_kind='create_task' then
    v_title=btrim(p_payload->>'title');
    if char_length(v_title) not between 3 and 160 then raise exception 'Task title must be 3-160 characters' using errcode='22023'; end if;
    insert into public.affairs_tasks(user_id,title) values(v_uid,v_title) returning id into v_id;
    v_summary='Created task: '||v_title;
  elsif p_kind='complete_task' then
    update public.affairs_tasks set completed_at=now() where id=(p_payload->>'task_id')::uuid and user_id=v_uid and completed_at is null returning id,title into v_id,v_title;
    if v_id is null then raise exception 'Open task not found' using errcode='22023'; end if;
    v_summary='Completed task: '||v_title;
  elsif p_kind='create_service_request' then
    v_title=btrim(p_payload->>'title');v_details=btrim(p_payload->>'details');v_type=p_payload->>'request_type';
    if char_length(v_title) not between 3 and 160 or char_length(v_details) not between 5 and 2000 or v_type not in ('records','registration','general') then
      raise exception 'Invalid service request' using errcode='22023';
    end if;
    insert into public.affairs_service_requests(user_id,request_type,title,details) values(v_uid,v_type,v_title,v_details) returning id into v_id;
    v_summary='Created stu.best request: '||v_title;
  elsif p_kind='publish_announcement' then
    if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
    v_title=btrim(p_payload->>'title');v_details=btrim(p_payload->>'body');
    if char_length(v_title) not between 3 and 160 or char_length(v_details) not between 5 and 2000 then raise exception 'Invalid announcement' using errcode='22023'; end if;
    insert into public.affairs_announcements(title,body,created_by,source_mode) values(v_title,v_details,v_uid,'site') returning id into v_id;
    v_summary='Published stu.best announcement: '||v_title;
  elsif p_kind='resolve_service_request' then
    if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
    update public.affairs_service_requests set status='resolved',updated_at=now()
      where id=(p_payload->>'request_id')::uuid and status <> 'resolved' returning id,title into v_id,v_title;
    if v_id is null then raise exception 'Open request not found' using errcode='22023'; end if;
    v_summary='Resolved stu.best request: '||v_title;
  else
    raise exception 'Unsupported School Affairs action' using errcode='22023';
  end if;
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,p_kind,v_id,v_summary);
  return jsonb_build_object('id',v_id,'kind',p_kind,'summary',v_summary);
end;
$$;
revoke all on function public.affairs_execute_action(text,jsonb) from public,anon;
grant execute on function public.affairs_execute_action(text,jsonb) to authenticated;

do $$ declare t text; begin
  foreach t in array array['affairs_profiles','affairs_terms','affairs_programs','affairs_courses','affairs_sections','affairs_students','affairs_enrollments','affairs_grade_items','affairs_attendance','affairs_charges','affairs_announcements','affairs_tasks','affairs_service_requests','affairs_agent_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;
grant insert,update,delete on public.affairs_tasks to authenticated;
grant insert on public.affairs_service_requests to authenticated;

create policy affairs_catalog_terms on public.affairs_terms for select to authenticated using ((select private.affairs_google_identity()));
create policy affairs_catalog_programs on public.affairs_programs for select to authenticated using ((select private.affairs_google_identity()));
create policy affairs_catalog_courses on public.affairs_courses for select to authenticated using ((select private.affairs_google_identity()));
create policy affairs_catalog_sections on public.affairs_sections for select to authenticated using ((select private.affairs_google_identity()));
create policy affairs_profiles_read on public.affairs_profiles for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));
create policy affairs_students_read on public.affairs_students for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));
create policy affairs_enrollments_read on public.affairs_enrollments for select to authenticated using ((select private.affairs_google_identity()) and (student_id in (select id from public.affairs_students where user_id=(select auth.uid())) or (select private.affairs_is_admin())));
create policy affairs_grade_items_read on public.affairs_grade_items for select to authenticated using ((select private.affairs_google_identity()) and (enrollment_id in (select e.id from public.affairs_enrollments e join public.affairs_students s on s.id=e.student_id where s.user_id=(select auth.uid())) or (select private.affairs_is_admin())));
create policy affairs_attendance_read on public.affairs_attendance for select to authenticated using ((select private.affairs_google_identity()) and (enrollment_id in (select e.id from public.affairs_enrollments e join public.affairs_students s on s.id=e.student_id where s.user_id=(select auth.uid())) or (select private.affairs_is_admin())));
create policy affairs_charges_read on public.affairs_charges for select to authenticated using ((select private.affairs_google_identity()) and (student_id in (select id from public.affairs_students where user_id=(select auth.uid())) or (select private.affairs_is_admin())));
create policy affairs_announcements_read on public.affairs_announcements for select to authenticated using ((select private.affairs_google_identity()));
create policy affairs_tasks_read on public.affairs_tasks for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));
create policy affairs_tasks_insert on public.affairs_tasks for insert to authenticated with check ((select private.affairs_google_identity()) and user_id=(select auth.uid()));
create policy affairs_tasks_update on public.affairs_tasks for update to authenticated using ((select private.affairs_google_identity()) and user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy affairs_tasks_delete on public.affairs_tasks for delete to authenticated using ((select private.affairs_google_identity()) and user_id=(select auth.uid()));
create policy affairs_requests_read on public.affairs_service_requests for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));
create policy affairs_requests_insert on public.affairs_service_requests for insert to authenticated with check ((select private.affairs_google_identity()) and user_id=(select auth.uid()));
create policy affairs_audit_read on public.affairs_agent_audit for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));
