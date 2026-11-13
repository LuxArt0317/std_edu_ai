-- Local 12-3 search. NULL metadata is unknown; no official data or inferred term backfill.
alter table public.affairs_course_offerings
  add column syllabus_is_current boolean,
  add column academic_year_text text check (char_length(academic_year_text)<=30),
  add column semester_text text check (char_length(semester_text)<=30);
create index affairs_syllabus_published_order on public.affairs_course_offerings(course_code collate "C",id) where published;
create index affairs_syllabus_current_order on public.affairs_course_offerings(course_code collate "C",id) where published and syllabus_is_current is true;

create function private.affairs_syllabus_filters_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' or not (value ?& array['scope','keyword','term','department','themes'])
    or (value-array['scope','keyword','term','department','themes'])<>'{}'::jsonb then return false; end if;
  if jsonb_typeof(value->'scope') is distinct from 'string' or value->>'scope' not in ('current','historical')
    or jsonb_typeof(value->'keyword') is distinct from 'string' or char_length(value->>'keyword')>160
    or jsonb_typeof(value->'term') is distinct from 'string' or char_length(value->>'term')>12
    or jsonb_typeof(value->'department') is distinct from 'string' or char_length(value->>'department')>16
    or jsonb_typeof(value->'themes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value->'themes')>26 then return false; end if;
  for item in select jsonb_array_elements(value->'themes') loop
    if jsonb_typeof(item) is distinct from 'number' or item::text !~ '^[0-9]+$' then return false; end if;
    if item::numeric<1 or item::numeric>26 then return false; end if;
  end loop;
  return true;
end; $$;
revoke all on function private.affairs_syllabus_filters_valid(jsonb) from public,anon;
grant execute on function private.affairs_syllabus_filters_valid(jsonb) to authenticated;

create function public.affairs_syllabus_search(p_filters jsonb,p_page integer default 0,p_page_size integer default 100,p_sort text default 'course_code',p_direction text default 'asc') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_order text;v_result jsonb;
begin
  if not (select private.affairs_google_identity()) then raise exception 'Verified Google account required' using errcode='42501'; end if;
  if not private.affairs_syllabus_filters_valid(p_filters) or p_page is null or p_page<0 or p_page>10000
    or p_page_size is null or p_page_size<1 or p_page_size>100 or p_sort is null
    or p_sort not in ('sequence','course_code','course_name','academicYearText','semesterText','admission_name','instructor')
    or p_direction is null or p_direction not in ('asc','desc') then raise exception 'Invalid syllabus query' using errcode='22023'; end if;
  -- Only the allowlisted identifier/direction enters SQL syntax. All filters remain parameters.
  v_order:=pg_catalog.format('%I%s %s nulls last,course_code collate "C",id',p_sort,case when p_sort='sequence' then '' else ' collate "C"' end,p_direction);
  execute pg_catalog.format($query$
    with filtered as materialized (
      select id,version,row_number() over(order by course_code collate "C",id) as sequence,
        course_code,course_name,admission_name,instructor,academic_year_text as "academicYearText",semester_text as "semesterText"
      from public.affairs_course_offerings c
      where c.published is true and ($1->>'scope'='historical' or c.syllabus_is_current is true)
        and ($1->>'term'='' or c.term_code=$1->>'term')
        and ($1->>'department'='' or c.department_code=$1->>'department')
        and ($1->>'keyword'='' or position(lower($1->>'keyword') in lower(c.course_code||' '||c.course_name||' '||c.english_name))>0)
        and (jsonb_array_length($1->'themes')=0 or exists(
          select 1 from jsonb_array_elements($1->'themes') chosen where coalesce(c.syllabus->'meanings','[]'::jsonb) @> jsonb_build_array(chosen.value)))
    ), page_rows as (select id,sequence,course_code,course_name,admission_name,instructor,"academicYearText","semesterText" from filtered order by %s limit $2 offset $3),
    counted as (select count(*) as total,md5(coalesce(string_agg(id::text||':'||version::text,',' order by id),'')) as revision from filtered)
    select jsonb_build_object('scope',$1->>'scope','total',counted.total,
      'rows',coalesce((select jsonb_agg(to_jsonb(page_rows) order by %s) from page_rows),'[]'::jsonb),
      'page',$4,'pageSize',$2,'hasMore',$3+(select count(*) from page_rows)<counted.total,'revision',counted.revision,
      'sort',jsonb_build_object('key',$5,'direction',$6)) from counted
  $query$,v_order,v_order) into v_result using p_filters,p_page_size,p_page*p_page_size,p_page,p_sort,p_direction;
  return v_result;
end; $$;
revoke all on function public.affairs_syllabus_search(jsonb,integer,integer,text,text) from public,anon;
grant execute on function public.affairs_syllabus_search(jsonb,integer,integer,text,text) to authenticated;

create function public.affairs_syllabus_options() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_terms jsonb;v_departments jsonb;
begin
  if not (select private.affairs_google_identity()) then raise exception 'Verified Google account required' using errcode='42501'; end if;
  -- A conflicting label is a local data error, never silently resolved using an arbitrary row.
  if exists(select 1 from public.affairs_course_offerings where published group by term_code having count(distinct term_label)>1)
    or exists(select 1 from public.affairs_course_offerings where published group by department_code having count(distinct department_name)>1)
    then raise exception 'Published syllabus option labels conflict' using errcode='PT409'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('value',term_code,'label',term_label) order by term_code collate "C"),'[]'::jsonb) into v_terms
    from (select distinct term_code,term_label from public.affairs_course_offerings where published order by term_code limit 1001) choices;
  select coalesce(jsonb_agg(jsonb_build_object('value',department_code,'label',department_name) order by department_code collate "C"),'[]'::jsonb) into v_departments
    from (select distinct department_code,department_name from public.affairs_course_offerings where published order by department_code limit 1001) choices;
  if jsonb_array_length(v_terms)>1000 or jsonb_array_length(v_departments)>1000 then raise exception 'Too many published syllabus options' using errcode='54000'; end if;
  return jsonb_build_object('terms',v_terms,'departments',v_departments);
