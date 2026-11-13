create table public.affairs_clearance_periods (
  term_id uuid primary key references public.affairs_terms(id),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  version integer not null default 1 check (version between 1 and 1000000),
  check (isfinite(opens_at) and isfinite(closes_at) and opens_at<closes_at and closes_at-opens_at<=interval '366 days')
);
create table public.affairs_clearance_candidates (
  term_id uuid not null references public.affairs_clearance_periods(term_id),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  track text not null check (track in ('undergraduate','graduate')),
  international boolean not null,
  version integer not null default 1 check (version between 1 and 1000000),
  primary key (term_id,user_id)
);
create table public.affairs_clearance_applications (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.affairs_terms(id),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  track text not null check (track in ('undergraduate','graduate')),
  submitted_at timestamptz not null default clock_timestamp(),
  unique (term_id,user_id)
);
create index affairs_clearance_application_owner_idx on public.affairs_clearance_applications(user_id,submitted_at desc,id);
create table public.affairs_clearance_reviews (
  application_id uuid not null references public.affairs_clearance_applications(id) on delete cascade,
  office text not null check (office in ('library','academic','department','cashier','career','advisor','thesis','international')),
  status text not null default 'pending' check (status in ('pending','cleared','action_required')),
  note text not null default '' check (char_length(note)<=1000),
  reviewed_at timestamptz,
  version integer not null default 1 check (version between 1 and 1000000),
  primary key (application_id,office),
  check ((status='pending')=(reviewed_at is null)),
  check (status<>'action_required' or char_length(btrim(note))>0)
);
create table private.affairs_clearance_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  target uuid references auth.users(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (actor,request_id)
);
alter table public.affairs_clearance_periods enable row level security;
alter table public.affairs_clearance_candidates enable row level security;
alter table public.affairs_clearance_applications enable row level security;
alter table public.affairs_clearance_reviews enable row level security;
alter table private.affairs_clearance_receipts enable row level security;
revoke all on public.affairs_clearance_periods,public.affairs_clearance_candidates,public.affairs_clearance_applications,
  public.affairs_clearance_reviews,private.affairs_clearance_receipts from public,anon,authenticated;

