create table private.affairs_club_foundations (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null check (char_length(description) between 10 and 1000),
  status text not null default 'submitted' check (status in ('submitted','approved','declined','withdrawn')),
  review_note text not null default '' check (char_length(review_note)<=500),
  club_id uuid references public.affairs_clubs(id),
  version integer not null default 1 check (version in (1,2)),
  updated_at timestamptz not null default now(),
  check ((status='approved')=(club_id is not null))
);
create index affairs_club_foundations_applicant on private.affairs_club_foundations (applicant_id,updated_at desc,id);
create unique index affairs_club_foundations_pending_name on private.affairs_club_foundations (lower(name)) where status='submitted';
create index affairs_club_attendance_student on public.affairs_club_attendance (student_id,application_id);
alter table private.affairs_club_foundations enable row level security;
revoke all on private.affairs_club_foundations from public,anon,authenticated;

create function public.affairs_read_club_student(
  p_view text, p_search text default '',p_page integer default 1
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  rows jsonb;
  offset_rows integer;
  eligible boolean:=false;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_view is null or p_view not in ('directory','activity-search','my-attendance','my-memberships','foundation','foundation/review')
    or p_search is null or char_length(p_search)>100 or p_search~'[[:cntrl:]]'
    or p_page is null or p_page not between 1 and 1000
    or (p_search<>'' and p_view not in ('directory','activity-search')) then
    raise exception 'Invalid student club search' using errcode='22023';
  end if;
  offset_rows:=(p_page-1)*25;
  case p_view
  when 'directory' then
    select coalesce(jsonb_agg(to_jsonb(x) order by name,id),'[]') into rows from (
      select id,name,location,advisor from public.affairs_clubs
      where active and strpos(lower(name),lower(p_search))>0
      order by name,id limit 26 offset offset_rows
    ) x;
  when 'activity-search' then
    select coalesce(jsonb_agg(to_jsonb(x) order by starts_at desc,id),'[]') into rows from (
      select a.id,a.title,a.starts_at,a.ends_at,a.location,a.category,a.description,c.name club_name
      from public.affairs_club_activities a join public.affairs_clubs c on c.id=a.club_id
      where a.published and c.active and (
        strpos(lower(a.title),lower(p_search))>0 or strpos(lower(c.name),lower(p_search))>0)
      order by a.starts_at desc,a.id limit 26 offset offset_rows
    ) x;
  when 'my-attendance' then
    select coalesce(jsonb_agg(to_jsonb(x) order by starts_at desc,id),'[]') into rows from (
      select a.id,a.title,a.starts_at,a.location,c.name club_name,a.academic_year,a.term,t.recorded_at
      from public.affairs_club_attendance t join public.affairs_club_applications a on a.id=t.application_id
      join public.affairs_clubs c on c.id=a.club_id
      where t.student_id=caller and a.status in ('approved','completed')
      order by a.starts_at desc,a.id limit 26 offset offset_rows
    ) x;
  when 'my-memberships' then
    select coalesce(jsonb_agg(to_jsonb(x) order by name,id),'[]') into rows from (
      select c.id,c.name,m.role_label,m.academic_year,m.term,c.active
      from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
      where m.user_id=caller
      order by c.name,c.id limit 26 offset offset_rows
    ) x;
  else
    if p_view='foundation/review' and not (select private.affairs_is_admin()) then
      raise exception 'Access denied' using errcode='42501';
    end if;
    eligible:=p_view='foundation' and exists(select 1 from public.affairs_student_profiles where user_id=caller);
    select coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc,id),'[]') into rows from (
      select f.id,f.name,f.description,f.status,f.review_note,f.club_id,f.version,f.updated_at,
        case when p_view='foundation/review' then s.name_zh end student_name
      from private.affairs_club_foundations f
      left join public.affairs_student_profiles s on s.user_id=f.applicant_id
      where (p_view='foundation' and f.applicant_id=caller) or
        (p_view='foundation/review' and f.status='submitted')
      order by f.updated_at desc,f.id limit 26 offset offset_rows
    ) x;
  end case;
  return jsonb_build_object('userId',caller,'view',p_view,'page',p_page,'eligible',eligible,
    'hasMore',p_page<1000 and jsonb_array_length(rows)>25,'rows',rows-25);
end;
$$;

