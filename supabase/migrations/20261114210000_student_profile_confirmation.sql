create table public.affairs_student_profiles (
  user_id uuid primary key references public.affairs_profiles(user_id) on delete cascade,
  student_number text not null check (char_length(student_number) between 1 and 40),
  name_zh text not null check (char_length(name_zh) between 1 and 120),
  name_en text check (char_length(name_en) <= 160),
  identity_last_four text check (identity_last_four ~ '^[A-Za-z0-9]{4}$'),
  birthday_label text check (char_length(birthday_label) <= 40),
  gender text check (gender in ('male','female')),
  overseas boolean,
  overseas_place text check (char_length(overseas_place) <= 120),
  indigenous boolean,
  indigenous_place text check (char_length(indigenous_place) <= 120),
  registered_address text check (char_length(registered_address) <= 300),
  mailing_address text check (char_length(mailing_address) <= 300),
  postal_code text check (char_length(postal_code) <= 20),
  home_phone text check (char_length(home_phone) <= 40),
  contact_phone text check (char_length(contact_phone) <= 40),
  original_mobile text check (char_length(original_mobile) <= 40),
  guardian text check (char_length(guardian) <= 120),
  occupation text check (char_length(occupation) <= 120),
  updated_mobile text check (updated_mobile ~ '^[+0-9 ()-]{3,20}$' and updated_mobile ~ '[0-9]'),
  confirmed_at timestamptz,
  version integer not null check (version between 1 and 1000000)
);
create table private.affairs_student_profile_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  target uuid not null references public.affairs_student_profiles(user_id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload_digest bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor,request_id)
);
alter table public.affairs_student_profiles enable row level security;
alter table private.affairs_student_profile_receipts enable row level security;
revoke all on public.affairs_student_profiles, private.affairs_student_profile_receipts from public, anon, authenticated;

