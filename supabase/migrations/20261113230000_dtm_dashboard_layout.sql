-- DRAFT: owner-only preferences for the three observed DTM dashboard blocks.
-- No institutional records, HTML, content, titles, styles or administrator access.
create function private.dtm_dashboard_default_blocks() returns jsonb
language sql immutable set search_path='' as $$
  select '[{"id":"important","visible":true,"region":"side-pre","weight":-1},{"id":"navigation","visible":true,"region":"side-pre","weight":0},{"id":"contacts","visible":true,"region":"side-pre","weight":1}]'::jsonb;
$$;

create function private.dtm_dashboard_layout_blocks_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare block jsonb;seen text[]:=array[]::text[];weight_value numeric;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false;end if;
  if jsonb_array_length(value)<>3 or octet_length(value::text)>1024 then return false;end if;
  for block in select item from jsonb_array_elements(value) as items(item) loop
    if jsonb_typeof(block) is distinct from 'object' then return false;end if;
    if not(block ?& array['id','visible','region','weight']) or block-array['id','visible','region','weight']<>'{}'::jsonb then return false;end if;
    if jsonb_typeof(block->'id') is distinct from 'string' or block->>'id' not in ('important','navigation','contacts')
      or (block->>'id')=any(seen) or jsonb_typeof(block->'visible') is distinct from 'boolean'
      or jsonb_typeof(block->'region') is distinct from 'string' or block->>'region' not in ('side-pre','side-post','content')
      or jsonb_typeof(block->'weight') is distinct from 'number' then return false;end if;
    weight_value:=(block->>'weight')::numeric;
    if weight_value<>trunc(weight_value) or weight_value < -10 or weight_value > 10 then return false;end if;
    seen:=array_append(seen,block->>'id');
  end loop;
  return cardinality(seen)=3;
exception when others then return false;
end;$$;

create function private.dtm_dashboard_layout_payload_valid(p_kind text,value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];expected numeric;
begin
  if p_kind is null or p_kind not in ('save_dtm_dashboard_layout','reset_dtm_dashboard_layout')
    or jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>2048 then return false;end if;
  fields:=array['request_id','expected_version']||case when p_kind='save_dtm_dashboard_layout' then array['blocks'] else array[]::text[] end;
  if not(value ?& fields) or value-fields<>'{}'::jsonb then return false;end if;
  if jsonb_typeof(value->'request_id') is distinct from 'string'
    or value->>'request_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(value->'expected_version') is distinct from 'number' then return false;end if;
  expected:=(value->>'expected_version')::numeric;
  if expected<>trunc(expected) or expected<0 or expected>999999998 then return false;end if;
  return p_kind='reset_dtm_dashboard_layout' or private.dtm_dashboard_layout_blocks_valid(value->'blocks');
exception when others then return false;
end;$$;
revoke all on function private.dtm_dashboard_default_blocks() from public,anon,authenticated;
revoke all on function private.dtm_dashboard_layout_blocks_valid(jsonb) from public,anon,authenticated;
revoke all on function private.dtm_dashboard_layout_payload_valid(text,jsonb) from public,anon,authenticated;

create table public.dtm_dashboard_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check(version between 1 and 999999999),
  blocks jsonb not null check(private.dtm_dashboard_layout_blocks_valid(blocks)),
  created_at timestamptz not null default now() check(isfinite(created_at)),
  updated_at timestamptz not null default now() check(isfinite(updated_at))
);
comment on table public.dtm_dashboard_layouts is 'Independent stu.best dashboard preferences, not school records. Exactly three built-in blocks. Missing rows use canonical defaults only after a successful own-account read; reset writes a new version.';
alter table public.dtm_dashboard_layouts enable row level security;
revoke all on public.dtm_dashboard_layouts from public,anon,authenticated;
grant select on public.dtm_dashboard_layouts to authenticated;
create policy dtm_dashboard_layout_owner_read on public.dtm_dashboard_layouts for select to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));

create table private.dtm_dashboard_layout_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null check(kind in ('save_dtm_dashboard_layout','reset_dtm_dashboard_layout')),
  payload jsonb not null check(private.dtm_dashboard_layout_payload_valid(kind,payload)),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
comment on table private.dtm_dashboard_layout_operations is 'Append-only owner-scoped command receipts and audit. Exact retries return their original result after later saves/resets. No auth/profile initialization or identity changes are performed.';
alter table private.dtm_dashboard_layout_operations enable row level security;
revoke all on private.dtm_dashboard_layout_operations from public,anon,authenticated;

create function private.dtm_dashboard_layout_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'Dashboard layout ownership is immutable' using errcode='42501';
  end if;
  if new.version<>old.version+1 then raise exception 'Dashboard layout version must advance once' using errcode='PT409';end if;
  return new;
end;$$;
revoke all on function private.dtm_dashboard_layout_identity_guard() from public,anon,authenticated;
create trigger dtm_dashboard_layout_identity before update on public.dtm_dashboard_layouts
  for each row execute function private.dtm_dashboard_layout_identity_guard();

create function public.affairs_save_dtm_dashboard_layout(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());request_id_value uuid;expected integer;
  prior public.dtm_dashboard_layouts;saved public.dtm_dashboard_layouts;
  receipt private.dtm_dashboard_layout_operations;next_blocks jsonb;operation_result jsonb;
begin
  if actor is null or not(select private.affairs_google_identity()) then raise exception 'Google sign-in required' using errcode='42501';end if;
  if not private.dtm_dashboard_layout_payload_valid(p_kind,p_payload) then raise exception 'Invalid dashboard layout command' using errcode='22023';end if;
  request_id_value:=(p_payload->>'request_id')::uuid;expected:=(p_payload->>'expected_version')::numeric::integer;
  -- A single owner lock serializes first inserts, saves, reset and receipt replay.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dtm-dashboard-layout:'||actor::text,0));
  select * into receipt from private.dtm_dashboard_layout_operations where user_id=actor and request_id=request_id_value;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another dashboard command' using errcode='PT409';end if;
    return receipt.result;
  end if;
  select * into prior from public.dtm_dashboard_layouts where user_id=actor for update;
  if coalesce(prior.version,0)<>expected then raise exception 'Dashboard layout changed; reload before saving' using errcode='PT409';end if;
  next_blocks:=case when p_kind='reset_dtm_dashboard_layout' then private.dtm_dashboard_default_blocks() else p_payload->'blocks' end;
  if prior.user_id is null then
    insert into public.dtm_dashboard_layouts(user_id,blocks) values(actor,next_blocks) returning * into saved;
  else
    update public.dtm_dashboard_layouts set blocks=next_blocks,version=version+1,updated_at=clock_timestamp()
      where user_id=actor and version=expected returning * into saved;
    if not found then raise exception 'Dashboard layout changed; reload before saving' using errcode='PT409';end if;
  end if;
  operation_result:=jsonb_build_object('version',saved.version,'blocks',saved.blocks,'updatedAt',saved.updated_at);
  insert into private.dtm_dashboard_layout_operations(user_id,request_id,kind,payload,result) values(actor,request_id_value,p_kind,p_payload,operation_result);
  return operation_result;
exception when unique_violation then raise exception 'Dashboard layout changed; reload before saving' using errcode='PT409';
end;$$;
revoke all on function public.affairs_save_dtm_dashboard_layout(text,jsonb) from public,anon;
grant execute on function public.affairs_save_dtm_dashboard_layout(text,jsonb) to authenticated;
