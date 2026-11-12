-- Local housing applications and administrator-maintained bed history. No university data or dates are seeded.
create table public.affairs_housing_periods (
  id uuid primary key default gen_random_uuid(),
  term_label text not null check (char_length(btrim(term_label)) between 1 and 80),
  academic_year integer not null check (academic_year between 1 and 300),
  semester integer not null check (semester in (1,2)),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  published boolean not null default false,
  instructions text not null default '' check (char_length(instructions)<=2000),
  agreement_text text not null check (char_length(btrim(agreement_text)) between 1 and 4000),
  source_mode text not null default 'local_demo' check (source_mode='local_demo'),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_year,semester),
  check (opens_at<closes_at and opens_at>='2000-01-01Z'::timestamptz and closes_at<'2101-01-01Z'::timestamptz)
);
create table public.affairs_housing_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  period_id uuid not null references public.affairs_housing_periods(id),
  receipt_number text not null unique default ('H-'||upper(replace(gen_random_uuid()::text,'-',''))),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 80),
  student_number text not null check (char_length(btrim(student_number)) between 1 and 40),
  gender text not null check (gender in ('male','female')),
  department text not null check (char_length(btrim(department)) between 1 and 100),
  birth_date date not null check (birth_date between '1900-01-01'::date and '2100-12-31'::date),
  home_phone text not null default '' check (char_length(home_phone)<=40),
  mobile_phone text not null default '' check (char_length(mobile_phone)<=40),
  email text not null check (char_length(email)<=254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 12),
  category text not null check (category in ('general','disability','island','low_income','lower_middle_income','college','academic_award','athlete','dorm_leader','overseas_chinese','international','mainland')),
  health_notes text not null default '' check (char_length(health_notes)<=250),
  agreement_version integer not null check (agreement_version>0),
  agreement_text text not null check (char_length(btrim(agreement_text)) between 1 and 4000),
  submitted_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  unique(user_id,period_id)
);
create index affairs_housing_applications_period_idx on public.affairs_housing_applications(period_id,submitted_at desc);
create table public.affairs_housing_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  period_id uuid not null references public.affairs_housing_periods(id),
  bed_number text not null check (bed_number ~ '^[A-Za-z0-9-]{1,32}$'),
  dormitory text not null check (char_length(btrim(dormitory)) between 1 and 80),
  bunk text check (bunk in ('upper','lower')),
  accommodation_fee numeric(12,2) check (accommodation_fee between 0 and 10000000),
  deposit numeric(12,2) check (deposit between 0 and 10000000),
  subsidy_amount numeric(12,2) check (subsidy_amount between 0 and 10000000),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,period_id),
  unique(period_id,bed_number)
);
create index affairs_housing_assignments_user_idx on public.affairs_housing_assignments(user_id,period_id);
create table private.affairs_housing_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.affairs_housing_periods enable row level security;
alter table public.affairs_housing_applications enable row level security;
alter table public.affairs_housing_assignments enable row level security;
alter table private.affairs_housing_operations enable row level security;
revoke all on public.affairs_housing_periods,public.affairs_housing_applications,public.affairs_housing_assignments,
  private.affairs_housing_operations from public,anon,authenticated;
