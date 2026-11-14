create table public.affairs_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.affairs_club_memberships (
  club_id uuid not null references public.affairs_clubs(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (user_id, club_id)
);
create table public.affairs_club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.affairs_clubs(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null check (category in ('lecture','performance','outreach','camp','service','special','competition','sports','other','uncategorized')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at and ends_at <= starts_at + interval '31 days'),
  location text not null default '' check (char_length(location) <= 160),
  description text not null default '' check (char_length(description) <= 2000),
  published boolean not null default false
);
create index affairs_club_activities_published_date on public.affairs_club_activities (starts_at, id) where published;
create table public.affairs_club_equipment (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('A01','B01','C01','D01','E01','F01')),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  available boolean not null default true
);
create table public.affairs_club_equipment_closures (
  day date primary key
);
create table public.affairs_club_equipment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.affairs_clubs(id),
  student_number text not null,
  student_name text not null,
  club_name text not null,
  phone text not null check (phone ~ '^[+0-9 ()-]{3,24}$' and phone ~ '[0-9]'),
  pickup_on date not null,
  return_on date not null check (return_on >= pickup_on),
  purpose text not null check (purpose in ('class','activity','meeting','other')),
  other_purpose text not null default '' check (char_length(other_purpose) <= 200),
  items jsonb not null check (jsonb_typeof(items)='array'),
  collateral text not null default '' check (char_length(collateral) <= 160),
  status text not null default 'submitted' check (status in ('submitted','approved','declined','cancelled','returned')),
  version integer not null default 1 check (version between 1 and 1000000),
  updated_at timestamptz not null default now()
);
create index affairs_club_equipment_requests_student on public.affairs_club_equipment_requests (user_id,updated_at desc,id);
create table private.affairs_club_equipment_operations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  digest bytea not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor,request_id)
);
alter table public.affairs_clubs enable row level security;
alter table public.affairs_club_memberships enable row level security;
alter table public.affairs_club_activities enable row level security;
alter table public.affairs_club_equipment enable row level security;
alter table public.affairs_club_equipment_closures enable row level security;
alter table public.affairs_club_equipment_requests enable row level security;
alter table private.affairs_club_equipment_operations enable row level security;
revoke all on public.affairs_clubs, public.affairs_club_memberships, public.affairs_club_activities,
  public.affairs_club_equipment, public.affairs_club_equipment_closures, public.affairs_club_equipment_requests,
  private.affairs_club_equipment_operations from public, anon, authenticated;
grant select,insert,update,delete on public.affairs_clubs, public.affairs_club_memberships,
  public.affairs_club_activities, public.affairs_club_equipment, public.affairs_club_equipment_closures to service_role;

create function public.affairs_read_club_services(p_view text,p_month date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Taipei')::date;
  manager boolean;
  student jsonb;
  clubs jsonb := '[]';
  equipment jsonb := '[]';
  rows jsonb := '[]';
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  manager := (select private.affairs_is_admin());
  if p_view='activities' then
    if p_month is null or extract(day from p_month)<>1 or p_month<'2000-01-01' or p_month>'2100-12-01' then
      raise exception 'Invalid calendar month' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at,e.id),'[]') into rows
    from (
      select a.id,c.name club_name,a.title,a.category,a.starts_at,a.ends_at,a.location,a.description
      from public.affairs_club_activities a join public.affairs_clubs c on c.id=a.club_id
      where a.published and c.active
        and a.starts_at < ((p_month+interval '1 month') at time zone 'Asia/Taipei')
        and a.starts_at >= ((p_month-interval '31 days') at time zone 'Asia/Taipei')
        and a.ends_at > (p_month::timestamp at time zone 'Asia/Taipei')
      order by a.starts_at,a.id limit 500
    ) e;
  elsif p_view in ('equipment','review') and p_month is null then
    if p_view='review' and not manager then raise exception 'Access denied' using errcode='42501'; end if;
    if p_view='equipment' then
      select jsonb_build_object('student_number',student_number,'student_name',name_zh) into student
      from public.affairs_student_profiles where user_id=caller;
      select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]') into clubs
      from (select c.id,c.name from public.affairs_clubs c join public.affairs_club_memberships m on m.club_id=c.id
        where m.user_id=caller and c.active order by c.name,c.id limit 100) c;
      if student is not null and jsonb_array_length(clubs)>0 then
        select coalesce(jsonb_agg(to_jsonb(i) order by i.category,i.label,i.id),'[]') into equipment
        from (select id,category,label from public.affairs_club_equipment where available order by category,label,id limit 400) i;
      end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id),'[]') into rows
    from (select id,student_number,student_name,club_id,club_name,phone,pickup_on,return_on,purpose,other_purpose,
        items,collateral,status,version,updated_at
      from public.affairs_club_equipment_requests
      where (p_view='equipment' and user_id=caller) or (p_view='review' and status in ('submitted','approved'))
      order by updated_at desc,id limit 100) r;
  else
    raise exception 'Invalid club service view' using errcode='22023';
  end if;
  return jsonb_build_object('userId',caller,'view',p_view,'manager',manager,'today',today,
    'student',student,'clubs',clubs,'equipment',equipment,'rows',rows);
