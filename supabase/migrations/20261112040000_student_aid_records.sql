-- Source-observed aid record columns. These local demonstration records are separate
-- from overseas scholarship applications and are never submissions to the university.
create table public.affairs_student_aid_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  applicant_label text not null check (char_length(applicant_label) between 1 and 160),
  student_name text not null check (char_length(student_name) between 1 and 160),
  masked_identity_number text check (masked_identity_number is null or (
    char_length(masked_identity_number) between 3 and 24
    and masked_identity_number ~ '^[A-Za-z0-9*•● -]+$'
    and masked_identity_number ~ '[*•●]{3,}'
    and char_length(regexp_replace(masked_identity_number,'[^A-Za-z0-9]','','g'))<=4
  )),
  department_name text check (department_name is null or char_length(department_name) between 1 and 160),
  phone text check (phone is null or (char_length(phone) between 3 and 40 and phone ~ '^[0-9+()# .-]+$')),
  application_kind text not null check (char_length(btrim(application_kind)) between 1 and 120),
  relative_count integer check (relative_count between 0 and 1000),
  subsidy_amount numeric(12,2) check (subsidy_amount between 0 and 10000000),
  student_record_locked boolean,
  school_review_status text check (school_review_status is null or char_length(school_review_status) between 1 and 160),
  ministry_review_status text check (ministry_review_status is null or char_length(ministry_review_status) between 1 and 160),
  academic_year integer not null check (academic_year between 1 and 999),
  semester smallint not null check (semester between 1 and 3),
  source_mode text not null default 'local_demo' check (source_mode='local_demo'),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affairs_student_aid_owner_idx on public.affairs_student_aid_records(user_id,academic_year desc,semester desc,id);
create table private.affairs_student_aid_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id,request_id)
);
alter table public.affairs_student_aid_records enable row level security;
alter table private.affairs_student_aid_operations enable row level security;
revoke all on public.affairs_student_aid_records,private.affairs_student_aid_operations from public,anon,authenticated;
grant select on public.affairs_student_aid_records to authenticated;
create policy student_aid_records_read on public.affairs_student_aid_records for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_manage_student_aid_record(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_student uuid;
  v_request uuid;
  v_expected integer;
  v_profile public.affairs_profiles;
  v_student_profile public.affairs_students;
  v_record public.affairs_student_aid_records;
  v_receipt private.affairs_student_aid_operations;
  v_result jsonb;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind is distinct from 'save_student_aid_record' or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>16000 then
    raise exception 'Invalid student aid record operation' using errcode='22023';
  end if;
  -- Reject unknown fields before storing receipts; never retain an extra raw identity field.
  if exists(select 1 from jsonb_object_keys(p_payload) as field(name) where field.name not in (
    'id','user_id','request_id','expected_version','student_name','masked_identity_number','department_name','phone',
    'application_kind','relative_count','subsidy_amount','student_record_locked','school_review_status',
    'ministry_review_status','academic_year','semester'
  )) then raise exception 'Unsupported student aid field' using errcode='22023'; end if;
  v_id := (p_payload->>'id')::uuid;
  v_student := (p_payload->>'user_id')::uuid;
  v_request := (p_payload->>'request_id')::uuid;
  v_expected := (p_payload->>'expected_version')::integer;
  if v_id is null or v_student is null or v_request is null or v_expected is null or v_expected<0 then
    raise exception 'Record, account, request and version are required' using errcode='22023';
  end if;
  -- Serialize each authorized actor's receipt lookup, including retries after later edits.
  perform 1 from public.affairs_profiles where user_id=v_actor for update;
  select * into v_receipt from private.affairs_student_aid_operations where user_id=v_actor and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then
      raise exception 'Request ID was already used for another operation' using errcode='PT409';
    end if;
    return v_receipt.result;
  end if;
  select * into v_profile from public.affairs_profiles where user_id=v_student;
  if v_profile.user_id is null then raise exception 'Student account unavailable' using errcode='42501'; end if;
  select * into v_student_profile from public.affairs_students where user_id=v_student;
  -- Also protect creation when two different authorized actors target the same new UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-aid:'||v_id::text,0));
  select * into v_record from public.affairs_student_aid_records where id=v_id for update;
  if v_record.id is not null and v_record.user_id<>v_student then
    raise exception 'An aid record cannot be reassigned to another account' using errcode='42501';
  end if;
  if coalesce(v_record.version,0)<>v_expected then
    raise exception 'This student aid record changed. Refresh and try again.' using errcode='PT409';
  end if;
  insert into public.affairs_student_aid_records(
    id,user_id,applicant_label,student_name,masked_identity_number,department_name,phone,application_kind,
    relative_count,subsidy_amount,student_record_locked,school_review_status,ministry_review_status,academic_year,semester
  ) values (
    v_id,v_student,left(coalesce(nullif(v_student_profile.student_number,''),nullif(v_profile.display_name,''),v_student::text),160),
    coalesce(nullif(btrim(p_payload->>'student_name'),''),left(coalesce(nullif(v_student_profile.full_name,''),nullif(v_profile.display_name,''),v_student::text),160)),
    nullif(btrim(p_payload->>'masked_identity_number'),''),nullif(btrim(p_payload->>'department_name'),''),nullif(btrim(p_payload->>'phone'),''),
    btrim(p_payload->>'application_kind'),nullif(p_payload->>'relative_count','')::integer,
    nullif(p_payload->>'subsidy_amount','')::numeric,nullif(p_payload->>'student_record_locked','')::boolean,
    nullif(btrim(p_payload->>'school_review_status'),''),nullif(btrim(p_payload->>'ministry_review_status'),''),
    (p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint
  ) on conflict (id) do update set
    student_name=excluded.student_name,masked_identity_number=excluded.masked_identity_number,
    department_name=excluded.department_name,phone=excluded.phone,application_kind=excluded.application_kind,
    relative_count=excluded.relative_count,subsidy_amount=excluded.subsidy_amount,student_record_locked=excluded.student_record_locked,
    school_review_status=excluded.school_review_status,ministry_review_status=excluded.ministry_review_status,
    academic_year=excluded.academic_year,semester=excluded.semester,
    version=affairs_student_aid_records.version+1,updated_at=now()
  returning * into v_record;
  v_result := jsonb_build_object('id',v_record.id,'kind',p_kind,'version',v_record.version,'summary','Saved a local demonstration student aid record.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
    values(v_actor,p_kind,v_record.id,'Saved a local demonstration student aid record.');
  insert into private.affairs_student_aid_operations(user_id,request_id,kind,payload,result)
    values(v_actor,v_request,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_manage_student_aid_record(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_student_aid_record(text,jsonb) to authenticated;
