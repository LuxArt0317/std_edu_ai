-- Local demonstration course offerings. Independent of student enrollment and personal data.
create function private.affairs_catalog_meetings_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare m jsonb; p text;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)>2 then return false; end if;
  for m in select jsonb_array_elements(value) loop
    if jsonb_typeof(m) is distinct from 'object' or (m - array['weekday','periods'])<>'{}'::jsonb or jsonb_typeof(m->'weekday') is distinct from 'number'
      or (m->>'weekday') !~ '^[1-7]$' or jsonb_typeof(m->'periods') is distinct from 'array'
      or jsonb_array_length(m->'periods') not between 1 and 15 then return false; end if;
    for p in select jsonb_array_elements_text(m->'periods') loop
      if p is null or p not in ('晨','1','2','3','4','午','5','6','7','8','傍','A','B','C','D') then return false; end if;
    end loop;
  end loop;
  return true;
end; $$;
revoke all on function private.affairs_catalog_meetings_valid(jsonb) from public,anon;
grant execute on function private.affairs_catalog_meetings_valid(jsonb) to authenticated;

create table public.affairs_course_offerings (
  id uuid primary key default gen_random_uuid(),
  term_code text not null default '' check (char_length(term_code) between 1 and 12),
  term_label text not null default '' check (char_length(term_label) between 1 and 80),
  department_code text not null default '' check (char_length(department_code) between 1 and 16),
  department_name text not null default '' check (char_length(department_name) between 1 and 100),
  classification_code text not null default '' check (char_length(classification_code) between 1 and 16),
  classification_name text not null default '' check (char_length(classification_name) between 0 and 100),
  admission_code text not null default '' check (char_length(admission_code) between 1 and 16),
  admission_name text not null default '' check (char_length(admission_name) between 0 and 100),
  course_code text not null default '' check (char_length(course_code) between 1 and 40),
  course_name text not null default '' check (char_length(course_name) between 1 and 160),
  english_name text not null default '' check (char_length(english_name) between 0 and 200),
  module text not null default '' check (char_length(module) between 0 and 100),
  instructor text not null default '' check (char_length(instructor) between 1 and 100),
  instructor2 text not null default '' check (char_length(instructor2) between 0 and 100),
  room1 text not null default '' check (char_length(room1) between 0 and 60),
  room2 text not null default '' check (char_length(room2) between 0 and 60),
  grade text not null default '' check (char_length(grade) between 0 and 8),
  open_grades text not null default '' check (char_length(open_grades) between 0 and 40),
  prerequisite text not null default '' check (char_length(prerequisite) between 0 and 500),
  course_nature text not null default '' check (char_length(course_nature) between 0 and 60),
  reserved_departments text not null default '' check (char_length(reserved_departments) between 0 and 500),
  description text not null default '' check (char_length(description) between 0 and 2000),
  credits numeric(7,2) not null default 0 check (credits between 0 and 30),
  capacity integer not null default 0 check (capacity between 0 and 100000),
  enrolled_count integer not null default 0 check (enrolled_count between 0 and 100000),
  selected_count integer not null default 0 check (selected_count between 0 and 100000),
  audit_capacity integer not null default 0 check (audit_capacity between 0 and 100000),
  audit_count integer not null default 0 check (audit_count between 0 and 100000),
  lecture_hours numeric(7,2) not null default 0 check (lecture_hours between 0 and 168),
  practice_hours numeric(7,2) not null default 0 check (practice_hours between 0 and 168),
  summer_weeks integer not null default 0 check (summer_weeks between 0 and 52),
  published boolean not null default false,
  shared_teaching boolean not null default false,
  open_other_departments boolean not null default false,
  cross_admission boolean not null default false,
  required boolean not null default false,
  e_course boolean not null default false,
  english_taught boolean not null default false,
  foreign_language boolean not null default false,
  immersion boolean not null default false,
  graduating_course boolean not null default false,
  meetings jsonb not null default '[]' check (private.affairs_catalog_meetings_valid(meetings)),
  program_codes text[] not null default '{}' check (cardinality(program_codes)<=30),
  source_mode text not null default 'sample' check (source_mode='sample'),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(term_code,course_code),
  check (enrolled_count<=capacity and selected_count<=capacity and audit_count<=audit_capacity)
);
create index affairs_course_offerings_term_department on public.affairs_course_offerings(term_code,department_code,course_code);
create table private.affairs_catalog_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.affairs_course_offerings enable row level security;
alter table private.affairs_catalog_operations enable row level security;
revoke all on public.affairs_course_offerings,private.affairs_catalog_operations from public,anon,authenticated;
grant select on public.affairs_course_offerings to authenticated;
create policy course_offerings_read on public.affairs_course_offerings for select to authenticated using (
  (select private.affairs_google_identity()) and (published or (select private.affairs_is_admin()))
);

