-- Source-shaped local syllabus records. No university account or instructor data is imported.
create function private.affairs_catalog_weights_valid(value jsonb,expected integer) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;total numeric:=0;complete boolean:=true;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)<>expected then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if item='null'::jsonb then complete:=false;
    elsif jsonb_typeof(item)<>'number' or item::numeric<0 or item::numeric>100 then return false;
    else total:=total+item::numeric; end if;
  end loop;
  return total<=100.0001 and (not complete or abs(total-100)<=0.0001);
exception when others then return false;
end; $$;
revoke all on function private.affairs_catalog_weights_valid(jsonb,integer) from public,anon;
grant execute on function private.affairs_catalog_weights_valid(jsonb,integer) to authenticated;

create function private.affairs_catalog_syllabus_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;method jsonb;key text;maximum integer;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if value='{}'::jsonb then return true; end if;
  if octet_length(value::text)>40000 or (value-array['level','language','teaching_mode','office_hours','objectives','materials','references','advice','certifications','grading','capabilities','meanings','sdgs','weeks'])<>'{}'::jsonb then return false; end if;
    if jsonb_typeof(value->'level') is distinct from 'string' or char_length(value->>'level')>60 then return false; end if;
    if jsonb_typeof(value->'language') is distinct from 'string' or char_length(value->>'language')>60 then return false; end if;
    if jsonb_typeof(value->'teaching_mode') is distinct from 'string' or char_length(value->>'teaching_mode')>80 then return false; end if;
    if jsonb_typeof(value->'office_hours') is distinct from 'string' or char_length(value->>'office_hours')>300 then return false; end if;
    if jsonb_typeof(value->'objectives') is distinct from 'string' or char_length(value->>'objectives')>1600 then return false; end if;
    if jsonb_typeof(value->'materials') is distinct from 'string' or char_length(value->>'materials')>1200 then return false; end if;
    if jsonb_typeof(value->'references') is distinct from 'string' or char_length(value->>'references')>1200 then return false; end if;
    if jsonb_typeof(value->'advice') is distinct from 'string' or char_length(value->>'advice')>1200 then return false; end if;
    if jsonb_typeof(value->'certifications') is distinct from 'string' or char_length(value->>'certifications')>500 then return false; end if;
  if jsonb_typeof(value->'grading') is distinct from 'array' or jsonb_array_length(value->'grading')<>4 then return false; end if;
  for item in select jsonb_array_elements(value->'grading') loop
    if jsonb_typeof(item) is distinct from 'object' or (item-array['weight','methods'])<>'{}'::jsonb or not (item?'weight')
      or jsonb_typeof(item->'methods') is distinct from 'array' or jsonb_array_length(item->'methods')>7 then return false; end if;
    for method in select jsonb_array_elements(item->'methods') loop
      if jsonb_typeof(method) is distinct from 'string' or method #>> '{}' not in ('1','2','3','4','5','13','15') then return false; end if;
    end loop;
  end loop;
  if not private.affairs_catalog_weights_valid((select jsonb_agg(g.entry->'weight') from jsonb_array_elements(value->'grading') as g(entry)),4)
    or not private.affairs_catalog_weights_valid(value->'capabilities',12) then return false; end if;
  foreach key in array array['meanings','sdgs'] loop
    maximum:=case when key='meanings' then 26 else 17 end;
    if jsonb_typeof(value->key) is distinct from 'array' or jsonb_array_length(value->key)>maximum then return false; end if;
    for item in select jsonb_array_elements(value->key) loop
      if jsonb_typeof(item) is distinct from 'number' or item::text !~ '^[0-9]+$' or item::integer<1 or item::integer>maximum then return false; end if;
    end loop;
  end loop;
  if jsonb_typeof(value->'weeks') is distinct from 'array' or jsonb_array_length(value->'weeks')<>18 then return false; end if;
  for item in select jsonb_array_elements(value->'weeks') loop
    if jsonb_typeof(item) is distinct from 'object' or (item-array['date','content','notes'])<>'{}'::jsonb
      or jsonb_typeof(item->'date') is distinct from 'string' or jsonb_typeof(item->'content') is distinct from 'string'
      or jsonb_typeof(item->'notes') is distinct from 'string' or char_length(item->>'content')>500 or char_length(item->>'notes')>160 then return false; end if;
    if item->>'date'<>'' and ((item->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or to_char((item->>'date')::date,'YYYY-MM-DD')<>item->>'date') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function private.affairs_catalog_syllabus_valid(jsonb) from public,anon;
grant execute on function private.affairs_catalog_syllabus_valid(jsonb) to authenticated;
alter table public.affairs_course_offerings add column syllabus jsonb not null default '{}'::jsonb check (private.affairs_catalog_syllabus_valid(syllabus));

create or replace function public.affairs_catalog_manage(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid());v_id uuid;v_request uuid;v_expected integer;v_existing public.affairs_course_offerings;v_row public.affairs_course_offerings;v_receipt private.affairs_catalog_operations;v_result jsonb;v_summary text;
begin
  if not (select private.affairs_google_identity()) or not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  perform 1 from public.affairs_profiles where user_id=v_uid for update;
  if not found then raise exception 'School Affairs profile required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('save_course_offering','delete_course_offering') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>48000 then raise exception 'Invalid catalog action' using errcode='22023'; end if;
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
    if ((p_payload->'record') - array['term_code','term_label','department_code','department_name','classification_code','classification_name','admission_code','admission_name','course_code','course_name','english_name','module','instructor','instructor2','room1','room2','grade','open_grades','prerequisite','course_nature','reserved_departments','description','credits','capacity','enrolled_count','selected_count','audit_capacity','audit_count','lecture_hours','practice_hours','summer_weeks','published','shared_teaching','open_other_departments','cross_admission','required','e_course','english_taught','foreign_language','immersion','graduating_course','meetings','program_codes','syllabus'])<>'{}'::jsonb then raise exception 'Unknown course field' using errcode='22023'; end if;
    select * into v_row from jsonb_populate_record(null::public.affairs_course_offerings,p_payload->'record');
    v_row.syllabus:=coalesce(p_payload->'record'->'syllabus',v_existing.syllabus,'{}'::jsonb);
    if exists(select 1 from unnest(v_row.program_codes) p where p is null or p !~ '^[A-Za-z0-9_-]{1,24}$') then raise exception 'Invalid program' using errcode='22023'; end if;
    insert into public.affairs_course_offerings(id,term_code,term_label,department_code,department_name,classification_code,classification_name,admission_code,admission_name,course_code,course_name,english_name,module,instructor,instructor2,room1,room2,grade,open_grades,prerequisite,course_nature,reserved_departments,description,credits,capacity,enrolled_count,selected_count,audit_capacity,audit_count,lecture_hours,practice_hours,summer_weeks,published,shared_teaching,open_other_departments,cross_admission,required,e_course,english_taught,foreign_language,immersion,graduating_course,meetings,program_codes,syllabus,source_mode,version)
      values(v_id,v_row.term_code,v_row.term_label,v_row.department_code,v_row.department_name,v_row.classification_code,v_row.classification_name,v_row.admission_code,v_row.admission_name,v_row.course_code,v_row.course_name,v_row.english_name,v_row.module,v_row.instructor,v_row.instructor2,v_row.room1,v_row.room2,v_row.grade,v_row.open_grades,v_row.prerequisite,v_row.course_nature,v_row.reserved_departments,v_row.description,v_row.credits,v_row.capacity,v_row.enrolled_count,v_row.selected_count,v_row.audit_capacity,v_row.audit_count,v_row.lecture_hours,v_row.practice_hours,v_row.summer_weeks,v_row.published,v_row.shared_teaching,v_row.open_other_departments,v_row.cross_admission,v_row.required,v_row.e_course,v_row.english_taught,v_row.foreign_language,v_row.immersion,v_row.graduating_course,v_row.meetings,v_row.program_codes,v_row.syllabus,'sample',v_expected+1)
      on conflict(id) do update set term_code=excluded.term_code,term_label=excluded.term_label,department_code=excluded.department_code,department_name=excluded.department_name,classification_code=excluded.classification_code,classification_name=excluded.classification_name,admission_code=excluded.admission_code,admission_name=excluded.admission_name,course_code=excluded.course_code,course_name=excluded.course_name,english_name=excluded.english_name,module=excluded.module,instructor=excluded.instructor,instructor2=excluded.instructor2,room1=excluded.room1,room2=excluded.room2,grade=excluded.grade,open_grades=excluded.open_grades,prerequisite=excluded.prerequisite,course_nature=excluded.course_nature,reserved_departments=excluded.reserved_departments,description=excluded.description,credits=excluded.credits,capacity=excluded.capacity,enrolled_count=excluded.enrolled_count,selected_count=excluded.selected_count,audit_capacity=excluded.audit_capacity,audit_count=excluded.audit_count,lecture_hours=excluded.lecture_hours,practice_hours=excluded.practice_hours,summer_weeks=excluded.summer_weeks,published=excluded.published,shared_teaching=excluded.shared_teaching,open_other_departments=excluded.open_other_departments,cross_admission=excluded.cross_admission,required=excluded.required,e_course=excluded.e_course,english_taught=excluded.english_taught,foreign_language=excluded.foreign_language,immersion=excluded.immersion,graduating_course=excluded.graduating_course,meetings=excluded.meetings,program_codes=excluded.program_codes,syllabus=excluded.syllabus,version=excluded.version,updated_at=now();
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


-- Only the catalog's pre-existing synthetic seed is populated. No official syllabus text or identities.
update public.affairs_course_offerings set syllabus='{"level":"大學部","language":"中文","teaching_mode":"課堂教學與實作","office_hours":"示範時段：星期一 13:00–14:00（本地範例）","objectives":"本地範例課程：認識計算機的硬體、軟體與網路架構，解釋資料如何儲存及處理，並能以生活情境分析資訊安全與數位倫理問題。透過討論、練習與小組活動，培養查找資訊、表達觀點與共同解決問題的能力。","materials":"本地範例教材：課程自編講義、概念圖與實作練習。每週材料由示範教師於上課前整理，涵蓋計算機基本架構、資料表示、作業系統、網路服務、資料管理及安全使用情境；此清單不是校方正式書單。","references":"本地範例參考資料：公開技術說明與課堂案例。請於實作時記錄使用來源。","advice":"Sample course guidance: review the weekly notes before class, bring questions to discussion, and practice the demonstrated tasks after class. Work with classmates on shared exercises and clearly credit sources. This is a local demonstration syllabus, not an official university course requirement.","certifications":"本地範例未安排證照輔導。","grading":[{"weight":25,"methods":["1","2"]},{"weight":25,"methods":["4","5"]},{"weight":25,"methods":["3","4"]},{"weight":25,"methods":["15"]}],"capabilities":[10,5,10,10,15,10,10,5,5,5,5,10],"meanings":[11,22,26],"sdgs":[4],"weeks":[{"date":"2026-09-07","content":"本地範例：課程介紹與學習環境。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-09-14","content":"本地範例：計算機系統與輸入輸出。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-09-21","content":"本地範例：數字系統與資料表示。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-09-28","content":"本地範例：處理器與記憶體。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-10-05","content":"本地範例：檔案與資料儲存。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-10-12","content":"本地範例：作業系統與應用軟體。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-10-19","content":"本地範例：網路與通訊基本原理。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-10-26","content":"本地範例：資訊查找與來源評估。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-11-02","content":"本地範例：期中概念整理與練習。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例評量週"},{"date":"2026-11-09","content":"本地範例：資料整理與表格工具。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-11-16","content":"本地範例：程式邏輯與問題拆解。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-11-23","content":"本地範例：流程圖與簡單演算法。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-11-30","content":"本地範例：網路服務與資料交換。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-12-07","content":"本地範例：安全設定與資料備份。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-12-14","content":"本地範例：數位倫理與智慧財產。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-12-21","content":"本地範例：小組案例分析。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2026-12-28","content":"本地範例：專題分享與同儕回饋。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例進度"},{"date":"2027-01-04","content":"本地範例：期末學習回顧。以課堂討論與實作活動練習本週概念，並記錄問題與學習成果。","notes":"範例評量週"}]}'::jsonb,version=version+1,updated_at=now() where id='cc120000-0000-4000-8000-000000000001' and course_code='DEMO0011151' and source_mode='sample';
