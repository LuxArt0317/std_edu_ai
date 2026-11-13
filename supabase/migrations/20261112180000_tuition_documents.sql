-- DRAFT ONLY. Explicit stu.best local statements and unverified document metadata.
-- No official amounts, eligibility, issuance, Storage object or download capability is inferred.
create function private.affairs_tuition_label_valid(value text) returns boolean
language sql immutable set search_path='' as $$
  select value is not null and char_length(value) between 1 and 160
    and btrim(value, E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'';
$$;
revoke all on function private.affairs_tuition_label_valid(text) from public,anon,authenticated;

create table public.affairs_tuition_settlements (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  period_label text not null check(private.affairs_tuition_label_valid(period_label)),
  statement_text text check(statement_text is null or char_length(statement_text)<=4000),
  row_order integer not null check(row_order between 0 and 10000),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at))
);
comment on table public.affairs_tuition_settlements is 'One explicit local period/statement snapshot. The source showed an empty period selector, not result columns. No academic year, amounts, credit totals, paid status or entitlement is derived. Null statement is unknown; blank text is a literal blank.';
create index affairs_tuition_settlements_owner_idx on public.affairs_tuition_settlements(user_id,id) where deleted_at is null;
create table public.affairs_tuition_document_metadata (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  kind text not null check(kind in ('summer','evening')),
  period_label text check(period_label is null or char_length(period_label)<=160),
  note_text text check(note_text is null or char_length(note_text)<=1000),
  status text not null check(status in ('metadata_only','revoked')),
  issuer text not null default 'stu.best' check(issuer='stu.best'),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at))
);
comment on table public.affairs_tuition_document_metadata is 'Admin-only application projection of unverified local metadata; table SELECT remains owner/admin RLS. No available/issued/verified state, URL, file bytes, path or signed capability exists. Revocation is terminal. A separately reviewed upload/content-verification/download workflow is required before Print can be enabled. Extended-study source remains Index/unavailable.';
create unique index affairs_tuition_document_active_kind_idx on public.affairs_tuition_document_metadata(user_id,kind) where deleted_at is null;
create index affairs_tuition_document_owner_idx on public.affairs_tuition_document_metadata(user_id,id) where deleted_at is null;
create table private.affairs_tuition_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table private.affairs_tuition_operations enable row level security;
revoke all on private.affairs_tuition_operations from public,anon,authenticated;
do $$ declare t text;begin
  foreach t in array array['affairs_tuition_settlements','affairs_tuition_document_metadata'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy tuition_read on public.%I for select to authenticated using (deleted_at is null and (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())))',t);
  end loop;
end;$$;

create function private.affairs_tuition_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Local tuition identity and provenance are immutable' using errcode='42501';
  end if;
  if old.deleted_at is not null then raise exception 'Deleted tuition IDs cannot be reused' using errcode='PT409';end if;
  if tg_table_name='affairs_tuition_document_metadata' then
    if new.kind<>old.kind or new.issuer<>old.issuer then raise exception 'Document owner, kind and issuer are immutable' using errcode='42501';end if;
    if old.status='revoked' and new.status<>'revoked' then raise exception 'Document revocation is terminal' using errcode='22023';end if;
  end if;
  return new;
end;$$;
revoke all on function private.affairs_tuition_identity_guard() from public,anon,authenticated;
create trigger tuition_settlement_identity before update on public.affairs_tuition_settlements for each row execute function private.affairs_tuition_identity_guard();
create trigger tuition_document_identity before update on public.affairs_tuition_document_metadata for each row execute function private.affairs_tuition_identity_guard();

create function public.affairs_tuition_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.affairs_tuition_access() from public,anon;
grant execute on function public.affairs_tuition_access() to authenticated;

create function private.affairs_tuition_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind
    when 'save_tuition_settlement' then array['period_label','statement_text','row_order']
    when 'save_tuition_document_metadata' then array['kind','period_label','note_text','status','issuer']
    when 'delete_tuition_settlement' then array[]::text[]
    when 'delete_tuition_document_metadata' then array[]::text[]
    else null end;
