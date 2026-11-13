-- DRAFT: independent local certificate assessments. No official eligibility, issuance, storage, or download capability.
create table public.affairs_enrollment_certificate_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer check(academic_year is null or academic_year between 1 and 9999),
  semester smallint check(semester is null or semester between 1 and 3),
  has_pending_fees text check(has_pending_fees is null or has_pending_fees in ('Y','N')),
  status text not null check(status in ('unknown','blocked','local_eligible')),
  result_text text check(result_text is null or char_length(result_text)<=500),
  assessed_at timestamptz check(assessed_at is null or isfinite(assessed_at)),
  student_number text check(student_number is null or char_length(student_number)<=80),
  student_name text check(student_name is null or char_length(student_name)<=160),
  department_name text check(department_name is null or char_length(department_name)<=160),
  year_text text check(year_text is null or char_length(year_text)<=30),
  class_label text check(class_label is null or char_length(class_label)<=80),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(id,user_id)
);
comment on table public.affairs_enrollment_certificate_assessments is 'One explicit current stu.best assessment per account. Null is unknown. Fees, terms, and source notices do not compute status or establish university eligibility.';
create table public.affairs_enrollment_certificate_documents (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  assessment_id uuid not null,
  assessment_version integer not null check(assessment_version between 1 and 999999999),
  issuer text not null check(issuer='stu.best'),
  purpose text not null check(purpose='local_enrollment_reference'),
  status text not null check(status in ('metadata_only','revoked')),
  verified_at timestamptz check(verified_at is null),
  expires_at timestamptz check(expires_at is null or isfinite(expires_at)),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(assessment_id,user_id) references public.affairs_enrollment_certificate_assessments(id,user_id) on delete cascade
);
comment on table public.affairs_enrollment_certificate_documents is 'Unverified local reference metadata only: no URL, bearer token, storage path or bytes. verified_at is always null and available is forbidden. A later reviewed content-verification/download implementation is required before activation.';
create unique index affairs_certificate_one_metadata_revision_idx on public.affairs_enrollment_certificate_documents(assessment_id,assessment_version) where status='metadata_only';
create index affairs_certificate_documents_owner_idx on public.affairs_enrollment_certificate_documents(user_id,id);
create table private.affairs_enrollment_certificate_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
do $$ declare t text;begin
  foreach t in array array['affairs_enrollment_certificate_assessments','affairs_enrollment_certificate_documents'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy enrollment_certificate_read on public.%I for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())))',t);
  end loop;
end;$$;
alter table private.affairs_enrollment_certificate_operations enable row level security;
revoke all on private.affairs_enrollment_certificate_operations from public,anon,authenticated;

-- Use the same protected administrator predicate as RLS/RPC, rather than
-- interpreting a role label alone as permission to read every account.
create function public.affairs_enrollment_certificate_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.affairs_enrollment_certificate_access() from public,anon;
grant execute on function public.affairs_enrollment_certificate_access() to authenticated;

create function private.affairs_certificate_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind
    when 'save_enrollment_certificate_assessment' then array['academic_year','semester','has_pending_fees','status','result_text','assessed_at','student_number','student_name','department_name','year_text','class_label']
    when 'save_enrollment_certificate_document' then array['assessment_id','assessment_version','issuer','purpose','status','verified_at','expires_at']
    else null end;
