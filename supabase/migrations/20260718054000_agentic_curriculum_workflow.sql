create table public.curriculum_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  program_id uuid not null references public.academic_programs(id) on delete cascade,
  effective_year integer not null check (effective_year between 2000 and 2200),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 160),
  source_payload jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, effective_year)
);

create table public.curriculum_plan_courses (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.curriculum_plans(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  year_level smallint not null check (year_level between 1 and 8),
  semester smallint not null check (semester between 1 and 3),
  category text not null check (category in ('general_education','core','professional','elective','capstone','internship','physical_education','nstp')),
  sort_order smallint not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  unique(plan_id, course_id),
  unique(plan_id, year_level, semester, sort_order)
);

create table public.curriculum_course_prerequisites (
  plan_course_id uuid not null references public.curriculum_plan_courses(id) on delete cascade,
  prerequisite_course_id uuid not null references public.courses(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(plan_course_id, prerequisite_course_id),
  check (plan_course_id is not null)
);

create table public.curriculum_block_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.curriculum_plans(id) on delete cascade,
  year_level smallint not null check (year_level between 1 and 8),
  block_code text not null check (char_length(trim(block_code)) between 2 and 30),
  capacity integer not null default 40 check (capacity between 1 and 500),
  created_at timestamptz not null default now(),
  unique(plan_id, year_level, block_code)
);

create index curriculum_plans_program_idx on public.curriculum_plans(program_id, effective_year desc);
create index curriculum_plan_courses_plan_sequence_idx on public.curriculum_plan_courses(plan_id, year_level, semester, sort_order);
create index curriculum_plan_courses_course_idx on public.curriculum_plan_courses(course_id);
create index curriculum_prerequisites_course_idx on public.curriculum_course_prerequisites(prerequisite_course_id);
create index curriculum_blocks_plan_year_idx on public.curriculum_block_templates(plan_id, year_level, block_code);

alter table public.curriculum_plans enable row level security;
alter table public.curriculum_plan_courses enable row level security;
alter table public.curriculum_course_prerequisites enable row level security;
alter table public.curriculum_block_templates enable row level security;

grant select, insert, update, delete on public.curriculum_plans, public.curriculum_plan_courses,
  public.curriculum_course_prerequisites, public.curriculum_block_templates to authenticated;

create policy curriculum_plans_read on public.curriculum_plans for select to authenticated using (true);
create policy curriculum_plans_insert on public.curriculum_plans for insert to authenticated
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])) and created_by=(select auth.uid()));
create policy curriculum_plans_update on public.curriculum_plans for update to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])))
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_plans_delete on public.curriculum_plans for delete to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_courses_read on public.curriculum_plan_courses for select to authenticated using (true);
create policy curriculum_courses_insert on public.curriculum_plan_courses for insert to authenticated
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_courses_update on public.curriculum_plan_courses for update to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])))
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_courses_delete on public.curriculum_plan_courses for delete to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_prerequisites_read on public.curriculum_course_prerequisites for select to authenticated using (true);
create policy curriculum_prerequisites_insert on public.curriculum_course_prerequisites for insert to authenticated
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_prerequisites_update on public.curriculum_course_prerequisites for update to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])))
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_prerequisites_delete on public.curriculum_course_prerequisites for delete to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_blocks_read on public.curriculum_block_templates for select to authenticated using (true);
create policy curriculum_blocks_insert on public.curriculum_block_templates for insert to authenticated
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_blocks_update on public.curriculum_block_templates for update to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])))
  with check ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));
create policy curriculum_blocks_delete on public.curriculum_block_templates for delete to authenticated
  using ((select private.has_role(array['owner','admin','dean','registrar','department_head'])));

