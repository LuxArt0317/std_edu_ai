-- Student-maintained course equivalencies and local review, separate from transcripts.
create table public.affairs_credit_transfer_applications (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  reason text not null check(reason in ('external_transfer','department_transfer','returning_transfer','minor','double_major','freshman')),
  previous_school text not null check(char_length(btrim(previous_school)) between 1 and 160),
  courses jsonb not null check(jsonb_typeof(courses)='array' and jsonb_array_length(courses) between 1 and 20),
  status text not null check(status in ('draft','submitted','reviewed')),
  decisions jsonb check(decisions is null or (jsonb_typeof(decisions)='array' and jsonb_array_length(decisions)=jsonb_array_length(courses))),
  version integer not null check(version between 1 and 1000000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  check((status='draft')=(submitted_at is null)),
  check((status='reviewed')=(reviewed_at is not null) and (status='reviewed')=(decisions is not null)),
  unique(user_id,reason)
);
alter table public.affairs_credit_transfer_applications enable row level security;
revoke all on public.affairs_credit_transfer_applications from public,anon,authenticated;
grant select on public.affairs_credit_transfer_applications to authenticated;
create policy credit_transfer_read on public.affairs_credit_transfer_applications for select to authenticated using
  ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_credit_transfer_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(actor,request_id)
);
alter table private.affairs_credit_transfer_receipts enable row level security;
revoke all on private.affairs_credit_transfer_receipts from public,anon,authenticated;

create function private.affairs_valid_credit_transfer_courses(p_rows jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  item jsonb;
  field text;
  fields text[]:=array['previous_title','previous_credits','requested_title','requested_credits','course_kind'];
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_rows) not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& fields) or item-fields<>'{}'::jsonb then return false; end if;
    if coalesce(item->>'course_kind','') not in ('required','elective') then return false; end if;
    foreach field in array array['previous_title','requested_title'] loop
      if jsonb_typeof(item->field) is distinct from 'string' or char_length(btrim(item->>field)) not between 1 and 160 then return false; end if;
    end loop;
    foreach field in array array['previous_credits','requested_credits'] loop
      if jsonb_typeof(item->field) is distinct from 'number' or item->>field !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.affairs_valid_credit_transfer_courses(jsonb) from public,anon,authenticated;

create function public.affairs_change_credit_transfer(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := (select auth.uid());
  fields text[] := array['id','expected_version','request_id'];
  application_id uuid;
  request_key uuid;
  expected integer;
  prior private.affairs_credit_transfer_receipts;
  current_application public.affairs_credit_transfer_applications;
  receipt jsonb;
begin
  if actor_id is null or not(select private.affairs_google_identity()) or
    (p_kind='review_credit_transfer' and not(select private.affairs_is_admin())) then
    raise exception 'Credit transfer operation is not authorized' using errcode='42501';
  end if;
  case p_kind
    when 'save_credit_transfer' then fields:=fields||array['reason','previous_school','courses'];
    when 'submit_credit_transfer' then null;
    when 'review_credit_transfer' then fields:=fields||array['decisions'];
    else raise exception 'Invalid credit transfer operation' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>36000 or
    not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb or
    coalesce(p_payload->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or p_payload->>'expected_version' !~ '^[0-9]{1,6}$' then
    raise exception 'Invalid credit transfer fields' using errcode='22023';
  end if;
  application_id:=(p_payload->>'id')::uuid;
  request_key:=(p_payload->>'request_id')::uuid;
  expected:=(p_payload->>'expected_version')::integer;
  perform pg_advisory_xact_lock(hashtextextended('credit-transfer-actor:'||actor_id::text,0));
  select * into prior from private.affairs_credit_transfer_receipts where actor=actor_id and request_id=request_key;
  if found then
    if prior.kind<>p_kind or prior.payload<>p_payload then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credit-transfer-application:'||application_id::text,0));
  select * into current_application from public.affairs_credit_transfer_applications where id=application_id for update;
  if (p_kind<>'review_credit_transfer' and current_application.user_id is not null and current_application.user_id<>actor_id)
    or (p_kind<>'save_credit_transfer' and current_application.id is null) then
    raise exception 'Credit transfer application unavailable' using errcode='42501';
  end if;
  if coalesce(current_application.version,0)<>expected then
    raise exception 'Credit transfer application changed' using errcode='PT409';
  end if;
  if p_kind='save_credit_transfer' then
    if current_application.id is not null and (current_application.status<>'draft' or
      current_application.reason is distinct from p_payload->>'reason') then
      raise exception 'Only drafts can be edited, and their reason cannot change' using errcode='PT409';
    end if;
    if coalesce(p_payload->>'reason','') not in ('external_transfer','department_transfer','returning_transfer','minor','double_major','freshman')
      or jsonb_typeof(p_payload->'previous_school') is distinct from 'string'
      or char_length(btrim(p_payload->>'previous_school')) not between 1 and 160
      or not private.affairs_valid_credit_transfer_courses(p_payload->'courses') then
      raise exception 'Invalid course equivalencies' using errcode='22023';
    end if;
    if current_application.id is null then
      insert into public.affairs_profiles(user_id,email,display_name)
        select id,email,coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1))
        from auth.users where id=actor_id and email_confirmed_at is not null
        on conflict(user_id) do nothing;
      if not exists(select 1 from public.affairs_profiles where user_id=actor_id) then
        raise exception 'Verified School Affairs profile required' using errcode='42501';
      end if;
      insert into public.affairs_credit_transfer_applications(id,user_id,reason,previous_school,courses,status,version)
      values(application_id,actor_id,p_payload->>'reason',btrim(p_payload->>'previous_school'),p_payload->'courses','draft',1)
      on conflict (user_id,reason) do nothing returning * into current_application;
      if not found then raise exception 'An application for this reason already exists' using errcode='PT409'; end if;
    else
      update public.affairs_credit_transfer_applications set previous_school=btrim(p_payload->>'previous_school'),
        courses=p_payload->'courses',version=expected+1 where id=application_id returning * into current_application;
    end if;
  elsif p_kind='submit_credit_transfer' then
    if current_application.status<>'draft' then raise exception 'Only drafts can be submitted' using errcode='PT409'; end if;
    update public.affairs_credit_transfer_applications set status='submitted',submitted_at=now(),version=expected+1
      where id=application_id returning * into current_application;
  else
    if current_application.status<>'submitted' then raise exception 'Only submitted applications can be reviewed' using errcode='PT409'; end if;
    if jsonb_typeof(p_payload->'decisions') is distinct from 'array' then raise exception 'Invalid course decisions' using errcode='22023'; end if;
    if jsonb_array_length(p_payload->'decisions')<>jsonb_array_length(current_application.courses)
      or exists(select 1 from jsonb_array_elements(p_payload->'decisions') x(value)
        where jsonb_typeof(x.value)<>'string' or x.value#>>'{}' not in ('transferred','waived','rejected')) then
      raise exception 'Each course needs a valid decision' using errcode='22023';
    end if;
    update public.affairs_credit_transfer_applications set status='reviewed',reviewed_at=now(),
      decisions=p_payload->'decisions',version=expected+1 where id=application_id returning * into current_application;
  end if;
  receipt:=to_jsonb(current_application);
  insert into private.affairs_credit_transfer_receipts values(actor_id,request_key,p_kind,p_payload,receipt);
  return receipt;
end;
$$;
revoke all on function public.affairs_change_credit_transfer(text,jsonb) from public,anon;
grant execute on function public.affairs_change_credit_transfer(text,jsonb) to authenticated;