end; $$;
revoke all on function public.affairs_syllabus_options() from public,anon;
grant execute on function public.affairs_syllabus_options() to authenticated;

create function public.affairs_syllabus_detail(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_row jsonb;
begin
  if not (select private.affairs_google_identity()) then raise exception 'Verified Google account required' using errcode='42501'; end if;
  if p_id is null then raise exception 'Course ID required' using errcode='22023'; end if;
  -- Explicit projection prevents future table columns from being silently exposed.
  select to_jsonb(detail) into v_row from (
    select id,term_code,term_label,department_code,department_name,classification_code,classification_name,
      admission_code,admission_name,course_code,course_name,english_name,module,instructor,instructor2,room1,room2,
      grade,open_grades,prerequisite,course_nature,reserved_departments,description,credits,capacity,enrolled_count,
      selected_count,audit_capacity,audit_count,lecture_hours,practice_hours,summer_weeks,published,shared_teaching,
      open_other_departments,cross_admission,required,e_course,english_taught,foreign_language,immersion,graduating_course,
      meetings,program_codes,syllabus,source_mode,version
    from public.affairs_course_offerings where id=p_id and published is true
  ) detail;
  return jsonb_build_object('row',v_row);
end; $$;
revoke all on function public.affairs_syllabus_detail(uuid) from public,anon;
grant execute on function public.affairs_syllabus_detail(uuid) to authenticated;

create function private.affairs_syllabus_metadata_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare key text;
begin
  if jsonb_typeof(value) is distinct from 'object' or not (value ?& array['id','request_id','expected_version','syllabus_is_current','academic_year_text','semester_text'])
    or (value-array['id','request_id','expected_version','syllabus_is_current','academic_year_text','semester_text'])<>'{}'::jsonb then return false; end if;
  foreach key in array array['id','request_id'] loop
    if jsonb_typeof(value->key) is distinct from 'string' or value->>key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  if jsonb_typeof(value->'expected_version') is distinct from 'number' or (value->>'expected_version') !~ '^[0-9]+$' then return false; end if;
  if (value->>'expected_version')::numeric<1 or (value->>'expected_version')::numeric>999999998 then return false; end if;
  if jsonb_typeof(value->'syllabus_is_current') not in ('boolean','null') then return false; end if;
  foreach key in array array['academic_year_text','semester_text'] loop
    if jsonb_typeof(value->key) not in ('string','null') or char_length(value->>key)>30 then return false; end if;
  end loop;
  return true;
end; $$;
revoke all on function private.affairs_syllabus_metadata_valid(jsonb) from public,anon;
grant execute on function private.affairs_syllabus_metadata_valid(jsonb) to authenticated;

create function public.affairs_syllabus_metadata_manage(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_id uuid;v_request uuid;v_expected integer;v_existing public.affairs_course_offerings;
  v_receipt private.affairs_catalog_operations;v_result jsonb;v_kind constant text:='save_syllabus_search_metadata';
  v_summary constant text:='Saved local syllabus search metadata.';
begin
  if not (select private.affairs_google_identity()) or not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if not private.affairs_syllabus_metadata_valid(p_payload) then raise exception 'Invalid syllabus metadata' using errcode='22023'; end if;
  perform 1 from public.affairs_profiles where user_id=v_uid for update;
  if not found then raise exception 'School Affairs profile required' using errcode='42501'; end if;
  v_id:=(p_payload->>'id')::uuid;v_request:=(p_payload->>'request_id')::uuid;v_expected:=(p_payload->>'expected_version')::integer;
  select * into v_receipt from private.affairs_catalog_operations where user_id=v_uid and request_id=v_request;
  if found then
    if v_receipt.kind<>v_kind or v_receipt.payload<>p_payload then raise exception 'Request already used' using errcode='PT409'; end if;
    return v_receipt.result;
  end if;
  -- Share the offering lock and version with the existing full catalog editor/delete operation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course-offering:'||v_id::text,0));
  select * into v_existing from public.affairs_course_offerings where id=v_id for update;
  if not found or v_existing.version<>v_expected then raise exception 'Offering changed; refresh' using errcode='PT409'; end if;
  update public.affairs_course_offerings set syllabus_is_current=(p_payload->>'syllabus_is_current')::boolean,
    academic_year_text=p_payload->>'academic_year_text',semester_text=p_payload->>'semester_text',version=v_expected+1,updated_at=now() where id=v_id;
  v_result:=jsonb_build_object('id',v_id,'kind',v_kind,'version',v_expected+1,'summary',v_summary);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,v_kind,v_id,v_summary);
  insert into private.affairs_catalog_operations(user_id,request_id,kind,payload,result) values(v_uid,v_request,v_kind,p_payload,v_result);
  return v_result;
end; $$;
revoke all on function public.affairs_syllabus_metadata_manage(jsonb) from public,anon;
grant execute on function public.affairs_syllabus_metadata_manage(jsonb) to authenticated;
