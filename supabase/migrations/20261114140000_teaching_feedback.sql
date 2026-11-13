create table public.affairs_teaching_surveys (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.affairs_terms(id),
  phase text not null check (phase in ('midterm','final')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  questions text[] not null check (cardinality(questions) between 1 and 16),
  released boolean not null default false,
  version integer not null default 1 check (version between 1 and 1000000),
  unique (term_id,phase),
  check (isfinite(opens_at) and isfinite(closes_at) and opens_at<closes_at and closes_at-opens_at<=interval '180 days')
);

create table private.affairs_teaching_survey_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  survey_id uuid not null references public.affairs_teaching_surveys(id),
  section_id uuid not null references public.affairs_sections(id),
  request_id uuid not null,
  primary key (user_id,survey_id,section_id)
);

-- Results carry neither a respondent identifier nor a receipt or submission time.
create table private.affairs_teaching_survey_results (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.affairs_teaching_surveys(id),
  section_id uuid not null references public.affairs_sections(id),
  ratings smallint[] not null check (cardinality(ratings) between 1 and 16 and array_position(ratings,null) is null and 1<=all(ratings) and 5>=all(ratings)),
  comment text not null default '' check (char_length(comment)<=2000)
);
create index affairs_teaching_survey_results_course_idx on private.affairs_teaching_survey_results(survey_id,section_id);

create table public.affairs_teaching_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.affairs_sections(id),
  comment text not null check (char_length(btrim(comment)) between 5 and 2000),
  status text not null default 'submitted' check (status in ('submitted','reviewed')),
  submitted_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  request_id uuid not null,
  unique (user_id,request_id),
  check ((status='reviewed')=(reviewed_at is not null))
);
create index affairs_teaching_feedback_owner_idx on public.affairs_teaching_feedback(user_id,submitted_at desc,id);
create index affairs_teaching_feedback_queue_idx on public.affairs_teaching_feedback(submitted_at,id) where status='submitted';

alter table public.affairs_teaching_surveys enable row level security;
alter table private.affairs_teaching_survey_completions enable row level security;
alter table private.affairs_teaching_survey_results enable row level security;
alter table public.affairs_teaching_feedback enable row level security;
revoke all on public.affairs_teaching_surveys,private.affairs_teaching_survey_completions,
  private.affairs_teaching_survey_results,public.affairs_teaching_feedback from public,anon,authenticated;

create function private.affairs_teaching_feedback_record(p_record public.affairs_teaching_feedback)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p_record.id,'sectionId',p_record.section_id,'course',c.title,'code',c.code,'term',t.label,
    'comment',p_record.comment,'status',p_record.status,'submittedAt',p_record.submitted_at,'reviewedAt',p_record.reviewed_at)
  from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id
  join public.affairs_terms t on t.id=s.term_id where s.id=p_record.section_id;
$$;
revoke all on function private.affairs_teaching_feedback_record(public.affairs_teaching_feedback) from public,anon,authenticated;

