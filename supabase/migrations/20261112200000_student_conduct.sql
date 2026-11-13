-- DRAFT ONLY: source 38-1 exposed an empty twelve-column table.
-- Store literal local demonstration cells. No merit total, eligibility, detail
-- report, issued certificate, file or official-school capability is inferred.
create table public.affairs_student_conduct (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  occurred_on_text text check(occurred_on_text is null or char_length(occurred_on_text)<=40),
  student_number text check(student_number is null or char_length(student_number)<=80),
  student_name text check(student_name is null or char_length(student_name)<=160),
  academic_year_text text check(academic_year_text is null or char_length(academic_year_text)<=40),
  semester_text text check(semester_text is null or char_length(semester_text)<=40),
  year_level_text text check(year_level_text is null or char_length(year_level_text)<=40),
  reason_text text check(reason_text is null or char_length(reason_text)<=2000),
  conduct_code text check(conduct_code is null or char_length(conduct_code)<=80),
  conduct_name text check(conduct_name is null or char_length(conduct_name)<=160),
  quantity_text text check(quantity_text is null or char_length(quantity_text)<=80),
  void_status_text text check(void_status_text is null or char_length(void_status_text)<=160),
  row_order integer not null check(row_order between 0 and 10000),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at)),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at))
);
comment on table public.affairs_student_conduct is 'Account-owned literal local conduct cells. Date, year, semester, quantity and void status remain nullable display text because no populated official rows were observed. Null and blank differ. View/detail and certificate actions have no modeled capability.';
create index affairs_student_conduct_owner_idx on public.affairs_student_conduct(user_id,id) where deleted_at is null;
alter table public.affairs_student_conduct enable row level security;
revoke all on public.affairs_student_conduct from public,anon,authenticated;
grant select on public.affairs_student_conduct to authenticated;
create policy student_conduct_read on public.affairs_student_conduct for select to authenticated
  using (deleted_at is null and (select private.affairs_google_identity())
    and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_student_conduct_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table private.affairs_student_conduct_operations enable row level security;
revoke all on private.affairs_student_conduct_operations from public,anon,authenticated;

create function private.affairs_student_conduct_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Local conduct owner, identity and provenance are immutable' using errcode='42501';
  end if;
  if old.deleted_at is not null then raise exception 'Deleted conduct IDs cannot be reused' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.affairs_student_conduct_identity_guard() from public,anon,authenticated;
create trigger student_conduct_identity before update on public.affairs_student_conduct
  for each row execute function private.affairs_student_conduct_identity_guard();

create function public.affairs_student_conduct_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.affairs_student_conduct_access() from public,anon;
grant execute on function public.affairs_student_conduct_access() to authenticated;

create function private.affairs_student_conduct_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind when 'save_student_conduct' then array[
    'occurred_on_text','student_number','student_name','academic_year_text','semester_text','year_level_text',
    'reason_text','conduct_code','conduct_name','quantity_text','void_status_text','row_order']
    when 'delete_student_conduct' then array[]::text[] else null end;
$$;
create function private.affairs_student_conduct_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;n numeric;minimum integer;maximum integer;
begin
  fields:=private.affairs_student_conduct_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>16000 then return false;end if;
  fields:=array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field in ('expected_version','row_order') then
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      n:=(value->>field)::numeric;minimum:=case when field='expected_version' and p_kind='delete_student_conduct' then 1 else 0 end;
      maximum:=case field when 'row_order' then 10000 else 999999998 end;
      if n<>trunc(n) or n<minimum or n>maximum then return false;end if;
    else
      if value->field='null'::jsonb then continue;end if;
      maximum:=case field when 'occurred_on_text' then 40 when 'student_number' then 80 when 'student_name' then 160
        when 'academic_year_text' then 40 when 'semester_text' then 40 when 'year_level_text' then 40 when 'reason_text' then 2000
        when 'conduct_code' then 80 when 'conduct_name' then 160 when 'quantity_text' then 80 when 'void_status_text' then 160 end;
      if maximum is null or jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>maximum then return false;end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_student_conduct_fields(text),private.affairs_student_conduct_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_student_conduct(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;deleting boolean;
  fields text[];columns_sql text;values_sql text;updates_sql text;before_row public.affairs_student_conduct;
  after_row public.affairs_student_conduct;result jsonb;receipt private.affairs_student_conduct_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_student_conduct_payload_valid(p_kind,p_payload) then raise exception 'Invalid conduct operation or field' using errcode='22023';end if;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=(p_payload->>'expected_version')::integer;
  deleting:=p_kind='delete_student_conduct';
  -- Receipt first, then target-owner/record locks. No profile/identity mutations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conduct:actor:'||actor::text,0));
  select * into receipt from private.affairs_student_conduct_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conduct:owner:'||owner_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conduct:record:'||record_id::text,0));
  select * into before_row from public.affairs_student_conduct where id=record_id for update;
  if before_row.id is not null and before_row.user_id<>owner_id then raise exception 'Conduct records cannot be reassigned' using errcode='42501';end if;
  if before_row.deleted_at is not null then raise exception 'Deleted conduct IDs cannot be reused' using errcode='PT409';end if;
  if coalesce(before_row.version,0)<>expected then raise exception 'This conduct record changed. Refresh and retry.' using errcode='PT409';end if;
  if deleting then
    update public.affairs_student_conduct as target set deleted_at=now(),updated_at=now(),version=version+1
      where id=record_id and user_id=owner_id and version=expected and deleted_at is null returning target.* into after_row;
  else
    if before_row.id is null and (select count(*) from public.affairs_student_conduct where user_id=owner_id and deleted_at is null)>=1000 then
      raise exception 'An account may hold at most 1000 active local conduct records' using errcode='22023';
    end if;
    fields:=private.affairs_student_conduct_fields(p_kind);
    select string_agg(format('%I',name),',' order by ordinal),string_agg(format('r.%I',name),',' order by ordinal)
      into columns_sql,values_sql from unnest(array['id','user_id']||fields) with ordinality field(name,ordinal);
    select string_agg(format('%I=excluded.%I',name,name),',' order by ordinal)
      into updates_sql from unnest(fields) with ordinality field(name,ordinal);
    execute format('insert into public.affairs_student_conduct as target (%s) select %s from jsonb_populate_record(null::public.affairs_student_conduct,$1) r on conflict(id) do update set %s,version=target.version+1,updated_at=now() where target.user_id=$2 and target.version=$3 and target.deleted_at is null returning target.*',columns_sql,values_sql,updates_sql)
      into after_row using p_payload-array['request_id','expected_version'],owner_id,expected;
  end if;
  if after_row.id is null then raise exception 'This conduct record changed. Refresh and retry.' using errcode='PT409';end if;
  result:=jsonb_build_object('id',record_id,'kind',p_kind,'version',after_row.version,'summary',
    case when deleting then 'Deleted local conduct record; its ID and receipt remain reserved.' else 'Saved literal local conduct record. No certificate or merit calculation was issued.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,result->>'summary');
  insert into private.affairs_student_conduct_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,result);
  return result;
exception when unique_violation then raise exception 'This conduct record changed. Refresh and retry.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_student_conduct(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_student_conduct(text,jsonb) to authenticated;
