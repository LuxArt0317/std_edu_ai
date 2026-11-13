-- Independent local literal grade reports. Existing dtm_grade_items, its
-- numeric personal tracker API and generic assistant snapshots are unchanged.
create function private.dtm_grade_report_cells_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare keys text[]:=array['score','maximum','gradeText','rangeText','percentageText','weightText','weightNote','rankText','feedbackText','contributionText'];
  field text;n numeric;
begin
  if jsonb_typeof(value) is distinct from 'object' or not(value ?& keys) or value-keys<>'{}'::jsonb then return false;end if;
  foreach field in array keys loop
    if value->field='null'::jsonb then continue;end if;
    if field in ('score','maximum') then
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      n:=(value->>field)::numeric;
      if n<0 or n>1000000 or n<>round(n,2) or (field='maximum' and n<=0) then return false;end if;
    elsif jsonb_typeof(value->field) is distinct from 'string'
      or char_length(value->>field)>(case when field='feedbackText' then 2000 else 80 end) then return false;
    end if;
  end loop;
  if value->'score'<>'null'::jsonb and value->'maximum'<>'null'::jsonb
    and (value->>'score')::numeric>(value->>'maximum')::numeric then return false;end if;
  return true;
exception when others then return false;
end;$$;

create function private.dtm_grade_report_content_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;seen text[]:=array[]::text[];
  -- ECMAScript trim's exact whitespace set: the browser rejects blank labels
  -- identically without trimming or changing any stored literal text.
  whitespace text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if jsonb_typeof(value) is distinct from 'object' or not(value ?& array['items','total'])
    or value-array['items','total']<>'{}'::jsonb or octet_length(value::text)>131072 then return false;end if;
  if jsonb_typeof(value->'items') is distinct from 'array' or jsonb_array_length(value->'items')>500 then return false;end if;
  if value->'total'<>'null'::jsonb and not private.dtm_grade_report_cells_valid(value->'total') then return false;end if;
  for item in select v from jsonb_array_elements(value->'items') as items(v) loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['id','label','activityKind'])
      or not private.dtm_grade_report_cells_valid(item-array['id','label','activityKind']) then return false;end if;
    if jsonb_typeof(item->'id') is distinct from 'string' or item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or item->>'id'=any(seen) then return false;end if;
    seen:=array_append(seen,item->>'id');
    if jsonb_typeof(item->'label') is distinct from 'string' or char_length(item->>'label')>160
      or char_length(btrim(item->>'label',whitespace))=0 then return false;end if;
    if item->'activityKind'<>'null'::jsonb and (jsonb_typeof(item->'activityKind') is distinct from 'string' or item->>'activityKind'<>'assignment') then return false;end if;
  end loop;
  return true;
exception when others then return false;
end;$$;

create function private.dtm_grade_report_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare keys text[]:=array['id','user_id','course_id','request_id','expected_version'];field text;n numeric;
begin
  if p_kind is null or p_kind not in ('save_dtm_grade_report','delete_dtm_grade_report') then return false;end if;
  if p_kind='save_dtm_grade_report' then keys:=keys||array['report'];end if;
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>131072
    or not(value ?& keys) or value-keys<>'{}'::jsonb then return false;end if;
  foreach field in array array['id','user_id','course_id','request_id'] loop
    if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
  end loop;
  if jsonb_typeof(value->'expected_version') is distinct from 'number' then return false;end if;
  n:=(value->>'expected_version')::numeric;
  if n<>trunc(n) or n<(case when p_kind='delete_dtm_grade_report' then 1 else 0 end) or n>999999998 then return false;end if;
  return p_kind='delete_dtm_grade_report' or private.dtm_grade_report_content_valid(value->'report');
exception when others then return false;
end;$$;
revoke all on function private.dtm_grade_report_cells_valid(jsonb),private.dtm_grade_report_content_valid(jsonb),private.dtm_grade_report_payload_valid(text,jsonb) from public,anon,authenticated;

