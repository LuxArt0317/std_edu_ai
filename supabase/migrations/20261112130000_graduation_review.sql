-- DRAFT: atomic, administrator-maintained local graduation-reference reports.
-- No source student data, eligibility rules, or computed credit totals are seeded.
create function private.affairs_graduation_object_valid(value jsonb,fields text[]) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  return value ?& fields and (value-fields)='{}'::jsonb;
end; $$;
create function private.affairs_graduation_text_valid(value jsonb,maximum integer,required boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if value='null'::jsonb then return not required; end if;
  if jsonb_typeof(value) is distinct from 'string' then return false; end if;
  return char_length(value #>> '{}')<=maximum and (not required or char_length(btrim(value #>> '{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0);
end; $$;
create function private.affairs_graduation_credit_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if value='null'::jsonb then return true; end if;
  if jsonb_typeof(value) is distinct from 'number' then return false; end if;
  return value::numeric between 0 and 1000 and value::numeric=round(value::numeric,2);
exception when others then return false;
end; $$;
create function private.affairs_graduation_ids_valid(value jsonb,maximum integer) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;seen text[] := '{}';identifier text;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value)>maximum then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' then return false; end if;
    identifier := item->>'id';
    if identifier !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$' or identifier=any(seen) then return false; end if;
    seen := array_append(seen,identifier);
  end loop;
  return true;
end; $$;
create function private.affairs_graduation_status_valid(value jsonb,with_note boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if not private.affairs_graduation_object_valid(value,case when with_note then array['text','indicator','note'] else array['text','indicator'] end)
    or not private.affairs_graduation_text_valid(value->'text',160) then return false; end if;
  if value->'indicator'<>'null'::jsonb and (jsonb_typeof(value->'indicator') is distinct from 'string' or value->>'indicator' not in ('passed','attention')) then return false; end if;
  return not with_note or private.affairs_graduation_text_valid(value->'note',1000);
end; $$;
create function private.affairs_graduation_course_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return private.affairs_graduation_object_valid(value,array['id','sequenceText','title','credits','requiredElectiveText','yearText','transferText'])
    and jsonb_typeof(value->'id')='string' and coalesce(value->>'id','') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
    and private.affairs_graduation_text_valid(value->'sequenceText',30)
    and private.affairs_graduation_text_valid(value->'title',160,true)
    and private.affairs_graduation_credit_valid(value->'credits')
    and private.affairs_graduation_text_valid(value->'requiredElectiveText',30)
    and private.affairs_graduation_text_valid(value->'yearText',30)
    and private.affairs_graduation_text_valid(value->'transferText',80);
end; $$;
create function private.affairs_graduation_report_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare language_row jsonb;category jsonb;requirement jsonb;course jsonb;key text;rows_count integer:=0;stamp text;
begin
  if not private.affairs_graduation_object_valid(value,array['reportedAt','identity','educationProgram','foreignLanguageCompletion','englishRequirement','graduationReview','languageRequirements','categories','otherCourses'])
    or octet_length(value::text)>131072 then return false; end if;
  if value->'reportedAt'<>'null'::jsonb then
    stamp := value->>'reportedAt';
    if jsonb_typeof(value->'reportedAt') is distinct from 'string' or stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then return false; end if;
    perform stamp::timestamptz;
  end if;
  if not private.affairs_graduation_object_valid(value->'identity',array['studentNumber','studentName','departmentName','yearText','enrollmentStatusText','curriculumCohortText','doubleMajorText','minorText']) then return false; end if;
  foreach key in array array['studentNumber','studentName','departmentName','yearText','enrollmentStatusText','curriculumCohortText','doubleMajorText','minorText'] loop
    if not private.affairs_graduation_text_valid(value->'identity'->key,case when key='yearText' then 30 else 160 end) then return false; end if;
  end loop;
  foreach key in array array['educationProgram','foreignLanguageCompletion','englishRequirement'] loop
    if not private.affairs_graduation_status_valid(value->key) then return false; end if;
  end loop;
  if not private.affairs_graduation_status_valid(value->'graduationReview',true)
    or not private.affairs_graduation_ids_valid(value->'languageRequirements',100)
    or not private.affairs_graduation_ids_valid(value->'categories',100)
    or not private.affairs_graduation_ids_valid(value->'otherCourses',1000) then return false; end if;
  for language_row in select jsonb_array_elements(value->'languageRequirements') loop
    if not private.affairs_graduation_object_valid(language_row,array['id','label','status','requiredCredits','matchedCredits','missingCredits'])
      or not private.affairs_graduation_text_valid(language_row->'label',160,true)
      or not private.affairs_graduation_status_valid(language_row->'status') then return false; end if;
    foreach key in array array['requiredCredits','matchedCredits','missingCredits'] loop
      if not private.affairs_graduation_credit_valid(language_row->key) then return false; end if;
    end loop;
  end loop;
  for category in select jsonb_array_elements(value->'categories') loop
    if not private.affairs_graduation_object_valid(category,array['id','label','requiredElectiveText','requiredCredits','completedCredits','matchedCredits','excludedCredits','status','requirements','detailSubtotalCredits'])
      or not private.affairs_graduation_text_valid(category->'label',160,true)
      or not private.affairs_graduation_text_valid(category->'requiredElectiveText',30)
      or not private.affairs_graduation_status_valid(category->'status')
      or not private.affairs_graduation_ids_valid(category->'requirements',1000) then return false; end if;
    foreach key in array array['requiredCredits','completedCredits','matchedCredits','excludedCredits','detailSubtotalCredits'] loop
      if not private.affairs_graduation_credit_valid(category->key) then return false; end if;
    end loop;
    rows_count := rows_count+jsonb_array_length(category->'requirements');
    if rows_count>1000 then return false; end if;
    for requirement in select jsonb_array_elements(category->'requirements') loop
      if not private.affairs_graduation_object_valid(requirement,array['id','sequenceText','title','moduleText','credits','requiredElectiveText','yearText','transferText','indicator','matchedCourses'])
        or not private.affairs_graduation_text_valid(requirement->'sequenceText',30)
        or not private.affairs_graduation_text_valid(requirement->'title',160,true)
        or not private.affairs_graduation_text_valid(requirement->'moduleText',160)
        or not private.affairs_graduation_credit_valid(requirement->'credits')
        or not private.affairs_graduation_text_valid(requirement->'requiredElectiveText',30)
        or not private.affairs_graduation_text_valid(requirement->'yearText',30)
        or not private.affairs_graduation_text_valid(requirement->'transferText',80)
        or not private.affairs_graduation_status_valid(jsonb_build_object('text',null,'indicator',requirement->'indicator'))
        or not private.affairs_graduation_ids_valid(requirement->'matchedCourses',1000) then return false; end if;
      rows_count := rows_count+jsonb_array_length(requirement->'matchedCourses');
      if rows_count>1000 then return false; end if;
      for course in select jsonb_array_elements(requirement->'matchedCourses') loop
        if not private.affairs_graduation_course_valid(course) then return false; end if;
      end loop;
    end loop;
  end loop;
  rows_count := rows_count+jsonb_array_length(value->'otherCourses');
  if rows_count>1000 then return false; end if;
  for course in select jsonb_array_elements(value->'otherCourses') loop
    if not private.affairs_graduation_course_valid(course) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function private.affairs_graduation_object_valid(jsonb,text[]),private.affairs_graduation_text_valid(jsonb,integer,boolean),
  private.affairs_graduation_credit_valid(jsonb),private.affairs_graduation_ids_valid(jsonb,integer),private.affairs_graduation_status_valid(jsonb,boolean),
  private.affairs_graduation_course_valid(jsonb),private.affairs_graduation_report_valid(jsonb) from public,anon,authenticated;

create table public.affairs_graduation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  report_kind text not null check(report_kind in ('academic_services','legacy')),
  report jsonb not null check(private.affairs_graduation_report_valid(report)),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,report_kind)
);
comment on column public.affairs_graduation_reviews.report_kind is
  'Immutable source-view kind: academic_services is 13-1/graduation; legacy is 15-2. Neither report is inferred from or substituted for the other.';