grant select on public.affairs_housing_periods,public.affairs_housing_applications,public.affairs_housing_assignments to authenticated;
create policy housing_periods_read on public.affairs_housing_periods for select to authenticated using (
  (select private.affairs_google_identity()) and (published or (select private.affairs_is_admin()))
);
create policy housing_applications_read on public.affairs_housing_applications for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);
create policy housing_assignments_read on public.affairs_housing_assignments for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_housing_action(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_request uuid;
  v_id uuid;
  v_period_id uuid;
  v_user_id uuid;
  v_version integer;
  v_allowed text[];
  v_period public.affairs_housing_periods;
  v_application public.affairs_housing_applications;
  v_assignment public.affairs_housing_assignments;
  v_receipt private.affairs_housing_operations;
  v_result jsonb;
  v_summary text;
begin
  if not (select private.affairs_google_identity()) then
    raise exception 'School Affairs sign-in is required' using errcode='42501';
  end if;
  perform 1 from public.affairs_profiles where user_id=v_uid for update;
  if not found then raise exception 'School Affairs profile is required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>24000
    or p_kind is null or p_kind not in ('submit_housing_application','save_housing_period','save_housing_assignment') then
    raise exception 'Invalid housing action' using errcode='22023';
  end if;
  if p_kind<>'submit_housing_application' and not (select private.affairs_is_admin()) then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  v_allowed := case p_kind
    when 'submit_housing_application' then array['period_id','period_version','expected_version','request_id','accepted_agreement','full_name','student_number','gender','department','birth_date','home_phone','mobile_phone','email','address','postal_code','category','health_notes']
    when 'save_housing_period' then array['id','term_label','academic_year','semester','opens_at','closes_at','published','instructions','agreement_text','expected_version','request_id']
    else array['id','user_id','period_id','bed_number','dormitory','bunk','accommodation_fee','deposit','subsidy_amount','expected_version','request_id'] end;
  -- Reject extra fields before recording a receipt; national identifiers are never accepted or retained.
  if exists(select 1 from jsonb_object_keys(p_payload) as supplied(key) where not (supplied.key=any(v_allowed)))
    or exists(select 1 from jsonb_each(p_payload) as supplied(key,value) where jsonb_typeof(supplied.value)<>'string') then
    raise exception 'Unsupported housing fields' using errcode='22023';
  end if;
  v_request := (p_payload->>'request_id')::uuid;
  v_version := (p_payload->>'expected_version')::integer;
  if v_request is null or v_version is null or v_version<0 then
    raise exception 'A request ID and record version are required' using errcode='22023';
  end if;
  select * into v_receipt from private.affairs_housing_operations where user_id=v_uid and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then
      raise exception 'Request ID was already used for another operation' using errcode='PT409';
    end if;
    return v_receipt.result;
  end if;

  if p_kind='save_housing_period' then
    v_id := (p_payload->>'id')::uuid;
    if v_id is null then raise exception 'Period ID is required' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('housing-period:'||v_id::text,0));
    select * into v_period from public.affairs_housing_periods where id=v_id for update;
    if coalesce(v_period.version,0)<>v_version then
      raise exception 'The housing period changed. Refresh and try again.' using errcode='PT409';
    end if;
    if v_period.id is not null and (exists(select 1 from public.affairs_housing_applications where period_id=v_id)
      or exists(select 1 from public.affairs_housing_assignments where period_id=v_id)) then
      if not coalesce((p_payload->>'published')::boolean,false)
        or (p_payload->>'academic_year')::integer is distinct from v_period.academic_year
        or (p_payload->>'semester')::integer is distinct from v_period.semester then
        raise exception 'A period with saved housing records must retain its published academic term.' using errcode='PT409';
      end if;
    end if;
    insert into public.affairs_housing_periods(id,term_label,academic_year,semester,opens_at,closes_at,published,instructions,agreement_text)
      values(v_id,btrim(p_payload->>'term_label'),(p_payload->>'academic_year')::integer,(p_payload->>'semester')::integer,
        (p_payload->>'opens_at')::timestamptz,(p_payload->>'closes_at')::timestamptz,coalesce((p_payload->>'published')::boolean,false),
        coalesce(btrim(p_payload->>'instructions'),''),btrim(p_payload->>'agreement_text'))
      on conflict(id) do update set term_label=excluded.term_label,academic_year=excluded.academic_year,semester=excluded.semester,
        opens_at=excluded.opens_at,closes_at=excluded.closes_at,published=excluded.published,instructions=excluded.instructions,
        agreement_text=excluded.agreement_text,version=affairs_housing_periods.version+1,updated_at=now()
      returning * into v_period;
    v_version := v_period.version;
    v_summary := 'Saved a local housing application period.';
  else
    v_period_id := (p_payload->>'period_id')::uuid;
    -- Every record path takes the period lock before an application/assignment lock.
    select * into v_period from public.affairs_housing_periods where id=v_period_id and published for share;
    if v_period.id is null then raise exception 'Housing period is unavailable' using errcode='42501'; end if;
    if p_kind='submit_housing_application' then
      if statement_timestamp()<v_period.opens_at or statement_timestamp()>=v_period.closes_at then
        raise exception 'This housing application period is not open.' using errcode='PT409';
      end if;
      if (p_payload->>'period_version')::integer is distinct from v_period.version then
        raise exception 'The application agreement or period changed. Read it again before submitting.' using errcode='PT409';
      end if;
      if p_payload->>'accepted_agreement' is distinct from 'true' then
        raise exception 'Read and accept the local application agreement first.' using errcode='22023';
      end if;
      if (p_payload->>'birth_date')::date>current_date then
        raise exception 'Birth date cannot be in the future.' using errcode='22023';
      end if;
      select * into v_application from public.affairs_housing_applications where user_id=v_uid and period_id=v_period_id for update;
      if v_application.id is not null or v_version<>0 then
        raise exception 'An application is already saved. Open its receipt instead of submitting again.' using errcode='PT409';
      end if;
      insert into public.affairs_housing_applications(user_id,period_id,full_name,student_number,gender,department,birth_date,
        home_phone,mobile_phone,email,address,postal_code,category,health_notes,agreement_version,agreement_text)
        values(v_uid,v_period_id,btrim(p_payload->>'full_name'),btrim(p_payload->>'student_number'),p_payload->>'gender',
          btrim(p_payload->>'department'),(p_payload->>'birth_date')::date,coalesce(btrim(p_payload->>'home_phone'),''),
          coalesce(btrim(p_payload->>'mobile_phone'),''),btrim(p_payload->>'email'),btrim(p_payload->>'address'),
          btrim(p_payload->>'postal_code'),p_payload->>'category',coalesce(btrim(p_payload->>'health_notes'),''),v_period.version,v_period.agreement_text)
        returning * into v_application;
      v_id := v_application.id;
      v_version := v_application.version;
      v_summary := 'Saved a local housing application and printable receipt.';
    else
      v_id := (p_payload->>'id')::uuid;
      v_user_id := (p_payload->>'user_id')::uuid;
      if v_id is null or v_user_id is null or not exists(select 1 from public.affairs_profiles where user_id=v_user_id) then
        raise exception 'Assignment ID and an existing School Affairs account are required.' using errcode='22023';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('housing-assignment:'||v_id::text,0));
      select * into v_assignment from public.affairs_housing_assignments where id=v_id for update;
      if coalesce(v_assignment.version,0)<>v_version then
        raise exception 'The bed record changed. Refresh and try again.' using errcode='PT409';
      end if;
      if v_assignment.id is not null and (v_assignment.user_id<>v_user_id or v_assignment.period_id<>v_period_id) then
        raise exception 'An existing bed record must retain its account and period.' using errcode='PT409';
      end if;
      insert into public.affairs_housing_assignments(id,user_id,period_id,bed_number,dormitory,bunk,accommodation_fee,deposit,subsidy_amount)
        values(v_id,v_user_id,v_period_id,upper(btrim(p_payload->>'bed_number')),btrim(p_payload->>'dormitory'),
          nullif(p_payload->>'bunk',''),nullif(p_payload->>'accommodation_fee','')::numeric,nullif(p_payload->>'deposit','')::numeric,nullif(p_payload->>'subsidy_amount','')::numeric)
        on conflict(id) do update set bed_number=excluded.bed_number,dormitory=excluded.dormitory,bunk=excluded.bunk,
          accommodation_fee=excluded.accommodation_fee,deposit=excluded.deposit,subsidy_amount=excluded.subsidy_amount,version=affairs_housing_assignments.version+1,updated_at=now()
        returning * into v_assignment;
      v_version := v_assignment.version;
      v_summary := 'Saved an account-owned local bed history record.';
    end if;
  end if;
  v_result := jsonb_build_object('id',v_id,'kind',p_kind,'version',v_version,'summary',v_summary);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,p_kind,v_id,v_summary);
  insert into private.affairs_housing_operations(user_id,request_id,kind,payload,result) values(v_uid,v_request,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_housing_action(text,jsonb) from public,anon;
grant execute on function public.affairs_housing_action(text,jsonb) to authenticated;