$$;
create function private.affairs_certificate_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;maximum integer;number numeric;stamp text;
begin
  fields:=private.affairs_certificate_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>8000 then return false;end if;
  fields:=array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id','assessment_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field in ('expected_version','academic_year','semester','assessment_version') then
      if field in ('academic_year','semester') and value->field='null'::jsonb then continue;end if;
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      number:=(value->>field)::numeric;
      maximum:=case field when 'expected_version' then 999999998 when 'assessment_version' then 999999999 when 'semester' then 3 else 9999 end;
      if number<>trunc(number) or number<(case when field='expected_version' then 0 else 1 end) or number>maximum then return false;end if;
    elsif field in ('assessed_at','verified_at','expires_at') then
      if value->field='null'::jsonb then continue;end if;
      if field='verified_at' or jsonb_typeof(value->field) is distinct from 'string' then return false;end if;
      stamp:=value->>field;
      if stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' then return false;end if;
      perform stamp::timestamptz;
    elsif field='has_pending_fees' then
      if value->field<>'null'::jsonb and (jsonb_typeof(value->field) is distinct from 'string' or value->>field not in ('Y','N')) then return false;end if;
    elsif field='status' then
      if jsonb_typeof(value->field) is distinct from 'string' then return false;end if;
      if p_kind='save_enrollment_certificate_assessment' and value->>field not in ('unknown','blocked','local_eligible') then return false;end if;
      if p_kind='save_enrollment_certificate_document' and value->>field not in ('metadata_only','revoked') then return false;end if;
    elsif field in ('issuer','purpose') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field<>(case when field='issuer' then 'stu.best' else 'local_enrollment_reference' end) then return false;end if;
    else
      if value->field='null'::jsonb then continue;end if;
      maximum:=case field when 'result_text' then 500 when 'student_name' then 160 when 'department_name' then 160 when 'year_text' then 30 else 80 end;
      if jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>maximum then return false;end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_certificate_fields(text),private.affairs_certificate_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_enrollment_certificate(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;target_table text;
  fields text[];columns_sql text;values_sql text;updates_sql text;before_row jsonb;after_row jsonb;result jsonb;
  linked public.affairs_enrollment_certificate_assessments;receipt private.affairs_enrollment_certificate_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_certificate_payload_valid(p_kind,p_payload) then raise exception 'Invalid certificate operation or field' using errcode='22023';end if;
  target_table:=case p_kind when 'save_enrollment_certificate_assessment' then 'affairs_enrollment_certificate_assessments' else 'affairs_enrollment_certificate_documents' end;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;request_id_value:=(p_payload->>'request_id')::uuid;expected:=(p_payload->>'expected_version')::integer;
  -- Per-actor receipts use an advisory lock, not a profile row lock: two admins
  -- may write each other's records without deadlocking on profile foreign keys.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('enrollment-certificate:actor:'||actor::text,0));
  select * into receipt from private.affairs_enrollment_certificate_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('enrollment-certificate:'||owner_id::text,0));
  -- An ID collision from two different owners must not bypass ownership checks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('enrollment-certificate:record:'||target_table||':'||record_id::text,0));
  -- Always lock assessment before document. An assessment update makes old references stale without reassigning them.
  if p_kind='save_enrollment_certificate_document' then
    select * into linked from public.affairs_enrollment_certificate_assessments where id=(p_payload->>'assessment_id')::uuid for update;
    if not found or linked.user_id<>owner_id then raise exception 'Linked assessment unavailable' using errcode='42501';end if;
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',target_table) into before_row using record_id;
  if before_row is not null and (before_row->>'user_id')::uuid<>owner_id then raise exception 'Certificate records cannot be reassigned' using errcode='42501';end if;
  if coalesce((before_row->>'version')::integer,0)<>expected then raise exception 'This certificate record changed. Refresh and retry.' using errcode='PT409';end if;
  if p_kind='save_enrollment_certificate_document' then
    if before_row is not null and ((before_row->>'assessment_id')::uuid<>(p_payload->>'assessment_id')::uuid or (before_row->>'assessment_version')::integer<>(p_payload->>'assessment_version')::integer) then
      raise exception 'Document assessment linkage is immutable' using errcode='42501';
    end if;
    if (before_row is null or p_payload->>'status'='metadata_only') and linked.version<>(p_payload->>'assessment_version')::integer then
      raise exception 'The linked assessment revision changed. Refresh and retry.' using errcode='PT409';
    end if;
  end if;
  fields:=private.affairs_certificate_fields(p_kind);
  select string_agg(format('%I',name),',' order by ordinal),string_agg(format('r.%I',name),',' order by ordinal)
    into columns_sql,values_sql from unnest(array['id','user_id']||fields) with ordinality field(name,ordinal);
  select string_agg(format('%I=excluded.%I',name,name),',' order by ordinal)
    into updates_sql from unnest(fields) with ordinality field(name,ordinal);
  execute format('insert into public.%I as target (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict(id) do update set %s,version=target.version+1,updated_at=now() where target.user_id=$2 and target.version=$3 returning to_jsonb(target)',
    target_table,columns_sql,values_sql,target_table,updates_sql) into after_row using p_payload-array['request_id','expected_version'],owner_id,expected;
  if after_row is null then raise exception 'This certificate record changed. Refresh and retry.' using errcode='PT409';end if;
  result:=jsonb_build_object('id',record_id,'kind',p_kind,'version',(after_row->>'version')::integer,'summary',
    case p_kind when 'save_enrollment_certificate_assessment' then 'Saved explicit local certificate assessment.' else 'Saved unverified local document metadata. No file is available.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,result->>'summary');
  insert into private.affairs_enrollment_certificate_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,result);
  return result;
exception when unique_violation then
  raise exception 'This account or assessment revision already has a record. Refresh and edit the existing record.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_enrollment_certificate(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_enrollment_certificate(text,jsonb) to authenticated;
