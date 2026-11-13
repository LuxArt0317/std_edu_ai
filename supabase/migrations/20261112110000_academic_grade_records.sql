-- DRAFT: local administrator-maintained AcademicServices query records only.
-- No source student data, existing assessment scores, or eligibility calculations.
create table public.affairs_academic_grade_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  record_kind text not null check(record_kind in ('transcript','warning')),
  academic_year integer not null check(academic_year between 1 and 9999),
  semester smallint not null check(semester between 1 and 3),
  course_title text not null check(char_length(btrim(course_title)) between 1 and 160),
  course_code text check(course_code is null or char_length(btrim(course_code)) between 1 and 80),
  category_text text check(category_text is null or char_length(btrim(category_text)) between 1 and 160),
  module_name text check(module_name is null or char_length(btrim(module_name)) between 1 and 160),
  required_elective_text text check(required_elective_text is null or char_length(btrim(required_elective_text)) between 1 and 30),
  credits numeric(5,2) check(credits is null or credits between 0 and 999.99),
  grade_text text check(grade_text is null or char_length(btrim(grade_text)) between 1 and 80),
  remark_text text check(remark_text is null or char_length(btrim(remark_text)) between 1 and 300),
  row_order integer not null check(row_order between 0 and 999999),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check((record_kind='transcript' and course_code is null and remark_text is null) or
    (record_kind='warning' and course_code is not null and category_text is null and module_name is null and required_elective_text is null))
);
comment on column public.affairs_academic_grade_records.grade_text is
  'Literal displayed result, including numeric text, P, or withdrawal. Never derive pass status, earned credits or eligibility from this field.';
comment on column public.affairs_academic_grade_records.category_text is
  'Literal transcript 類別 column; code-like values are not assumed to be a course identifier.';
create index affairs_academic_grade_owner_idx on public.affairs_academic_grade_records(user_id,record_kind,academic_year,semester,row_order,id);

create table public.affairs_academic_term_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  summary_kind text not null check(summary_kind in ('transcript','warning')),
  academic_year integer not null check(academic_year between 1 and 9999),
  semester smallint not null check(semester between 1 and 3),
  earned_credits numeric(6,2) check(earned_credits is null or earned_credits between 0 and 9999.99),
  average_grade_text text check(average_grade_text is null or char_length(btrim(average_grade_text)) between 1 and 80),
  attempted_credits numeric(6,2) check(attempted_credits is null or attempted_credits between 0 and 9999.99),
  passed_credits numeric(6,2) check(passed_credits is null or passed_credits between 0 and 9999.99),
  failed_credits numeric(6,2) check(failed_credits is null or failed_credits between 0 and 9999.99),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,academic_year,semester,summary_kind),
  check((summary_kind='transcript' and attempted_credits is null and passed_credits is null and failed_credits is null) or
    (summary_kind='warning' and earned_credits is null and average_grade_text is null))
);
comment on table public.affairs_academic_term_summaries is
  'Explicitly stored display summaries. Values are independent of course rows and are never recomputed from grade text.';
create index affairs_academic_summary_owner_idx on public.affairs_academic_term_summaries(user_id,summary_kind,academic_year,semester,id);

create table public.affairs_academic_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year integer not null check(academic_year between 1 and 9999),
  semester smallint not null check(semester between 1 and 3),
  department_ranking_text text check(department_ranking_text is null or char_length(btrim(department_ranking_text)) between 1 and 160),
  class_ranking_text text check(class_ranking_text is null or char_length(btrim(class_ranking_text)) between 1 and 160),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,academic_year,semester)
);
comment on table public.affairs_academic_rankings is
  'Literal department/class ranking cells, including displayed percentage text. No peer records or ranking calculation.';
create index affairs_academic_ranking_owner_idx on public.affairs_academic_rankings(user_id,academic_year desc,semester desc,id);

