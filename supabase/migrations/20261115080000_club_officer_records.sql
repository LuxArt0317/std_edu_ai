alter table public.affairs_club_memberships
  add column officer boolean not null default false,
  add column role_label text not null default '社員' check (char_length(role_label) between 1 and 40);
alter table public.affairs_clubs
  add column location text not null default '' check (char_length(location)<=160),
  add column advisor text not null default '' check (char_length(advisor)<=160),
  add column lead_name text check (char_length(lead_name)<=160),
  add column lead_email text check (char_length(lead_email)<=254),
  add column lead_phone text check (char_length(lead_phone)<=40),
  add column lead_mobile text check (char_length(lead_mobile)<=40),
  add column review_status text check (char_length(review_status)<=80),
  add column lending_status text check (char_length(lending_status)<=80),
  add column academic_year integer check (academic_year between 89 and 199),
  add column term integer check (term between 1 and 3);
alter table public.affairs_club_memberships
  add column contact_email text check (char_length(contact_email)<=254),
  add column contact_phone text check (char_length(contact_phone)<=40),
  add column academic_year integer check (academic_year between 89 and 199),
  add column term integer check (term between 1 and 3);

create table public.affairs_club_applications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.affairs_clubs(id),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  organizer text not null check (char_length(btrim(organizer)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at>starts_at and ends_at<=starts_at+interval '31 days'),
  hours numeric(6,2) not null check (hours>0 and hours<=744),
  location text not null check (char_length(btrim(location)) between 1 and 160),
  details jsonb not null check (jsonb_typeof(details)='object' and pg_column_size(details)<=8000),
  status text not null default 'submitted' check (status in ('submitted','approved','declined','withdrawn','completed')),
  academic_year integer check (academic_year between 89 and 199),
  term integer check (term between 1 and 3),
  review_note text not null default '',
  completion_note text not null default '',
  calendar_activity_id uuid unique references public.affairs_club_activities(id),
  version integer not null default 1 check (version between 1 and 1000000),
  updated_at timestamptz not null default now()
);
create index affairs_club_applications_club on public.affairs_club_applications(club_id,updated_at desc,id);
create table public.affairs_club_attendance (
  application_id uuid not null references public.affairs_club_applications(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  primary key(application_id,student_id)
);
create table private.affairs_club_officer_operations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  digest bytea not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor,request_id)
);
alter table public.affairs_club_applications enable row level security;
alter table public.affairs_club_attendance enable row level security;
alter table private.affairs_club_officer_operations enable row level security;
revoke all on public.affairs_club_applications,public.affairs_club_attendance,private.affairs_club_officer_operations from public,anon,authenticated;
grant select,insert,update,delete on public.affairs_club_attendance to service_role;

create function private.affairs_club_officer(p_club uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
    where m.user_id=(select auth.uid()) and m.club_id=p_club and m.officer and c.active);
$$;
revoke all on function private.affairs_club_officer(uuid) from public,anon,authenticated;

create function public.affairs_read_club_officer(p_view text,p_club uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); manager boolean; clubs jsonb; rows jsonb:='[]';
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  manager:=(select private.affairs_is_admin());
  if p_view not in ('applications','completion','profiles','members','participation','review') or p_view is null
     or (p_club is not null and p_view not in ('members','participation')) then
    raise exception 'Invalid club officer view' using errcode='22023';
  end if;
  if p_view='review' and not manager then raise exception 'Access denied' using errcode='42501'; end if;
  if p_club is not null and not private.affairs_club_officer(p_club) then
    raise exception 'Club unavailable' using errcode='PT404';
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]') into clubs
  from (select id,name from public.affairs_clubs where private.affairs_club_officer(id)
    order by name,id limit 100) c;

  if p_view in ('applications','completion','review') then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]') into rows from (
      select a.id,a.club_id,c.name club_name,a.title,a.organizer,a.starts_at,a.ends_at,a.hours,a.location,a.details,
        a.academic_year,a.term,a.status,a.review_note,a.completion_note,a.version,a.updated_at,(a.applicant_id=caller) can_edit
      from public.affairs_club_applications a join public.affairs_clubs c on c.id=a.club_id
      where case p_view
        when 'review' then a.status='submitted'
        when 'completion' then private.affairs_club_officer(a.club_id) and a.status in ('approved','completed')
        else private.affairs_club_officer(a.club_id) end
      order by a.updated_at desc,a.id limit 100
    ) a;
  elsif p_view='profiles' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]') into rows from (
      select c.id,c.name,c.location,c.advisor,c.lead_name,c.lead_email,c.lead_phone,c.lead_mobile,c.review_status,c.lending_status,
        c.academic_year,c.term,(select count(*)::integer from public.affairs_club_memberships m where m.club_id=c.id) member_count
      from public.affairs_clubs c where private.affairs_club_officer(c.id) order by c.name,c.id limit 100
    ) c;
  elsif p_view='members' and p_club is not null then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.student_number,m.id),'[]') into rows from (
      select s.user_id id,s.student_number,s.name_zh student_name,c.name club_name,m.role_label,m.officer,m.contact_email,m.contact_phone,m.academic_year,m.term
      from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
      join public.affairs_student_profiles s on s.user_id=m.user_id
      where m.club_id=p_club order by s.student_number,s.user_id limit 200
    ) m;
  elsif p_view='participation' and p_club is not null then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at desc,r.id,r.student_number),'[]') into rows from (
      select a.id,a.title,a.starts_at,s.student_number,s.name_zh student_name,c.name club_name,a.academic_year,a.term
      from public.affairs_club_attendance t join public.affairs_club_applications a on a.id=t.application_id
      join public.affairs_clubs c on c.id=a.club_id join public.affairs_student_profiles s on s.user_id=t.student_id
      where a.club_id=p_club and a.status in ('approved','completed')
      order by a.starts_at desc,a.id,s.student_number limit 200
    ) r;
  end if;
  return jsonb_build_object('userId',caller,'view',p_view,'clubs',clubs,'rows',rows);
