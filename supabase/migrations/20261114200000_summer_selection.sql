alter table public.affairs_course_adjustment_eligibility
  drop constraint affairs_course_adjustment_eligibility_phase_check,
  drop constraint affairs_course_adjustment_eligibility_semester_check,
  drop constraint affairs_course_adjustment_eligibility_decision_check,
  add constraint affairs_course_adjustment_phase_semester check (
    (phase in ('add_drop','late_add') and semester in (1,2)) or (phase='summer' and semester=3)
  ),
  add constraint affairs_course_adjustment_decision check (
    decision in ('eligible','ineligible','unverified') or (phase='summer' and decision='missing_college')
  );

create table public.affairs_summer_selection_notices (
  academic_year smallint primary key check (academic_year between 100 and 999),
  published_on date not null,
  source_url text not null check (source_url ~ '^https://www[.]stu[.]edu[.]tw/latestnews-single/[?]id=[0-9]+$'),
  fee_per_unit integer not null check (fee_per_unit between 0 and 100000),
  minimum_paid_students smallint not null check (minimum_paid_students between 1 and 500),
  registration_rules_zh text[] not null check (cardinality(registration_rules_zh) between 1 and 8),
  registration_rules_en text[] not null check (cardinality(registration_rules_en) = cardinality(registration_rules_zh))
);
alter table public.affairs_summer_selection_notices enable row level security;
revoke all on public.affairs_summer_selection_notices from public, anon, authenticated;
grant select on public.affairs_summer_selection_notices to anon, authenticated;
create policy summer_selection_notices_read on public.affairs_summer_selection_notices for select to anon, authenticated using (true);

-- The May 25, 2026 notice describes academic year 114. It sets no policy for later terms.
insert into public.affairs_summer_selection_notices values
  (114, date '2026-05-25', 'https://www.stu.edu.tw/latestnews-single/?id=213145', 1522, 12,
    array['已核准休學的學生無法參加暑期課程。','請本人於期限內完成選課與繳費；轉帳後須按時完成對帳。','除人數不足停開外，選課後不得改選、退選或退費。'],
    array['Students on approved leave from study cannot take summer courses.','Students must register and pay by the deadline. Bank transfers must be reconciled by the deadline.','Course changes, withdrawals and refunds are unavailable unless the class is cancelled for low enrollment.']);

create or replace function public.affairs_set_course_adjustment_eligibility(p_payload jsonb) returns jsonb
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
    or coalesce(p_payload->>'phase','') not in ('add_drop','late_add','summer')
    or coalesce(p_payload->>'decision','') not in ('eligible','ineligible','unverified','missing_college')
    or jsonb_typeof(p_payload->'academic_year') is distinct from 'number'
    or p_payload->>'academic_year' !~ '^[1-9][0-9]{2}$'
    or jsonb_typeof(p_payload->'semester') is distinct from 'number'
    or ((p_payload->>'phase' = 'summer') and p_payload->>'semester' <> '3')
    or ((p_payload->>'phase' <> 'summer') and p_payload->>'semester' !~ '^[12]$')
    or ((p_payload->>'phase' <> 'summer') and p_payload->>'decision' = 'missing_college')
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