create table public.affairs_academic_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.affairs_profiles(user_id) on delete cascade,
  class_label text check(class_label is null or char_length(btrim(class_label)) between 1 and 80),
  english_requirement_text text check(english_requirement_text is null or char_length(btrim(english_requirement_text)) between 1 and 300),
  source_mode text not null default 'local_demo' check(source_mode='local_demo'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
comment on column public.affairs_academic_metadata.english_requirement_text is
  'Explicitly entered display status only, not a calculated English or graduation eligibility decision.';

create table private.affairs_academic_grade_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,kind text not null,payload jsonb not null,result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
do $$
declare t text;
begin
  foreach t in array array['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy academic_owner_read on public.%I for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())))',t);
  end loop;
end;
$$;
alter table private.affairs_academic_grade_operations enable row level security;
revoke all on private.affairs_academic_grade_operations from public,anon,authenticated;

create function public.affairs_manage_academic_grades(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid()); v_id uuid; v_owner uuid; v_request uuid; v_expected integer;
  v_table text; v_subkind text; v_fields text[]; v_required text[] := '{}'; v_field record; v_limit integer;
  v_before jsonb; v_after jsonb; v_result jsonb; v_receipt private.affairs_academic_grade_operations;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8000 then
    raise exception 'Invalid academic-grade operation' using errcode='22023'; end if;
  v_fields := array['id','user_id','request_id','expected_version'];
  if p_kind='save_academic_grade_record' then
    v_table := 'affairs_academic_grade_records';v_subkind := p_payload->>'record_kind';
    v_fields := v_fields||array['record_kind','academic_year','semester','course_title','credits','grade_text','row_order'];
    v_required := array['course_title'];
    if v_subkind='transcript' then v_fields := v_fields||array['category_text','module_name','required_elective_text'];
    elsif v_subkind='warning' then v_fields := v_fields||array['course_code','remark_text'];v_required := v_required||array['course_code'];
    else raise exception 'Invalid academic-grade record kind' using errcode='22023'; end if;
  elsif p_kind='save_academic_term_summary' then
    v_table := 'affairs_academic_term_summaries';v_subkind := p_payload->>'summary_kind';
    v_fields := v_fields||array['summary_kind','academic_year','semester'];
    if v_subkind='transcript' then v_fields := v_fields||array['earned_credits','average_grade_text'];
    elsif v_subkind='warning' then v_fields := v_fields||array['attempted_credits','passed_credits','failed_credits'];
    else raise exception 'Invalid academic-grade summary kind' using errcode='22023'; end if;
  elsif p_kind='save_academic_ranking' then
    v_table := 'affairs_academic_rankings';v_fields := v_fields||array['academic_year','semester','department_ranking_text','class_ranking_text'];
  elsif p_kind='save_academic_metadata' then
    v_table := 'affairs_academic_metadata';v_fields := v_fields||array['class_label','english_requirement_text'];
  else raise exception 'Invalid academic-grade operation' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as field(name) where not(field.name=any(v_fields))) then
    raise exception 'Unsupported academic-grade field' using errcode='22023'; end if;
  for v_field in select key as name,value from jsonb_each(p_payload) loop
    if v_field.name in ('expected_version','academic_year','semester','row_order','credits','earned_credits','attempted_credits','passed_credits','failed_credits') then
      if jsonb_typeof(v_field.value) not in ('string','number','null') then
        raise exception 'Invalid academic-grade numeric field type' using errcode='22023'; end if;
    elsif jsonb_typeof(v_field.value) not in ('string','null') then
      raise exception 'Invalid academic-grade text field type' using errcode='22023';
    end if;
    v_limit := case v_field.name when 'course_title' then 160 when 'course_code' then 80 when 'category_text' then 160 when 'module_name' then 160
      when 'required_elective_text' then 30 when 'grade_text' then 80 when 'remark_text' then 300 when 'average_grade_text' then 80
      when 'department_ranking_text' then 160 when 'class_ranking_text' then 160 when 'class_label' then 80 when 'english_requirement_text' then 300 else null end;
    if v_limit is not null and char_length(coalesce(p_payload->>v_field.name,''))>v_limit then
      raise exception 'Academic-grade text is too long' using errcode='22023'; end if;
    if v_field.name in ('credits','earned_credits','attempted_credits','passed_credits','failed_credits') and jsonb_typeof(v_field.value)<>'null' then
      if (v_field.name='credits' and coalesce(p_payload->>v_field.name,'') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$') or
        (v_field.name<>'credits' and coalesce(p_payload->>v_field.name,'') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$') then
        raise exception 'Invalid academic-grade credit value' using errcode='22023'; end if;
    end if;
  end loop;
  if exists(select 1 from unnest(array['id','user_id','request_id']) as field(name)
    where jsonb_typeof(p_payload->field.name) is distinct from 'string' or coalesce(p_payload->>field.name,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or coalesce(p_payload->>'expected_version','') !~ '^(0|[1-9][0-9]{0,8})$'
    or exists(select 1 from unnest(v_required) as field(name) where char_length(btrim(coalesce(p_payload->>field.name,'')))=0)
    or (p_kind<>'save_academic_metadata' and (coalesce(p_payload->>'academic_year','') !~ '^[1-9][0-9]{0,3}$' or coalesce(p_payload->>'semester','') !~ '^[123]$'))
    or (p_kind='save_academic_grade_record' and coalesce(p_payload->>'row_order','') !~ '^(0|[1-9][0-9]{0,5})$') then
    raise exception 'Missing or invalid academic-grade value' using errcode='22023'; end if;
  v_id := (p_payload->>'id')::uuid;v_owner := (p_payload->>'user_id')::uuid;
  v_request := (p_payload->>'request_id')::uuid;v_expected := (p_payload->>'expected_version')::integer;
  perform 1 from public.affairs_profiles where user_id=v_actor for update;
  select * into v_receipt from private.affairs_academic_grade_operations where user_id=v_actor and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then raise exception 'Request ID was already used for another operation' using errcode='PT409'; end if;
    return v_receipt.result;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=v_owner) then raise exception 'Student account unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academic-grades:'||v_table||':'||v_id::text,0));
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',v_table) into v_before using v_id;
  if v_before is not null and (v_before->>'user_id')::uuid<>v_owner then
    raise exception 'Academic records cannot be reassigned to another account' using errcode='42501'; end if;
  if v_before is not null and coalesce(v_before->>'record_kind',v_before->>'summary_kind','')<>coalesce(v_subkind,'') then
    raise exception 'Academic record kind cannot change' using errcode='22023'; end if;
  if coalesce((v_before->>'version')::integer,0)<>v_expected then
    raise exception 'This academic record changed. Refresh and try again.' using errcode='PT409'; end if;
  if p_kind='save_academic_grade_record' then
    insert into public.affairs_academic_grade_records(id,user_id,record_kind,academic_year,semester,course_title,course_code,category_text,module_name,required_elective_text,credits,grade_text,remark_text,row_order)
    values(v_id,v_owner,v_subkind,(p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint,btrim(p_payload->>'course_title'),
      nullif(btrim(p_payload->>'course_code'),''),nullif(btrim(p_payload->>'category_text'),''),nullif(btrim(p_payload->>'module_name'),''),
      nullif(btrim(p_payload->>'required_elective_text'),''),(p_payload->>'credits')::numeric,nullif(btrim(p_payload->>'grade_text'),''),
      nullif(btrim(p_payload->>'remark_text'),''),(p_payload->>'row_order')::integer)
    on conflict(id) do update set academic_year=excluded.academic_year,semester=excluded.semester,course_title=excluded.course_title,
      course_code=excluded.course_code,category_text=excluded.category_text,module_name=excluded.module_name,required_elective_text=excluded.required_elective_text,
      credits=excluded.credits,grade_text=excluded.grade_text,remark_text=excluded.remark_text,row_order=excluded.row_order,
      version=affairs_academic_grade_records.version+1,updated_at=now()
    returning to_jsonb(affairs_academic_grade_records) into v_after;
  elsif p_kind='save_academic_term_summary' then
    insert into public.affairs_academic_term_summaries(id,user_id,summary_kind,academic_year,semester,earned_credits,average_grade_text,attempted_credits,passed_credits,failed_credits)
    values(v_id,v_owner,v_subkind,(p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint,(p_payload->>'earned_credits')::numeric,
      nullif(btrim(p_payload->>'average_grade_text'),''),(p_payload->>'attempted_credits')::numeric,(p_payload->>'passed_credits')::numeric,(p_payload->>'failed_credits')::numeric)
    on conflict(id) do update set academic_year=excluded.academic_year,semester=excluded.semester,earned_credits=excluded.earned_credits,
      average_grade_text=excluded.average_grade_text,attempted_credits=excluded.attempted_credits,passed_credits=excluded.passed_credits,
      failed_credits=excluded.failed_credits,version=affairs_academic_term_summaries.version+1,updated_at=now()
    returning to_jsonb(affairs_academic_term_summaries) into v_after;
  elsif p_kind='save_academic_ranking' then
    insert into public.affairs_academic_rankings(id,user_id,academic_year,semester,department_ranking_text,class_ranking_text)
    values(v_id,v_owner,(p_payload->>'academic_year')::integer,(p_payload->>'semester')::smallint,
      nullif(btrim(p_payload->>'department_ranking_text'),''),nullif(btrim(p_payload->>'class_ranking_text'),''))
    on conflict(id) do update set academic_year=excluded.academic_year,semester=excluded.semester,
      department_ranking_text=excluded.department_ranking_text,class_ranking_text=excluded.class_ranking_text,
      version=affairs_academic_rankings.version+1,updated_at=now()
    returning to_jsonb(affairs_academic_rankings) into v_after;
  else
    insert into public.affairs_academic_metadata(id,user_id,class_label,english_requirement_text)
    values(v_id,v_owner,nullif(btrim(p_payload->>'class_label'),''),nullif(btrim(p_payload->>'english_requirement_text'),''))
    on conflict(id) do update set class_label=excluded.class_label,english_requirement_text=excluded.english_requirement_text,
      version=affairs_academic_metadata.version+1,updated_at=now()
    returning to_jsonb(affairs_academic_metadata) into v_after;
  end if;
  v_result := jsonb_build_object('id',v_id,'kind',p_kind,'version',(v_after->>'version')::integer,'summary','Saved local demonstration academic record.');
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_actor,p_kind,v_id,'Saved local demonstration academic record.');
  insert into private.affairs_academic_grade_operations(user_id,request_id,kind,payload,result) values(v_actor,v_request,p_kind,p_payload,v_result);
  return v_result;
exception when unique_violation then
  raise exception 'An academic record for this account and term already exists. Refresh and try again.' using errcode='PT409';
end;
$$;
revoke all on function public.affairs_manage_academic_grades(text,jsonb) from public,anon;
grant execute on function public.affairs_manage_academic_grades(text,jsonb) to authenticated;
