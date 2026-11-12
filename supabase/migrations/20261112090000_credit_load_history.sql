-- The captured 11-3 history is read-only and empty. Store only administrator-authored
-- local demonstration history; this does not implement the unseen 7-1 application.
create table public.affairs_credit_load_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer not null check (academic_year between 1 and 9999),
  semester smallint not null check (semester between 1 and 3),
  category text not null check (category in ('over','under')),
  requested_credits numeric(6,2) not null check (requested_credits between 0 and 9999.99),
  process_text text check (process_text is null or char_length(btrim(process_text)) between 1 and 300),
  result_text text check (result_text is null or char_length(btrim(result_text)) between 1 and 300),
  source_mode text not null default 'local_demo' check (source_mode='local_demo'),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.affairs_credit_load_history.requested_credits is
  'Displayed request value only. Storage limits are not school eligibility rules, approved credits, or enrollment totals.';
create index affairs_credit_load_history_owner_idx on public.affairs_credit_load_history(user_id,academic_year desc,semester desc,id);
create table private.affairs_credit_load_history_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.affairs_credit_load_history enable row level security;
alter table private.affairs_credit_load_history_operations enable row level security;
revoke all on public.affairs_credit_load_history,private.affairs_credit_load_history_operations from public,anon,authenticated;
grant select on public.affairs_credit_load_history to authenticated;
create policy credit_load_history_read on public.affairs_credit_load_history for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_manage_credit_load_history(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid; v_owner uuid; v_request uuid; v_expected integer;
  v_credits numeric;
  v_record public.affairs_credit_load_history;
  v_receipt private.affairs_credit_load_history_operations;
  v_result jsonb;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind is distinct from 'save_credit_load_history' or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>8000 then
    raise exception 'Invalid credit-load history operation' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as field(name) where field.name not in (
    'id','user_id','request_id','expected_version','academic_year','semester','category','requested_credits','process_text','result_text'
  )) then raise exception 'Unsupported credit-load history field' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_payload) as field(name,value) where
    jsonb_typeof(field.value) not in ('string','number','null') or
    (field.name in ('process_text','result_text','category') and jsonb_typeof(field.value) not in ('string','null'))
  ) then raise exception 'Invalid credit-load history field type' using errcode='22023'; end if;
  v_id := (p_payload->>'id')::uuid;
  v_owner := (p_payload->>'user_id')::uuid;
  v_request := (p_payload->>'request_id')::uuid;
  v_expected := (p_payload->>'expected_version')::integer;
  if v_id is null or v_owner is null or v_request is null or v_expected is null or v_expected<0 then
    raise exception 'Record, account, request and version are required' using errcode='22023';
  end if;
  -- Serialize receipt lookup as well as row updates. Retries return their original
  -- result even after a later edit; reused IDs with changed content are conflicts.
  perform 1 from public.affairs_profiles where user_id=v_actor for update;
  select * into v_receipt from private.affairs_credit_load_history_operations where user_id=v_actor and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then
      raise exception 'Request ID was already used for another operation' using errcode='PT409';
    end if;
    return v_receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=v_owner) then
    raise exception 'Student account unavailable' using errcode='42501';
  end if;
  v_credits := (p_payload->>'requested_credits')::numeric;
  if v_credits is null or not (v_credits between 0 and 9999.99) or v_credits<>round(v_credits,2) then
    raise exception 'Invalid displayed credit value' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credit-load-history:'||v_id::text,0));
  select * into v_record from public.affairs_credit_load_history where id=v_id for update;
  if v_record.id is not null and v_record.user_id<>v_owner then
    raise exception 'Credit-load history cannot be reassigned to another account' using errcode='42501';
  end if;
  if coalesce(v_record.version,0)<>v_expected then
    raise exception 'This credit-load history changed. Refresh and try again.' using errcode='PT409';
  end if;
  insert into public.affairs_credit_load_history(id,user_id,academic_year,semester,category,requested_credits,process_text,result_text)
    values(v_id,v_owner,(p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint,
      p_payload->>'category',v_credits,nullif(btrim(p_payload->>'process_text'),''),nullif(btrim(p_payload->>'result_text'),''))
    on conflict(id) do update set academic_year=excluded.academic_year,semester=excluded.semester,
      category=excluded.category,requested_credits=excluded.requested_credits,process_text=excluded.process_text,
      result_text=excluded.result_text,version=affairs_credit_load_history.version+1,updated_at=now()
    returning * into v_record;
  v_result := jsonb_build_object('id',v_record.id,'kind',p_kind,'version',v_record.version,'summary','Saved local demonstration credit-load history.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
    values(v_actor,p_kind,v_record.id,'Saved local demonstration credit-load history.');
  insert into private.affairs_credit_load_history_operations(user_id,request_id,kind,payload,result)
    values(v_actor,v_request,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_manage_credit_load_history(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_credit_load_history(text,jsonb) to authenticated;