create or replace function public.create_academic_curriculum(
  p_department_id uuid,
  p_idempotency_key text,
  p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_program public.academic_programs;
  v_plan public.curriculum_plans;
  v_subject jsonb;
  v_block jsonb;
  v_prerequisite text;
  v_course public.courses;
  v_plan_course public.curriculum_plan_courses;
  v_prerequisite_plan_course public.curriculum_plan_courses;
  v_subject_count integer;
  v_block_count integer;
  v_prerequisite_count integer := 0;
  v_codes text[] := '{}';
begin
  if auth.uid() is null or not (select private.has_role(array['owner','admin','dean','registrar','department_head'])) then
    raise exception 'Not authorized to create an academic curriculum' using errcode='42501';
  end if;
  if not exists(select 1 from public.departments where id=p_department_id and status='active') then
    raise exception 'Select an active department before creating the curriculum';
  end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then
    raise exception 'A valid curriculum request key is required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Curriculum payload must be an object'; end if;
  v_subject_count := jsonb_array_length(coalesce(p_payload->'subjects','[]'::jsonb));
  v_block_count := jsonb_array_length(coalesce(p_payload->'blocks','[]'::jsonb));
  if v_subject_count not between 8 and 120 then raise exception 'A curriculum must contain between 8 and 120 subjects'; end if;
  if v_block_count not between 1 and 32 then raise exception 'A curriculum must contain between 1 and 32 block templates'; end if;
  if (p_payload->>'durationYears')::integer not between 1 and 8 then raise exception 'Duration must be between one and eight years'; end if;
  if (
    select count(distinct (value->>'yearLevel')::integer)
    from jsonb_array_elements(p_payload->'blocks')
    where (value->>'yearLevel')::integer between 1 and (p_payload->>'durationYears')::integer
  ) <> (p_payload->>'durationYears')::integer then
    raise exception 'Block templates must cover every curriculum year exactly within the program duration';
  end if;

  select * into v_plan from public.curriculum_plans where idempotency_key=trim(p_idempotency_key);
  if v_plan.id is not null then
    return jsonb_build_object('status','reused','planId',v_plan.id,'programId',v_plan.program_id,
      'subjects', (select count(*) from public.curriculum_plan_courses where plan_id=v_plan.id),
      'blocks', (select count(*) from public.curriculum_block_templates where plan_id=v_plan.id),
      'prerequisites', (select count(*) from public.curriculum_course_prerequisites cp join public.curriculum_plan_courses pc on pc.id=cp.plan_course_id where pc.plan_id=v_plan.id));
  end if;

  select * into v_program from public.academic_programs where upper(code)=upper(trim(p_payload->>'programCode')) for update;
  if v_program.id is null then
    insert into public.academic_programs(department_id,code,name,level,duration_years,description,status)
    values(p_department_id,upper(trim(p_payload->>'programCode')),trim(p_payload->>'programName'),'bachelor',
      (p_payload->>'durationYears')::numeric,trim(coalesce(p_payload->>'description','')),'active') returning * into v_program;
  elsif v_program.department_id <> p_department_id then
    raise exception 'Program code % already belongs to another department', v_program.code;
  end if;

  if exists(select 1 from public.curriculum_plans where program_id=v_program.id and effective_year=(p_payload->>'effectiveYear')::integer) then
    raise exception 'A curriculum already exists for program % and effective year %',v_program.code,p_payload->>'effectiveYear';
  end if;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    if trim(coalesce(v_subject->>'code',''))='' or trim(coalesce(v_subject->>'title',''))='' then raise exception 'Every subject requires a code and title'; end if;
    if (v_subject->>'yearLevel')::integer not between 1 and (p_payload->>'durationYears')::integer then raise exception 'Invalid year level for %',v_subject->>'code'; end if;
    if (v_subject->>'semester')::integer not between 1 and 3 then raise exception 'Invalid semester for %',v_subject->>'code'; end if;
    if (v_subject->>'units')::numeric <= 0 or (v_subject->>'units')::numeric > 12 then raise exception 'Invalid units for %',v_subject->>'code'; end if;
    if upper(trim(v_subject->>'code'))=any(v_codes) then raise exception 'Duplicate subject code %',v_subject->>'code'; end if;
    v_codes := array_append(v_codes,upper(trim(v_subject->>'code')));
  end loop;

  insert into public.curriculum_plans(program_id,effective_year,status,idempotency_key,source_payload,created_by)
  values(v_program.id,(p_payload->>'effectiveYear')::integer,'draft',trim(p_idempotency_key),p_payload,auth.uid()) returning * into v_plan;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    select * into v_course from public.courses where upper(code)=upper(trim(v_subject->>'code')) for update;
    if v_course.id is null then
      insert into public.courses(department_id,program_id,code,title,description,credits,status)
      values(p_department_id,v_program.id,upper(trim(v_subject->>'code')),trim(v_subject->>'title'),
        trim(coalesce(v_subject->>'description','')),(v_subject->>'units')::numeric,'active') returning * into v_course;
    elsif v_course.program_id is distinct from v_program.id then
      raise exception 'Subject code % already belongs to another program',v_course.code;
    end if;
    insert into public.curriculum_plan_courses(plan_id,course_id,year_level,semester,category,sort_order)
    values(v_plan.id,v_course.id,(v_subject->>'yearLevel')::smallint,(v_subject->>'semester')::smallint,
      v_subject->>'category',(v_subject->>'sortOrder')::smallint) returning * into v_plan_course;
  end loop;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    select pc.* into v_plan_course from public.curriculum_plan_courses pc join public.courses c on c.id=pc.course_id
      where pc.plan_id=v_plan.id and upper(c.code)=upper(trim(v_subject->>'code'));
    for v_prerequisite in select value #>> '{}' from jsonb_array_elements(coalesce(v_subject->'prerequisiteCodes','[]'::jsonb)) loop
      select * into v_course from public.courses where program_id=v_program.id and upper(code)=upper(trim(v_prerequisite));
      if v_course.id is null then raise exception 'Prerequisite % for % is not in this curriculum',v_prerequisite,v_subject->>'code'; end if;
      if v_course.id=v_plan_course.course_id then raise exception 'A subject cannot require itself'; end if;
      select * into v_prerequisite_plan_course from public.curriculum_plan_courses where plan_id=v_plan.id and course_id=v_course.id;
      if (v_prerequisite_plan_course.year_level, v_prerequisite_plan_course.semester, v_prerequisite_plan_course.sort_order)
        >= (v_plan_course.year_level, v_plan_course.semester, v_plan_course.sort_order) then
        raise exception 'Prerequisite % must appear before %',v_prerequisite,v_subject->>'code';
      end if;
      insert into public.curriculum_course_prerequisites(plan_course_id,prerequisite_course_id) values(v_plan_course.id,v_course.id);
      v_prerequisite_count := v_prerequisite_count + 1;
    end loop;
  end loop;

  for v_block in select value from jsonb_array_elements(p_payload->'blocks') loop
    if nullif(trim(v_block->>'blockCode'),'') is null then
      raise exception 'Every block template requires a block code';
    end if;
    insert into public.curriculum_block_templates(plan_id,year_level,block_code,capacity)
    values(v_plan.id,(v_block->>'yearLevel')::smallint,upper(trim(v_block->>'blockCode')),(v_block->>'capacity')::integer);
  end loop;

  return jsonb_build_object('status','created','planId',v_plan.id,'programId',v_program.id,
    'subjects',v_subject_count,'blocks',v_block_count,'prerequisites',v_prerequisite_count);
end;
$$;

revoke all on function public.create_academic_curriculum(uuid,text,jsonb) from public, anon;
grant execute on function public.create_academic_curriculum(uuid,text,jsonb) to authenticated;
