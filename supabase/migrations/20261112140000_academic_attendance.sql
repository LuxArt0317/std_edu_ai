-- DRAFT: independent literal StuOffclass statistics/detail records. No source data or inferred attendance/leave transitions.
create table public.affairs_academic_attendance_statistics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer not null check(academic_year between 1 and 9999),
  semester smallint not null check(semester between 1 and 3),
  course_code text not null check(char_length(btrim(course_code)) between 1 and 80),
  course_title text not null check(char_length(btrim(course_title)) between 1 and 160),
  student_number text check(student_number is null or char_length(student_number)<=80),
  student_name text check(student_name is null or char_length(student_name)<=160),
  total_teaching_hours numeric(6,2) check(total_teaching_hours is null or total_teaching_hours between 0 and 9999.99),
  current_teaching_weeks numeric(6,2) check(current_teaching_weeks is null or current_teaching_weeks between 0 and 9999.99),
  current_teaching_hours numeric(6,2) check(current_teaching_hours is null or current_teaching_hours between 0 and 9999.99),
  absence_hours numeric(6,2) check(absence_hours is null or absence_hours between 0 and 9999.99),
  unexcused_absence_hours numeric(6,2) check(unexcused_absence_hours is null or unexcused_absence_hours between 0 and 9999.99),
  row_order integer not null check(row_order between 0 and 999999),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,academic_year,semester,course_code)
);
comment on table public.affairs_academic_attendance_statistics is 'Explicit source-shaped statistics. Do not sum detail rows, interpret null as zero, calculate penalties, or infer changes from local leave status.';
create table public.affairs_academic_attendance_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer not null check(academic_year between 1 and 9999),
  semester smallint not null check(semester between 1 and 3),
  course_code text not null check(char_length(btrim(course_code)) between 1 and 80),
  course_title text not null check(char_length(btrim(course_title)) between 1 and 160),
  teacher_name text check(teacher_name is null or char_length(teacher_name)<=160),
  absence_type_text text check(absence_type_text is null or char_length(absence_type_text)<=80),
  course_date date check(course_date is null or course_date between date '0001-01-01' and date '9999-12-31'),
  period_text text check(period_text is null or char_length(period_text)<=80),
  roll_called_at timestamptz check(roll_called_at is null or isfinite(roll_called_at)),
  row_order integer not null check(row_order between 0 and 999999),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.affairs_academic_attendance_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  current_academic_year integer check(current_academic_year is null or current_academic_year between 1 and 9999),
  current_semester smallint check(current_semester is null or current_semester between 1 and 3),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id),
  check((current_academic_year is null)=(current_semester is null))
);
comment on table public.affairs_academic_attendance_metadata is 'Explicit account-specific current-term designation. Never infer it from the latest statistics/details or a system calendar.';
create index affairs_attendance_statistics_owner_idx on public.affairs_academic_attendance_statistics(user_id,academic_year desc,semester desc,row_order,id);
create index affairs_attendance_details_owner_idx on public.affairs_academic_attendance_details(user_id,academic_year desc,semester desc,row_order,id);
create table private.affairs_academic_attendance_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
do $$ declare t text;begin
  foreach t in array array['affairs_academic_attendance_statistics','affairs_academic_attendance_details','affairs_academic_attendance_metadata'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy academic_attendance_read on public.%I for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())))',t);
  end loop;
end;$$;
alter table private.affairs_academic_attendance_operations enable row level security;
revoke all on private.affairs_academic_attendance_operations from public,anon,authenticated;

create function private.affairs_attendance_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind
    when 'save_academic_attendance_statistic' then array['academic_year','semester','student_number','student_name','course_code','course_title','total_teaching_hours','current_teaching_weeks','current_teaching_hours','absence_hours','unexcused_absence_hours','row_order']
    when 'save_academic_attendance_detail' then array['academic_year','semester','course_code','course_title','teacher_name','absence_type_text','course_date','period_text','roll_called_at','row_order']
    when 'save_academic_attendance_metadata' then array['current_academic_year','current_semester']
    else null end;
