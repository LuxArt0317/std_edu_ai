-- UNAPPLIED DRAFT. Source34-2 exposed only a no-record event message.
-- Separate from housing34-1 and student conduct38-1; no rows or capabilities inferred.
create table public.affairs_dormitory_conduct (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  result text not null check(result in ('empty','unknown')),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at)),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at))
);
comment on table public.affairs_dormitory_conduct is 'One active account-owned explicit local empty/unknown notice snapshot for source34-2. Absence is unknown, never evidence of an empty record. No populated conduct rows, housing eligibility, official synchronization, documents or issuance capability are modeled.';
create unique index affairs_dormitory_conduct_active_owner_idx on public.affairs_dormitory_conduct(user_id) where deleted_at is null;
alter table public.affairs_dormitory_conduct enable row level security;
revoke all on public.affairs_dormitory_conduct from public,anon,authenticated;
grant select on public.affairs_dormitory_conduct to authenticated;
create policy dormitory_conduct_read on public.affairs_dormitory_conduct for select to authenticated
  using (deleted_at is null and (select private.affairs_google_identity())
    and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_dormitory_conduct_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table private.affairs_dormitory_conduct_operations enable row level security;
revoke all on private.affairs_dormitory_conduct_operations from public,anon,authenticated;

create function private.affairs_dormitory_conduct_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Dormitory conduct metadata owner, identity and provenance are immutable' using errcode='42501';
  end if;
  if old.deleted_at is not null then raise exception 'Deleted dormitory conduct IDs cannot be reused' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.affairs_dormitory_conduct_identity_guard() from public,anon,authenticated;
create trigger dormitory_conduct_identity before update on public.affairs_dormitory_conduct
  for each row execute function private.affairs_dormitory_conduct_identity_guard();

create function public.affairs_dormitory_conduct_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.affairs_dormitory_conduct_access() from public,anon;
grant execute on function public.affairs_dormitory_conduct_access() to authenticated;

create function private.affairs_dormitory_conduct_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind when 'save_dormitory_conduct' then array['result']
    when 'delete_dormitory_conduct' then array[]::text[] else null end;
$$;
create function private.affairs_dormitory_conduct_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;n numeric;minimum integer;
begin
  fields:=private.affairs_dormitory_conduct_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>1024 then return false;end if;
  fields:=array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field='expected_version' then
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      n:=(value->>field)::numeric;minimum:=case when p_kind='delete_dormitory_conduct' then 1 else 0 end;
      if n<>trunc(n) or n<minimum or n>999999998 then return false;end if;
    elsif field='result' then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field not in ('empty','unknown') then return false;end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_dormitory_conduct_fields(text),private.affairs_dormitory_conduct_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_dormitory_conduct(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;deleting boolean;
  before_row public.affairs_dormitory_conduct;after_row public.affairs_dormitory_conduct;operation_result jsonb;receipt private.affairs_dormitory_conduct_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_dormitory_conduct_payload_valid(p_kind,p_payload) then raise exception 'Invalid dormitory conduct metadata operation or field' using errcode='22023';end if;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=((p_payload->>'expected_version')::numeric)::integer;deleting:=p_kind='delete_dormitory_conduct';
  -- Actor -> selected owner -> record lock order; exact replay survives later edits/deletion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dorm-conduct:actor:'||actor::text,0));
  select * into receipt from private.affairs_dormitory_conduct_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dorm-conduct:owner:'||owner_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dorm-conduct:record:'||record_id::text,0));
  select * into before_row from public.affairs_dormitory_conduct where id=record_id for update;
  if before_row.id is not null and before_row.user_id<>owner_id then raise exception 'Dormitory conduct metadata cannot be reassigned' using errcode='42501';end if;
  if before_row.deleted_at is not null then raise exception 'Deleted dormitory conduct IDs cannot be reused' using errcode='PT409';end if;
  if coalesce(before_row.version,0)<>expected then raise exception 'This dormitory conduct metadata changed. Refresh and retry.' using errcode='PT409';end if;
  if deleting then
    update public.affairs_dormitory_conduct as target set deleted_at=now(),updated_at=now(),version=version+1
      where id=record_id and user_id=owner_id and version=expected and deleted_at is null returning target.* into after_row;
  else
    if before_row.id is null and exists(select 1 from public.affairs_dormitory_conduct where user_id=owner_id and deleted_at is null) then
      raise exception 'This account already has active dormitory conduct metadata. Refresh and edit the existing record.' using errcode='PT409';
    end if;
    insert into public.affairs_dormitory_conduct as target (id,user_id,result) values(record_id,owner_id,p_payload->>'result')
      on conflict(id) do update set result=excluded.result,version=target.version+1,updated_at=now()
      where target.user_id=owner_id and target.version=expected and target.deleted_at is null returning target.* into after_row;
  end if;
  if after_row.id is null then raise exception 'This dormitory conduct metadata changed. Refresh and retry.' using errcode='PT409';end if;
  operation_result:=jsonb_build_object('id',record_id,'kind',p_kind,'version',after_row.version,'summary',
    case when deleting then 'Deleted local dormitory conduct metadata; its ID and receipt remain reserved.' else 'Saved an explicit local empty/unknown notice. No university record or eligibility was inferred.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,operation_result->>'summary');
  insert into private.affairs_dormitory_conduct_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,operation_result);
  return operation_result;
exception when unique_violation then raise exception 'This account already has active dormitory conduct metadata. Refresh and edit the existing record.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_dormitory_conduct(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_dormitory_conduct(text,jsonb) to authenticated;