comment on column public.affairs_graduation_reviews.report is
  'Atomic literal reference report. Credit totals, matching, status indicators and eligibility text are entered explicitly and are never calculated here.';
create function private.affairs_graduation_identity_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.user_id is distinct from old.user_id or new.report_kind is distinct from old.report_kind then
    raise exception 'Graduation report owner and kind are immutable' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function private.affairs_graduation_identity_immutable() from public,anon,authenticated;
create trigger graduation_review_identity_immutable before update on public.affairs_graduation_reviews
  for each row execute function private.affairs_graduation_identity_immutable();
create table private.affairs_graduation_review_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table public.affairs_graduation_reviews enable row level security;
alter table private.affairs_graduation_review_operations enable row level security;
revoke all on public.affairs_graduation_reviews,private.affairs_graduation_review_operations from public,anon,authenticated;
grant select on public.affairs_graduation_reviews to authenticated;
create policy graduation_review_read on public.affairs_graduation_reviews for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_manage_graduation_review(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid());record_id uuid;owner_id uuid;v_request uuid;expected integer;v_report_kind text;
  existing public.affairs_graduation_reviews;saved public.affairs_graduation_reviews;
  receipt private.affairs_graduation_review_operations;result jsonb;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind is distinct from 'save_graduation_review' or not private.affairs_graduation_object_valid(p_payload,array['id','user_id','report_kind','request_id','expected_version','report'])
    or octet_length(p_payload::text)>131072 then raise exception 'Invalid graduation-review operation' using errcode='22023'; end if;
  if exists(select 1 from unnest(array['id','user_id','request_id']) as field(name) where
      jsonb_typeof(p_payload->field.name) is distinct from 'string' or coalesce(p_payload->>field.name,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or jsonb_typeof(p_payload->'report_kind') is distinct from 'string'
    or p_payload->>'report_kind' not in ('academic_services','legacy')
    or jsonb_typeof(p_payload->'expected_version') not in ('string','number')
    or coalesce(p_payload->>'expected_version','') !~ '^(0|[1-9][0-9]{0,8})$'
    or not private.affairs_graduation_report_valid(p_payload->'report') then
    raise exception 'Invalid graduation-review field or nested report' using errcode='22023'; end if;
  record_id := (p_payload->>'id')::uuid;owner_id := (p_payload->>'user_id')::uuid;
  v_report_kind := p_payload->>'report_kind';
  v_request := (p_payload->>'request_id')::uuid;expected := (p_payload->>'expected_version')::integer;
  perform 1 from public.affairs_profiles where user_id=actor for update;
  select * into receipt from private.affairs_graduation_review_operations o where o.user_id=actor and o.request_id=v_request;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409'; end if;
    return receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=owner_id) then raise exception 'Student account unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('graduation-owner:'||owner_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('graduation-report:'||record_id::text,0));
  select * into existing from public.affairs_graduation_reviews where id=record_id for update;
  if existing.id is not null and existing.user_id<>owner_id then raise exception 'Graduation reports cannot be reassigned to another account' using errcode='42501'; end if;
  if existing.id is not null and existing.report_kind<>v_report_kind then raise exception 'Graduation report kind cannot be changed' using errcode='22023'; end if;
  if coalesce(existing.version,0)<>expected then raise exception 'This graduation report changed. Refresh and try again.' using errcode='PT409'; end if;
  if exists(select 1 from public.affairs_graduation_reviews where user_id=owner_id and report_kind=v_report_kind and id<>record_id) then
    raise exception 'This account already has a graduation report of this kind. Refresh and edit that report.' using errcode='PT409'; end if;
  insert into public.affairs_graduation_reviews(id,user_id,report_kind,report) values(record_id,owner_id,v_report_kind,p_payload->'report')
    on conflict(id) do update set report=excluded.report,version=affairs_graduation_reviews.version+1,updated_at=now() returning * into saved;
  result := jsonb_build_object('id',saved.id,'kind',p_kind,'report_kind',saved.report_kind,'version',saved.version,'summary','Saved local demonstration graduation-reference report.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,saved.id,'Saved local demonstration graduation-reference report.');
  insert into private.affairs_graduation_review_operations(user_id,request_id,kind,payload,result) values(actor,v_request,p_kind,p_payload,result);
  return result;
exception when unique_violation then
  raise exception 'A graduation report of this kind already exists. Refresh and try again.' using errcode='PT409';
end; $$;
revoke all on function public.affairs_manage_graduation_review(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_graduation_review(text,jsonb) to authenticated;
