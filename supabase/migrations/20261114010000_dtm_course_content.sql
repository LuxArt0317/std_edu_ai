-- Independent local course placement metadata. No legacy activity, grade,
-- submission, generic snapshot or existing table policy is changed.
create function private.dtm_course_content_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;seen text[]:=array[]::text[];key text;
begin
  if jsonb_typeof(value) is distinct from 'object' or not(value ? 'references') or value-array['references']<>'{}'::jsonb
    or octet_length(value::text)>131072 or jsonb_typeof(value->'references') is distinct from 'array' then return false;end if;
  if jsonb_array_length(value->'references')>1000 then return false;end if;
  for item in select v from jsonb_array_elements(value->'references') as refs(v) loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['kind','id','section']) or item-array['kind','id','section']<>'{}'::jsonb
      or jsonb_typeof(item->'kind') is distinct from 'string' or item->>'kind' not in ('assignment','material')
      or jsonb_typeof(item->'id') is distinct from 'string' or item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(item->'section') is distinct from 'string' or item->>'section' not in ('assignments','quizzes','materials') then return false;end if;
    key:=(item->>'kind')||':'||(item->>'id');if key=any(seen) then return false;end if;seen:=array_append(seen,key);
  end loop;
  return true;
exception when others then return false;
end;$$;
create function private.dtm_course_content_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare keys text[]:=array['id','user_id','course_id','request_id','expected_version'];field text;n numeric;
begin
  if p_kind is null or p_kind not in ('save_dtm_course_content','delete_dtm_course_content') then return false;end if;
  if p_kind='save_dtm_course_content' then keys:=keys||array['content'];end if;
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>131072 or not(value ?& keys) or value-keys<>'{}'::jsonb then return false;end if;
  foreach field in array array['id','user_id','course_id','request_id'] loop
    if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
  end loop;
  if jsonb_typeof(value->'expected_version') is distinct from 'number' then return false;end if;
  n:=(value->>'expected_version')::numeric;
  if n<>trunc(n) or n<(case when p_kind='delete_dtm_course_content' then 1 else 0 end) or n>999999998 then return false;end if;
  return p_kind='delete_dtm_course_content' or private.dtm_course_content_valid(value->'content');
exception when others then return false;
end;$$;
revoke all on function private.dtm_course_content_valid(jsonb),private.dtm_course_content_payload_valid(text,jsonb) from public,anon,authenticated;

create table public.dtm_course_contents (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  course_id uuid not null,
  content jsonb not null check(private.dtm_course_content_valid(content)),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at)),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at)),
  constraint dtm_course_contents_owned_course foreign key(course_id,user_id) references public.dtm_courses(id,user_id) on delete cascade
);
comment on table public.dtm_course_contents is 'One active admin-managed local placement snapshot per course. Ordered references identify existing backing-table rows. Quizzes is a section, not an invented activity type. Unavailable references stay inert until explicit maintenance; reads never mutate. Unplaced activities retain deterministic fallback visibility. No university synchronization.';
create unique index dtm_course_contents_active_course_idx on public.dtm_course_contents(course_id) where deleted_at is null;
create index dtm_course_contents_owner_idx on public.dtm_course_contents(user_id,course_id) where deleted_at is null;
alter table public.dtm_course_contents enable row level security;
revoke all on public.dtm_course_contents from public,anon,authenticated;
grant select on public.dtm_course_contents to authenticated;
create policy dtm_course_contents_own_read on public.dtm_course_contents for select to authenticated
  using(deleted_at is null and user_id=(select auth.uid()) and (select private.affairs_google_identity()));

create table private.dtm_course_content_operations (
  actor_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  request_id uuid not null,
  kind text not null check(kind in ('save_dtm_course_content','delete_dtm_course_content')),
  payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
alter table private.dtm_course_content_operations enable row level security;
revoke all on private.dtm_course_content_operations from public,anon,authenticated;
create function private.dtm_course_content_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.course_id<>old.course_id or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Course content identity, owner, course and provenance are immutable' using errcode='42501';end if;
  if old.deleted_at is not null then raise exception 'Deleted course content IDs cannot be reused' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.dtm_course_content_identity_guard() from public,anon,authenticated;
create trigger dtm_course_content_identity before update on public.dtm_course_contents
  for each row execute function private.dtm_course_content_identity_guard();

create function public.dtm_course_content_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) or not exists(select 1 from public.affairs_profiles where user_id=(select auth.uid())) then
    raise exception 'Verified School Affairs Google sign-in is required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.dtm_course_content_access() from public,anon;
grant execute on function public.dtm_course_content_access() to authenticated;

