create table public.affairs_counseling_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('counseling','assessment')),
  preferred_on date not null,
  preferred_period text not null check (preferred_period in ('morning','afternoon')),
  status text not null default 'requested' check (status in ('requested','scheduled','cancelled','closed')),
  scheduled_at timestamptz,
  consent_version text not null check (consent_version='stu-best-2026-11-14'),
  consent_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version between 1 and 1000000),
  check (status<>'scheduled' or scheduled_at is not null)
);
create unique index affairs_counseling_open_student on public.affairs_counseling_appointments(user_id)
  where status in ('requested','scheduled');
create index affairs_counseling_queue on public.affairs_counseling_appointments(status,updated_at,id);

create table private.affairs_counseling_coordinators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table private.affairs_counseling_operations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  digest bytea not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor,request_id)
);
alter table public.affairs_counseling_appointments enable row level security;
alter table private.affairs_counseling_coordinators enable row level security;
alter table private.affairs_counseling_operations enable row level security;
revoke all on public.affairs_counseling_appointments,private.affairs_counseling_coordinators,private.affairs_counseling_operations
  from public,anon,authenticated;

create function private.affairs_can_coordinate_counseling() returns boolean
language sql stable security definer set search_path='' as $$
  select (select private.affairs_google_identity()) and exists (
    select 1 from private.affairs_counseling_coordinators c join auth.users u on u.id=c.user_id
    where c.user_id=(select auth.uid()) and u.email_confirmed_at is not null and u.email is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
  );
$$;
revoke all on function private.affairs_can_coordinate_counseling() from public,anon,authenticated;

create function public.affairs_read_counseling(p_view text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); coordinator boolean; available boolean; rows jsonb;
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';end if;
  coordinator:=(select private.affairs_can_coordinate_counseling());
  available:=exists(select 1 from private.affairs_counseling_coordinators c join auth.users u on u.id=c.user_id
    where u.email_confirmed_at is not null and u.email is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'));
  if p_view='access' then
    if not(select private.affairs_is_admin()) then raise exception 'Access denied' using errcode='42501';end if;
    select coalesce(jsonb_agg(user_id order by user_id),'[]'::jsonb) into rows from private.affairs_counseling_coordinators;
  elsif p_view='queue' then
    if not coordinator then raise exception 'Access denied' using errcode='42501';end if;
    select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at,a.id),'[]'::jsonb) into rows from (
      select r.id,r.user_id,r.kind,r.status,r.preferred_on,r.preferred_period,r.scheduled_at,r.version,r.updated_at,
        u.email as contact_email
      from public.affairs_counseling_appointments r join auth.users u on u.id=r.user_id
      where r.status in ('requested','scheduled') and u.email_confirmed_at is not null
        and u.email is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
      order by r.updated_at,r.id limit 100
    ) a;
  elsif p_view='mine' then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]'::jsonb) into rows from (
      select r.id,r.kind,r.status,r.preferred_on,r.preferred_period,r.scheduled_at,r.version,r.updated_at
      from public.affairs_counseling_appointments r where r.user_id=caller
      order by (r.status in ('requested','scheduled')) desc,r.updated_at desc,r.id limit 50
    ) a;
  else raise exception 'Invalid appointment view' using errcode='22023';end if;
  return jsonb_build_object('userId',caller,'canCoordinate',coordinator,'available',available,'rows',rows);
end;
$$;

