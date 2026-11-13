-- Private local applications and reports. The conference fields are documented in the operation manual.
create table public.affairs_exchange_grant_drafts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null check (char_length(department) between 1 and 160),
  activity_category text not null check (char_length(activity_category) between 1 and 160),
  starts_on date not null check (isfinite(starts_on) and starts_on >= date '1900-01-01' and starts_on <= date '9999-12-31'),
  ends_on date not null check (isfinite(ends_on) and ends_on >= starts_on and ends_on <= date '9999-12-31'),
  activity_name text not null check (char_length(activity_name) between 1 and 250),
  activity_location text not null check (char_length(activity_location) between 1 and 250),
  topic text not null check (char_length(topic) between 1 and 400),
  region text not null check (char_length(region) between 1 and 160),
  lodging boolean not null,
  report_text text check (char_length(report_text) <= 5000),
  version integer not null default 1 check (version between 1 and 999999999),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index affairs_exchange_grant_owner_idx on public.affairs_exchange_grant_drafts(user_id, id) where deleted_at is null;
alter table public.affairs_exchange_grant_drafts enable row level security;
revoke all on public.affairs_exchange_grant_drafts from public, anon, authenticated;
grant select on public.affairs_exchange_grant_drafts to authenticated;
create policy exchange_grant_drafts_read on public.affairs_exchange_grant_drafts for select to authenticated
  using (deleted_at is null and user_id = (select auth.uid()) and (select private.affairs_google_identity()));

create table private.affairs_exchange_grant_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  receipt jsonb not null,
  primary key (user_id, request_id)
);
alter table private.affairs_exchange_grant_requests enable row level security;
revoke all on private.affairs_exchange_grant_requests from public, anon, authenticated;

create function public.affairs_read_exchange_grants() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  records jsonb;
begin
  if not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), '[]'::jsonb) into records
  from (select id, department, activity_category, starts_on, ends_on, activity_name, activity_location,
               topic, region, lodging, report_text, version
        from public.affairs_exchange_grant_drafts where user_id = actor and deleted_at is null
        order by id limit 101) entry;
  if jsonb_array_length(records) > 100 then
    raise exception 'Grant drafts exceed the supported record count' using errcode = 'PT503';
  end if;
  return jsonb_build_object('userId', actor, 'records', records);
end;
$$;
revoke all on function public.affairs_read_exchange_grants() from public, anon;
grant execute on function public.affairs_read_exchange_grants() to authenticated;