create function public.affairs_read_graduation_clearance(p_view text,p_term uuid default null,p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller_id uuid := (select auth.uid());
  target uuid := case when p_view='manage' then p_student else caller_id end;
  terms jsonb := '[]'::jsonb;
  periods jsonb := '[]'::jsonb;
  applications jsonb := '[]'::jsonb;
begin
  if not(select private.affairs_google_identity()) or (p_view='manage' and not(select private.affairs_is_admin())) then
    raise exception 'Graduation clearance is unavailable to your account' using errcode='42501';
  end if;
  if p_view is null or p_view not in ('student','manage') or (p_view='student' and (p_term is not null or p_student is not null))
    or (p_student is not null and p_term is null) then
    raise exception 'Invalid clearance scope' using errcode='22023';
  end if;
  if p_view='manage' then
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into terms from (
      select id,label from public.affairs_terms order by starts_on desc,id limit 200
    ) row;
  end if;
  select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into periods from (
    select p.term_id as "termId",t.label as term,p.opens_at as "opensAt",p.closes_at as "closesAt",p.version,
      private.affairs_withdrawal_window_state(p.opens_at,p.closes_at,statement_timestamp()) as state,
      case when c.user_id is null then null else jsonb_build_object('track',c.track,'international',c.international,'version',c.version) end as candidate
    from public.affairs_clearance_periods p join public.affairs_terms t on t.id=p.term_id
    left join public.affairs_clearance_candidates c on c.term_id=p.term_id and c.user_id=target
    where (p_view='manage' and p.term_id=p_term) or (p_view='student' and c.user_id=target)
    order by p.opens_at desc,p.term_id limit 100
  ) row;
  select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into applications from (
    select a.id,a.term_id as "termId",t.label as term,a.track,a.submitted_at as "submittedAt",
      coalesce((select jsonb_agg(jsonb_build_object('office',r.office,'status',r.status,'note',r.note,
        'reviewedAt',r.reviewed_at,'version',r.version) order by r.office)
        from public.affairs_clearance_reviews r where r.application_id=a.id),'[]'::jsonb) as reviews
    from public.affairs_clearance_applications a join public.affairs_terms t on t.id=a.term_id
    where a.user_id=target and (p_view='student' or a.term_id=p_term)
    order by a.submitted_at desc,a.id limit 100
  ) row;
  return jsonb_build_object('userId',caller_id,'targetId',target,'terms',terms,'periods',periods,'applications',applications);
end;
$$;
revoke all on function public.affairs_read_graduation_clearance(text,uuid,uuid) from public,anon;
grant execute on function public.affairs_read_graduation_clearance(text,uuid,uuid) to authenticated;

create function public.affairs_change_graduation_clearance(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller_id uuid := (select auth.uid());
  target uuid;
  fields text[];
  request_key uuid;
  term_key uuid;
  application_key uuid;
  expected integer;
  opening timestamptz;
  closing timestamptz;
  changed_at timestamptz;
  period public.affairs_clearance_periods;
  candidate public.affairs_clearance_candidates;
  application public.affairs_clearance_applications;
  review public.affairs_clearance_reviews;
  receipt private.affairs_clearance_receipts;
  decision text;
  note_text text;
  offices text[] := array['library','academic','department','cashier','career'];
  result jsonb;
begin
  if not(select private.affairs_google_identity()) or (p_action<>'submit_graduation_clearance' and not(select private.affairs_is_admin())) then
    raise exception 'Graduation clearance is unavailable to your account' using errcode='42501';
  end if;
  case p_action
    when 'set_clearance_period' then fields:=array['term_id','opens_at','closes_at','expected_version','request_id'];
    when 'set_clearance_candidate' then fields:=array['term_id','user_id','track','international','expected_version','request_id'];
    when 'submit_graduation_clearance' then fields:=array['term_id','period_version','candidate_version','acknowledged','request_id'];
    when 'review_clearance_office' then fields:=array['application_id','office','decision','note','expected_version','request_id'];
    else raise exception 'Invalid clearance action' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>7000
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or exists(select 1 from unnest(fields) k(field) where k.field like '%\_id' escape '\'
      and (jsonb_typeof(p_payload->k.field) is distinct from 'string' or p_payload->>k.field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    or exists(select 1 from unnest(fields) k(field) where k.field like '%version' and
      (jsonb_typeof(p_payload->k.field) is distinct from 'number' or p_payload->>k.field !~ '^(?:[0-9]{1,6}|1000000)$')) then
    raise exception 'Invalid clearance fields' using errcode='22023';
  end if;
  request_key:=(p_payload->>'request_id')::uuid; term_key:=(p_payload->>'term_id')::uuid;
  target:=(p_payload->>'user_id')::uuid; application_key:=(p_payload->>'application_id')::uuid;
  expected:=(p_payload->>'expected_version')::int;
  perform pg_advisory_xact_lock(hashtextextended('clearance-actor:'||caller_id,0));
  select * into receipt from private.affairs_clearance_receipts r where r.actor=caller_id and r.request_id=request_key;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return receipt.result;
  end if;

  if p_action='set_clearance_period' then
    if not exists(select 1 from public.affairs_terms where id=term_key)
      or coalesce(p_payload->>'opens_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or coalesce(p_payload->>'closes_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
      raise exception 'Invalid clearance dates or term' using errcode='22023';
    end if;
    opening:=(p_payload->>'opens_at')::timestamptz; closing:=(p_payload->>'closes_at')::timestamptz;
    if closing<=opening or closing-opening>interval '366 days' then raise exception 'Invalid application period' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('clearance-period:'||term_key,0));
    select * into period from public.affairs_clearance_periods where term_id=term_key for update;
    if coalesce(period.version,0)<>expected or expected>=1000000 then raise exception 'Application period changed' using errcode='PT409'; end if;
    insert into public.affairs_clearance_periods values(term_key,opening,closing,expected+1)
      on conflict(term_id) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,version=excluded.version returning * into period;
    result:=jsonb_build_object('termId',term_key,'version',period.version);
  elsif p_action='set_clearance_candidate' or p_action='submit_graduation_clearance' then
    if p_action='submit_graduation_clearance' then target:=caller_id; end if;
    perform pg_advisory_xact_lock(hashtextextended('clearance-candidate:'||target||':'||term_key,0));
    select * into period from public.affairs_clearance_periods where term_id=term_key for share;
    select * into candidate from public.affairs_clearance_candidates where term_id=term_key and user_id=target;
    select * into application from public.affairs_clearance_applications where term_id=term_key and user_id=target;
    if p_action='set_clearance_candidate' then
      if coalesce(p_payload->>'track','') not in ('undergraduate','graduate') or jsonb_typeof(p_payload->'international') is distinct from 'boolean'
        or not exists(select 1 from public.affairs_profiles where user_id=target) then raise exception 'Invalid candidate' using errcode='22023'; end if;
      if period.term_id is null or application.id is not null or coalesce(candidate.version,0)<>expected or expected>=1000000 then
        raise exception 'Candidate or period changed' using errcode='PT409';
      end if;
      insert into public.affairs_clearance_candidates values(term_key,target,p_payload->>'track',(p_payload->>'international')::boolean,expected+1)
        on conflict(term_id,user_id) do update set track=excluded.track,international=excluded.international,version=excluded.version returning * into candidate;
      result:=jsonb_build_object('termId',term_key,'version',candidate.version);
    else
      if p_payload->'acknowledged' is distinct from 'true'::jsonb then raise exception 'Application acknowledgement required' using errcode='22023'; end if;
      if candidate.user_id is null then raise exception 'Candidate is not assigned' using errcode='42501'; end if;
      changed_at:=clock_timestamp();
      if application.id is not null or period.version<>(p_payload->>'period_version')::int or candidate.version<>(p_payload->>'candidate_version')::int
        or private.affairs_withdrawal_window_state(period.opens_at,period.closes_at,changed_at)<>'open' then
        raise exception 'Application, candidate or period changed' using errcode='PT409';
      end if;
      if candidate.track='graduate' then offices:=offices||array['advisor','thesis']; end if;
      if candidate.international then offices:=offices||array['international']; end if;
      insert into public.affairs_clearance_applications(term_id,user_id,track,submitted_at) values(term_key,target,candidate.track,changed_at) returning * into application;
      insert into public.affairs_clearance_reviews(application_id,office) select application.id,unit from unnest(offices) unit;
      result:=jsonb_build_object('id',application.id,'termId',term_key);
    end if;
  else
    decision:=p_payload->>'decision'; note_text:=btrim(p_payload->>'note');
    if coalesce(decision,'') not in ('pending','cleared','action_required') or jsonb_typeof(p_payload->'note') is distinct from 'string'
      or char_length(note_text)>1000 or (decision='action_required' and note_text='') then raise exception 'Invalid clearance decision' using errcode='22023'; end if;
    select * into application from public.affairs_clearance_applications where id=application_key;
    target:=application.user_id;
    select * into review from public.affairs_clearance_reviews where application_id=application_key and office=p_payload->>'office' for update;
    if review.application_id is null or review.version<>expected or expected>=1000000 then raise exception 'Office review changed' using errcode='PT409'; end if;
    update public.affairs_clearance_reviews set status=decision,note=note_text,
      reviewed_at=case when decision='pending' then null else clock_timestamp() end,version=version+1
      where application_id=application_key and office=review.office returning * into review;
    result:=jsonb_build_object('id',application_key,'office',review.office,'version',review.version);
  end if;
  insert into private.affairs_clearance_receipts(actor,request_id,action,target,payload,result) values(caller_id,request_key,p_action,target,p_payload,result);
  return result;
end;
$$;
revoke all on function public.affairs_change_graduation_clearance(text,jsonb) from public,anon;
grant execute on function public.affairs_change_graduation_clearance(text,jsonb) to authenticated;
