-- Local withdrawal uses the existing explicit withdrawal-phase course rows.
create table public.affairs_course_withdrawal_windows (
  academic_year smallint not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1, 2)),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  version integer not null check (version between 1 and 1000000),
  primary key (academic_year, semester),
  check (isfinite(opens_at) and isfinite(closes_at) and opens_at < closes_at and closes_at - opens_at <= interval '180 days')
);
alter table public.affairs_course_withdrawal_windows enable row level security;
revoke all on public.affairs_course_withdrawal_windows from public, anon, authenticated;

create table private.affairs_course_withdrawal_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  receipt jsonb not null,
  primary key (actor, request_id)
);
alter table private.affairs_course_withdrawal_receipts enable row level security;
revoke all on private.affairs_course_withdrawal_receipts from public, anon, authenticated;

create function private.affairs_withdrawal_window_state(
  p_opens_at timestamptz, p_closes_at timestamptz, p_now timestamptz
) returns text language sql immutable set search_path = '' as $$
  select case when p_opens_at is null then 'unconfigured'
              when p_now < p_opens_at then 'scheduled'
              when p_now >= p_closes_at then 'closed'
              else 'open' end;
$$;
revoke all on function private.affairs_withdrawal_window_state(timestamptz,timestamptz,timestamptz) from public, anon, authenticated;