create function public.affairs_catalog_search(p_filters jsonb default '{}',p_page integer default 0,p_page_size integer default 100,p_sort text default 'course_code',p_direction text default 'asc') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_sort text; v_result jsonb;
begin
  if not (select private.affairs_google_identity()) then raise exception 'School Affairs sign-in required' using errcode='42501'; end if;
  if jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>4000
    or p_page is null or p_page<0 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 100
    or p_direction is null or p_direction not in ('asc','desc') then raise exception 'Invalid catalog query' using errcode='22023'; end if;
  if p_sort in ('sequence','schedule1','schedule2') then v_sort:=case when p_sort='sequence' then 'course_code' when p_sort='schedule1' then '(meetings->0)' else '(meetings->1)' end;
  elsif p_sort in ('course_code','course_name','module','instructor','room1','room2','shared_teaching','grade','open_grades','open_other_departments','cross_admission','required','credits','capacity','enrolled_count','selected_count','audit_capacity','audit_count') then v_sort:=p_sort;
  else raise exception 'Invalid catalog sort' using errcode='22023'; end if;
  execute format($query$
    with filtered as (
      select o.* from public.affairs_course_offerings o where
        (coalesce($1->>'id','')='' or o.id::text=$1->>'id') and
        (coalesce($1->>'yr','')='' or o.term_code=$1->>'yr') and
        (coalesce($1->>'dep','') in ('','0') or o.department_code=$1->>'dep') and
        (coalesce($1->>'ref1','')='' or o.classification_code=$1->>'ref1') and
        (coalesce($1->>'admissionType','') in ('','0') or o.admission_code=$1->>'admissionType') and
        (coalesce($1->>'credit','') in ('','0') or o.credits::numeric=($1->>'credit')::numeric) and
        (coalesce($1->>'grd','') in ('','0') or o.grade=$1->>'grd') and
        (coalesce($1->>'prog','') in ('','0') or $1->>'prog'=any(o.program_codes)) and
        (coalesce($1->>'required','')='' or o.required=($1->>'required')::boolean) and
        (coalesce($1->>'e_course','')='' or o.e_course=($1->>'e_course')::boolean) and
        (coalesce($1->>'english_taught','')='' or o.english_taught=($1->>'english_taught')::boolean) and
        (coalesce($1->>'foreign_language','')='' or o.foreign_language=($1->>'foreign_language')::boolean) and
        (coalesce($1->>'immersion','')='' or o.immersion=($1->>'immersion')::boolean) and
        (coalesce($1->>'keyword','')='' or position(lower($1->>'keyword') in lower(o.course_code||' '||o.course_name||' '||o.english_name))>0) and
        (coalesce($1->>'instructor','')='' or position(lower($1->>'instructor') in lower(o.instructor||' '||o.instructor2||' '||o.department_name))>0) and
        ((coalesce(jsonb_array_length($1->'weekdays'),0)=0 and coalesce(jsonb_array_length($1->'periods'),0)=0) or exists (
          select 1 from jsonb_array_elements(o.meetings) m where
            (coalesce(jsonb_array_length($1->'weekdays'),0)=0 or $1->'weekdays' ? (m->>'weekday')) and
            (coalesce(jsonb_array_length($1->'periods'),0)=0 or exists(select 1 from jsonb_array_elements_text(m->'periods') p where $1->'periods' ? p))
        ))
    ), paged as (select * from filtered order by %s %s,id asc limit $2 offset $3)
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),
      'total',(select count(*) from filtered),'can_manage',(select private.affairs_is_admin()),
      'terms',coalesce((select jsonb_agg(t order by t.value desc) from (select distinct term_code as value,term_label as label from public.affairs_course_offerings) t),'[]'::jsonb))
  $query$,v_sort,p_direction) into v_result using p_filters,p_page_size,p_page*p_page_size;
  return v_result;