$$;
create function private.affairs_attendance_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;maximum integer;stamp text;number numeric;
begin
  fields := private.affairs_attendance_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>8000 then return false;end if;
  fields := array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field in ('expected_version','academic_year','semester','row_order','current_academic_year','current_semester') then
      if field in ('current_academic_year','current_semester') and value->field='null'::jsonb then continue;end if;
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      number := (value->>field)::numeric;
      maximum := case when field='expected_version' then 999999999 when field='row_order' then 999999 when field in ('semester','current_semester') then 3 else 9999 end;
      if number<>trunc(number) or number<(case when field in ('expected_version','row_order') then 0 else 1 end) or number>maximum then return false;end if;
    elsif field in ('total_teaching_hours','current_teaching_weeks','current_teaching_hours','absence_hours','unexcused_absence_hours') then
      if value->field='null'::jsonb then continue;end if;
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      number := (value->>field)::numeric;
      if number<0 or number>9999.99 or number<>round(number,2) then return false;end if;
    elsif field in ('course_date','roll_called_at') then
      if value->field='null'::jsonb then continue;end if;
      if jsonb_typeof(value->field) is distinct from 'string' then return false;end if;
      stamp := value->>field;
      if field='course_date' then
        if stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
        perform stamp::date;
      else
        if stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' then return false;end if;
        perform stamp::timestamptz;
      end if;
    else
      maximum := case when field in ('student_name','course_title','teacher_name') then 160 else 80 end;
      if value->field='null'::jsonb then
        if field in ('course_code','course_title') then return false;end if;
        continue;
      end if;
      if jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>maximum then return false;end if;
      if field in ('course_code','course_title') and char_length(btrim(value->>field,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0 then return false;end if;
    end if;
  end loop;
  if p_kind='save_academic_attendance_metadata' and ((value->'current_academic_year'='null'::jsonb)<>(value->'current_semester'='null'::jsonb)) then return false;end if;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_attendance_fields(text),private.affairs_attendance_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_academic_attendance(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;target_table text;
  fields text[];columns_sql text;values_sql text;updates_sql text;before_row jsonb;after_row jsonb;result jsonb;
  receipt private.affairs_academic_attendance_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_attendance_payload_valid(p_kind,p_payload) then raise exception 'Invalid attendance operation or field' using errcode='22023';end if;
  target_table := case p_kind when 'save_academic_attendance_statistic' then 'affairs_academic_attendance_statistics'
    when 'save_academic_attendance_detail' then 'affairs_academic_attendance_details' else 'affairs_academic_attendance_metadata' end;
  record_id := (p_payload->>'id')::uuid;owner_id := (p_payload->>'user_id')::uuid;request_id_value := (p_payload->>'request_id')::uuid;expected := (p_payload->>'expected_version')::integer;
  perform 1 from public.affairs_profiles where user_id=actor for update;
  select * into receipt from private.affairs_academic_attendance_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academic-attendance:'||target_table||':'||record_id::text,0));
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',target_table) into before_row using record_id;
  if before_row is not null and (before_row->>'user_id')::uuid<>owner_id then raise exception 'Attendance records cannot be reassigned to another account' using errcode='42501';end if;
  if coalesce((before_row->>'version')::integer,0)<>expected then raise exception 'This attendance record changed. Refresh and try again.' using errcode='PT409';end if;
  fields := private.affairs_attendance_fields(p_kind);
  select string_agg(format('%I',name),',' order by ordinal),string_agg(format('r.%I',name),',' order by ordinal)
    into columns_sql,values_sql from unnest(array['id','user_id']||fields) with ordinality field(name,ordinal);
  select string_agg(format('%I=excluded.%I',name,name),',' order by ordinal)
    into updates_sql from unnest(fields) with ordinality field(name,ordinal);
  execute format('insert into public.%I as target (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict(id) do update set %s,version=target.version+1,updated_at=now() returning to_jsonb(target)',
    target_table,columns_sql,values_sql,target_table,updates_sql) into after_row using p_payload-array['request_id','expected_version'];
  result := jsonb_build_object('id',record_id,'kind',p_kind,'version',(after_row->>'version')::integer,'summary','Saved local demonstration attendance record.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,'Saved local demonstration attendance record.');
  insert into private.affairs_academic_attendance_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,result);
  return result;
exception when unique_violation then
  raise exception 'This account already has that attendance statistics or metadata record. Refresh and edit the existing record.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_academic_attendance(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_academic_attendance(text,jsonb) to authenticated;
