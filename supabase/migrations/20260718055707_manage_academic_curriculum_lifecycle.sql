create or replace function public.update_academic_curriculum(
  p_plan_id uuid,
  p_status text,
  p_payload jsonb,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_plan public.curriculum_plans;
  v_program public.academic_programs;
  v_before jsonb;
  v_subject jsonb;
  v_block jsonb;
  v_prerequisite text;
  v_course public.courses;
  v_plan_course public.curriculum_plan_courses;
  v_prerequisite_course public.courses;
  v_prerequisite_mapping public.curriculum_plan_courses;
  v_codes text[] := '{}';
  v_subject_count integer;
  v_block_count integer;
  v_prerequisite_count integer := 0;
  v_duration integer;
begin
  if auth.uid() is null or not (select private.has_role(array['owner','admin','dean','registrar','department_head'])) then
    raise exception 'Not authorized to manage an academic curriculum' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then
    raise exception 'A curriculum change reason of at least 12 characters is required';
  end if;
  if p_status not in ('draft','approved','retired') then raise exception 'Invalid curriculum status'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Curriculum payload must be an object'; end if;

  select * into v_plan from public.curriculum_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception 'Curriculum plan was not found'; end if;
  select * into v_program from public.academic_programs where id=v_plan.program_id;
  v_before := jsonb_build_object('plan',to_jsonb(v_plan),'courses',(select coalesce(jsonb_agg(to_jsonb(pc) order by pc.year_level,pc.semester,pc.sort_order),'[]'::jsonb) from public.curriculum_plan_courses pc where pc.plan_id=p_plan_id),'blocks',(select coalesce(jsonb_agg(to_jsonb(bt) order by bt.year_level,bt.block_code),'[]'::jsonb) from public.curriculum_block_templates bt where bt.plan_id=p_plan_id));

  if v_plan.status='retired' then raise exception 'A retired curriculum is immutable; duplicate it as a new version'; end if;
  if v_plan.status='approved' and p_status <> 'retired' then raise exception 'An approved curriculum can only be retired; duplicate it to make academic changes'; end if;
  if v_plan.status='approved' and p_payload is distinct from v_plan.source_payload then raise exception 'Approved curriculum content is immutable'; end if;

  v_duration := (p_payload->>'durationYears')::integer;
  v_subject_count := jsonb_array_length(coalesce(p_payload->'subjects','[]'::jsonb));
  v_block_count := jsonb_array_length(coalesce(p_payload->'blocks','[]'::jsonb));
  if trim(coalesce(p_payload->>'programCode','')) <> v_program.code then raise exception 'Curriculum program code cannot be changed'; end if;
  if (p_payload->>'effectiveYear')::integer not between 2000 and 2200 then raise exception 'Effective year is invalid'; end if;
  if v_duration not between 1 and 8 then raise exception 'Duration must be between one and eight years'; end if;
  if v_subject_count not between 1 and 120 then raise exception 'A curriculum must contain between 1 and 120 subjects'; end if;
  if v_block_count not between 1 and 32 then raise exception 'A curriculum must contain between 1 and 32 block templates'; end if;
  if exists(select 1 from public.curriculum_plans where program_id=v_plan.program_id and effective_year=(p_payload->>'effectiveYear')::integer and id<>p_plan_id) then raise exception 'That program already has a curriculum for the effective year'; end if;
  if (select count(distinct (value->>'yearLevel')::integer) from jsonb_array_elements(p_payload->'blocks') where (value->>'yearLevel')::integer between 1 and v_duration) <> v_duration then raise exception 'Block templates must cover every curriculum year'; end if;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    if trim(coalesce(v_subject->>'code',''))='' or trim(coalesce(v_subject->>'title',''))='' then raise exception 'Every subject requires a code and title'; end if;
    if (v_subject->>'yearLevel')::integer not between 1 and v_duration then raise exception 'Invalid year level for %',v_subject->>'code'; end if;
    if (v_subject->>'semester')::integer not between 1 and 3 then raise exception 'Invalid semester for %',v_subject->>'code'; end if;
    if (v_subject->>'units')::numeric <= 0 or (v_subject->>'units')::numeric > 12 then raise exception 'Invalid units for %',v_subject->>'code'; end if;
    if v_subject->>'category' not in ('general_education','core','professional','elective','capstone','internship','physical_education','nstp') then raise exception 'Invalid category for %',v_subject->>'code'; end if;
    if upper(trim(v_subject->>'code'))=any(v_codes) then raise exception 'Duplicate subject code %',v_subject->>'code'; end if;
    v_codes := array_append(v_codes,upper(trim(v_subject->>'code')));
  end loop;

  delete from public.curriculum_plan_courses where plan_id=p_plan_id;
  delete from public.curriculum_block_templates where plan_id=p_plan_id;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    select * into v_course from public.courses where upper(code)=upper(trim(v_subject->>'code')) for update;
    if v_course.id is null then
      insert into public.courses(department_id,program_id,code,title,description,credits,status)
      values(v_program.department_id,v_program.id,upper(trim(v_subject->>'code')),trim(v_subject->>'title'),trim(coalesce(v_subject->>'description','')),(v_subject->>'units')::numeric,'active') returning * into v_course;
    elsif v_course.program_id is distinct from v_program.id then
      raise exception 'Subject code % belongs to another program',v_course.code;
    else
      update public.courses set title=trim(v_subject->>'title'),description=trim(coalesce(v_subject->>'description','')),credits=(v_subject->>'units')::numeric,updated_at=now() where id=v_course.id returning * into v_course;
    end if;
    insert into public.curriculum_plan_courses(plan_id,course_id,year_level,semester,category,sort_order)
    values(p_plan_id,v_course.id,(v_subject->>'yearLevel')::smallint,(v_subject->>'semester')::smallint,v_subject->>'category',(v_subject->>'sortOrder')::smallint);
  end loop;

  for v_subject in select value from jsonb_array_elements(p_payload->'subjects') loop
    select pc.* into v_plan_course from public.curriculum_plan_courses pc join public.courses c on c.id=pc.course_id where pc.plan_id=p_plan_id and upper(c.code)=upper(trim(v_subject->>'code'));
    for v_prerequisite in select value #>> '{}' from jsonb_array_elements(coalesce(v_subject->'prerequisiteCodes','[]'::jsonb)) loop
      select * into v_prerequisite_course from public.courses where program_id=v_program.id and upper(code)=upper(trim(v_prerequisite));
      if v_prerequisite_course.id is null then raise exception 'Prerequisite % for % is not in this curriculum',v_prerequisite,v_subject->>'code'; end if;
      if v_prerequisite_course.id=v_plan_course.course_id then raise exception 'A subject cannot require itself'; end if;
      select * into v_prerequisite_mapping from public.curriculum_plan_courses where plan_id=p_plan_id and course_id=v_prerequisite_course.id;
      if (v_prerequisite_mapping.year_level,v_prerequisite_mapping.semester,v_prerequisite_mapping.sort_order) >= (v_plan_course.year_level,v_plan_course.semester,v_plan_course.sort_order) then raise exception 'Prerequisite % must appear before %',v_prerequisite,v_subject->>'code'; end if;
      insert into public.curriculum_course_prerequisites(plan_course_id,prerequisite_course_id) values(v_plan_course.id,v_prerequisite_course.id);
      v_prerequisite_count := v_prerequisite_count+1;
    end loop;
  end loop;

  for v_block in select value from jsonb_array_elements(p_payload->'blocks') loop
    if (v_block->>'yearLevel')::integer not between 1 and v_duration or nullif(trim(v_block->>'blockCode'),'') is null or (v_block->>'capacity')::integer not between 1 and 500 then raise exception 'Every block requires a valid year, code, and capacity'; end if;
    insert into public.curriculum_block_templates(plan_id,year_level,block_code,capacity) values(p_plan_id,(v_block->>'yearLevel')::smallint,upper(trim(v_block->>'blockCode')),(v_block->>'capacity')::integer);
  end loop;

  update public.curriculum_plans set effective_year=(p_payload->>'effectiveYear')::integer,status=p_status,source_payload=p_payload,updated_at=now() where id=p_plan_id returning * into v_plan;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state)
  values('update_academic_curriculum','curriculum_plan',p_plan_id,auth.uid(),trim(p_reason),v_before,jsonb_build_object('plan',to_jsonb(v_plan),'subjects',v_subject_count,'blocks',v_block_count,'prerequisites',v_prerequisite_count));
  return jsonb_build_object('status','updated','planId',p_plan_id,'programId',v_plan.program_id,'subjects',v_subject_count,'blocks',v_block_count,'prerequisites',v_prerequisite_count);
end;
$$;

revoke all on function public.update_academic_curriculum(uuid,text,jsonb,text) from public, anon;
grant execute on function public.update_academic_curriculum(uuid,text,jsonb,text) to authenticated;