create function public.affairs_change_counseling(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid()); key uuid; target uuid; expected integer; fields text[]; digest_value bytea;
  previous private.affairs_counseling_operations; appointment public.affairs_counseling_appointments;
  preferred date; appointment_time timestamptz; next_status text; receipt jsonb;
  today date:=(now() at time zone 'Asia/Taipei')::date;
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';end if;
  if p_operation='access' and not(select private.affairs_is_admin()) then raise exception 'Access denied' using errcode='42501';end if;
  if p_operation='review' and not(select private.affairs_can_coordinate_counseling()) then raise exception 'Access denied' using errcode='42501';end if;
  fields:=case p_operation
    when 'request' then array['request_id','kind','preferred_on','preferred_period','consent_version']
    when 'cancel' then array['request_id','id','expected_version']
    when 'review' then array['request_id','id','expected_version','status','scheduled_at']
    when 'access' then array['request_id','user_id','enabled'] end;
  if fields is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2000 or
    not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb or
    coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then raise exception 'Invalid appointment fields' using errcode='22023';end if;
  key:=(p_payload->>'request_id')::uuid;
  digest_value:=extensions.digest(p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('counseling-actor:'||caller,0));
  select * into previous from private.affairs_counseling_operations where actor=caller and request_id=key;
  if found then
    if previous.operation<>p_operation or previous.digest<>digest_value then raise exception 'Request already used' using errcode='PT409';end if;
    return previous.receipt;
  end if;
  if p_operation='access' then
    target:=(p_payload->>'user_id')::uuid;
    if target is null or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid coordinator' using errcode='22023';end if;
    if (p_payload->>'enabled')::boolean then
      if not exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id
        where u.id=target and u.email_confirmed_at is not null and u.email is not null and u.deleted_at is null
          and (u.banned_until is null or u.banned_until<=now()) and i.provider='google') then
        raise exception 'Coordinator account unavailable' using errcode='PT404';end if;
      insert into private.affairs_counseling_coordinators(user_id) values(target) on conflict do nothing;
    else delete from private.affairs_counseling_coordinators where user_id=target;
    end if;
    receipt:=jsonb_build_object('userId',target,'enabled',(p_payload->>'enabled')::boolean);
  elsif p_operation='request' then
    if p_payload->>'consent_version' is distinct from 'stu-best-2026-11-14' or
      coalesce(p_payload->>'kind','') not in ('counseling','assessment') or
      coalesce(p_payload->>'preferred_period','') not in ('morning','afternoon') or
      coalesce(p_payload->>'preferred_on','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid appointment request' using errcode='22023';end if;
    preferred:=(p_payload->>'preferred_on')::date;
    if preferred<today or preferred>today+90 then raise exception 'Invalid preferred date' using errcode='22023';end if;
    perform 1 from private.affairs_counseling_coordinators c join auth.users u on u.id=c.user_id
      where u.email_confirmed_at is not null and u.email is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
      order by c.user_id limit 1 for key share of c;
    if not found then
      raise exception 'Appointment coordination is unavailable' using errcode='PT409';end if;
    insert into public.affairs_counseling_appointments(user_id,kind,preferred_on,preferred_period,consent_version)
      values(caller,p_payload->>'kind',preferred,p_payload->>'preferred_period',p_payload->>'consent_version') returning * into appointment;
  else
    if p_operation='review' then
      perform 1 from private.affairs_counseling_coordinators where user_id=caller for key share;
      if not found then raise exception 'Access denied' using errcode='42501';end if;
    end if;
    if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or
      p_payload->>'expected_version' !~ '^(?:[1-9][0-9]{0,5}|1000000)$' then raise exception 'Invalid version' using errcode='22023';end if;
    expected:=(p_payload->>'expected_version')::integer;
    select * into appointment from public.affairs_counseling_appointments where id=(p_payload->>'id')::uuid
      and (p_operation='review' or user_id=caller) for update;
    if not found then raise exception 'Appointment unavailable' using errcode='PT404';end if;
    if appointment.version<>expected or appointment.status not in ('requested','scheduled') then
      raise exception 'Appointment changed' using errcode='PT409';end if;
    next_status:=case when p_operation='cancel' then 'cancelled' else p_payload->>'status' end;
    if p_operation='review' then
      if next_status is null or next_status not in ('scheduled','closed') or
        (next_status='closed' and p_payload->'scheduled_at'<>'null'::jsonb) then raise exception 'Invalid review' using errcode='22023';end if;
      if next_status='scheduled' then
        if coalesce(p_payload->>'scheduled_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$'
          then raise exception 'Invalid appointment time' using errcode='22023';end if;
        appointment_time:=(p_payload->>'scheduled_at')::timestamptz;
        if appointment_time<=now() or appointment_time>now()+interval '90 days' then raise exception 'Invalid appointment time' using errcode='22023';end if;
      end if;
    end if;
    update public.affairs_counseling_appointments set status=next_status,scheduled_at=coalesce(appointment_time,scheduled_at),
      version=version+1,updated_at=now() where id=appointment.id returning * into appointment;
  end if;
  if receipt is null then
    receipt:=jsonb_build_object('id',appointment.id,'version',appointment.version,'status',appointment.status);
  end if;
  insert into private.affairs_counseling_operations(actor,request_id,operation,digest,receipt) values(caller,key,p_operation,digest_value,receipt);
  return receipt;
exception when unique_violation then
  raise exception 'An open appointment already exists' using errcode='PT409';
end;
$$;

revoke all on function public.affairs_read_counseling(text),public.affairs_change_counseling(text,jsonb) from public,anon;
grant execute on function public.affairs_read_counseling(text),public.affairs_change_counseling(text,jsonb) to authenticated;
