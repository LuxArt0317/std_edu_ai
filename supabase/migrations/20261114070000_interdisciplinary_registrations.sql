-- Student-owned registration history for the published interdisciplinary directory.
create table public.affairs_interdisciplinary_registrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  program_code text not null references public.affairs_interdisciplinary_programs(code),
  academic_year smallint not null check (academic_year between 88 and 500),
  semester smallint not null check (semester in (1,2)),
  withdrawn_year smallint check (withdrawn_year between 88 and 500),
  withdrawn_semester smallint check (withdrawn_semester in (1,2)),
  completed_year smallint check (completed_year between 88 and 500),
  completed_semester smallint check (completed_semester in (1,2)),
  version integer not null default 1 check (version between 1 and 1000000),
  primary key (user_id, program_code),
  check ((withdrawn_year is null) = (withdrawn_semester is null)),
  check ((completed_year is null) = (completed_semester is null)),
  check (withdrawn_year is null or completed_year is null),
  check (withdrawn_year is null or (withdrawn_year, withdrawn_semester) >= (academic_year, semester)),
  check (completed_year is null or (completed_year, completed_semester) >= (academic_year, semester))
);

alter table public.affairs_interdisciplinary_registrations enable row level security;
revoke all on public.affairs_interdisciplinary_registrations from public, anon, authenticated;
grant select on public.affairs_interdisciplinary_registrations to authenticated;
create policy interdisciplinary_registrations_own_read
  on public.affairs_interdisciplinary_registrations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.affairs_google_identity()));

create table private.affairs_interdisciplinary_registration_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  receipt jsonb not null,
  primary key (user_id, request_id)
);
alter table private.affairs_interdisciplinary_registration_receipts enable row level security;
revoke all on private.affairs_interdisciplinary_registration_receipts from public, anon, authenticated;

create function public.affairs_change_interdisciplinary_registration(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  fields text[] := array['program_code','operation','expected_version','request_id'];
  code text;
  expected integer;
  key uuid;
  taipei date := (now() at time zone 'Asia/Taipei')::date;
  term_year smallint := extract(year from taipei)::integer - 1911 - case when extract(month from taipei) < 8 then 1 else 0 end;
  term_semester smallint := case when extract(month from taipei) between 2 and 7 then 2 else 1 end;
  current_row public.affairs_interdisciplinary_registrations;
  saved private.affairs_interdisciplinary_registration_receipts;
  result jsonb;
begin
  if actor is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 1024
    or not (p_payload ?& fields) or p_payload - fields <> '{}'::jsonb
    or jsonb_typeof(p_payload->'program_code') is distinct from 'string'
    or p_payload->>'program_code' !~ '^PU[0-9]{3}$'
    or jsonb_typeof(p_payload->'operation') is distinct from 'string'
    or p_payload->>'operation' not in ('register','withdraw')
    or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or p_payload->>'expected_version' !~ '^[0-9]{1,6}$'
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
    or p_payload->>'request_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid program registration request' using errcode = '22023';
  end if;
  code := p_payload->>'program_code';
  expected := (p_payload->>'expected_version')::integer;
  key := (p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('program-registration:' || actor::text,0));
  select * into saved from private.affairs_interdisciplinary_registration_receipts
    where user_id = actor and request_id = key;
  if found then
    if saved.payload <> p_payload then
      raise exception 'Request ID already used' using errcode = 'PT409';
    end if;
    return saved.receipt;
  end if;

  select * into current_row from public.affairs_interdisciplinary_registrations
    where user_id = actor and program_code = code for update;
  if expected <> coalesce(current_row.version,0) then
    raise exception 'Registration changed. Reload and retry.' using errcode = 'PT409';
  end if;
  if p_payload->>'operation' = 'register' then
    if current_row.user_id is not null then
      raise exception 'Registration history already exists' using errcode = 'PT409';
    end if;
    if not exists (select 1 from public.affairs_interdisciplinary_programs where affairs_interdisciplinary_programs.code = (p_payload->>'program_code')) then
      raise exception 'Unknown program' using errcode = '22023';
    end if;
    insert into public.affairs_interdisciplinary_registrations(user_id, program_code, academic_year, semester)
      values (actor,code,term_year,term_semester) returning * into current_row;
  else
    if current_row.user_id is null or current_row.withdrawn_year is not null or current_row.completed_year is not null then
      raise exception 'Only an active registration can be withdrawn' using errcode = 'PT409';
    end if;
    update public.affairs_interdisciplinary_registrations set withdrawn_year=term_year,
      withdrawn_semester=term_semester, version=expected+1
      where user_id=actor and program_code=code returning * into current_row;
  end if;
  result := jsonb_build_object('userId',actor,'requestId',key,'programCode',code,'version',current_row.version);
  insert into private.affairs_interdisciplinary_registration_receipts(user_id,request_id,payload,receipt)
    values (actor,key,p_payload,result);
  return result;
end;
$$;

revoke all on function public.affairs_change_interdisciplinary_registration(jsonb) from public, anon;
grant execute on function public.affairs_change_interdisciplinary_registration(jsonb) to authenticated;
