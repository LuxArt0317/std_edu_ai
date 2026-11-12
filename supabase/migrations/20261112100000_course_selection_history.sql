-- Local administrator-maintained phase snapshots for the observed 11-1/11-2
-- read-only queries. Do not backfill selection phases from enrollment/grade data.
create function private.affairs_course_selection_meetings_valid(p_meetings jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare v_slot jsonb; v_seen text[] := '{}'; v_key text;
begin
  if jsonb_typeof(p_meetings) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_meetings)>98 then return false; end if;
  for v_slot in select value from jsonb_array_elements(p_meetings) loop
    if jsonb_typeof(v_slot) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(v_slot) as field(name) where field.name not in ('weekday','period','room'))
      or jsonb_typeof(v_slot->'weekday') is distinct from 'number'
      or coalesce(v_slot->>'weekday','') !~ '^[1-7]$'
      or jsonb_typeof(v_slot->'period') is distinct from 'string'
      or coalesce(v_slot->>'period','') not in ('1','2','3','4','午','5','6','7','8','傍','A','B','C','D')
      or jsonb_typeof(v_slot->'room') is distinct from 'string'
      or char_length(v_slot->>'room')>80 then return false; end if;
    v_key := (v_slot->>'weekday')||':'||(v_slot->>'period');
    if v_key=any(v_seen) then return false; end if;
    v_seen := array_append(v_seen,v_key);
  end loop;
  return true;
end;
$$;
revoke all on function private.affairs_course_selection_meetings_valid(jsonb) from public,anon;
grant execute on function private.affairs_course_selection_meetings_valid(jsonb) to authenticated;

create table public.affairs_course_selection_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer not null check (academic_year between 1 and 9999),
  semester smallint not null check (semester between 1 and 3),
  selection_phase text not null check (selection_phase in ('initial','add_drop','withdrawal','summer1')),
  term_course_code text not null check (char_length(btrim(term_course_code)) between 1 and 80),
  course_title text not null check (char_length(btrim(course_title)) between 1 and 160),
  required_elective_text text check (required_elective_text is null or char_length(btrim(required_elective_text)) between 1 and 30),
  credits numeric(5,2) not null check (credits between 0 and 999.99),
  instructor_one text check (instructor_one is null or char_length(btrim(instructor_one)) between 1 and 160),
  remark_text text check (remark_text is null or char_length(btrim(remark_text)) between 1 and 300),
  row_order integer not null check (row_order between 0 and 999999),
  timetable_included boolean not null,
  meetings jsonb not null default '[]'::jsonb check (private.affairs_course_selection_meetings_valid(meetings)),
  source_mode text not null default 'local_demo' check (source_mode='local_demo'),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.affairs_course_selection_records.timetable_included is
  'Explicit local timetable membership, independent of displayed Y/Y(W)/A remarks. Empty meetings on an included row mean unscheduled.';
comment on column public.affairs_course_selection_records.selection_phase is
  'Observed source query phase: initial=初選, add_drop=加退選, withdrawal=棄選, summer1=暑一. Not an enrollment or grade status.';
create index affairs_course_selection_owner_idx on public.affairs_course_selection_records
  (user_id,academic_year desc,semester desc,selection_phase,row_order,id);