end; $$;
revoke all on function public.affairs_catalog_search(jsonb,integer,integer,text,text) from public,anon;
grant execute on function public.affairs_catalog_search(jsonb,integer,integer,text,text) to authenticated;

create function public.affairs_catalog_manage(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_id uuid;v_request uuid;v_expected integer;v_existing public.affairs_course_offerings;v_row public.affairs_course_offerings;v_receipt private.affairs_catalog_operations;v_result jsonb;v_summary text;
begin
  if not (select private.affairs_google_identity()) or not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  perform 1 from public.affairs_profiles where user_id=v_uid for update;
  if not found then raise exception 'School Affairs profile required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('save_course_offering','delete_course_offering') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then raise exception 'Invalid catalog action' using errcode='22023'; end if;
  if (p_payload - array['id','request_id','expected_version','record'])<>'{}'::jsonb then raise exception 'Unknown action field' using errcode='22023'; end if;
  v_id:=(p_payload->>'id')::uuid;v_request:=(p_payload->>'request_id')::uuid;v_expected:=(p_payload->>'expected_version')::integer;
  if v_id is null or v_request is null or v_expected is null or v_expected<0 then raise exception 'ID, request and version required' using errcode='22023'; end if;
  select * into v_receipt from private.affairs_catalog_operations where user_id=v_uid and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then raise exception 'Request already used' using errcode='PT409'; end if;
    return v_receipt.result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course-offering:'||v_id::text,0));
  select * into v_existing from public.affairs_course_offerings where id=v_id for update;
  if coalesce(v_existing.version,0)<>v_expected then raise exception 'Offering changed; refresh' using errcode='PT409'; end if;
  if p_kind='save_course_offering' then
    if jsonb_typeof(p_payload->'record') is distinct from 'object' then raise exception 'Course fields required' using errcode='22023'; end if;
    if ((p_payload->'record') - array['term_code','term_label','department_code','department_name','classification_code','classification_name','admission_code','admission_name','course_code','course_name','english_name','module','instructor','instructor2','room1','room2','grade','open_grades','prerequisite','course_nature','reserved_departments','description','credits','capacity','enrolled_count','selected_count','audit_capacity','audit_count','lecture_hours','practice_hours','summer_weeks','published','shared_teaching','open_other_departments','cross_admission','required','e_course','english_taught','foreign_language','immersion','graduating_course','meetings','program_codes'])<>'{}'::jsonb then raise exception 'Unknown course field' using errcode='22023'; end if;
    select * into v_row from jsonb_populate_record(null::public.affairs_course_offerings,p_payload->'record');
    if exists(select 1 from unnest(v_row.program_codes) p where p is null or p !~ '^[A-Za-z0-9_-]{1,24}$') then raise exception 'Invalid program' using errcode='22023'; end if;
    insert into public.affairs_course_offerings(id,term_code,term_label,department_code,department_name,classification_code,classification_name,admission_code,admission_name,course_code,course_name,english_name,module,instructor,instructor2,room1,room2,grade,open_grades,prerequisite,course_nature,reserved_departments,description,credits,capacity,enrolled_count,selected_count,audit_capacity,audit_count,lecture_hours,practice_hours,summer_weeks,published,shared_teaching,open_other_departments,cross_admission,required,e_course,english_taught,foreign_language,immersion,graduating_course,meetings,program_codes,source_mode,version)
      values(v_id,v_row.term_code,v_row.term_label,v_row.department_code,v_row.department_name,v_row.classification_code,v_row.classification_name,v_row.admission_code,v_row.admission_name,v_row.course_code,v_row.course_name,v_row.english_name,v_row.module,v_row.instructor,v_row.instructor2,v_row.room1,v_row.room2,v_row.grade,v_row.open_grades,v_row.prerequisite,v_row.course_nature,v_row.reserved_departments,v_row.description,v_row.credits,v_row.capacity,v_row.enrolled_count,v_row.selected_count,v_row.audit_capacity,v_row.audit_count,v_row.lecture_hours,v_row.practice_hours,v_row.summer_weeks,v_row.published,v_row.shared_teaching,v_row.open_other_departments,v_row.cross_admission,v_row.required,v_row.e_course,v_row.english_taught,v_row.foreign_language,v_row.immersion,v_row.graduating_course,v_row.meetings,v_row.program_codes,'sample',v_expected+1)
      on conflict(id) do update set term_code=excluded.term_code,term_label=excluded.term_label,department_code=excluded.department_code,department_name=excluded.department_name,classification_code=excluded.classification_code,classification_name=excluded.classification_name,admission_code=excluded.admission_code,admission_name=excluded.admission_name,course_code=excluded.course_code,course_name=excluded.course_name,english_name=excluded.english_name,module=excluded.module,instructor=excluded.instructor,instructor2=excluded.instructor2,room1=excluded.room1,room2=excluded.room2,grade=excluded.grade,open_grades=excluded.open_grades,prerequisite=excluded.prerequisite,course_nature=excluded.course_nature,reserved_departments=excluded.reserved_departments,description=excluded.description,credits=excluded.credits,capacity=excluded.capacity,enrolled_count=excluded.enrolled_count,selected_count=excluded.selected_count,audit_capacity=excluded.audit_capacity,audit_count=excluded.audit_count,lecture_hours=excluded.lecture_hours,practice_hours=excluded.practice_hours,summer_weeks=excluded.summer_weeks,published=excluded.published,shared_teaching=excluded.shared_teaching,open_other_departments=excluded.open_other_departments,cross_admission=excluded.cross_admission,required=excluded.required,e_course=excluded.e_course,english_taught=excluded.english_taught,foreign_language=excluded.foreign_language,immersion=excluded.immersion,graduating_course=excluded.graduating_course,meetings=excluded.meetings,program_codes=excluded.program_codes,version=excluded.version,updated_at=now();
    v_summary:='Saved a local sample course offering.';
  else
    if v_existing.id is null then raise exception 'Offering unavailable' using errcode='PT409'; end if;
    delete from public.affairs_course_offerings where id=v_id;
    v_summary:='Deleted a local sample course offering.';
  end if;
  v_result:=jsonb_build_object('id',v_id,'kind',p_kind,'version',v_expected+1,'summary',v_summary);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,p_kind,v_id,v_summary);
  insert into private.affairs_catalog_operations(user_id,request_id,kind,payload,result) values(v_uid,v_request,p_kind,p_payload,v_result);
  return v_result;