end;
$$;

create function public.affairs_change_club_officer(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); op_id uuid; digest_value bytea; earlier private.affairs_club_officer_operations;
  fields text[]; row public.affairs_club_applications; club uuid; event_id uuid; detail jsonb; approved boolean;
  event_title text; host text; starts timestamptz; ends timestamptz; event_hours numeric; place text; note text;
  selected text; allowed text[]; picks jsonb; receipt jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_operation='review' and not (select private.affairs_is_admin()) then raise exception 'Access denied' using errcode='42501'; end if;
  fields:=case p_operation
    when 'submit' then array['application','request_id']
    when 'edit' then array['application','expected_version','id','request_id']
    when 'withdraw' then array['expected_version','id','request_id']
    when 'complete' then array['expected_version','id','note','request_id']
    when 'review' then array['category','expected_version','id','note','request_id','status'] end;
  if fields is null or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>11000 then
    raise exception 'Invalid club application' using errcode='22023';
  end if;
  if array(select key from jsonb_object_keys(p_payload) key order by key)<>fields
     or coalesce(p_payload->>'request_id','') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'Invalid club application' using errcode='22023';
  end if;
  op_id:=(p_payload->>'request_id')::uuid;
  digest_value:=extensions.digest(p_operation||':'||p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':club-officer:'||op_id::text,0));
  select * into earlier from private.affairs_club_officer_operations where actor=caller and request_id=op_id;
  if found then
    if earlier.digest<>digest_value then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return earlier.receipt;
  end if;
  if p_operation<>'submit' then
    if jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
       or coalesce(p_payload->>'expected_version','') !~ '^[1-9][0-9]{0,5}$'
       or jsonb_typeof(p_payload->'id') is distinct from 'string' then
      raise exception 'Invalid application version' using errcode='22023';
    end if;
    select * into row from public.affairs_club_applications a where a.id=(p_payload->>'id')::uuid and
      (p_operation='review' or (private.affairs_club_officer(a.club_id) and a.applicant_id=caller)) for update;
    if not found then raise exception 'Application unavailable' using errcode='PT404'; end if;
    if p_operation<>'review' then
      perform 1 from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
        where m.club_id=row.club_id and m.user_id=caller and m.officer and c.active for share of m,c;
      if not found then raise exception 'Club officer access required' using errcode='42501'; end if;
    end if;
    if row.version<>(p_payload->>'expected_version')::integer
       or row.status<>(case when p_operation='complete' then 'approved' else 'submitted' end) then
      raise exception 'Application changed' using errcode='PT409';
    end if;
  end if;

  if p_operation in ('submit','edit') then
    detail:=p_payload->'application';
    if jsonb_typeof(detail) is distinct from 'object' then raise exception 'Invalid details' using errcode='22023'; end if;
    if array(select key from jsonb_object_keys(detail) key order by key)<>array['advisor','advisor_phone','area','audiences',
      'campus_location','club_id','co_organizer','coordinator','coordinator_phone','education','education_other','ends_at',
      'hours','location','natures','offsite_location','organizer','sdgs','starts_at','title'] then
      raise exception 'Invalid details' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_each(detail) e where e.key not in ('audiences','education','natures','sdgs')
        and (jsonb_typeof(e.value) is distinct from 'string' or char_length(e.value #>> '{}')>160))
      or coalesce(detail->>'hours','') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
      or coalesce(detail->>'starts_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}\+08:00$'
      or coalesce(detail->>'ends_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}\+08:00$'
      or detail->>'area' not in ('campus','offsite','both') then
      raise exception 'Invalid activity fields' using errcode='22023';
    end if;
    for selected,allowed in values
      ('natures',array['service','meeting','competition','visit','class','election','other']),
      ('audiences',array['teachers','students','staff','external','beneficiaries','other']),
      ('sdgs',array(select n::text from generate_series(1,17) n)),
      ('education',array['life','lifeskills','safety','energy','arts','civic','ip','gender','tobacco','swimming','other'])
    loop
      picks:=detail->selected;
      if jsonb_typeof(picks) is distinct from 'array' then raise exception 'Invalid activity choices' using errcode='22023';end if;
      if jsonb_array_length(picks)>cardinality(allowed) or exists(
        select 1 from jsonb_array_elements(picks) p where jsonb_typeof(p)<>'string' or not ((p #>> '{}')=any(allowed)))
        or jsonb_array_length(picks)<>(select count(distinct p) from jsonb_array_elements(picks) p) then
        raise exception 'Invalid activity choices' using errcode='22023';
      end if;
    end loop;
    club:=(detail->>'club_id')::uuid;
    if club is null or not private.affairs_club_officer(club) or (p_operation='edit' and row.club_id<>club) then
      raise exception 'Club officer access required' using errcode='42501';
    end if;
    perform 1 from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
      where m.club_id=club and m.user_id=caller and m.officer and c.active for share of m,c;
    if not found then raise exception 'Club officer access required' using errcode='42501'; end if;
    event_title:=btrim(detail->>'title');
    host:=btrim(detail->>'organizer');
    place:=btrim(detail->>'location');
    starts:=(detail->>'starts_at')::timestamptz;
    ends:=(detail->>'ends_at')::timestamptz;
    event_hours:=(detail->>'hours')::numeric;
    if event_title='' or host='' or place='' or event_hours<=0 or event_hours>extract(epoch from (ends-starts))/3600
       or starts<=now() or ends<=starts or ends>starts+interval '31 days' then
      raise exception 'Invalid activity schedule' using errcode='22023';
    end if;
    if p_operation='submit' then
      insert into public.affairs_club_applications(club_id,applicant_id,title,organizer,starts_at,ends_at,hours,location,details)
        values(club,caller,event_title,host,starts,ends,event_hours,place,detail) returning * into row;
    else
      update public.affairs_club_applications a set title=event_title,organizer=host,starts_at=starts,
        ends_at=ends,hours=event_hours,location=place,details=detail,version=a.version+1,updated_at=now()
        where a.id=row.id returning * into row;
    end if;
  elsif p_operation='withdraw' then
    update public.affairs_club_applications a set status='withdrawn',version=a.version+1,updated_at=now()
      where a.id=row.id returning * into row;
  elsif p_operation='complete' then
    note:=btrim(p_payload->>'note');
    if jsonb_typeof(p_payload->'note') is distinct from 'string' or char_length(note) not between 1 and 2000 or row.ends_at>now()
       then raise exception 'Completion requires an ended activity and a summary' using errcode='22023'; end if;
    update public.affairs_club_applications a set status='completed',completion_note=note,version=a.version+1,updated_at=now()
      where a.id=row.id returning * into row;
  else
    approved:=p_payload->>'status'='approved';
    note:=btrim(p_payload->>'note');
    if coalesce(p_payload->>'status','') not in ('approved','declined') or jsonb_typeof(p_payload->'note') is distinct from 'string'
       or char_length(note)>1000
       or coalesce(p_payload->>'category','') not in ('lecture','performance','outreach','camp','service','special','competition','sports','other','uncategorized')
       or (approved and row.starts_at<=now()) then raise exception 'Invalid activity review' using errcode='22023'; end if;
    if approved then
      insert into public.affairs_club_activities(club_id,title,category,starts_at,ends_at,location,published)
        values(row.club_id,row.title,p_payload->>'category',row.starts_at,row.ends_at,row.location,true) returning id into event_id;
    end if;
    update public.affairs_club_applications a set status=p_payload->>'status',review_note=note,calendar_activity_id=event_id,
      version=a.version+1,updated_at=now() where a.id=row.id returning * into row;
  end if;
  receipt:=jsonb_build_object('id',row.id,'version',row.version,'status',row.status);
  insert into private.affairs_club_officer_operations(actor,request_id,digest,receipt) values(caller,op_id,digest_value,receipt);
  return receipt;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid club application details' using errcode='22023';
end;
$$;
revoke all on function public.affairs_read_club_officer(text,uuid),public.affairs_change_club_officer(text,jsonb) from public,anon;
grant execute on function public.affairs_read_club_officer(text,uuid),public.affairs_change_club_officer(text,jsonb) to authenticated;