-- This composite key ensures that report ownership can never disagree with its
-- existing course, including privileged updates outside the report RPC.
alter table public.dtm_courses add constraint dtm_courses_report_owner_key unique(id,user_id);
create table public.dtm_grade_reports (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  course_id uuid not null,
  report jsonb not null check(private.dtm_grade_report_content_valid(report)),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at)),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at)),
  constraint dtm_grade_reports_owned_course foreign key(course_id,user_id) references public.dtm_courses(id,user_id) on delete cascade
);
comment on table public.dtm_grade_reports is 'One active admin-maintained local literal report per owned course. Ordered item and total cells preserve null, blank and zero. Numeric metadata does not calculate or override displayed text. No university synchronization, grading policy, nested categories or personal tracker mutation.';
create unique index dtm_grade_reports_active_course_idx on public.dtm_grade_reports(course_id) where deleted_at is null;
create index dtm_grade_reports_owner_idx on public.dtm_grade_reports(user_id,course_id) where deleted_at is null;
alter table public.dtm_grade_reports enable row level security;
revoke all on public.dtm_grade_reports from public,anon,authenticated;
grant select on public.dtm_grade_reports to authenticated;
create policy dtm_grade_reports_read on public.dtm_grade_reports for select to authenticated
  using (deleted_at is null and (select private.affairs_google_identity())
    and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create table private.dtm_grade_report_operations (
  actor_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  request_id uuid not null,kind text not null check(kind in ('save_dtm_grade_report','delete_dtm_grade_report')),
  payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
alter table private.dtm_grade_report_operations enable row level security;
revoke all on private.dtm_grade_report_operations from public,anon,authenticated;

create function private.dtm_grade_report_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.course_id<>old.course_id
    or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Grade report identity, owner, course and provenance are immutable' using errcode='42501';
  end if;
  if old.deleted_at is not null then raise exception 'Deleted grade report IDs cannot be reused' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.dtm_grade_report_identity_guard() from public,anon,authenticated;
create trigger dtm_grade_report_identity before update on public.dtm_grade_reports
  for each row execute function private.dtm_grade_report_identity_guard();

create function public.dtm_grade_report_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.dtm_grade_report_access() from public,anon;
grant execute on function public.dtm_grade_report_access() to authenticated;

-- Exact-owner metadata only. This does not broaden the legacy table policy for
-- personal courses, materials, meetings or numeric grade trackers.
create function public.dtm_grade_report_courses_admin(p_user_id uuid,p_course_id uuid default null,p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if p_user_id is null or (p_course_id is not null and p_after_id is not null) then raise exception 'Select an account and either an exact course or a cursor' using errcode='22023';end if;
  if not exists(select 1 from public.affairs_profiles where user_id=p_user_id) then raise exception 'Selected account unavailable' using errcode='42501';end if;
  select jsonb_build_object('courses',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'userId',r.user_id,'title',r.title,'code',r.code,'term',r.term) order by r.id)
    filter(where r.position<=100),'[]'::jsonb),'limit',100,'nextCursor',case when count(*)>100 then max(r.id::text) filter(where r.position=100) else null end)
    into result from (select c.id,c.user_id,c.title,c.code,c.term,row_number() over(order by c.id) as position
      from public.dtm_courses c where c.user_id=p_user_id and (p_course_id is null or c.id=p_course_id)
        and (p_after_id is null or c.id>p_after_id) order by c.id limit 101) r;
  return result;
end;$$;
revoke all on function public.dtm_grade_report_courses_admin(uuid,uuid,uuid) from public,anon;
grant execute on function public.dtm_grade_report_courses_admin(uuid,uuid,uuid) to authenticated;

create function public.dtm_grade_report_overview(p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());result jsonb;
begin
  if not(select private.affairs_google_identity()) or not exists(select 1 from public.affairs_profiles where user_id=actor) then
    raise exception 'Initialized Google account required' using errcode='42501';end if;
  select jsonb_build_object('courses',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'userId',r.user_id,'title',r.title,'code',r.code,'term',r.term,'gradeText',r.grade_text) order by r.id)
    filter(where r.position<=100),'[]'::jsonb),'limit',100,'nextCursor',case when count(*)>100 then max(r.id::text) filter(where r.position=100) else null end)
    into result from (select c.id,c.user_id,c.title,c.code,c.term,g.report->'total'->>'gradeText' as grade_text,row_number() over(order by c.id) as position
      from public.dtm_courses c left join public.dtm_grade_reports g on g.course_id=c.id and g.user_id=actor and g.deleted_at is null
      where c.user_id=actor and (p_after_id is null or c.id>p_after_id) order by c.id limit 101) r;
  return result;
