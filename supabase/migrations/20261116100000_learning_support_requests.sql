-- A stu.best learning-support intake and review queue. The official WeakReward
-- application, award decisions, eligibility and payments are separate systems.
-- Match ECMAScript trim() and the plain-text fields accepted by the HTTP contract.
create function private.affairs_learning_support_text(value text) returns text
language sql immutable strict set search_path='' as $$
  select case when cleaned !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F]' then cleaned end
  from (select btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') as cleaned) input
$$;
revoke all on function private.affairs_learning_support_text(text) from public,anon,authenticated;

create table public.affairs_learning_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 3 and 160 and topic is not distinct from private.affairs_learning_support_text(topic)),
  details text not null check (char_length(details) between 5 and 1200 and details is not distinct from private.affairs_learning_support_text(details)),
  status text not null default 'submitted' check (status in ('submitted','in_review','reviewed','withdrawn')),
  review_note text not null default '' check (char_length(review_note)<=600 and review_note is not distinct from private.affairs_learning_support_text(review_note)),
  version smallint not null default 1 check (version between 1 and 3),
  submitted_at timestamptz not null default now() check (isfinite(submitted_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  check (
    (status='submitted' and version=1 and review_note='')
    or (status='in_review' and version=2)
    or (status='reviewed' and version=3)
    or (status='withdrawn' and version in (2,3))
  )
);
comment on table public.affairs_learning_support_requests is 'Independent stu.best support intake. Reviewed means the site administrator finished reviewing this request.';
create index affairs_learning_support_owner on public.affairs_learning_support_requests(user_id,updated_at desc,id);
create index affairs_learning_support_queue on public.affairs_learning_support_requests(updated_at desc,id);

create table private.affairs_learning_support_operations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  target_id uuid not null references public.affairs_learning_support_requests(id) on delete cascade,
  kind text not null check(kind in ('submit','withdraw','review')),
  payload jsonb not null,
  result jsonb not null,
  occurred_at timestamptz not null default now(),
  primary key(actor,request_id)
);
comment on table private.affairs_learning_support_operations is 'Private durable replay and mutation audit. Exact same caller, kind and payload return the original receipt.';
create index affairs_learning_support_operation_target on private.affairs_learning_support_operations(target_id);

alter table public.affairs_learning_support_requests enable row level security;
alter table private.affairs_learning_support_operations enable row level security;
revoke all on public.affairs_learning_support_requests,private.affairs_learning_support_operations from public,anon,authenticated;
grant select on public.affairs_learning_support_requests to authenticated;
create policy affairs_learning_support_own on public.affairs_learning_support_requests for select to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));

