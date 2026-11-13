create table public.affairs_early_graduation_windows (
  academic_year smallint not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1,2)),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  version integer not null check (version between 1 and 1000000),
  primary key (academic_year,semester),
  check (isfinite(opens_at) and isfinite(closes_at) and opens_at<closes_at and closes_at-opens_at<=interval '180 days')
);

create table public.affairs_early_graduation_candidates (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year smallint not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1,2)),
  study_track text not null check (char_length(btrim(study_track)) between 1 and 100),
  department text not null check (char_length(btrim(department)) between 1 and 160),
  student_number text not null check (char_length(btrim(student_number)) between 1 and 40),
  graduation_year smallint not null check (graduation_year between 100 and 999),
  graduation_semester smallint not null check (graduation_semester in (1,2)),
  eligibility text not null check (eligibility in ('unverified','eligible','ineligible')),
  version integer not null check (version between 1 and 1000000),
  primary key (user_id,academic_year,semester),
  check ((graduation_year,graduation_semester)>=(academic_year,semester))
);

create table public.affairs_early_graduation_applications (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year smallint not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1,2)),
  study_track text not null,
  department text not null,
  student_number text not null,
  graduation_year smallint not null,
  graduation_semester smallint not null,
  applied_at timestamptz not null,
  status text not null check (status in ('submitted','cancelled','approved','rejected')),
  version integer not null check (version between 1 and 1000000),
  primary key (user_id,academic_year,semester)
);

create table private.affairs_early_graduation_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key (actor,request_id)
);

alter table public.affairs_early_graduation_windows enable row level security;
alter table public.affairs_early_graduation_candidates enable row level security;
alter table public.affairs_early_graduation_applications enable row level security;
alter table private.affairs_early_graduation_receipts enable row level security;
revoke all on public.affairs_early_graduation_windows,public.affairs_early_graduation_candidates,
  public.affairs_early_graduation_applications,private.affairs_early_graduation_receipts from public,anon,authenticated;

