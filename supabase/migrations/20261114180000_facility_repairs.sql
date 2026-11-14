create table public.affairs_facility_repairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  building text not null check (length(btrim(building)) between 1 and 100),
  location text not null check (length(btrim(location)) between 1 and 120),
  item text not null check (length(btrim(item)) between 1 and 100),
  description text not null check (length(btrim(description)) between 1 and 1000),
  status text not null default 'submitted' check (status in ('submitted','in_progress','resolved','cancelled')),
  version integer not null default 1 check (version between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affairs_facility_repair_owner on public.affairs_facility_repairs(user_id,created_at desc,id desc);
create index affairs_facility_repair_queue on public.affairs_facility_repairs(status,created_at desc,id desc);
create table private.affairs_facility_repair_events (
  repair_id uuid not null references public.affairs_facility_repairs(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  version integer not null,
  action text not null,
  payload jsonb not null,
  status text not null,
  note text not null default '' check (length(note)<=600),
  occurred_at timestamptz not null default now(),
  primary key (repair_id,version),
  unique (actor,request_id)
);
alter table public.affairs_facility_repairs enable row level security;
alter table private.affairs_facility_repair_events enable row level security;
revoke all on public.affairs_facility_repairs,private.affairs_facility_repair_events from public,anon,authenticated;

create function public.affairs_read_facility_repairs(p_manage boolean,p_id uuid,p_page integer,p_status text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  entry public.affairs_facility_repairs;
  rows jsonb;
  total integer;
begin
  if caller is null or not(select private.affairs_google_identity()) or (p_manage and not(select private.affairs_is_admin())) then
    raise exception 'Facility repair access denied' using errcode='42501';
  end if;
  if p_manage is null or p_page is null or p_page not between 0 and 999 or p_status is null
    or p_status not in ('','submitted','in_progress','resolved','cancelled')
    or (p_id is not null and (p_page<>0 or p_status<>'')) then
    raise exception 'Invalid repair query' using errcode='22023';
  end if;
  if p_id is not null then
    select * into entry from public.affairs_facility_repairs r where r.id=p_id and (p_manage or r.user_id=caller);
    if not found then raise exception 'Repair record not found' using errcode='PT404';end if;
    return jsonb_build_object('userId',caller,'detail',to_jsonb(entry),'events',
      coalesce((select jsonb_agg(jsonb_build_object('version',e.version,'status',e.status,'note',e.note,'occurred_at',e.occurred_at) order by e.version)
        from (select version,status,note,occurred_at from private.affairs_facility_repair_events
          where repair_id=entry.id order by version desc limit 100) e),'[]'::jsonb));
  end if;
  with visible as (
    select r.id,r.user_id,r.building,r.location,r.item,r.status,r.version,r.created_at,r.updated_at
    from public.affairs_facility_repairs r where (p_manage or r.user_id=caller) and (p_status='' or r.status=p_status)
  )
  select (select count(*) from visible),
    coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc)
      from (select * from visible order by created_at desc,id desc limit 25 offset p_page*25) page),'[]'::jsonb)
  into total,rows;
  return jsonb_build_object('userId',caller,'rows',rows,'total',total,'page',p_page,'pageSize',25);
end;
$$;

create function public.affairs_change_facility_repair(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  request_key uuid;
  fields text[];
  entry public.affairs_facility_repairs;
  receipt private.affairs_facility_repair_events;
  next_status text;
  next_note text := '';
begin
  if caller is null or not(select private.affairs_google_identity())
    or (p_action='review_facility_repair' and not(select private.affairs_is_admin())) then
    raise exception 'Facility repair access denied' using errcode='42501';
  end if;
  case p_action
    when 'submit_facility_repair' then fields:=array['request_id','building','location','item','description','confirmed'];
    when 'cancel_facility_repair' then fields:=array['request_id','id','version'];
    when 'review_facility_repair' then fields:=array['request_id','id','version','status','note'];
    else raise exception 'Unknown repair action' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>7000
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string' then
    raise exception 'Invalid repair fields' using errcode='22023';
  end if;
  request_key:=(p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('facility-repair:'||caller,0));
  select * into receipt from private.affairs_facility_repair_events e where e.actor=caller and e.request_id=request_key;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Repair request ID already used' using errcode='PT409';end if;
    return jsonb_build_object('id',receipt.repair_id,'status',receipt.status,'version',receipt.version);
  end if;
  if p_action='submit_facility_repair' then
    if p_payload->'confirmed' is distinct from 'true'::jsonb
      or exists(select 1 from unnest(array['building','location','item','description']) as key(field)
        where jsonb_typeof(p_payload->key.field) is distinct from 'string' or btrim(p_payload->>key.field)='') then
      raise exception 'A confirmed repair description is required' using errcode='22023';
    end if;
    if length(btrim(p_payload->>'building'))>100 or length(btrim(p_payload->>'location'))>120
      or length(btrim(p_payload->>'item'))>100 or length(btrim(p_payload->>'description'))>1000 then
      raise exception 'Repair description exceeds the field length' using errcode='22023';
    end if;
    insert into public.affairs_facility_repairs(user_id,building,location,item,description)
    values(caller,btrim(p_payload->>'building'),btrim(p_payload->>'location'),btrim(p_payload->>'item'),btrim(p_payload->>'description'))
    returning * into entry;
  else
    if jsonb_typeof(p_payload->'id') is distinct from 'string' or jsonb_typeof(p_payload->'version') is distinct from 'number' or p_payload->>'version' !~ '^[1-9][0-9]{0,4}$' then
      raise exception 'Invalid repair revision' using errcode='22023';
    end if;
    select * into entry from public.affairs_facility_repairs r where r.id=(p_payload->>'id')::uuid
      and (p_action='review_facility_repair' or r.user_id=caller) for update;
    if not found then raise exception 'Repair record not found' using errcode='PT404';end if;
    if entry.version<>(p_payload->>'version')::integer or entry.version>=10000 then
      raise exception 'Repair changed' using errcode='PT409';
    end if;
    if p_action='cancel_facility_repair' then
      if entry.status<>'submitted' then raise exception 'Repair cannot be cancelled' using errcode='PT409';end if;
      next_status:='cancelled';
    else
      next_status:=p_payload->>'status';
      next_note:=btrim(p_payload->>'note');
      if jsonb_typeof(p_payload->'note') is distinct from 'string' or jsonb_typeof(p_payload->'status') is distinct from 'string'
        or next_status not in ('in_progress','resolved') or length(next_note)>600 then
        raise exception 'Invalid repair decision' using errcode='22023';
      end if;
      if not((entry.status in ('submitted','resolved') and next_status='in_progress') or
        (entry.status='in_progress' and next_status='resolved')) then
        raise exception 'Invalid repair status change' using errcode='PT409';
      end if;
    end if;
    update public.affairs_facility_repairs r set status=next_status,version=r.version+1,updated_at=now()
      where r.id=entry.id returning * into entry;
  end if;
  insert into private.affairs_facility_repair_events(repair_id,actor,request_id,version,action,payload,status,note)
    values(entry.id,caller,request_key,entry.version,p_action,p_payload,entry.status,next_note);
  return jsonb_build_object('id',entry.id,'status',entry.status,'version',entry.version);
end;
$$;
revoke all on function public.affairs_read_facility_repairs(boolean,uuid,integer,text),public.affairs_change_facility_repair(text,jsonb) from public,anon;
grant execute on function public.affairs_read_facility_repairs(boolean,uuid,integer,text),public.affairs_change_facility_repair(text,jsonb) to authenticated;
