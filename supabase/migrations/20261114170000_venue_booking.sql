create table public.affairs_venue_weeks (
  venue text not null check (venue ~ '^[A-Z0-9-]{2,10}$'),
  week date not null check (extract(isodow from week)=1),
  label text not null check (length(label) between 1 and 200),
  description text not null check (length(description) <= 200),
  occupied text[] not null check (cardinality(occupied)<=105 and array_position(occupied,null) is null),
  checked_at timestamptz not null default now(),
  primary key (venue,week)
);
create table public.affairs_venue_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue text not null check (venue ~ '^[A-Z0-9-]{2,10}$'),
  booking_date date not null,
  period text not null check (period in ('M','1','2','3','4','N','5','6','7','8','E','A','B','C','D')),
  purpose text not null check (length(btrim(purpose)) between 1 and 600),
  status text not null default 'submitted' check (status in ('submitted','approved','declined','cancelled')),
  review_note text not null default '' check (length(review_note)<=600),
  version integer not null default 1 check (version between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index affairs_venue_approved_slot on public.affairs_venue_requests(venue,booking_date,period) where status='approved';
create unique index affairs_venue_own_open_slot on public.affairs_venue_requests(user_id,venue,booking_date,period)
  where status in ('submitted','approved');
create index affairs_venue_request_owner on public.affairs_venue_requests(user_id,created_at desc,id);
create table private.affairs_venue_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key (actor,request_id)
);
alter table public.affairs_venue_weeks enable row level security;
alter table public.affairs_venue_requests enable row level security;
alter table private.affairs_venue_receipts enable row level security;
revoke all on public.affairs_venue_weeks,public.affairs_venue_requests,private.affairs_venue_receipts from public,anon,authenticated;
grant select on public.affairs_venue_weeks to anon,authenticated;
grant select,insert,update on public.affairs_venue_weeks to service_role;
create policy venue_weeks_read on public.affairs_venue_weeks for select to anon,authenticated using (true);
grant select on public.affairs_venue_requests to authenticated;
create policy venue_requests_read on public.affairs_venue_requests for select to authenticated
  using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())));

create function public.affairs_read_venue_requests(p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller_id uuid := (select auth.uid());
begin
  if caller_id is null or p_manage is null or not(select private.affairs_google_identity())
    or (p_manage and not(select private.affairs_is_admin())) then
    raise exception 'Venue requests unavailable to this account' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(rows) order by created_at desc,id)
    from (select id,user_id,venue,booking_date,period,purpose,status,review_note,version,created_at
      from public.affairs_venue_requests
      where (p_manage and status='submitted') or (not p_manage and user_id=caller_id)
      order by created_at desc,id limit 100) rows),'[]'::jsonb);
end;
$$;

create function public.affairs_venue_approved_slots(p_venue text,p_week date) returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg('T'||(booking_date-p_week+1)||period order by booking_date,period),'{}'::text[])
    from public.affairs_venue_requests
    where venue=p_venue and booking_date>=p_week and booking_date<p_week+7 and status='approved'
      and p_venue ~ '^[A-Z0-9-]{2,10}$' and extract(isodow from p_week)=1;
$$;