create function public.affairs_read_early_graduation(p_year integer default null,p_semester integer default null,p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor_id uuid := (select auth.uid());
  target uuid := actor_id;
  taipei timestamp := statement_timestamp() at time zone 'Asia/Taipei';
  term_year integer := extract(year from taipei)::int-1911-case when extract(month from taipei)<8 then 1 else 0 end;
  term_sem integer := case when extract(month from taipei) between 2 and 7 then 2 else 1 end;
  term_window public.affairs_early_graduation_windows;
  candidate public.affairs_early_graduation_candidates;
  records jsonb := '[]'::jsonb;
begin
  if not(select private.affairs_google_identity()) then raise exception 'Verified Google session required' using errcode='42501'; end if;
  if p_year is not null or p_semester is not null or p_student is not null then
    if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
    if p_year is null or p_year not between 100 and 999 or p_semester is null or p_semester not in (1,2) then
      raise exception 'Invalid academic term' using errcode='22023';
    end if;
    term_year:=p_year; term_sem:=p_semester; target:=p_student;
  end if;
  select * into term_window from public.affairs_early_graduation_windows where academic_year=term_year and semester=term_sem;
  select * into candidate from public.affairs_early_graduation_candidates where user_id=target and academic_year=term_year and semester=term_sem;
  select coalesce(jsonb_agg(to_jsonb(row) order by row.academic_year desc,row.semester desc),'[]'::jsonb) into records
    from (select * from public.affairs_early_graduation_applications where user_id=target
      order by academic_year desc,semester desc limit 100) row;
  return jsonb_build_object('userId',target,'academicYear',term_year,'semester',term_sem,
    'state',private.affairs_withdrawal_window_state(term_window.opens_at,term_window.closes_at,statement_timestamp()),
    'window',case when term_window.version is null then null else to_jsonb(term_window) end,
    'candidate',case when candidate.version is null then null else to_jsonb(candidate) end,'records',records);
end;
$$;
revoke all on function public.affairs_read_early_graduation(integer,integer,uuid) from public,anon;
grant execute on function public.affairs_read_early_graduation(integer,integer,uuid) to authenticated;

create function public.affairs_change_early_graduation(p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := (select auth.uid());
  target uuid := actor_id;
  manager boolean := p_kind in ('set_graduation_window','set_graduation_candidate','review_early_graduation');
  fields text[]:=array['academic_year','semester','request_id','expected_version'];
  request_key uuid;
  expected integer;
  term_year integer;
  term_sem integer;
  timestamp_now timestamptz;
  taipei timestamp;
  start_time timestamptz;
  end_time timestamptz;
  graduation_year integer;
  graduation_sem integer;
  term_window public.affairs_early_graduation_windows;
  candidate public.affairs_early_graduation_candidates;
  application public.affairs_early_graduation_applications;
  prior private.affairs_early_graduation_receipts;
  result jsonb;
begin
  if not(select private.affairs_google_identity()) or (manager and not(select private.affairs_is_admin())) then
    raise exception 'This action is unavailable to your account' using errcode='42501';
  end if;
  case p_kind
    when 'set_graduation_window' then fields:=fields||array['opens_at','closes_at'];
    when 'set_graduation_candidate' then fields:=fields||array['user_id','study_track','department','student_number','graduation_year','graduation_semester','eligibility'];
    when 'review_early_graduation' then fields:=fields||array['user_id','decision'];
    when 'submit_early_graduation' then fields:=fields||array['candidate_version'];
    when 'cancel_early_graduation' then null;
    else raise exception 'Invalid graduation operation' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2400
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or exists(select 1 from unnest(array['academic_year','semester','expected_version']) as k(field)
      where jsonb_typeof(p_payload->k.field) is distinct from 'number' or p_payload->>k.field !~ '^[0-9]{1,6}$') then
    raise exception 'Invalid graduation fields' using errcode='22023';
  end if;
  term_year:=(p_payload->>'academic_year')::integer; term_sem:=(p_payload->>'semester')::integer;
  expected:=(p_payload->>'expected_version')::integer; request_key:=(p_payload->>'request_id')::uuid;
  if term_year not between 100 and 999 or term_sem not in (1,2) then raise exception 'Invalid academic term' using errcode='22023'; end if;
  if p_payload?'user_id' then
    if coalesce(p_payload->>'user_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid account' using errcode='22023';
    end if;
    target:=(p_payload->>'user_id')::uuid;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('early-graduation-actor:'||actor_id::text,0));
  select * into prior from private.affairs_early_graduation_receipts r where r.actor=actor_id and r.request_id=request_key;
  if found then
    if prior.kind<>p_kind or prior.payload<>p_payload then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if p_kind='set_graduation_window' then
    if coalesce(p_payload->>'opens_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or coalesce(p_payload->>'closes_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
      raise exception 'Invalid dates' using errcode='22023';
    end if;
    start_time:=(p_payload->>'opens_at')::timestamptz; end_time:=(p_payload->>'closes_at')::timestamptz;
    if start_time>=end_time or end_time-start_time>interval '180 days' then raise exception 'Invalid window' using errcode='22023'; end if;
    select * into term_window from public.affairs_early_graduation_windows where academic_year=term_year and semester=term_sem for update;
    if coalesce(term_window.version,0)<>expected then raise exception 'Window changed' using errcode='PT409'; end if;
    insert into public.affairs_early_graduation_windows values (term_year,term_sem,start_time,end_time,expected+1)
      on conflict(academic_year,semester) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,version=excluded.version
      where affairs_early_graduation_windows.version=expected returning * into term_window;
    if not found then raise exception 'Window changed' using errcode='PT409'; end if;
    result:=to_jsonb(term_window);
  else
    perform pg_advisory_xact_lock(hashtextextended('early-graduation-student:'||target::text||'/'||term_year||'/'||term_sem,0));
    select * into candidate from public.affairs_early_graduation_candidates where user_id=target and academic_year=term_year and semester=term_sem;
    select * into application from public.affairs_early_graduation_applications where user_id=target and academic_year=term_year and semester=term_sem;
    if p_kind='set_graduation_candidate' then
      if coalesce(candidate.version,0)<>expected then raise exception 'Candidate changed' using errcode='PT409'; end if;
      if coalesce(p_payload->>'eligibility','') not in ('unverified','eligible','ineligible')
        or exists(select 1 from unnest(array['graduation_year','graduation_semester']) as k(field)
          where jsonb_typeof(p_payload->k.field) is distinct from 'number' or p_payload->>k.field !~ '^[0-9]{1,3}$')
        or exists(select 1 from (values ('study_track',100),('department',160),('student_number',40)) k(field,max_length)
          where jsonb_typeof(p_payload->k.field) is distinct from 'string' or char_length(btrim(p_payload->>k.field)) not between 1 and k.max_length)
        or not exists(select 1 from public.affairs_profiles where user_id=target) then
        raise exception 'Invalid candidate details' using errcode='22023';
      end if;
      graduation_year:=(p_payload->>'graduation_year')::integer; graduation_sem:=(p_payload->>'graduation_semester')::integer;
      if graduation_year not between 100 and 999 or graduation_sem not in (1,2) or (graduation_year,graduation_sem)<(term_year,term_sem) then
        raise exception 'Invalid planned graduation term' using errcode='22023';
      end if;
      insert into public.affairs_early_graduation_candidates values (target,term_year,term_sem,btrim(p_payload->>'study_track'),
        btrim(p_payload->>'department'),btrim(p_payload->>'student_number'),graduation_year,graduation_sem,p_payload->>'eligibility',expected+1)
        on conflict(user_id,academic_year,semester) do update set study_track=excluded.study_track,department=excluded.department,
          student_number=excluded.student_number,graduation_year=excluded.graduation_year,graduation_semester=excluded.graduation_semester,
          eligibility=excluded.eligibility,version=excluded.version returning * into candidate;
      result:=to_jsonb(candidate);
    else
      if coalesce(application.version,0)<>expected then raise exception 'Application changed' using errcode='PT409'; end if;
      if not manager then
        select * into term_window from public.affairs_early_graduation_windows where academic_year=term_year and semester=term_sem for share;
        timestamp_now:=clock_timestamp(); taipei:=timestamp_now at time zone 'Asia/Taipei';
        if term_year<>(extract(year from taipei)::int-1911-(case when extract(month from taipei)<8 then 1 else 0 end))
          or term_sem<>(case when extract(month from taipei) between 2 and 7 then 2 else 1 end)
          or private.affairs_withdrawal_window_state(term_window.opens_at,term_window.closes_at,timestamp_now)<>'open' then
          raise exception 'Application period is closed' using errcode='PT409';
        end if;
      end if;
      if p_kind='submit_early_graduation' then
        if application.version is not null or candidate.eligibility is distinct from 'eligible' or
          jsonb_typeof(p_payload->'candidate_version') is distinct from 'number' or
          coalesce(p_payload->>'candidate_version','') !~ '^[0-9]{1,7}$' or candidate.version<>(p_payload->>'candidate_version')::integer then
          raise exception 'Candidate or application changed' using errcode='PT409';
        end if;
        insert into public.affairs_early_graduation_applications values (target,term_year,term_sem,candidate.study_track,
          candidate.department,candidate.student_number,candidate.graduation_year,candidate.graduation_semester,timestamp_now,'submitted',1)
          returning * into application;
      else
        if application.status is distinct from 'submitted' then raise exception 'Application cannot change' using errcode='PT409'; end if;
        if manager and coalesce(p_payload->>'decision','') not in ('approved','rejected') then
          raise exception 'Invalid review decision' using errcode='22023';
        end if;
        update public.affairs_early_graduation_applications set
          status=case when manager then p_payload->>'decision' else 'cancelled' end,version=version+1
          where user_id=target and academic_year=term_year and semester=term_sem returning * into application;
      end if;
      result:=to_jsonb(application);
    end if;
  end if;
  insert into private.affairs_early_graduation_receipts values(actor_id,request_key,p_kind,p_payload,result);
  return result;
end;
$$;
revoke all on function public.affairs_change_early_graduation(text,jsonb) from public,anon;
grant execute on function public.affairs_change_early_graduation(text,jsonb) to authenticated;