create function public.affairs_read_student_profile(p_target uuid default null,p_status_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  target uuid := coalesce(p_target,caller);
  saved public.affairs_student_profiles;
begin
  if caller is null or not(select private.affairs_google_identity()) or
    (p_target is not null and not(select private.affairs_is_admin())) then
    raise exception 'Student profile access denied' using errcode='42501';
  end if;
  if p_status_only is null or (p_status_only and p_target is not null) then
    raise exception 'Invalid student profile selector' using errcode='22023';
  end if;
  select * into saved from public.affairs_student_profiles where user_id=target;
  if p_status_only then
    return jsonb_build_object('userId',caller,'recordExists',found,'confirmedAt',saved.confirmed_at);
  end if;
  return jsonb_build_object('userId',target,'record',case when found then to_jsonb(saved) else null end);
end;
$$;

create function public.affairs_change_student_profile(p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  target_id uuid;
  key uuid;
  is_manager boolean := p_operation='save';
  fields text[];
  record_fields text[] := array['student_number','name_zh','name_en','identity_last_four','birthday_label','gender','overseas',
    'overseas_place','indigenous','indigenous_place','registered_address','mailing_address','postal_code','home_phone',
    'contact_phone','original_mobile','guardian','occupation'];
  request_digest bytea;
  previous private.affairs_student_profile_receipts;
  saved public.affairs_student_profiles;
  profile public.affairs_student_profiles;
  proposed_mobile text;
  expected integer;
  receipt jsonb;
begin
  if caller is null or not(select private.affairs_google_identity()) or
    (is_manager and not(select private.affairs_is_admin())) then
    raise exception 'Student profile access denied' using errcode='42501';
  end if;
  if p_operation is null or p_operation not in ('save','confirm') then
    raise exception 'Invalid student profile operation' using errcode='22023';
  end if;
  fields:=case when is_manager then array['user_id','record','request_id','expected_version']
    else array['updated_mobile','request_id','expected_version','confirmed'] end;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>7500
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
    or coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or p_payload->>'expected_version' !~ '^(0|[1-9][0-9]{0,5})$' then
    raise exception 'Invalid student profile fields' using errcode='22023';
  end if;
  key:=(p_payload->>'request_id')::uuid;
  expected:=(p_payload->>'expected_version')::integer;
  target_id:=caller;
  if is_manager then
    if coalesce(p_payload->>'user_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'Invalid student profile account' using errcode='22023';
    end if;
    target_id:=(p_payload->>'user_id')::uuid;
    if jsonb_typeof(p_payload->'record') is distinct from 'object' or
      not((p_payload->'record') ?& record_fields) or (p_payload->'record')-record_fields<>'{}'::jsonb or
      exists(select 1 from jsonb_each(p_payload->'record') as field(key,value)
        where jsonb_typeof(field.value) not in ('null',case when field.key in ('overseas','indigenous') then 'boolean' else 'string' end)) or
      coalesce(btrim(p_payload->'record'->>'student_number'),'')='' or coalesce(btrim(p_payload->'record'->>'name_zh'),'')='' then
      raise exception 'Invalid student profile record' using errcode='22023';
    end if;
    profile:=jsonb_populate_record(null::public.affairs_student_profiles,p_payload->'record');
  else
    if p_payload->'confirmed' is distinct from 'true'::jsonb or
      jsonb_typeof(p_payload->'updated_mobile') not in ('string','null') then
      raise exception 'Confirmation is required' using errcode='22023';
    end if;
    proposed_mobile:=p_payload->>'updated_mobile';
    if proposed_mobile is not null and (proposed_mobile !~ '^[+0-9 ()-]{3,20}$' or proposed_mobile !~ '[0-9]') then
      raise exception 'Invalid mobile number' using errcode='22023';
    end if;
  end if;
  request_digest:=extensions.digest(p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('student-profile-actor:'||caller,0));
  select * into previous from private.affairs_student_profile_receipts r where r.actor=caller and r.request_id=key;
  if found then
    if previous.operation<>p_operation or previous.payload_digest<>request_digest then
      raise exception 'Request ID already used' using errcode='PT409';
    end if;
    return previous.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('student-profile-target:'||target_id,0));
  select * into saved from public.affairs_student_profiles where user_id=target_id for update;
  if not found and not is_manager then raise exception 'Student profile unavailable' using errcode='PT404';end if;
  if coalesce(saved.version,0)<>expected then raise exception 'Student profile changed' using errcode='PT409';end if;
  if is_manager then
    if not exists(select 1 from public.affairs_profiles where user_id=target_id and role='student') then
      raise exception 'Student account unavailable' using errcode='PT404';
    end if;
    insert into public.affairs_student_profiles(user_id,student_number,name_zh,name_en,identity_last_four,birthday_label,
      gender,overseas,overseas_place,indigenous,indigenous_place,registered_address,mailing_address,postal_code,
      home_phone,contact_phone,original_mobile,guardian,occupation,version)
    values(target_id,profile.student_number,profile.name_zh,profile.name_en,profile.identity_last_four,profile.birthday_label,
      profile.gender,profile.overseas,profile.overseas_place,profile.indigenous,profile.indigenous_place,profile.registered_address,
      profile.mailing_address,profile.postal_code,profile.home_phone,profile.contact_phone,profile.original_mobile,profile.guardian,profile.occupation,expected+1)
    on conflict (user_id) do update set student_number=excluded.student_number,name_zh=excluded.name_zh,name_en=excluded.name_en,
      identity_last_four=excluded.identity_last_four,birthday_label=excluded.birthday_label,gender=excluded.gender,
      overseas=excluded.overseas,overseas_place=excluded.overseas_place,indigenous=excluded.indigenous,
      indigenous_place=excluded.indigenous_place,registered_address=excluded.registered_address,mailing_address=excluded.mailing_address,
      postal_code=excluded.postal_code,home_phone=excluded.home_phone,contact_phone=excluded.contact_phone,
      original_mobile=excluded.original_mobile,guardian=excluded.guardian,occupation=excluded.occupation,
      confirmed_at=null,version=excluded.version
    returning * into saved;
  else
    update public.affairs_student_profiles set updated_mobile=coalesce(proposed_mobile,updated_mobile),confirmed_at=now(),version=expected+1
      where user_id=target_id returning * into saved;
  end if;
  receipt:=jsonb_build_object('userId',target_id,'version',saved.version,'confirmedAt',saved.confirmed_at);
  insert into private.affairs_student_profile_receipts(actor,target,request_id,operation,payload_digest,result)
    values(caller,target_id,key,p_operation,request_digest,receipt);
  return receipt;
end;
$$;
revoke all on function public.affairs_read_student_profile(uuid,boolean),public.affairs_change_student_profile(text,jsonb) from public,anon;
grant execute on function public.affairs_read_student_profile(uuid,boolean),public.affairs_change_student_profile(text,jsonb) to authenticated;