-- A stable function uses one calling-statement snapshot. The revision hashes
-- ALL eligible rows (not merely this page), the owner/course, and active layout.
-- No source metadata or ownership from another course enters the projection.
create function private.dtm_course_content_page(p_user_id uuid,p_course_id uuid,p_after_kind text,p_after_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_user_id is null or p_course_id is null or (p_after_kind is null)<>(p_after_id is null)
    or (p_after_kind is not null and p_after_kind not in ('assignment','material')) then
    raise exception 'Select a course and either both cursor fields or neither' using errcode='22023';end if;
  if not exists(select 1 from public.dtm_courses where id=p_course_id and user_id=p_user_id) then raise exception 'Owned course unavailable' using errcode='42501';end if;
  with owned as materialized(select * from public.dtm_courses where id=p_course_id and user_id=p_user_id),
  active as materialized(select * from public.dtm_course_contents where course_id=p_course_id and user_id=p_user_id and deleted_at is null),
  layout as(select (select jsonb_build_object('id',id,'userId',user_id,'courseId',course_id,'sourceMode',source_mode,'version',version,
    'createdAt',created_at,'updatedAt',updated_at,'references',content->'references') from active) as value),
  eligible as materialized(
    select 'assignment'::text as kind,a.id,to_jsonb(a) as fingerprint,
      jsonb_build_object('kind','assignment','id',a.id,'title',a.title,'details',a.details,'dueAt',a.due_at) as value
    from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id join owned c on c.id=a.dtm_course_id and c.user_id=s.user_id
      where a.source_mode=c.source_mode
    union all
    select 'material'::text,m.id,to_jsonb(m),jsonb_build_object('kind','material','id',m.id,'title',m.title,'materialKind',m.kind,'summary',m.summary,
      'position',m.position,'sourceMode',m.source_mode,'sourceUrl',m.source_url)
    from public.dtm_materials m join owned c on c.id=m.course_id
  ),
  candidates as materialized(select * from eligible where p_after_kind is null or kind>p_after_kind or (kind=p_after_kind and id>p_after_id) order by kind,id limit 101),
  page as materialized(select * from candidates order by kind,id limit 100),
  summary as(select count(*) as total,coalesce(jsonb_agg(jsonb_build_array(kind,id,fingerprint) order by kind,id),'[]'::jsonb) as fingerprint from eligible)
  select jsonb_build_object(
    'course',jsonb_build_object('id',c.id,'userId',c.user_id,'title',c.title,'code',c.code,'term',c.term),
    'content',layout.value,'activities',coalesce((select jsonb_agg(value order by kind,id) from page),'[]'::jsonb),
    'total',summary.total,'limit',100,
    'nextCursor',case when (select count(*) from candidates)>100 then (select jsonb_build_object('kind',kind,'id',id) from page order by kind desc,id desc limit 1) else null end,
    'revision',encode(sha256(convert_to(jsonb_build_object('course',to_jsonb(c),'content',layout.value,'activities',summary.fingerprint)::text,'UTF8')),'hex'),
    'unavailableReferenceCount',(select count(*) from jsonb_array_elements(coalesce(layout.value->'references','[]'::jsonb)) as r(value)
      where not exists(select 1 from eligible e where e.kind=r.value->>'kind' and e.id=(r.value->>'id')::uuid))
  ) into result from owned c cross join layout cross join summary;
  if result is null or octet_length(result::text)>196608 then raise exception 'Course content exceeds the bounded response; no partial course was returned' using errcode='PT503';end if;
  return result;
end;$$;
revoke all on function private.dtm_course_content_page(uuid,uuid,text,uuid) from public,anon,authenticated;
create function public.dtm_course_content_read(p_course_id uuid,p_after_kind text default null,p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
begin
  if not(select private.affairs_google_identity()) or not exists(select 1 from public.affairs_profiles where user_id=actor) then
    raise exception 'Verified School Affairs Google sign-in is required' using errcode='42501';end if;
  return private.dtm_course_content_page(actor,p_course_id,p_after_kind,p_after_id);
end;$$;
create function public.dtm_course_content_admin(p_user_id uuid,p_course_id uuid,p_after_kind text default null,p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  return private.dtm_course_content_page(p_user_id,p_course_id,p_after_kind,p_after_id);
end;$$;
revoke all on function public.dtm_course_content_read(uuid,text,uuid),public.dtm_course_content_admin(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.dtm_course_content_read(uuid,text,uuid),public.dtm_course_content_admin(uuid,uuid,text,uuid) to authenticated;

create function public.dtm_course_content_assignment(p_course_id uuid,p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());result jsonb;
begin
  if not(select private.affairs_google_identity()) or not exists(select 1 from public.affairs_profiles where user_id=actor) then
    raise exception 'Verified School Affairs Google sign-in is required' using errcode='42501';end if;
  if p_course_id is null or p_assignment_id is null then raise exception 'Select a course and assignment' using errcode='22023';end if;
  if not exists(select 1 from public.dtm_courses where id=p_course_id and user_id=actor) then raise exception 'Owned course unavailable' using errcode='42501';end if;
  select jsonb_build_object('id',a.id,'userId',actor,'courseId',a.dtm_course_id,'title',a.title,'details',a.details,'dueAt',a.due_at,'status',a.status,
    'submittedAt',a.submitted_at,'sourceMode',a.source_mode,'meetingId',a.meeting_id,
    'origin',case when a.import_key is not null then 'moodle_calendar' when a.source_mode='personal' then 'manual' else 'sample' end)
    into result from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id
      join public.dtm_courses c on c.id=a.dtm_course_id and c.user_id=s.user_id
    where a.id=p_assignment_id and a.dtm_course_id=p_course_id and s.user_id=actor and a.source_mode=c.source_mode;
  result:=jsonb_build_object('assignment',result);
  if octet_length(result::text)>196608 then raise exception 'Assignment exceeds the bounded response' using errcode='PT503';end if;
  return result;
end;$$;
revoke all on function public.dtm_course_content_assignment(uuid,uuid) from public,anon;
grant execute on function public.dtm_course_content_assignment(uuid,uuid) to authenticated;

create function public.dtm_manage_course_content(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());owner_id uuid;course_id_value uuid;record_id uuid;request_id_value uuid;expected integer;deleting boolean;
  before_row public.dtm_course_contents;after_row public.dtm_course_contents;receipt private.dtm_course_content_operations;operation_result jsonb;ref jsonb;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.dtm_course_content_payload_valid(p_kind,p_payload) then raise exception 'Invalid course content operation or field' using errcode='22023';end if;
  owner_id:=(p_payload->>'user_id')::uuid;course_id_value:=(p_payload->>'course_id')::uuid;record_id:=(p_payload->>'id')::uuid;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=((p_payload->>'expected_version')::numeric)::integer;deleting:=p_kind='delete_dtm_course_content';
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dtm-course-content:actor:'||actor::text,0));
  select * into receipt from private.dtm_course_content_operations where actor_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Selected account unavailable' using errcode='42501';end if;
  -- Existing personal-activity CRUD locks this same course row before changing
  -- activities. Target row locks additionally cover privileged move/deletion.
  perform 1 from public.dtm_courses where id=course_id_value and user_id=owner_id for update;
  if not found then raise exception 'Selected owned course unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dtm-course-content:record:'||record_id::text,0));
  select * into before_row from public.dtm_course_contents where id=record_id for update;
  if before_row.id is not null and (before_row.user_id<>owner_id or before_row.course_id<>course_id_value) then
    raise exception 'Course content owner and course are immutable' using errcode='42501';end if;
  if before_row.deleted_at is not null then raise exception 'Deleted course content IDs cannot be reused' using errcode='PT409';end if;
  if coalesce(before_row.version,0)<>expected or (deleting and before_row.id is null) then raise exception 'Course content changed; refresh and review the draft' using errcode='PT409';end if;
  if not deleting then
    -- Array order is retained; locks alone use canonical backing-table/ID order.
    for ref in select value from jsonb_array_elements(p_payload->'content'->'references') order by value->>'kind',value->>'id' loop
      if ref->>'kind'='assignment' then
        perform 1 from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id
          join public.dtm_courses c on c.id=a.dtm_course_id and c.user_id=s.user_id
          where a.id=(ref->>'id')::uuid and a.dtm_course_id=course_id_value and s.user_id=owner_id and a.source_mode=c.source_mode for share of a,s;
      else
        perform 1 from public.dtm_materials m where m.id=(ref->>'id')::uuid and m.course_id=course_id_value for share of m;
      end if;
      if not found then raise exception 'A referenced activity is unavailable in the selected course; refresh and review the draft' using errcode='PT409';end if;
    end loop;
  end if;
  if deleting then
    update public.dtm_course_contents as target set deleted_at=now(),updated_at=now(),version=version+1,content='{"references":[]}'::jsonb
      where id=record_id and user_id=owner_id and course_id=course_id_value and version=expected and deleted_at is null returning target.* into after_row;
  else
    if before_row.id is null and exists(select 1 from public.dtm_course_contents where course_id=course_id_value and deleted_at is null) then
      raise exception 'This course already has active content; refresh the active layout' using errcode='PT409';end if;
    insert into public.dtm_course_contents as target(id,user_id,course_id,content)
      values(record_id,owner_id,course_id_value,p_payload->'content')
      on conflict(id) do update set content=excluded.content,version=target.version+1,updated_at=now()
      where target.user_id=owner_id and target.course_id=course_id_value and target.version=expected and target.deleted_at is null returning target.* into after_row;
  end if;
  if after_row.id is null then raise exception 'Course content changed; refresh and review the draft' using errcode='PT409';end if;
  operation_result:=jsonb_build_object('id',record_id,'userId',owner_id,'courseId',course_id_value,'kind',p_kind,'version',after_row.version,
    'summary',case when deleting then 'Deleted the local course layout; existing activities retain fallback placement.' else 'Saved local course section placement without changing existing activities.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,operation_result->>'summary');
  insert into private.dtm_course_content_operations(actor_id,user_id,course_id,request_id,kind,payload,result)
    values(actor,owner_id,course_id_value,request_id_value,p_kind,p_payload,operation_result);
  return operation_result;
exception when unique_violation then raise exception 'This course already has active content; refresh the active layout' using errcode='PT409';
end;$$;
revoke all on function public.dtm_manage_course_content(text,jsonb) from public,anon;
grant execute on function public.dtm_manage_course_content(text,jsonb) to authenticated;