end;$$;
revoke all on function public.dtm_grade_report_overview(uuid) from public,anon;
grant execute on function public.dtm_grade_report_overview(uuid) to authenticated;

create function public.dtm_manage_grade_report(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;course_id_value uuid;request_id_value uuid;expected integer;deleting boolean;
  before_row public.dtm_grade_reports;after_row public.dtm_grade_reports;receipt private.dtm_grade_report_operations;operation_result jsonb;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.dtm_grade_report_payload_valid(p_kind,p_payload) then raise exception 'Invalid literal grade report operation or field' using errcode='22023';end if;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;course_id_value:=(p_payload->>'course_id')::uuid;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=((p_payload->>'expected_version')::numeric)::integer;deleting:=p_kind='delete_dtm_grade_report';
  -- The actor lock serializes identical request IDs across all targets. Course
  -- row locking also serializes different report IDs and course deletion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dtm-grade-report:actor:'||actor::text,0));
  select * into receipt from private.dtm_grade_report_operations where actor_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  perform 1 from public.affairs_profiles where user_id=owner_id for key share;
  if not found then raise exception 'Selected account unavailable' using errcode='42501';end if;
  perform 1 from public.dtm_courses where id=course_id_value and user_id=owner_id for update;
  if not found then raise exception 'Selected course does not belong to this account' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dtm-grade-report:record:'||record_id::text,0));
  select * into before_row from public.dtm_grade_reports where id=record_id for update;
  if before_row.id is not null and (before_row.user_id<>owner_id or before_row.course_id<>course_id_value) then
    raise exception 'Grade reports cannot be reassigned' using errcode='42501';end if;
  if before_row.deleted_at is not null then raise exception 'Deleted grade report IDs cannot be reused' using errcode='PT409';end if;
  if coalesce(before_row.version,0)<>expected then raise exception 'The grade report changed. Refresh and review the draft.' using errcode='PT409';end if;
  if deleting then
    update public.dtm_grade_reports as target set deleted_at=now(),updated_at=now(),version=version+1,report='{"items":[],"total":null}'::jsonb
      where id=record_id and user_id=owner_id and course_id=course_id_value and version=expected and deleted_at is null returning target.* into after_row;
  else
    if before_row.id is null and exists(select 1 from public.dtm_grade_reports where course_id=course_id_value and deleted_at is null) then
      raise exception 'This course already has a grade report. Refresh the active report.' using errcode='PT409';end if;
    insert into public.dtm_grade_reports as target(id,user_id,course_id,report) values(record_id,owner_id,course_id_value,p_payload->'report')
      on conflict(id) do update set report=excluded.report,version=target.version+1,updated_at=now()
      where target.user_id=owner_id and target.course_id=course_id_value and target.version=expected and target.deleted_at is null returning target.* into after_row;
  end if;
  if after_row.id is null then raise exception 'The grade report changed. Refresh and review the draft.' using errcode='PT409';end if;
  operation_result:=jsonb_build_object('id',record_id,'userId',owner_id,'courseId',course_id_value,'kind',p_kind,'version',after_row.version,'summary',
    case when deleting then 'Deleted the local grade report; its ID and retry receipts remain reserved.' else 'Saved the local literal grade report without calculating grades or totals.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,operation_result->>'summary');
  insert into private.dtm_grade_report_operations(actor_id,user_id,course_id,request_id,kind,payload,result)
    values(actor,owner_id,course_id_value,request_id_value,p_kind,p_payload,operation_result);
  return operation_result;
exception when unique_violation then raise exception 'This course already has a grade report. Refresh the active report.' using errcode='PT409';
end;$$;
revoke all on function public.dtm_manage_grade_report(text,jsonb) from public,anon;
grant execute on function public.dtm_manage_grade_report(text,jsonb) to authenticated;