create function public.affairs_change_venue_request(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller_id uuid := (select auth.uid());
  key uuid;
  fields text[];
  row public.affairs_venue_requests;
  receipt private.affairs_venue_receipts;
  room text;
  day date;
  slot text;
  week_start date;
  target uuid;
  desired text;
  note text;
  result jsonb;
  today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if caller_id is null or not(select private.affairs_google_identity())
    or (p_action='review_venue_request' and not(select private.affairs_is_admin())) then
    raise exception 'Venue request denied' using errcode='42501';
  end if;
  case p_action
    when 'submit_venue_request' then fields:=array['request_id','venue','booking_date','period','purpose','confirmed'];
    when 'cancel_venue_request' then fields:=array['request_id','id','version'];
    when 'review_venue_request' then fields:=array['request_id','id','version','status','note'];
    else raise exception 'Unknown venue request action' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>6000
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb then
    raise exception 'Invalid venue request fields' using errcode='22023';
  end if;
  key:=(p_payload->>'request_id')::uuid;
  if key is null then raise exception 'Request ID is required' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('venue-actor:'||caller_id,0));
  select * into receipt from private.affairs_venue_receipts r where r.actor=caller_id and r.request_id=key;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_payload then
      raise exception 'Request ID already used' using errcode='PT409';
    end if;
    return receipt.result;
  end if;

  if p_action='submit_venue_request' then
    room:=p_payload->>'venue';
    day:=(p_payload->>'booking_date')::date;
    slot:=p_payload->>'period';
    note:=btrim(p_payload->>'purpose');
    if p_payload->'confirmed' is distinct from 'true'::jsonb
      or day is null or day<today or day>today+90 or room is null or room !~ '^[A-Z0-9-]{2,10}$'
      or slot is null or slot not in ('M','1','2','3','4','N','5','6','7','8','E','A','B','C','D')
      or note is null or length(note) not between 1 and 600 then
      raise exception 'Invalid venue application' using errcode='22023';
    end if;
  else
    target:=(p_payload->>'id')::uuid;
    select * into row from public.affairs_venue_requests r where r.id=target and
      (p_action='review_venue_request' or r.user_id=caller_id) for update;
    if not found then raise exception 'Venue request not found' using errcode='PT404';end if;
    if row.version is distinct from (p_payload->>'version')::int then
      raise exception 'Venue request changed' using errcode='PT409';
    end if;
    room:=row.venue;day:=row.booking_date;slot:=row.period;
    if p_action='cancel_venue_request' then
      if row.status not in ('submitted','approved') or day<today then
        raise exception 'Venue request cannot be cancelled' using errcode='PT409';
      end if;
      desired:='cancelled';
    else
      desired:=p_payload->>'status';note:=btrim(p_payload->>'note');
      if desired is null or desired not in ('approved','declined') or note is null or length(note)>600 then
        raise exception 'Invalid review' using errcode='22023';
      end if;
      if row.status<>'submitted' or (desired='approved' and day<today) then
        raise exception 'Venue request cannot be reviewed' using errcode='PT409';
      end if;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('venue-slot:'||room||':'||day||':'||slot,0));
  if p_action='submit_venue_request' or desired='approved' then
    week_start:=day-(extract(isodow from day)::int-1);
    if not exists(select 1 from public.affairs_venue_weeks w where w.venue=room and w.week=week_start
      and w.checked_at>=now()-interval '30 minutes'
      and not(('T'||(day-week_start+1)||slot)=any(w.occupied)))
      or exists(select 1 from public.affairs_venue_requests r where r.venue=room and r.booking_date=day
        and r.period=slot and r.status='approved') then
      raise exception 'Check the room schedule again before continuing' using errcode='PT409';
    end if;
  end if;
  if p_action='submit_venue_request' then
    insert into public.affairs_venue_requests(user_id,venue,booking_date,period,purpose)
      values(caller_id,room,day,slot,note) returning * into row;
  else
    update public.affairs_venue_requests r set status=desired,version=r.version+1,updated_at=now(),
      review_note=case when p_action='review_venue_request' then note else r.review_note end
      where r.id=target returning * into row;
  end if;
  result:=jsonb_build_object('id',row.id,'version',row.version,'status',row.status);
  insert into private.affairs_venue_receipts(actor,request_id,action,payload,result)
    values(caller_id,key,p_action,p_payload,result);
  return result;
exception when unique_violation then
  raise exception 'An open request already uses this slot' using errcode='PT409';
end;
$$;
revoke all on function public.affairs_change_venue_request(text,jsonb) from public,anon;
grant execute on function public.affairs_change_venue_request(text,jsonb) to authenticated;
revoke all on function public.affairs_read_venue_requests(boolean) from public,anon;
grant execute on function public.affairs_read_venue_requests(boolean) to authenticated;
revoke all on function public.affairs_venue_approved_slots(text,date) from public;
grant execute on function public.affairs_venue_approved_slots(text,date) to anon,authenticated;
