-- DRAFT ONLY. Source21-1 exposed an index and unavailable application/history
-- notices. This stores explicit local metadata, not a loan application or file.
create table public.affairs_student_loan (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  current_term_label text check(current_term_label is null or char_length(current_term_label)<=160),
  current_application_state text not null check(current_application_state in ('unknown','not_applied','recorded')),
  current_application_text text check(current_application_text is null or char_length(current_application_text)<=2000),
  progress_text text check(progress_text is null or char_length(progress_text)<=2000),
  history_count integer check(history_count is null or history_count between 0 and 1000000),
  history_text text check(history_text is null or char_length(history_text)<=2000),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version between 1 and 999999999),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at)),
  deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at))
);
comment on table public.affairs_student_loan is 'One active account-owned local loan metadata snapshot. All source-facing values are explicit and independent. Unknown, not_applied and recorded describe entered local metadata only. Absent metadata, null text/count, blank text and zero count remain distinct. No official application, approval, amount, eligibility, file, document or issuing capability exists.';
create unique index affairs_student_loan_active_owner_idx on public.affairs_student_loan(user_id) where deleted_at is null;
alter table public.affairs_student_loan enable row level security;
revoke all on public.affairs_student_loan from public,anon,authenticated;
grant select on public.affairs_student_loan to authenticated;
create policy student_loan_read on public.affairs_student_loan for select to authenticated
  using (deleted_at is null and (select private.affairs_google_identity())
    and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_student_loan_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table private.affairs_student_loan_operations enable row level security;
revoke all on private.affairs_student_loan_operations from public,anon,authenticated;

create function private.affairs_student_loan_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.source_mode<>old.source_mode or new.created_at<>old.created_at then
    raise exception 'Local loan metadata owner, identity and provenance are immutable' using errcode='42501';
  end if;
  if old.deleted_at is not null then raise exception 'Deleted loan metadata IDs cannot be reused' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.affairs_student_loan_identity_guard() from public,anon,authenticated;
create trigger student_loan_identity before update on public.affairs_student_loan
  for each row execute function private.affairs_student_loan_identity_guard();

create function public.affairs_student_loan_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  return jsonb_build_object('userId',(select auth.uid()),'canManage',(select private.affairs_is_admin()));
end;$$;
revoke all on function public.affairs_student_loan_access() from public,anon;
grant execute on function public.affairs_student_loan_access() to authenticated;

create function private.affairs_student_loan_fields(p_kind text) returns text[]
language sql immutable set search_path='' as $$
  select case p_kind when 'save_student_loan' then array[
    'current_term_label','current_application_state','current_application_text','progress_text','history_count','history_text']
    when 'delete_student_loan' then array[]::text[] else null end;
$$;
create function private.affairs_student_loan_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];field text;n numeric;minimum integer;maximum integer;
begin
  fields:=private.affairs_student_loan_fields(p_kind);
  if fields is null or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>32000 then return false;end if;
  fields:=array['id','user_id','request_id','expected_version']||fields;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  foreach field in array fields loop
    if field in ('id','user_id','request_id') then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
    elsif field in ('expected_version','history_count') then
      if field='history_count' and value->field='null'::jsonb then continue;end if;
      if jsonb_typeof(value->field) is distinct from 'number' then return false;end if;
      n:=(value->>field)::numeric;minimum:=case when field='expected_version' and p_kind='delete_student_loan' then 1 else 0 end;
      maximum:=case field when 'history_count' then 1000000 else 999999998 end;
      if n<>trunc(n) or n<minimum or n>maximum then return false;end if;
    elsif field='current_application_state' then
      if jsonb_typeof(value->field) is distinct from 'string' or value->>field not in ('unknown','not_applied','recorded') then return false;end if;
    else
      if value->field='null'::jsonb then continue;end if;
      maximum:=case field when 'current_term_label' then 160 when 'current_application_text' then 2000 when 'progress_text' then 2000 when 'history_text' then 2000 end;
      if maximum is null or jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>maximum then return false;end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;$$;
revoke all on function private.affairs_student_loan_fields(text),private.affairs_student_loan_payload_valid(text,jsonb) from public,anon,authenticated;

create function public.affairs_manage_student_loan(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());record_id uuid;owner_id uuid;request_id_value uuid;expected integer;deleting boolean;
  before_row public.affairs_student_loan;after_row public.affairs_student_loan;result jsonb;receipt private.affairs_student_loan_operations;
begin
  if not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  if not private.affairs_student_loan_payload_valid(p_kind,p_payload) then raise exception 'Invalid loan metadata operation or field' using errcode='22023';end if;
  record_id:=(p_payload->>'id')::uuid;owner_id:=(p_payload->>'user_id')::uuid;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=((p_payload->>'expected_version')::numeric)::integer;deleting:=p_kind='delete_student_loan';
  -- Exact receipt replay precedes the target check, including after later edits/deletion.
  -- All writes serialize actor -> selected owner -> record; no Auth/profile mutation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loan:actor:'||actor::text,0));
  select * into receipt from private.affairs_student_loan_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409';end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loan:owner:'||owner_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loan:record:'||record_id::text,0));
  select * into before_row from public.affairs_student_loan where id=record_id for update;
  if before_row.id is not null and before_row.user_id<>owner_id then raise exception 'Loan metadata cannot be reassigned' using errcode='42501';end if;
  if before_row.deleted_at is not null then raise exception 'Deleted loan metadata IDs cannot be reused' using errcode='PT409';end if;
  if coalesce(before_row.version,0)<>expected then raise exception 'This loan metadata changed. Refresh and retry.' using errcode='PT409';end if;
  if deleting then
    update public.affairs_student_loan as target set deleted_at=now(),updated_at=now(),version=version+1
      where id=record_id and user_id=owner_id and version=expected and deleted_at is null returning target.* into after_row;
  else
    if before_row.id is null and exists(select 1 from public.affairs_student_loan where user_id=owner_id and deleted_at is null) then
      raise exception 'This account already has active loan metadata. Refresh and edit the existing record.' using errcode='PT409';
    end if;
    insert into public.affairs_student_loan as target (id,user_id,current_term_label,current_application_state,current_application_text,progress_text,history_count,history_text)
      values(record_id,owner_id,p_payload->>'current_term_label',p_payload->>'current_application_state',p_payload->>'current_application_text',
        p_payload->>'progress_text',((p_payload->>'history_count')::numeric)::integer,p_payload->>'history_text')
      on conflict(id) do update set current_term_label=excluded.current_term_label,current_application_state=excluded.current_application_state,
        current_application_text=excluded.current_application_text,progress_text=excluded.progress_text,history_count=excluded.history_count,history_text=excluded.history_text,
        version=target.version+1,updated_at=now()
      where target.user_id=owner_id and target.version=expected and target.deleted_at is null returning target.* into after_row;
  end if;
  if after_row.id is null then raise exception 'This loan metadata changed. Refresh and retry.' using errcode='PT409';end if;
  result:=jsonb_build_object('id',record_id,'kind',p_kind,'version',after_row.version,'summary',
    case when deleting then 'Deleted local loan metadata; its ID and receipt remain reserved.' else 'Saved explicit local loan metadata. No application, approval or document was issued.' end);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,record_id,result->>'summary');
  insert into private.affairs_student_loan_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,result);
  return result;
exception when unique_violation then raise exception 'This account already has active loan metadata. Refresh and edit the existing record.' using errcode='PT409';
end;$$;
revoke all on function public.affairs_manage_student_loan(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_student_loan(text,jsonb) to authenticated;
