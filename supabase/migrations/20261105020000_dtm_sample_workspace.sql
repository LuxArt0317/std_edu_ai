-- Independent stu.best DTM preview. Every personal row is sample-only and
-- scoped to the Google identity already used by School Affairs.
create table public.dtm_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null,
  term text not null,
  role text not null default 'student' check (role in ('student','teacher')),
  source_mode text not null default 'sample' check (source_mode = 'sample'),
  created_at timestamptz not null default now(),
  unique (user_id, code, term)
);
create index dtm_courses_user_idx on public.dtm_courses(user_id);

create table public.dtm_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('page','file','assignment')),
  summary text not null,
  source_mode text not null default 'sample' check (source_mode = 'sample'),
  position integer not null check (position > 0),
  unique (course_id, position)
);
create index dtm_materials_course_idx on public.dtm_materials(course_id);

create table public.dtm_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  source_mode text not null default 'sample' check (source_mode = 'sample')
);
insert into public.dtm_notices(title,body) values
  ('Welcome to the Digital Teaching Materials preview', 'The courses and materials shown here are sample stu.best records. They are not official university Moodle data.'),
  ('Using your sample course', 'Open a course to view its outline, materials and practice assignment. Nothing here submits work to the university.');

create function public.dtm_initialize_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_course uuid;
begin
  if v_uid is null or not (select private.affairs_google_identity())
      or not exists (select 1 from public.affairs_profiles where user_id=v_uid) then
    raise exception 'Verified School Affairs Google sign-in is required' using errcode='42501';
  end if;
  insert into public.dtm_courses(user_id,code,title,term)
  values (v_uid,'DTM-SAMPLE-101','Digital Learning Orientation','115學年度第1學期')
  on conflict (user_id,code,term) do nothing;
  select id into v_course from public.dtm_courses
  where user_id=v_uid and code='DTM-SAMPLE-101' and term='115學年度第1學期';
  insert into public.dtm_materials(course_id,title,kind,summary,position) values
    (v_course,'Course introduction','page','A sample overview of learning online and finding course materials.',1),
    (v_course,'Getting started guide','file','Sample guide for browsing and organizing digital materials.',2),
    (v_course,'Practice reflection','assignment','A preview activity; no work is submitted to the university.',3)
  on conflict (course_id,position) do nothing;
end;
$$;
revoke all on function public.dtm_initialize_account() from public,anon;
grant execute on function public.dtm_initialize_account() to authenticated;

alter table public.dtm_courses enable row level security;
alter table public.dtm_materials enable row level security;
alter table public.dtm_notices enable row level security;
create policy dtm_courses_own_read on public.dtm_courses for select to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));
create policy dtm_materials_own_read on public.dtm_materials for select to authenticated
  using (exists (select 1 from public.dtm_courses c where c.id=course_id and c.user_id=(select auth.uid()))
    and (select private.affairs_google_identity()));
create policy dtm_notices_google_read on public.dtm_notices for select to authenticated
  using ((select private.affairs_google_identity()));
grant select on public.dtm_courses, public.dtm_materials, public.dtm_notices to authenticated;
