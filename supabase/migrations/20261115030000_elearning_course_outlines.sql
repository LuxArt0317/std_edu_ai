create table public.elearning_sections (
  course_id integer not null references public.elearning_courses(id) on delete cascade,
  position integer not null check (position between 1 and 64),
  title text not null check (length(btrim(title)) between 1 and 200),
  primary key (course_id,position)
);

create table public.elearning_activities (
  id integer primary key check (id > 0),
  course_id integer not null,
  section_position integer not null,
  position integer not null check (position between 1 and 100),
  kind text not null check (kind in ('url','attendanceregister')),
  title text not null check (length(btrim(title)) between 1 and 240),
  unique (course_id,section_position,position),
  foreign key (course_id,section_position)
    references public.elearning_sections(course_id,position) on delete cascade
);

-- Link an authorized stu.best account to this outline independently of
-- local workshop enrollment. A Google account alone grants no course access.
create table public.elearning_course_access (
  course_id integer not null references public.elearning_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id,user_id)
);
create index elearning_course_access_user_idx on public.elearning_course_access(user_id);

alter table public.elearning_sections enable row level security;
alter table public.elearning_activities enable row level security;
alter table public.elearning_course_access enable row level security;
revoke all on public.elearning_sections,public.elearning_activities,public.elearning_course_access from public,anon,authenticated;

insert into public.elearning_sections (course_id,position,title) values
  (9408,1,'課程主題'),
  (9098,1,'課程主題'),
  (9098,2,'課程回饋');

insert into public.elearning_activities (id,course_id,section_position,position,kind,title) values
  (293399,9408,1,1,'attendanceregister','出席統計'),
  (293395,9408,1,2,'url','第一段影片'),
  (293396,9408,1,3,'url','第二段影片'),
  (293397,9408,1,4,'url','第三段影片'),
  (293398,9408,1,5,'url','第四段影片'),
  (281284,9098,1,1,'url','退撫儲金說明會(含退休)-陳協勝主任簡報'),
  (281285,9098,1,2,'url','儲金會_新法宣導說明會-柳信泰講師簡報'),
  (281286,9098,1,3,'url','第一段影片'),
  (281287,9098,1,4,'url','第二段影片'),
  (281288,9098,1,5,'url','第三段影片'),
  (281289,9098,1,6,'url','第四段影片'),
  (281290,9098,1,7,'url','第五段影片'),
  (281291,9098,1,8,'url','第六段影片'),
  (281292,9098,1,9,'url','第七段影片'),
  (281293,9098,1,10,'url','第八段影片'),
  (281295,9098,1,11,'attendanceregister','出席統計'),
  (281294,9098,2,1,'url','課程回饋單');

create function public.elearning_course_outline(p_course_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  sections jsonb:='[]'::jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_course_id is null or p_course_id<=0 then
    raise exception 'Invalid remote-learning course' using errcode='22023';
  end if;
  if (select private.affairs_is_admin()) or exists(
    select 1 from public.elearning_course_access a where a.user_id=caller and a.course_id=p_course_id
  ) or exists(
    select 1 from public.elearning_enrollments e where e.user_id=caller and e.course_id=p_course_id
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'position',s.position,'title',s.title,'activities',
      (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind) order by a.position),'[]'::jsonb)
        from public.elearning_activities a where a.course_id=s.course_id and a.section_position=s.position)
    ) order by s.position),'[]'::jsonb) into sections
    from public.elearning_sections s where s.course_id=p_course_id;
  end if;
  return jsonb_build_object('userId',caller,'courseId',p_course_id,'sections',sections);
end;
$$;
revoke all on function public.elearning_course_outline(integer) from public,anon;
grant execute on function public.elearning_course_outline(integer) to authenticated;