create function public.affairs_change_club_foundation(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  operation_id uuid;
  expected_fields text[];
  digest_value bytea;
  previous private.affairs_club_officer_operations;
  application private.affairs_club_foundations;
  club_name text;
  intent text;
  decision text;
  decision_note text;
  new_club uuid;
  receipt jsonb;
begin
  if caller is null or not (select private.affairs_google_identity())
    or (p_operation='review' and not (select private.affairs_is_admin())) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  expected_fields:=case p_operation when 'submit' then array['description','name','request_id']
    when 'withdraw' then array['expected_version','id','request_id']
    when 'review' then array['expected_version','id','note','request_id','status'] end;
  if expected_fields is null or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>4500 then
    raise exception 'Invalid club application' using errcode='22023';
  end if;
  if array(select key from jsonb_object_keys(p_payload) key order by key)<>expected_fields
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string' then
    raise exception 'Invalid club application' using errcode='22023';
  end if;
  operation_id:=(p_payload->>'request_id')::uuid;
  digest_value:=extensions.digest('club-foundation:'||p_operation||':'||p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':club-officer:'||operation_id::text,0));
  select * into previous from private.affairs_club_officer_operations where actor=caller and request_id=operation_id;
  if found then
    if previous.digest<>digest_value then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return previous.receipt;
  end if;

  if p_operation='submit' then
    if jsonb_typeof(p_payload->'name') is distinct from 'string' or
       jsonb_typeof(p_payload->'description') is distinct from 'string' then
      raise exception 'Invalid club application' using errcode='22023';
    end if;
    club_name:=btrim(regexp_replace(p_payload->>'name','[[:space:]]+',' ','g'));
    intent:=btrim(p_payload->>'description');
    if char_length(club_name) not between 2 and 120 or club_name~'[[:cntrl:]]'
      or char_length(intent) not between 10 and 1000 then
      raise exception 'Invalid club application' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('club-foundation-name:'||lower(club_name),0));
    perform 1 from public.affairs_student_profiles where user_id=caller for key share;
    if not found then raise exception 'Student profile required' using errcode='42501'; end if;
    if exists(select 1 from public.affairs_clubs where lower(name)=lower(club_name)) then
      raise exception 'Club name unavailable' using errcode='PT409';
    end if;
    insert into private.affairs_club_foundations(applicant_id,name,description)
      values(caller,club_name,intent) returning * into application;
  else
    if jsonb_typeof(p_payload->'id') is distinct from 'string' or p_payload->'expected_version' is distinct from '1'::jsonb then
      raise exception 'Invalid club application' using errcode='22023';
    end if;
    select * into application from private.affairs_club_foundations f
      where f.id=(p_payload->>'id')::uuid and (p_operation='review' or f.applicant_id=caller) for update;
    if not found then raise exception 'Application unavailable' using errcode='PT404'; end if;
    if application.status<>'submitted' then raise exception 'Application changed' using errcode='PT409'; end if;
    decision:='withdrawn'; decision_note:='';
    if p_operation='review' then
      decision:=p_payload->>'status'; decision_note:=btrim(p_payload->>'note');
      if decision is null or decision not in ('approved','declined') or
        jsonb_typeof(p_payload->'note') is distinct from 'string' or char_length(decision_note)>500 or
        (decision='declined' and decision_note='') then
        raise exception 'Invalid application decision' using errcode='22023';
      end if;
      if decision='approved' then
        perform pg_advisory_xact_lock(hashtextextended('club-foundation-name:'||lower(application.name),0));
        perform 1 from public.affairs_student_profiles where user_id=application.applicant_id for key share;
        if not found or exists(select 1 from public.affairs_clubs where lower(name)=lower(application.name)) then
          raise exception 'Applicant or club name unavailable' using errcode='PT409';
        end if;
        insert into public.affairs_clubs(name) values(application.name) returning id into new_club;
        insert into public.affairs_club_memberships(club_id,user_id,officer,role_label)
          values(new_club,application.applicant_id,true,'社團負責人');
      end if;
    end if;
    update private.affairs_club_foundations
      set status=decision,review_note=decision_note,club_id=new_club,version=2,updated_at=now()
      where id=application.id returning * into application;
  end if;
  receipt:=jsonb_build_object('id',application.id,'version',application.version,'status',application.status);
  insert into private.affairs_club_officer_operations(actor,request_id,digest,receipt)
    values(caller,operation_id,digest_value,receipt);
  return receipt;
exception
  when unique_violation then raise exception 'Club name unavailable' using errcode='PT409';
  when invalid_text_representation then raise exception 'Invalid club application' using errcode='22023';
end;
$$;
revoke all on function public.affairs_read_club_student(text,text,integer),public.affairs_change_club_foundation(text,jsonb) from public,anon;
grant execute on function public.affairs_read_club_student(text,text,integer),public.affairs_change_club_foundation(text,jsonb) to authenticated;
