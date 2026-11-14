create table public.affairs_health_examinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  examination_code text not null check (length(btrim(examination_code)) between 1 and 40),
  student_number text not null check (length(btrim(student_number)) between 1 and 40),
  student_name text not null check (length(btrim(student_name)) between 1 and 120),
  class_label text not null check (length(btrim(class_label)) between 1 and 120),
  examined_on date,
  report_available boolean not null default false,
  unique(user_id,examination_code)
);
create index affairs_health_examinations_recent on public.affairs_health_examinations
  (user_id,examined_on desc nulls last,id);
alter table public.affairs_health_examinations enable row level security;
revoke all on public.affairs_health_examinations from public,anon,authenticated;
grant select,insert,update,delete on public.affairs_health_examinations to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('affairs-health-reports','affairs-health-reports',false,10485760,array['application/pdf']);

create function private.affairs_can_read_health_report(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select (select private.affairs_google_identity()) and exists(
    select 1 from public.affairs_health_examinations e
    where e.user_id=(select auth.uid()) and e.report_available
      and p_name=e.user_id::text||'/'||e.id::text||'.pdf'
  );
$$;
revoke all on function private.affairs_can_read_health_report(text) from public,anon;
grant execute on function private.affairs_can_read_health_report(text) to authenticated;
create policy affairs_health_report_read on storage.objects for select to authenticated
  using (
    bucket_id='affairs-health-reports'
    and storage.allow_only_operation('object.get_authenticated')
    and private.affairs_can_read_health_report(name)
  );

create function public.affairs_read_health_examinations(p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  total integer;
  rows jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_offset is null or p_offset<0 or p_offset>5000 or p_offset%25<>0 then
    raise exception 'Invalid examination inquiry page' using errcode='22023';
  end if;
  select count(*) into total from public.affairs_health_examinations where user_id=caller;
  select coalesce(jsonb_agg(to_jsonb(r)-'examined_on' order by r.examined_on desc nulls last,r.id),'[]') into rows
    from (select id, examination_code, student_number, student_name, class_label, examined_on, report_available and
      exists(select 1 from storage.objects o where o.bucket_id='affairs-health-reports' and o.name=e.user_id::text||'/'||e.id::text||'.pdf')
        as report_available
      from public.affairs_health_examinations e where user_id=caller order by examined_on desc nulls last,id limit 25 offset p_offset) r;
  return jsonb_build_object('userId',caller,'total',total,'rows',rows);
end;
$$;
revoke all on function public.affairs_read_health_examinations(integer) from public,anon;
grant execute on function public.affairs_read_health_examinations(integer) to authenticated;