create function public.affairs_read_learning_support(p_view text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); manager boolean; result jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Sign in to School Affairs' using errcode='42501';
  end if;
  if p_view is null or p_view not in ('mine','review') or p_page is null or p_page not between 1 and 1000 then
    raise exception 'Invalid learning support query' using errcode='22023';
  end if;
  manager:=(select private.affairs_is_admin());
  if p_view='review' and not manager then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  select jsonb_build_object('userId',caller,'canReview',manager,'view',p_view,'page',p_page,
    'total',(select count(*) from public.affairs_learning_support_requests r where p_view='review' or r.user_id=caller),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by rows."updatedAt" desc,rows.id) from (
      select r.id,r.user_id as "ownerId",r.topic,r.details,r.status,r.review_note as "reviewNote",r.version,
        r.submitted_at as "submittedAt",r.updated_at as "updatedAt"
      from public.affairs_learning_support_requests r where p_view='review' or r.user_id=caller
      order by r.updated_at desc,r.id limit 25 offset (p_page-1)*25
    ) rows),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.affairs_change_learning_support(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  fields text[]; nonce uuid; target uuid; expected numeric;
  current_request public.affairs_learning_support_requests;
  previous private.affairs_learning_support_operations;
  submit_topic text; submit_details text; new_status text; note text; result jsonb;
begin
  if caller is null or not (select private.affairs_google_identity())
    or (p_kind='review' and not (select private.affairs_is_admin())) then
    raise exception 'Learning support access denied' using errcode='42501';
  end if;
  case p_kind
    when 'submit' then fields:=array['request_id','topic','details'];
    when 'withdraw' then fields:=array['request_id','id','expected_version'];
    when 'review' then fields:=array['request_id','id','expected_version','status','note'];
    else raise exception 'Invalid learning support operation' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>7000
    or not (p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
    or p_payload->>'request_id' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
    raise exception 'Invalid learning support fields' using errcode='22023';
  end if;
  nonce:=(p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('learning-support-actor:'||caller,0));
  select * into previous from private.affairs_learning_support_operations o where o.actor=caller and o.request_id=nonce;
  if found then
    if previous.kind<>p_kind or previous.payload<>p_payload then
      raise exception 'Request ID already used' using errcode='PT409';
    end if;
    return previous.result;
  end if;
  if p_kind='submit' then
    submit_topic:=private.affairs_learning_support_text(p_payload->>'topic');
    submit_details:=private.affairs_learning_support_text(p_payload->>'details');
    if jsonb_typeof(p_payload->'topic') is distinct from 'string'
      or jsonb_typeof(p_payload->'details') is distinct from 'string'
      or submit_topic is null or char_length(submit_topic) not between 3 and 160
      or submit_details is null or char_length(submit_details) not between 5 and 1200 then
      raise exception 'Invalid learning support application' using errcode='22023';
    end if;
    insert into public.affairs_learning_support_requests(user_id,topic,details)
    values(caller,submit_topic,submit_details) returning * into current_request;
  else
    if jsonb_typeof(p_payload->'id') is distinct from 'string'
      or p_payload->>'id' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      or jsonb_typeof(p_payload->'expected_version') is distinct from 'number' then
      raise exception 'Invalid learning support request selector' using errcode='22023';
    end if;
    expected:=(p_payload->>'expected_version')::numeric;
    if expected<>trunc(expected) or expected not between 1 and 3 then
      raise exception 'Invalid learning support request version' using errcode='22023';
    end if;
    target:=(p_payload->>'id')::uuid;
    select * into current_request from public.affairs_learning_support_requests r
      where r.id=target and (p_kind='review' or r.user_id=caller) for update;
    if not found then raise exception 'Learning support request unavailable' using errcode='PT404'; end if;
    if current_request.version<>expected then raise exception 'Learning support request changed' using errcode='PT409'; end if;
    if p_kind='withdraw' then
      if current_request.status not in ('submitted','in_review') then
        raise exception 'Learning support request cannot be withdrawn' using errcode='PT409';
      end if;
      new_status:='withdrawn';
      note:=current_request.review_note;
    else
      new_status:=p_payload->>'status';note:=private.affairs_learning_support_text(p_payload->>'note');
      if jsonb_typeof(p_payload->'status') is distinct from 'string' or new_status not in ('in_review','reviewed')
        or jsonb_typeof(p_payload->'note') is distinct from 'string' or note is null or char_length(note)>600 then
        raise exception 'Invalid learning support review' using errcode='22023';
      end if;
      if (current_request.status,new_status) not in (('submitted','in_review'),('in_review','reviewed')) then
        raise exception 'Learning support review cannot make that transition' using errcode='PT409';
      end if;
    end if;
    update public.affairs_learning_support_requests
      set status=new_status,review_note=note,version=version+1,updated_at=greatest(updated_at,clock_timestamp())
      where id=target returning * into current_request;
  end if;
  result:=jsonb_build_object('id',current_request.id,'requestId',nonce,'status',current_request.status,'version',current_request.version);
  insert into private.affairs_learning_support_operations(actor,request_id,target_id,kind,payload,result)
    values(caller,nonce,current_request.id,p_kind,p_payload,result);
  return result;
end;
$$;

revoke all on function public.affairs_read_learning_support(text,integer),public.affairs_change_learning_support(text,jsonb) from public,anon;
grant execute on function public.affairs_read_learning_support(text,integer),public.affairs_change_learning_support(text,jsonb) to authenticated;