end;
$$;

create function public.affairs_change_club_equipment(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Taipei')::date;
  keys text[];
  operation_key uuid;
  payload_digest bytea;
  previous private.affairs_club_equipment_operations;
  student public.affairs_student_profiles;
  club public.affairs_clubs;
  request public.affairs_club_equipment_requests;
  pickup date;
  due date;
  requested_items uuid[];
  item_list jsonb;
  requested_status text;
  collateral_text text;
  result jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  keys := case p_operation
    when 'submit' then array['club_id','items','other_purpose','phone','pickup_on','purpose','request_id','return_on']
    when 'edit' then array['club_id','expected_version','id','items','other_purpose','phone','pickup_on','purpose','request_id','return_on']
    when 'cancel' then array['expected_version','id','request_id']
    when 'review' then array['collateral','expected_version','id','request_id','status'] end;
  if keys is null or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8000 then
    raise exception 'Invalid equipment request' using errcode='22023';
  end if;
  if array(select key from jsonb_object_keys(p_payload) key order by key)<>keys or
     coalesce(p_payload->>'request_id','') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'Invalid equipment request' using errcode='22023';
  end if;
  if p_operation='review' and not(select private.affairs_is_admin()) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  operation_key := (p_payload->>'request_id')::uuid;
  payload_digest := extensions.digest(p_operation||':'||p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':club-equipment:'||operation_key::text,0));
  select * into previous from private.affairs_club_equipment_operations where actor=caller and request_id=operation_key;
  if found then
    if previous.digest<>payload_digest then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return previous.receipt;
  end if;
  if p_operation<>'submit' then
    if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or
      p_payload->>'expected_version' !~ '^(?:[1-9][0-9]{0,5}|1000000)$' or
      jsonb_typeof(p_payload->'id') is distinct from 'string' then
      raise exception 'Invalid request version' using errcode='22023';
    end if;
    select * into request from public.affairs_club_equipment_requests
      where id=(p_payload->>'id')::uuid and (p_operation='review' or user_id=caller) for update;
    if not found then raise exception 'Equipment request unavailable' using errcode='PT404'; end if;
    if request.version<>(p_payload->>'expected_version')::integer or request.version>=1000000 then
      raise exception 'Reload the equipment request' using errcode='PT409';
    end if;
    if p_operation in ('edit','cancel') and (request.status<>'submitted' or request.pickup_on<today) then
      raise exception 'Equipment request can no longer be changed' using errcode='PT409';
    end if;
  end if;
  if p_operation in ('submit','edit') then
    if jsonb_typeof(p_payload->'items') is distinct from 'array'
       or (select count(*) from jsonb_each(p_payload) e where e.key not in ('items','id','expected_version') and jsonb_typeof(e.value)='string')<>7
       or p_payload->>'pickup_on' !~ '^\d{4}-\d{2}-\d{2}$' or p_payload->>'return_on' !~ '^\d{4}-\d{2}-\d{2}$'
       or p_payload->>'purpose' not in ('class','activity','meeting','other')
       or p_payload->>'phone' !~ '^[+0-9 ()-]{3,24}$' or p_payload->>'phone' !~ '[0-9]'
       or char_length(p_payload->>'other_purpose')>200
       or ((p_payload->>'purpose'='other')<>(btrim(p_payload->>'other_purpose')<>'')) then
      raise exception 'Invalid equipment request details' using errcode='22023';
    end if;
    if jsonb_array_length(p_payload->'items') not between 1 and 10 then
      raise exception 'Choose between one and ten equipment items' using errcode='22023';
    end if;
    requested_items := array(select distinct value::uuid from jsonb_array_elements_text(p_payload->'items') order by 1);
    if cardinality(requested_items)<>jsonb_array_length(p_payload->'items') or array_position(requested_items,null) is not null then
      raise exception 'Duplicate or invalid equipment item' using errcode='22023';
    end if;
    pickup := (p_payload->>'pickup_on')::date;
    due := (p_payload->>'return_on')::date;
    if (pickup<today+3 and not (p_operation='edit' and pickup=request.pickup_on)) or pickup>today+180 or due<pickup or due>today+180
       or extract(isodow from pickup)>5 or extract(isodow from due)>5
       or exists(select 1 from public.affairs_club_equipment_closures where day in (pickup,due)) then
      raise exception 'Choose valid pickup and return days' using errcode='22023';
    end if;
    select * into student from public.affairs_student_profiles where user_id=caller;
    if not found then raise exception 'Student identity is unavailable' using errcode='PT409'; end if;
    select c.* into club from public.affairs_clubs c join public.affairs_club_memberships m on c.id=m.club_id
      where m.user_id=caller and c.id=(p_payload->>'club_id')::uuid and c.active for share of c,m;
    if not found then raise exception 'Club membership is unavailable' using errcode='PT409'; end if;
    -- Lock each selected item in a stable order before checking overlapping bookings.
    select coalesce(jsonb_agg(to_jsonb(i) order by i.label,i.id),'[]') into item_list
    from (select id,label from public.affairs_club_equipment where available and id=any(requested_items) order by id for update) i;
    if jsonb_array_length(item_list)<>cardinality(requested_items) then
      raise exception 'Equipment is no longer available' using errcode='PT409';
    end if;
    if exists (select 1 from public.affairs_club_equipment_requests r
      where r.id is distinct from request.id and r.status in ('submitted','approved') and r.pickup_on<=due and r.return_on>=pickup
        and exists(select 1 from jsonb_array_elements(r.items) e where (e->>'id')::uuid=any(requested_items))) then
      raise exception 'Equipment is already reserved for those dates' using errcode='PT409';
    end if;
    if p_operation='submit' then
      insert into public.affairs_club_equipment_requests
        (user_id,club_id,student_number,student_name,club_name,phone,pickup_on,return_on,purpose,other_purpose,items)
        values(caller,club.id,student.student_number,student.name_zh,club.name,p_payload->>'phone',pickup,due,
          p_payload->>'purpose',btrim(p_payload->>'other_purpose'),item_list) returning * into request;
    else
      update public.affairs_club_equipment_requests
        set club_id=club.id,student_number=student.student_number,student_name=student.name_zh,club_name=club.name,
          phone=p_payload->>'phone',pickup_on=pickup,return_on=due,purpose=p_payload->>'purpose',
          other_purpose=btrim(p_payload->>'other_purpose'),items=item_list,version=version+1,updated_at=now()
        where id=request.id returning * into request;
    end if;
  else
    if p_operation='cancel' then
      requested_status := 'cancelled';
      collateral_text := request.collateral;
    else
      requested_status := p_payload->>'status';
      collateral_text := btrim(p_payload->>'collateral');
      if jsonb_typeof(p_payload->'status') is distinct from 'string' or
         jsonb_typeof(p_payload->'collateral') is distinct from 'string' or char_length(collateral_text)>160 or
         not ((request.status='submitted' and requested_status='declined')
           or (request.status='submitted' and requested_status='approved' and request.pickup_on>=today)
           or (request.status='approved' and requested_status='returned' and request.pickup_on<=today)) then
        raise exception 'Invalid equipment request transition' using errcode='22023';
      end if;
    end if;
    update public.affairs_club_equipment_requests
      set status=requested_status,collateral=collateral_text,version=version+1,updated_at=now()
      where id=request.id returning * into request;
  end if;
  result := jsonb_build_object('id',request.id,'version',request.version,'status',request.status);
  insert into private.affairs_club_equipment_operations(actor,request_id,digest,receipt)
    values(caller,operation_key,payload_digest,result);
  return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid equipment request details' using errcode='22023';
end;
$$;
revoke all on function public.affairs_read_club_services(text,date), public.affairs_change_club_equipment(text,jsonb) from public,anon;
grant execute on function public.affairs_read_club_services(text,date), public.affairs_change_club_equipment(text,jsonb) to authenticated;