end; $$;
revoke all on function public.affairs_catalog_manage(text,jsonb) from public,anon;
grant execute on function public.affairs_catalog_manage(text,jsonb) to authenticated;

-- Explicit sample provenance; no university identities or personal records.
insert into public.affairs_course_offerings(id,term_code,term_label,department_code,department_name,classification_code,classification_name,admission_code,admission_name,course_code,course_name,english_name,module,instructor,instructor2,room1,room2,grade,open_grades,prerequisite,course_nature,reserved_departments,description,credits,capacity,enrolled_count,selected_count,audit_capacity,audit_count,lecture_hours,practice_hours,summer_weeks,published,shared_teaching,open_other_departments,cross_admission,required,e_course,english_taught,foreign_language,immersion,graduating_course,meetings,program_codes,source_mode,version) values
('cc120000-0000-4000-8000-000000000001','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','1','四技日間部','DEMO0011151','範例：計算機概論','Sample Introduction to Computing','','示範教師1','','DEMO-101','','一','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,20,20,5,0,3,0,0,true,false,false,false,true,false,true,false,false,false,'[{"weekday":1,"periods":["5","6","7"]}]'::jsonb,array['PU031']::text[],'sample',1),
('cc120000-0000-4000-8000-000000000002','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','1','四技日間部','DEMO0021151','範例：程式設計','Sample Programming','','示範教師2','','DEMO-102','','一','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,21,21,5,1,3,0,0,true,false,true,false,true,false,false,false,false,false,'[{"weekday":2,"periods":["5","6","7"]}]'::jsonb,array['PU031']::text[],'sample',1),
('cc120000-0000-4000-8000-000000000003','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','1','四技日間部','DEMO0031151','範例：資料庫管理','Sample Database Management','','示範教師3','','DEMO-103','','二','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,22,22,5,2,3,0,0,true,false,false,false,true,false,false,false,false,false,'[{"weekday":3,"periods":["5","6","7"]}]'::jsonb,array['PU031']::text[],'sample',1),
('cc120000-0000-4000-8000-000000000004','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','1','四技日間部','DEMO0041151','範例：資訊系統專題','Sample Information Systems Project','','示範教師4','示範共同教師','DEMO-104','DEMO-LAB','四','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,23,23,5,0,3,2,0,true,true,true,false,false,false,false,false,false,true,'[{"weekday":4,"periods":["5","6","7"]},{"weekday":5,"periods":["1","2"]}]'::jsonb,array[]::text[],'sample',1),
('cc120000-0000-4000-8000-000000000005','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','1','四技日間部','DEMO0051151','範例：網路應用','Sample Web Applications','','示範教師5','','DEMO-105','','三','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,24,24,5,1,3,0,0,true,false,false,true,false,true,false,false,false,false,'[{"weekday":5,"periods":["5","6","7"]}]'::jsonb,array[]::text[],'sample',1),
('cc120000-0000-4000-8000-000000000006','1151','115學年度上學期','13','資訊工程系','CSU','資訊工程系','1','四技日間部','DEMO0061151','範例：資料結構','Sample Data Structures','','示範教師6','','DEMO-106','','二','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,25,25,5,2,3,0,0,true,false,true,false,false,false,false,false,false,false,'[{"weekday":1,"periods":["5","6","7"]}]'::jsonb,array[]::text[],'sample',1),
('cc120000-0000-4000-8000-000000000007','1151','115學年度上學期','03','應用外語系','ALU','應用外語系','1','四技日間部','DEMO0071151','範例：英語溝通','Sample English Communication','','示範教師7','','DEMO-107','','一','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',2,60,26,26,5,0,3,0,0,true,false,false,false,false,false,false,true,true,false,'[{"weekday":2,"periods":["5","6","7"]}]'::jsonb,array[]::text[],'sample',1),
('cc120000-0000-4000-8000-000000000008','1151','115學年度上學期','01','資訊管理系','IMU','資訊管理系','3','四技進修部','DEMO0081151','範例：管理資訊系統','Sample Management Information Systems','','示範教師8','','DEMO-108','','三','1234','','半','','本課程為 stu.best 本地示範資料，用於查詢與管理功能驗證；不是校方開課或選課紀錄。',3,60,27,27,5,1,3,0,0,true,false,true,false,false,false,false,false,false,false,'[{"weekday":3,"periods":["A","B","C"]}]'::jsonb,array[]::text[],'sample',1);
