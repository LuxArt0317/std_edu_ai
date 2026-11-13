-- Captured late-add rules. Keep legacy credential and browser instructions out of the local service.
create table public.affairs_late_add_notice (
  id integer primary key check (id = 1),
  observed_on date not null,
  rules_zh text[] not null check (cardinality(rules_zh) between 1 and 8 and octet_length(rules_zh::text) <= 4000),
  rules_en text[] not null check (cardinality(rules_en) = cardinality(rules_zh) and octet_length(rules_en::text) <= 4000),
  selection_notes text[] not null check (cardinality(selection_notes) between 1 and 12 and octet_length(selection_notes::text) <= 8000),
  fee_notes text[] not null check (cardinality(fee_notes) between 1 and 8 and octet_length(fee_notes::text) <= 8000)
);
alter table public.affairs_late_add_notice enable row level security;
revoke all on public.affairs_late_add_notice from public, anon, authenticated;
grant select on public.affairs_late_add_notice to anon, authenticated;
create policy late_add_notice_read on public.affairs_late_add_notice for select to anon, authenticated using (true);

insert into public.affairs_late_add_notice values
  (1, date '2026-11-14',
   array['補加選限加退選階段遇到關課的學生。','加選的課程須有剩餘名額。'],
   array['Late add is for students affected by a course closure during add/drop.','A replacement course must have an available seat.'],
   array['選課前先向開課單位查詢先修要求與全學年課程規定。','選課前請閱讀適用的選課準則。','確認選課結果並保存紀錄，離開共用裝置時請登出。','如有疑問，請聯絡註冊課務組。'],
   array['進修部依修業期間預計的平均學分數與每學分收費計算預收金額。','結算按實際修習學分計算，包含棄選學分。補繳或退還差額後才能完成離校手續。','收費問題請洽會計室分機 1501、1502。']);

create table public.affairs_course_adjustment_eligibility (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  phase text not null check (phase in ('add_drop','late_add')),
  academic_year smallint not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1,2)),
  decision text not null check (decision in ('eligible','ineligible','unverified')),
  checked_on date not null default (now() at time zone 'Asia/Taipei')::date,
  version integer not null default 1 check (version between 1 and 1000000),
  primary key (user_id,phase,academic_year,semester)
);
alter table public.affairs_course_adjustment_eligibility enable row level security;
revoke all on public.affairs_course_adjustment_eligibility from public, anon, authenticated;
grant select on public.affairs_course_adjustment_eligibility to authenticated;
create policy course_adjustment_eligibility_read on public.affairs_course_adjustment_eligibility for select to authenticated
  using ((select private.affairs_google_identity()) and
    (user_id = (select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_course_adjustment_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  receipt jsonb not null,
  primary key (actor,request_id)
);
alter table private.affairs_course_adjustment_receipts enable row level security;
revoke all on private.affairs_course_adjustment_receipts from public, anon, authenticated;

create function public.affairs_set_course_adjustment_eligibility(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  fields text[] := array['user_id','phase','academic_year','semester','decision','expected_version','request_id'];
  student uuid;
  request_key uuid;
  target_year smallint;
  target_semester smallint;
  target_phase text;
  wanted_version integer;
  new_decision text;
  saved private.affairs_course_adjustment_receipts;
  existing public.affairs_course_adjustment_eligibility;
  result jsonb;
begin
  if actor_id is null or not (select private.affairs_is_admin()) then
    raise exception 'Verified School Affairs administrator required' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 1024
    or not (p_payload ?& fields) or p_payload - fields <> '{}'::jsonb
    or coalesce(p_payload->>'user_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'phase','') not in ('add_drop','late_add')
    or coalesce(p_payload->>'decision','') not in ('eligible','ineligible','unverified')
    or jsonb_typeof(p_payload->'academic_year') is distinct from 'number'
    or p_payload->>'academic_year' !~ '^[1-9][0-9]{2}$'
    or jsonb_typeof(p_payload->'semester') is distinct from 'number'
    or p_payload->>'semester' !~ '^[12]$'
    or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or p_payload->>'expected_version' !~ '^[0-9]{1,6}$' then
    raise exception 'Invalid eligibility fields' using errcode='22023';
  end if;
  student := (p_payload->>'user_id')::uuid;
  request_key := (p_payload->>'request_id')::uuid;
  target_year := (p_payload->>'academic_year')::smallint;
  target_semester := (p_payload->>'semester')::smallint;
  target_phase := p_payload->>'phase';
  wanted_version := (p_payload->>'expected_version')::integer;
  new_decision := p_payload->>'decision';
  perform pg_advisory_xact_lock(hashtextextended('course-adjustment-actor:' || actor_id::text,0));
  select * into saved from private.affairs_course_adjustment_receipts
    where actor=actor_id and request_id=request_key;
  if found then
    if saved.payload <> p_payload then raise exception 'Request ID already used' using errcode='PT409'; end if;
    return saved.receipt;
  end if;
  if not exists (select 1 from public.affairs_profiles where user_id=student) then
    raise exception 'Unknown student account' using errcode='22023';
  end if;
  select * into existing from public.affairs_course_adjustment_eligibility
    where user_id=student and phase=target_phase and academic_year=target_year and semester=target_semester for update;
  if coalesce(existing.version,0) <> wanted_version then
    raise exception 'Eligibility changed' using errcode='PT409';
  end if;
  insert into public.affairs_course_adjustment_eligibility
    (user_id,phase,academic_year,semester,decision,version)
    values (student,target_phase,target_year,target_semester,new_decision,wanted_version+1)
    on conflict (user_id,phase,academic_year,semester) do update
      set decision=excluded.decision, version=excluded.version, checked_on=excluded.checked_on
    where affairs_course_adjustment_eligibility.version=wanted_version
    returning * into existing;
  if not found then raise exception 'Eligibility changed' using errcode='PT409'; end if;
  result := to_jsonb(existing);
  insert into private.affairs_course_adjustment_receipts values (actor_id,request_key,p_payload,result);
  return result;
end;
$$;
revoke all on function public.affairs_set_course_adjustment_eligibility(jsonb) from public, anon;
grant execute on function public.affairs_set_course_adjustment_eligibility(jsonb) to authenticated;