create function public.affairs_read_teaching_feedback(p_scope text,p_term uuid default null,p_survey uuid default null,p_section uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  today date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
  courses jsonb := '[]'::jsonb;
  surveys jsonb := '[]'::jsonb;
  feedback jsonb := '[]'::jsonb;
  terms jsonb := '[]'::jsonb;
  results jsonb := '[]'::jsonb;
begin
  if not (select private.affairs_google_identity()) or (p_scope='manage' and not(select private.affairs_is_admin())) then
    raise exception 'Teaching feedback is unavailable to your account' using errcode='42501';
  end if;
  if p_scope not in ('survey','immediate','manage') or p_scope is null or (p_scope<>'manage' and (p_term is not null or p_survey is not null or p_section is not null))
    or (p_survey is null)<>(p_section is null) or (p_survey is not null and p_term is null) then
    raise exception 'Invalid teaching feedback scope' using errcode='22023';
  end if;
  if p_scope='survey' then
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into surveys from (
      select v.id,v.term_id as "termId",t.label as term,v.phase,v.questions,v.opens_at as "opensAt",v.closes_at as "closesAt",v.version,v.released,
        private.affairs_withdrawal_window_state(v.opens_at,v.closes_at,statement_timestamp()) as state,
        coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'course',c.title,'code',c.code,'term',t.label,'section',s.section_code,
          'completed',r.user_id is not null) order by c.code,s.section_code,s.id)
          from public.affairs_students student
          join public.affairs_enrollments e on e.student_id=student.id
          join public.affairs_sections s on s.id=e.section_id and s.term_id=v.term_id
          join public.affairs_courses c on c.id=s.course_id
          left join private.affairs_teaching_survey_completions r on r.user_id=actor and r.survey_id=v.id and r.section_id=s.id
          where student.user_id=actor and (e.status in ('enrolled','completed') or r.user_id is not null)),'[]'::jsonb) as courses
      from public.affairs_teaching_surveys v join public.affairs_terms t on t.id=v.term_id
      where exists(select 1 from public.affairs_students student join public.affairs_enrollments e on e.student_id=student.id
        join public.affairs_sections s on s.id=e.section_id and s.term_id=v.term_id
        where student.user_id=actor and e.status in ('enrolled','completed'))
        or exists(select 1 from private.affairs_teaching_survey_completions r where r.user_id=actor and r.survey_id=v.id)
      order by v.opens_at desc,v.id limit 50
    ) row;
  elsif p_scope='immediate' then
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into courses from (
      select s.id,c.title as course,c.code,t.label as term,s.section_code as section
      from public.affairs_students student join public.affairs_enrollments e on e.student_id=student.id
      join public.affairs_sections s on s.id=e.section_id join public.affairs_terms t on t.id=s.term_id
      join public.affairs_courses c on c.id=s.course_id
      where student.user_id=actor and student.status='active' and e.status='enrolled' and today between t.starts_on and t.ends_on
      order by c.code,s.section_code,s.id limit 200
    ) row;
    select coalesce(jsonb_agg(private.affairs_teaching_feedback_record(row)),'[]'::jsonb) into feedback
      from (select * from public.affairs_teaching_feedback where user_id=actor order by submitted_at desc,id limit 100) row;
  else
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into terms
      from (select id,label from public.affairs_terms order by starts_on desc,id limit 200) row;
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into surveys from (
      select v.id,v.term_id as "termId",t.label as term,v.phase,v.questions,v.opens_at as "opensAt",v.closes_at as "closesAt",v.version,v.released,
        private.affairs_withdrawal_window_state(v.opens_at,v.closes_at,statement_timestamp()) as state,'[]'::jsonb as courses
      from public.affairs_teaching_surveys v join public.affairs_terms t on t.id=v.term_id where v.term_id=p_term order by v.phase
    ) row;
    select coalesce(jsonb_agg(private.affairs_teaching_feedback_record(row)),'[]'::jsonb) into feedback
      from (select * from public.affairs_teaching_feedback where status='submitted' order by submitted_at,id limit 100) row;
    select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into results from (
      select v.id as "surveyId",s.id as "sectionId",c.title as course,c.code,s.section_code as section,count(*)::integer as count,
        (select jsonb_agg(score.average order by score.position) from (
          select item.position,round(avg(item.rating),2) as average
          from private.affairs_teaching_survey_results answer
          cross join lateral unnest(answer.ratings) with ordinality item(rating,position)
          where answer.survey_id=v.id and answer.section_id=s.id group by item.position
        ) score) as averages,
        coalesce((select jsonb_agg(answer.comment order by answer.id) from (
          select id,comment from private.affairs_teaching_survey_results where survey_id=v.id and section_id=s.id and v.id=p_survey and s.id=p_section and comment<>'' order by id limit 100
        ) answer),'[]'::jsonb) as comments
      from private.affairs_teaching_survey_results r join public.affairs_teaching_surveys v on v.id=r.survey_id
      join public.affairs_sections s on s.id=r.section_id join public.affairs_courses c on c.id=s.course_id
      where v.term_id=p_term and v.released and (p_survey is null or (v.id=p_survey and s.id=p_section))
      group by v.id,s.id,c.title,c.code,s.section_code having count(*)>=5 order by v.id,c.code,s.section_code limit 300
    ) row;
  end if;
  return jsonb_build_object('userId',actor,'courses',courses,'surveys',surveys,'feedback',feedback,'terms',terms,'results',results);