create function public.affairs_read_course_withdrawal(p_year integer default null, p_semester integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  taipei timestamp := statement_timestamp() at time zone 'Asia/Taipei';
  term_year integer := extract(year from taipei)::integer - 1911 - case when extract(month from taipei)<8 then 1 else 0 end;
  term_semester integer := case when extract(month from taipei) between 2 and 7 then 2 else 1 end;
  manager_view boolean := p_year is not null or p_semester is not null;
  saved_window public.affairs_course_withdrawal_windows;
  courses jsonb := '[]'::jsonb;
begin
  if actor is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode='42501';
  end if;
  if manager_view then
    if not (select private.affairs_is_admin()) then
      raise exception 'School Affairs administrator required' using errcode='42501';
    end if;
    if p_year is null or p_year not between 100 and 999 or p_semester is null or p_semester not in (1,2) then
      raise exception 'Invalid withdrawal term' using errcode='22023';
    end if;
    term_year := p_year;
    term_semester := p_semester;
  else
    select coalesce(jsonb_agg(to_jsonb(item) - 'row_order' order by item.row_order, item.id),'[]'::jsonb)
      into courses
      from (select id,term_course_code,course_title,required_elective_text,credits,instructor_one,remark_text,version,row_order
            from public.affairs_course_selection_records where user_id=actor and academic_year=term_year
              and semester=term_semester and selection_phase='withdrawal'
            order by row_order,id limit 201) item;
    if jsonb_array_length(courses)>200 then
      raise exception 'Course withdrawal list exceeds its allowed size' using errcode='22023';
    end if;
  end if;
  select * into saved_window from public.affairs_course_withdrawal_windows where academic_year=term_year and semester=term_semester;
  return jsonb_build_object('userId',actor,'academicYear',term_year,'semester',term_semester,
    'state',private.affairs_withdrawal_window_state(saved_window.opens_at,saved_window.closes_at,statement_timestamp()),
    'window',case when saved_window.version is null then null else jsonb_build_object(
      'opensAt',saved_window.opens_at,'closesAt',saved_window.closes_at,'version',saved_window.version) end,
    'courses',courses);
end;
$$;
revoke all on function public.affairs_read_course_withdrawal(integer,integer) from public, anon;
grant execute on function public.affairs_read_course_withdrawal(integer,integer) to authenticated;

create function public.affairs_write_course_withdrawal(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  manager_write boolean := p_kind='set_course_withdrawal_window';
  fields text[];
  request_key uuid;
  expected integer;
  operation text;
  course_id uuid;
  taipei timestamp;
  term_year integer;
  term_semester integer;
  start_time timestamptz;
  end_time timestamptz;
  current_window public.affairs_course_withdrawal_windows;
  course public.affairs_course_selection_records;
  prior private.affairs_course_withdrawal_receipts;
  result jsonb;
begin
  if actor_id is null or not (select private.affairs_google_identity()) or
    (manager_write and not (select private.affairs_is_admin())) then
    raise exception 'This School Affairs action is not allowed' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('set_course_withdrawal_window','change_course_withdrawal') then
    raise exception 'Invalid withdrawal operation' using errcode='22023';
  end if;
  fields := case when manager_write then array['academic_year','semester','opens_at','closes_at','expected_version','request_id']
    else array['course_id','operation','expected_version','request_id'] end;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>1024
    or not (p_payload ?& fields) or p_payload-fields <> '{}'::jsonb
    or coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or coalesce(p_payload->>'expected_version','') !~ '^[0-9]{1,9}$' then
    raise exception 'Invalid withdrawal fields' using errcode='22023';
  end if;
  expected := (p_payload->>'expected_version')::integer;
  request_key := (p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('course-withdrawal-actor:'||actor_id::text,0));
  select * into prior from private.affairs_course_withdrawal_receipts saved where saved.actor=actor_id and saved.request_id=request_key;
  if found then
    if prior.kind<>p_kind or prior.payload<>p_payload then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return prior.receipt;
  end if;

  if manager_write then
    if jsonb_typeof(p_payload->'academic_year') is distinct from 'number' or coalesce(p_payload->>'academic_year','') !~ '^[1-9][0-9]{2}$'
      or jsonb_typeof(p_payload->'semester') is distinct from 'number' or coalesce(p_payload->>'semester','') !~ '^[12]$'
      or coalesce(p_payload->>'opens_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or coalesce(p_payload->>'closes_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or expected>=1000000 then
      raise exception 'Invalid window values' using errcode='22023';
    end if;
    term_year := (p_payload->>'academic_year')::integer;
    term_semester := (p_payload->>'semester')::integer;
    start_time := (p_payload->>'opens_at')::timestamptz;
    end_time := (p_payload->>'closes_at')::timestamptz;
    if start_time>=end_time or end_time-start_time>interval '180 days' then raise exception 'Invalid window interval' using errcode='22023'; end if;
    select * into current_window from public.affairs_course_withdrawal_windows where academic_year=term_year and semester=term_semester for update;
    if expected<>coalesce(current_window.version,0) then raise exception 'Withdrawal window changed' using errcode='PT409'; end if;
    insert into public.affairs_course_withdrawal_windows (academic_year,semester,opens_at,closes_at,version)
      values (term_year,term_semester,start_time,end_time,expected+1)
      on conflict (academic_year,semester) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,version=excluded.version
      where affairs_course_withdrawal_windows.version=expected returning * into current_window;
    if not found then raise exception 'Withdrawal window changed' using errcode='PT409'; end if;
    result := jsonb_build_object('userId',actor_id,'requestId',request_key,'academicYear',term_year,'semester',term_semester,
      'window',jsonb_build_object('opensAt',current_window.opens_at,'closesAt',current_window.closes_at,'version',current_window.version));
  else
    operation := p_payload->>'operation';
    if coalesce(operation,'') not in ('withdraw','restore') or expected not between 1 and 999999998
      or coalesce(p_payload->>'course_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid course change' using errcode='22023';
    end if;
    course_id := (p_payload->>'course_id')::uuid;
    taipei := clock_timestamp() at time zone 'Asia/Taipei';
    term_year := extract(year from taipei)::integer - 1911 - case when extract(month from taipei)<8 then 1 else 0 end;
    term_semester := case when extract(month from taipei) between 2 and 7 then 2 else 1 end;
    select * into current_window from public.affairs_course_withdrawal_windows where academic_year=term_year and semester=term_semester for share;
    select * into course from public.affairs_course_selection_records
      where id=course_id and user_id=actor_id and academic_year=term_year and semester=term_semester and selection_phase='withdrawal' for update;
    if not found then raise exception 'Withdrawal course is unavailable' using errcode='42501'; end if;
    if private.affairs_withdrawal_window_state(current_window.opens_at,current_window.closes_at,clock_timestamp())<>'open' then
      raise exception 'Course withdrawal window is closed' using errcode='PT409';
    end if;
    if course.version<>expected or (operation='withdraw' and course.remark_text is not null)
      or (operation='restore' and course.remark_text is distinct from 'Y(W)') then
      raise exception 'Course withdrawal status changed' using errcode='PT409';
    end if;
    update public.affairs_course_selection_records set
      remark_text=case when operation='withdraw' then 'Y(W)' else null end,
      version=version+1,updated_at=clock_timestamp() where id=course_id
      returning * into course;
    result := jsonb_build_object('userId',actor_id,'requestId',request_key,'courseId',course_id,
      'version',course.version,'remark',course.remark_text);
  end if;
  insert into private.affairs_course_withdrawal_receipts values (actor_id,request_key,p_kind,p_payload,result);
  return result;
end;
$$;
revoke all on function public.affairs_write_course_withdrawal(text,jsonb) from public, anon;
grant execute on function public.affairs_write_course_withdrawal(text,jsonb) to authenticated;