create table private.affairs_course_selection_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.affairs_course_selection_records enable row level security;
alter table private.affairs_course_selection_operations enable row level security;
revoke all on public.affairs_course_selection_records,private.affairs_course_selection_operations from public,anon,authenticated;
grant select on public.affairs_course_selection_records to authenticated;
create policy course_selection_read on public.affairs_course_selection_records for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_manage_course_selection(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid; v_owner uuid; v_request uuid; v_expected integer; v_meetings jsonb;
  v_record public.affairs_course_selection_records;
  v_receipt private.affairs_course_selection_operations;
  v_result jsonb;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind is distinct from 'save_course_selection' or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>10000 then
    raise exception 'Invalid course-selection operation' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as field(name) where field.name not in (
    'id','user_id','request_id','expected_version','academic_year','semester','selection_phase','term_course_code',
    'course_title','required_elective_text','credits','instructor_one','remark_text','row_order','timetable_included','meetings'
  )) then raise exception 'Unsupported course-selection field' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_payload) as field(name,value) where
    (field.name in ('id','user_id','request_id','selection_phase','term_course_code','course_title') and jsonb_typeof(field.value)<>'string') or
    (field.name in ('expected_version','academic_year','semester','credits','row_order') and jsonb_typeof(field.value) not in ('string','number')) or
    (field.name in ('required_elective_text','instructor_one','remark_text') and jsonb_typeof(field.value) not in ('string','null'))
  ) then raise exception 'Invalid course-selection field type' using errcode='22023'; end if;
  if exists(select 1 from unnest(array['id','user_id','request_id']) as field(name)
    where coalesce(p_payload->>field.name,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or coalesce(p_payload->>'expected_version','') !~ '^(0|[1-9][0-9]{0,8})$'
    or coalesce(p_payload->>'academic_year','') !~ '^[1-9][0-9]{0,3}$'
    or coalesce(p_payload->>'semester','') !~ '^[123]$'
    or coalesce(p_payload->>'selection_phase','') not in ('initial','add_drop','withdrawal','summer1')
    or coalesce(p_payload->>'credits','') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
    or coalesce(p_payload->>'row_order','') !~ '^(0|[1-9][0-9]{0,5})$'
    or char_length(btrim(coalesce(p_payload->>'term_course_code',''))) not between 1 and 80
    or char_length(btrim(coalesce(p_payload->>'course_title',''))) not between 1 and 160
    or char_length(coalesce(p_payload->>'required_elective_text',''))>30
    or char_length(coalesce(p_payload->>'instructor_one',''))>160
    or char_length(coalesce(p_payload->>'remark_text',''))>300
    or jsonb_typeof(p_payload->'timetable_included') is distinct from 'boolean'
    or not private.affairs_course_selection_meetings_valid(p_payload->'meetings') then
    raise exception 'Invalid course-selection value or meeting slot' using errcode='22023';
  end if;
  v_id := (p_payload->>'id')::uuid; v_owner := (p_payload->>'user_id')::uuid;
  v_request := (p_payload->>'request_id')::uuid; v_expected := (p_payload->>'expected_version')::integer;
  -- Keep receipt lookup and changes serialized, including retries after later edits.
  perform 1 from public.affairs_profiles where user_id=v_actor for update;
  select * into v_receipt from private.affairs_course_selection_operations where user_id=v_actor and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then
      raise exception 'Request ID was already used for another operation' using errcode='PT409';
    end if;
    return v_receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=v_owner) then
    raise exception 'Student account unavailable' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course-selection:'||v_id::text,0));
  select * into v_record from public.affairs_course_selection_records where id=v_id for update;
  if v_record.id is not null and v_record.user_id<>v_owner then
    raise exception 'Course selection cannot be reassigned to another account' using errcode='42501';
  end if;
  if coalesce(v_record.version,0)<>v_expected then
    raise exception 'This course selection changed. Refresh and try again.' using errcode='PT409';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('weekday',(slot->>'weekday')::integer,'period',slot->>'period','room',btrim(slot->>'room')) order by ordinal),'[]'::jsonb)
    into v_meetings from jsonb_array_elements(p_payload->'meetings') with ordinality as slots(slot,ordinal);
  insert into public.affairs_course_selection_records(id,user_id,academic_year,semester,selection_phase,term_course_code,course_title,
    required_elective_text,credits,instructor_one,remark_text,row_order,timetable_included,meetings)
    values(v_id,v_owner,(p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint,p_payload->>'selection_phase',
      btrim(p_payload->>'term_course_code'),btrim(p_payload->>'course_title'),nullif(btrim(p_payload->>'required_elective_text'),''),
      (p_payload->>'credits')::numeric,nullif(btrim(p_payload->>'instructor_one'),''),nullif(btrim(p_payload->>'remark_text'),''),
      (p_payload->>'row_order')::integer,(p_payload->>'timetable_included')::boolean,v_meetings)
    on conflict(id) do update set academic_year=excluded.academic_year,semester=excluded.semester,selection_phase=excluded.selection_phase,
      term_course_code=excluded.term_course_code,course_title=excluded.course_title,required_elective_text=excluded.required_elective_text,
      credits=excluded.credits,instructor_one=excluded.instructor_one,remark_text=excluded.remark_text,row_order=excluded.row_order,
      timetable_included=excluded.timetable_included,meetings=excluded.meetings,version=affairs_course_selection_records.version+1,updated_at=now()
    returning * into v_record;
  v_result := jsonb_build_object('id',v_record.id,'kind',p_kind,'version',v_record.version,'summary','Saved local demonstration course selection.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
    values(v_actor,p_kind,v_record.id,'Saved local demonstration course selection.');
  insert into private.affairs_course_selection_operations(user_id,request_id,kind,payload,result)
    values(v_actor,v_request,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_manage_course_selection(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_course_selection(text,jsonb) to authenticated;