end;
$$;
revoke all on function public.affairs_read_teaching_feedback(text,uuid,uuid,uuid) from public,anon;
grant execute on function public.affairs_read_teaching_feedback(text,uuid,uuid,uuid) to authenticated;

create function public.affairs_change_teaching_feedback(p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  manager boolean := p_kind in ('save_teaching_survey','release_teaching_survey','review_teaching_feedback');
  fields text[];
  requested uuid;
  section_id_arg uuid;
  survey_id_arg uuid;
  term_id_arg uuid;
  feedback_id_arg uuid;
  expected integer;
  phase_arg text;
  questions_arg text[];
  ratings_arg smallint[];
  opens_arg timestamptz;
  closes_arg timestamptz;
  survey public.affairs_teaching_surveys;
  feedback public.affairs_teaching_feedback;
  receipt private.affairs_teaching_survey_completions;
  text_arg text;
  now_at timestamptz;
  today date;
begin
  if not (select private.affairs_google_identity()) or (manager and not(select private.affairs_is_admin())) then
    raise exception 'Teaching feedback is unavailable to your account' using errcode='42501';
  end if;
  case p_kind
    when 'submit_teaching_survey' then fields:=array['survey_id','section_id','request_id','version','ratings','comment'];
    when 'submit_teaching_feedback' then fields:=array['section_id','request_id','comment'];
    when 'save_teaching_survey' then fields:=array['term_id','phase','expected_version','opens_at','closes_at','questions'];
    when 'release_teaching_survey' then fields:=array['survey_id','expected_version','confirm_release','grades_published'];
    when 'review_teaching_feedback' then fields:=array['feedback_id'];
    else raise exception 'Invalid teaching feedback action' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12288
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or exists(select 1 from unnest(fields) k(field) where k.field in ('survey_id','section_id','request_id','term_id','feedback_id')
      and (jsonb_typeof(p_payload->k.field) is distinct from 'string' or p_payload->>k.field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    or exists(select 1 from unnest(fields) k(field) where k.field in ('version','expected_version')
      and (jsonb_typeof(p_payload->k.field) is distinct from 'number' or p_payload->>k.field !~ '^[0-9]{1,7}$' or case when p_payload->>k.field ~ '^[0-9]{1,7}$' then (p_payload->>k.field)::numeric>1000000 else false end)) then
    raise exception 'Invalid teaching feedback fields' using errcode='22023';
  end if;
  requested:=(p_payload->>'request_id')::uuid; section_id_arg:=(p_payload->>'section_id')::uuid;
  survey_id_arg:=(p_payload->>'survey_id')::uuid; term_id_arg:=(p_payload->>'term_id')::uuid;
  feedback_id_arg:=(p_payload->>'feedback_id')::uuid; expected:=(p_payload->>'expected_version')::int;

  if p_kind='save_teaching_survey' then
    phase_arg:=p_payload->>'phase';
    if coalesce(phase_arg,'') not in ('midterm','final') or jsonb_typeof(p_payload->'questions') is distinct from 'array'
      or coalesce(p_payload->>'opens_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or coalesce(p_payload->>'closes_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      or not exists(select 1 from public.affairs_terms where id=term_id_arg) then
      raise exception 'Invalid survey settings' using errcode='22023';
    end if;
    if jsonb_array_length(p_payload->'questions') not between 1 and 16 or exists(
      select 1 from jsonb_array_elements(p_payload->'questions') q(value)
      where jsonb_typeof(q.value) is distinct from 'string' or char_length(btrim(q.value#>>'{}')) not between 1 and 160) then
      raise exception 'Invalid survey questions' using errcode='22023';
    end if;
    select array_agg(btrim(q.value) order by q.position) into questions_arg
      from jsonb_array_elements_text(p_payload->'questions') with ordinality q(value,position);
    if (select count(distinct item) from unnest(questions_arg) item)<>cardinality(questions_arg) then
      raise exception 'Duplicate survey questions' using errcode='22023';
    end if;
    opens_arg:=(p_payload->>'opens_at')::timestamptz; closes_arg:=(p_payload->>'closes_at')::timestamptz;
    if closes_arg<=opens_arg or closes_arg-opens_arg>interval '180 days' then
      raise exception 'Invalid survey window' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('teaching-survey-config:'||term_id_arg||':'||phase_arg,0));
    select * into survey from public.affairs_teaching_surveys where term_id=term_id_arg and phase=phase_arg for update;
    if survey.version=expected+1 and survey.opens_at=opens_arg and survey.closes_at=closes_arg and survey.questions=questions_arg then
      return jsonb_build_object('id',survey.id,'version',survey.version);
    end if;
    if coalesce(survey.version,0)<>expected or survey.released or expected>=1000000 or
      (survey.questions<>questions_arg and exists(select 1 from private.affairs_teaching_survey_results where survey_id=survey.id)) then
      raise exception 'Survey changed or its questions already have answers' using errcode='PT409';
    end if;
    if survey.id is null then
      insert into public.affairs_teaching_surveys(term_id,phase,opens_at,closes_at,questions)
        values(term_id_arg,phase_arg,opens_arg,closes_arg,questions_arg) returning * into survey;
    else
      update public.affairs_teaching_surveys set opens_at=opens_arg,closes_at=closes_arg,questions=questions_arg,version=version+1
        where id=survey.id returning * into survey;
    end if;
    return jsonb_build_object('id',survey.id,'version',survey.version);
  elsif p_kind='release_teaching_survey' then
    if p_payload->'confirm_release' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'grades_published') is distinct from 'boolean' then
      raise exception 'Release must be confirmed' using errcode='22023';
    end if;
    select * into survey from public.affairs_teaching_surveys where id=survey_id_arg for update;
    if survey.phase='final' and p_payload->'grades_published' is distinct from 'true'::jsonb then
      raise exception 'Confirm final grades have been published' using errcode='22023';
    end if;
    if survey.released and survey.version=expected+1 then return jsonb_build_object('id',survey.id,'version',survey.version); end if;
    if survey.id is null or survey.version<>expected or survey.released or expected>=1000000 or clock_timestamp()<survey.closes_at then
      raise exception 'Survey cannot be released' using errcode='PT409';
    end if;
    update public.affairs_teaching_surveys set released=true,version=version+1 where id=survey.id returning * into survey;
    return jsonb_build_object('id',survey.id,'version',survey.version);
  elsif p_kind='review_teaching_feedback' then
    select * into feedback from public.affairs_teaching_feedback where id=feedback_id_arg for update;
    if feedback.id is null then raise exception 'Feedback is unavailable' using errcode='PT409'; end if;
    if feedback.status='submitted' then
      update public.affairs_teaching_feedback set status='reviewed',reviewed_at=clock_timestamp() where id=feedback.id returning * into feedback;
    end if;
    return private.affairs_teaching_feedback_record(feedback);
  end if;

  if p_kind='submit_teaching_feedback' then
    text_arg:=btrim(p_payload->>'comment');
    if jsonb_typeof(p_payload->'comment') is distinct from 'string' or char_length(text_arg) not between 5 and 2000 then
      raise exception 'Invalid feedback comment' using errcode='22023';
    end if;
  else
    text_arg:=btrim(p_payload->>'comment');
    if jsonb_typeof(p_payload->'comment') is distinct from 'string' or char_length(text_arg)>2000 then
      raise exception 'Invalid survey comment' using errcode='22023';
    end if;
    if jsonb_typeof(p_payload->'ratings') is distinct from 'array' then raise exception 'Invalid ratings' using errcode='22023'; end if;
    if jsonb_array_length(p_payload->'ratings') not between 1 and 16 or exists(select 1 from jsonb_array_elements(p_payload->'ratings') q(value)
      where jsonb_typeof(q.value)<>'number' or q.value::text !~ '^[1-5]$') then raise exception 'Invalid ratings' using errcode='22023'; end if;
    select array_agg(q.value::smallint order by q.position) into ratings_arg
      from jsonb_array_elements_text(p_payload->'ratings') with ordinality q(value,position);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('teaching-feedback:'||actor,0));
  if p_kind='submit_teaching_feedback' then
    select * into feedback from public.affairs_teaching_feedback where user_id=actor and request_id=requested;
    if found then
      if feedback.section_id<>section_id_arg or feedback.comment<>text_arg then raise exception 'Request ID already used' using errcode='PT409'; end if;
      return private.affairs_teaching_feedback_record(feedback);
    end if;
  else
    select * into receipt from private.affairs_teaching_survey_completions
      where user_id=actor and survey_id=survey_id_arg and section_id=section_id_arg;
    if found then
      if receipt.request_id<>requested then raise exception 'Survey already completed' using errcode='PT409'; end if;
      return jsonb_build_object('surveyId',survey_id_arg,'sectionId',section_id_arg,'completed',true);
    end if;
    select * into survey from public.affairs_teaching_surveys where id=survey_id_arg for share;
    now_at:=clock_timestamp();
    if survey.id is null or survey.released or survey.version<>(p_payload->>'version')::int or
      not (now_at>=survey.opens_at and now_at<survey.closes_at) then
      raise exception 'Survey window or form changed' using errcode='PT409';
    end if;
    if cardinality(ratings_arg)<>cardinality(survey.questions) then raise exception 'Incomplete survey' using errcode='22023'; end if;
  end if;
  today:=(clock_timestamp() at time zone 'Asia/Taipei')::date;
  perform 1 from public.affairs_students student
    join public.affairs_enrollments e on e.student_id=student.id join public.affairs_sections s on s.id=e.section_id
    join public.affairs_terms t on t.id=s.term_id where student.user_id=actor and student.status='active' and s.id=section_id_arg
    and ((p_kind='submit_teaching_survey' and e.status in ('enrolled','completed') and t.id=survey.term_id)
      or (p_kind='submit_teaching_feedback' and e.status='enrolled' and today between t.starts_on and t.ends_on))
    for share of student,e,s,t;
  if not found then raise exception 'Course is unavailable to your account' using errcode='42501'; end if;
  if p_kind='submit_teaching_feedback' then
    insert into public.affairs_teaching_feedback(user_id,section_id,comment,request_id)
      values(actor,section_id_arg,text_arg,requested) returning * into feedback;
    return private.affairs_teaching_feedback_record(feedback);
  end if;
  insert into private.affairs_teaching_survey_completions values(actor,survey_id_arg,section_id_arg,requested);
  insert into private.affairs_teaching_survey_results(survey_id,section_id,ratings,comment) values(survey_id_arg,section_id_arg,ratings_arg,text_arg);
  return jsonb_build_object('surveyId',survey_id_arg,'sectionId',section_id_arg,'completed',true);
end;
$$;
revoke all on function public.affairs_change_teaching_feedback(text,jsonb) from public,anon;
grant execute on function public.affairs_change_teaching_feedback(text,jsonb) to authenticated;