create function public.affairs_manage_exchange_grant(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  keys text[] := array['id','request_id','expected_version'];
  form_fields text[] := array['department','activity_category','starts_on','ends_on','activity_name','activity_location','topic','region','lodging'];
  field text;
  n numeric;
  record_id uuid;
  request_key uuid;
  expected integer;
  previous public.affairs_exchange_grant_drafts;
  next_row public.affairs_exchange_grant_drafts;
  stored private.affairs_exchange_grant_requests;
  result jsonb;
begin
  if not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('save_exchange_grant_draft','save_exchange_grant_report','delete_exchange_grant_draft')
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 32768 then
    raise exception 'Invalid grant draft operation' using errcode = '22023';
  end if;
  if p_kind = 'save_exchange_grant_draft' then keys := keys || form_fields; end if;
  if p_kind = 'save_exchange_grant_report' then keys := keys || array['report_text']; end if;
  if not (p_payload ?& keys) or p_payload - keys <> '{}'::jsonb then
    raise exception 'Invalid grant draft fields' using errcode = '22023';
  end if;
  foreach field in array array['id','request_id'] loop
    if jsonb_typeof(p_payload->field) is distinct from 'string'
      or p_payload->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid grant draft identifier' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' then
    raise exception 'Invalid grant draft version' using errcode = '22023';
  end if;
  n := (p_payload->>'expected_version')::numeric;
  if n <> trunc(n) or n < (case when p_kind = 'save_exchange_grant_draft' then 0 else 1 end) or n > 999999998 then
    raise exception 'Invalid grant draft version' using errcode = '22023';
  end if;
  expected := n::integer;
  if p_kind = 'save_exchange_grant_draft' then
    foreach field in array form_fields loop
      if field = 'lodging' then
        if jsonb_typeof(p_payload->field) is distinct from 'boolean' then
          raise exception 'Choose a lodging option' using errcode = '22023';
        end if;
      elsif jsonb_typeof(p_payload->field) is distinct from 'string' or p_payload->>field !~ '[^[:space:]]'
        or (field in ('starts_on','ends_on') and p_payload->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        raise exception 'Invalid grant application field' using errcode = '22023';
      end if;
    end loop;
    next_row := jsonb_populate_record(null::public.affairs_exchange_grant_drafts, p_payload - array['request_id','expected_version']);
  elsif p_kind = 'save_exchange_grant_report' and
    (jsonb_typeof(p_payload->'report_text') is distinct from 'string' or p_payload->>'report_text' !~ '[^[:space:]]') then
    raise exception 'Enter the reflection report' using errcode = '22023';
  end if;
  record_id := (p_payload->>'id')::uuid;
  request_key := (p_payload->>'request_id')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('exchange-grant:owner:' || actor::text, 0));
  select * into stored from private.affairs_exchange_grant_requests where user_id = actor and request_id = request_key;
  if found then
    if stored.kind <> p_kind or stored.payload <> p_payload then
      raise exception 'Request ID already used' using errcode = 'PT409';
    end if;
    return stored.receipt;
  end if;
  select * into previous from public.affairs_exchange_grant_drafts where id = record_id and user_id = actor for update;
  if previous.deleted_at is not null or coalesce(previous.version, 0) <> expected then
    raise exception 'Grant draft changed. Reload and retry.' using errcode = 'PT409';
  end if;
  if p_kind = 'delete_exchange_grant_draft' then
    update public.affairs_exchange_grant_drafts set deleted_at = now(), updated_at = now(), version = expected + 1
      where id = record_id and user_id = actor;
  elsif p_kind = 'save_exchange_grant_report' then
    update public.affairs_exchange_grant_drafts set report_text = p_payload->>'report_text', updated_at = now(), version = expected + 1
      where id = record_id and user_id = actor;
  elsif previous.id is null then
    if (select count(*) from public.affairs_exchange_grant_drafts where user_id = actor and deleted_at is null) >= 100 then
      raise exception 'Grant draft limit reached' using errcode = '22023';
    end if;
    insert into public.affairs_exchange_grant_drafts(id, user_id, department, activity_category, starts_on, ends_on,
      activity_name, activity_location, topic, region, lodging)
    values (record_id, actor, next_row.department, next_row.activity_category, next_row.starts_on, next_row.ends_on,
      next_row.activity_name, next_row.activity_location, next_row.topic, next_row.region, next_row.lodging);
  else
    update public.affairs_exchange_grant_drafts set department = next_row.department, activity_category = next_row.activity_category,
      starts_on = next_row.starts_on, ends_on = next_row.ends_on, activity_name = next_row.activity_name,
      activity_location = next_row.activity_location, topic = next_row.topic, region = next_row.region,
      lodging = next_row.lodging, updated_at = now(), version = expected + 1
    where id = record_id and user_id = actor;
  end if;
  result := jsonb_build_object('id', record_id, 'kind', p_kind, 'version', expected + 1);
  insert into private.affairs_exchange_grant_requests(user_id, request_id, kind, payload, receipt)
    values (actor, request_key, p_kind, p_payload, result);
  return result;
exception
  when unique_violation then raise exception 'Grant draft changed. Reload and retry.' using errcode = 'PT409';
  when check_violation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Check the grant application fields and dates' using errcode = '22023';
end;
$$;
revoke all on function public.affairs_manage_exchange_grant(text,jsonb) from public, anon;
grant execute on function public.affairs_manage_exchange_grant(text,jsonb) to authenticated;