$$;
create function private.affairs_tuition_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;n numeric;minimum integer;maximum integer;
begin
  fields:=private.affairs_tuition_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>26000 then return false;end if;
  fields:=array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field in ('expected_version','row_order') then
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      n:=(value->>field)::numeric;minimum:=case when field='expected_version' and p_kind like 'delete_%' then 1 else 0 end;
      maximum:=case field when 'row_order' then 10000 else 999999998 end;
      if n<>trunc(n) or n<minimum or n>maximum then return false;end if;
    elsif field='kind' then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field not in ('summer','evening') then return false;end if;
    elsif field='status' then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field not in ('metadata_only','revoked') then return false;end if;
    elsif field='issuer' then
      if value->field is distinct from '"stu.best"'::jsonb then return false;end if;
    elsif field='period_label' and p_kind='save_tuition_settlement' then
      if jsonb_typeof(value->field) is distinct from 'string' or not private.affairs_tuition_label_valid(value->>field) then return false;end if;
    else
      if value->field='null'::jsonb then continue;end if;
      maximum:=case field when 'statement_text' then 4000 when 'note_text' then 1000 else 160 end;
      if jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>maximum then return false;end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_tuition_fields(text),private.affairs_tuition_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_tuition_documents(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;target_table text;deleting boolean;
  fields text[];columns_sql text;values_sql text;updates_sql text;before_row jsonb;after_row jsonb;result jsonb;receipt private.affairs_tuition_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_tuition_payload_valid(p_kind,p_payload) then raise exception 'Invalid tuition operation or field' using errcode='22023';end if;
  deleting:=p_kind in ('delete_tuition_settlement','delete_tuition_document_metadata');
  target_table:=case when p_kind in ('save_tuition_settlement','delete_tuition_settlement') then 'affairs_tuition_settlements' else 'affairs_tuition_document_metadata' end;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;request_id_value:=(p_payload->>'request_id')::uuid;expected:=(p_payload->>'expected_version')::integer;
  -- Serialize receipts before owner/record locks. Never lock or mutate the protected actor's profile.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuition:actor:'||actor::text,0));
  select * into receipt from private.affairs_tuition_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuition:owner:'||owner_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuition:record:'||target_table||':'||record_id::text,0));
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',target_table) into before_row using record_id;
  if before_row is not null and (before_row->>'user_id')::uuid<>owner_id then raise exception 'Tuition records cannot be reassigned' using errcode='42501';end if;
  if before_row->>'deleted_at' is not null then raise exception 'Deleted tuition IDs cannot be reused' using errcode='PT409';end if;
  if coalesce((before_row->>'version')::integer,0)<>expected then raise exception 'This tuition record changed. Refresh and retry.' using errcode='PT409';end if;
  if p_kind='save_tuition_document_metadata' and before_row is not null then
    if before_row->>'kind'<>p_payload->>'kind' or before_row->>'issuer'<>p_payload->>'issuer' then raise exception 'Document kind and issuer are immutable' using errcode='42501';end if;
    if before_row->>'status'='revoked' and p_payload->>'status'<>'revoked' then raise exception 'Document revocation is terminal' using errcode='22023';end if;
  end if;
  if deleting then
    execute format('update public.%I as target set deleted_at=now(),updated_at=now(),version=version+1 where id=$1 and user_id=$2 and version=$3 and deleted_at is null returning to_jsonb(target)',target_table)
      into after_row using record_id,owner_id,expected;
  else
    fields:=private.affairs_tuition_fields(p_kind);
    select string_agg(format('%I',name),',' order by ordinal),string_agg(format('r.%I',name),',' order by ordinal)
      into columns_sql,values_sql from unnest(array['id','user_id']||fields) with ordinality field(name,ordinal);
    select string_agg(format('%I=excluded.%I',name,name),',' order by ordinal)
      into updates_sql from unnest(fields) with ordinality field(name,ordinal);
    execute format('insert into public.%I as target (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict(id) do update set %s,version=target.version+1,updated_at=now() where target.user_id=$2 and target.version=$3 and target.deleted_at is null returning to_jsonb(target)',target_table,columns_sql,values_sql,target_table,updates_sql)
      into after_row using p_payload-array['request_id','expected_version'],owner_id,expected;
  end if;
  if after_row is null then raise exception 'This tuition record changed. Refresh and retry.' using errcode='PT409';end if;
  result:=jsonb_build_object('id',record_id,'kind',p_kind,'version',(after_row->>'version')::integer,'summary',
    case when deleting then 'Deleted local tuition record; its ID and receipt remain reserved.' when p_kind='save_tuition_settlement' then 'Saved literal local tuition statement.' else 'Saved unverified local tuition document metadata. No file is available.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,result->>'summary');
  insert into private.affairs_tuition_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,result);
  return result;
exception when unique_violation then
  raise exception 'This account already has active metadata for this document kind. Refresh and edit the existing record.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_tuition_documents(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_tuition_documents(text,jsonb) to authenticated;
