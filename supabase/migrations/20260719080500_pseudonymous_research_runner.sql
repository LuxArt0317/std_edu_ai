create table public.research_participant_tokens (
  participant_id uuid primary key references public.research_participants(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

alter table public.research_participant_tokens enable row level security;
revoke all on public.research_participant_tokens from public, anon, authenticated;

create or replace function private.research_token_participant(p_token text)
returns uuid
language sql
security definer
set search_path=''
stable
as $$
  select t.participant_id
  from public.research_participant_tokens t
  join public.research_participants p on p.id=t.participant_id
  where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now()
    and p.status in ('consented','active','completed')
  limit 1
$$;

revoke all on function private.research_token_participant(text) from public;

create or replace function public.public_research_study(p_study_code text, p_language text default 'en')
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  with selected as (
    select s.id study_id,s.code,s.title,s.purpose,s.retention_days,v.id version_id,v.version,
      case when p_language='zh-Hant' then v.consent_text_zh else v.consent_text_en end consent_text
    from public.research_studies s
    join lateral (
      select sv.* from public.research_study_versions sv
      where sv.study_id=s.id and sv.frozen_at is not null
      order by sv.version desc limit 1
    ) v on true
    where s.code=p_study_code and s.status in ('recruiting','active')
  )
  select jsonb_build_object(
    'code',x.code,'title',x.title,'purpose',x.purpose,'retentionDays',x.retention_days,
    'version',x.version,'versionId',x.version_id,'consentText',x.consent_text,
    'taskCount',(select count(*) from public.research_tasks t where t.study_version_id=x.version_id),
    'instruments',coalesce((select jsonb_agg(distinct q.instrument order by q.instrument) from public.research_questionnaires q where q.study_version_id=x.version_id and q.language=case when p_language='zh-Hant' then 'zh-Hant' else 'en' end),'[]'::jsonb)
  ) from selected x
$$;

create or replace function public.begin_research_participation(
  p_study_code text,
  p_study_version_id uuid,
  p_population_role text,
  p_familiarity_level text,
  p_consent boolean,
  p_user_agent_family text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_study public.research_studies%rowtype;
  v_version public.research_study_versions%rowtype;
  v_participant_id uuid;
  v_session_id uuid;
  v_token text;
  v_code text;
  v_ab bigint;
  v_ba bigint;
  v_sequence text;
begin
  if not p_consent then raise exception 'Active consent is required' using errcode='22023'; end if;
  if p_population_role not in ('student','prospective_student','visitor','faculty','administrative_staff') then raise exception 'Invalid population role' using errcode='22023'; end if;
  if p_familiarity_level not in ('new','occasional','frequent') then raise exception 'Invalid familiarity level' using errcode='22023'; end if;
  select * into v_study from public.research_studies where code=p_study_code and status in ('recruiting','active');
  if not found then raise exception 'Study is not recruiting' using errcode='P0002'; end if;
  select * into v_version from public.research_study_versions where id=p_study_version_id and study_id=v_study.id and frozen_at is not null;
  if not found then raise exception 'Frozen study version not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_version.id::text,0));
  select count(*) filter(where sequence='AB'),count(*) filter(where sequence='BA') into v_ab,v_ba from public.research_sessions where study_version_id=v_version.id;
  v_sequence:=case when v_ab<=v_ba then 'AB' else 'BA' end;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_code:='P-'||upper(substr(encode(extensions.digest(v_token||v_study.id::text,'sha256'),'hex'),1,12));
  insert into public.research_participants(study_id,participant_code,population_role,familiarity_level,status)
  values(v_study.id,v_code,p_population_role,p_familiarity_level,'active') returning id into v_participant_id;
  insert into public.research_consent_records(participant_id,study_version_id,consented,consented_at,user_agent_family)
  values(v_participant_id,v_version.id,true,now(),nullif(left(trim(p_user_agent_family),120),''));
  insert into public.research_sessions(participant_id,study_version_id,sequence,status)
  values(v_participant_id,v_version.id,v_sequence,'started') returning id into v_session_id;
  insert into public.research_participant_tokens(participant_id,token_hash,expires_at)
  values(v_participant_id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+make_interval(days=>v_study.retention_days));
  return jsonb_build_object('participantCode',v_code,'sessionId',v_session_id,'token',v_token,'sequence',v_sequence,'studyVersion',v_version.version,'expiresAt',now()+make_interval(days=>v_study.retention_days));
end
$$;

create or replace function public.get_research_session(p_token text, p_language text default 'en')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_participant_id uuid; v_result jsonb;
begin
  v_participant_id:=private.research_token_participant(p_token);
  if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000'; end if;
  update public.research_participant_tokens set last_used_at=now() where participant_id=v_participant_id;
  select jsonb_build_object(
    'participantCode',p.participant_code,'participantStatus',p.status,'sessionId',s.id,'sessionStatus',s.status,'sequence',s.sequence,
    'study',jsonb_build_object('code',st.code,'title',st.title,'purpose',st.purpose,'version',sv.version),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'key',t.task_key,'domain',t.domain,'prompt',case when s.sequence='AB' then t.variant_a else t.variant_b end,'maxSeconds',t.max_seconds,'ordinal',t.ordinal) order by t.ordinal) from public.research_tasks t where t.study_version_id=s.study_version_id),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(jsonb_build_object('taskId',a.task_id,'condition',a.condition,'success',a.success,'durationMs',a.duration_ms,'seqScore',a.seq_score,'createdAt',a.created_at) order by a.created_at) from public.research_task_attempts a where a.session_id=s.id),'[]'::jsonb),
    'questionnaires',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'instrument',q.instrument,'version',q.version,'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'key',i.item_key,'ordinal',i.ordinal,'prompt',i.prompt,'responseType',i.response_type) order by i.ordinal),'[]'::jsonb) from public.research_questionnaire_items i where i.questionnaire_id=q.id)) order by q.instrument) from public.research_questionnaires q where q.study_version_id=s.study_version_id and q.language=case when p_language='zh-Hant' then 'zh-Hant' else 'en' end),'[]'::jsonb)
  ) into v_result
  from public.research_participants p join public.research_sessions s on s.participant_id=p.id join public.research_study_versions sv on sv.id=s.study_version_id join public.research_studies st on st.id=sv.study_id
  where p.id=v_participant_id;
  return v_result;
end
$$;

create or replace function public.submit_research_attempt(p_token text,p_task_id uuid,p_condition text,p_metrics jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_participant_id uuid;v_session public.research_sessions%rowtype;v_attempt_id uuid;v_variant text;
begin
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  select * into v_session from public.research_sessions where participant_id=v_participant_id and status in ('started','paused');if not found then raise exception 'Session is not active' using errcode='55000';end if;
  if not exists(select 1 from public.research_consent_records c where c.participant_id=v_participant_id and c.study_version_id=v_session.study_version_id and c.consented and c.withdrawn_at is null) then raise exception 'Active consent is required' using errcode='28000';end if;
  if not exists(select 1 from public.research_tasks t where t.id=p_task_id and t.study_version_id=v_session.study_version_id) then raise exception 'Task does not belong to this protocol' using errcode='23503';end if;
  if p_condition not in ('current_site','enhanced_platform') then raise exception 'Invalid condition' using errcode='22023';end if;
  v_variant:=case when (v_session.sequence='AB' and p_condition='current_site') or (v_session.sequence='BA' and p_condition='enhanced_platform') then 'A' else 'B' end;
  insert into public.research_task_attempts(session_id,task_id,condition,variant,success,duration_ms,navigation_steps,wrong_page_visits,reformulations,backtracks,assistance_requests,source_identification_correct,seq_score,notes)
  values(v_session.id,p_task_id,p_condition,v_variant,
    case when p_metrics->>'success' in ('complete','partial','failed','abandoned') then p_metrics->>'success' else 'failed' end,
    least(86400000,greatest(0,coalesce((p_metrics->>'durationMs')::integer,0))),
    least(10000,greatest(0,coalesce((p_metrics->>'navigationSteps')::integer,0))),
    least(10000,greatest(0,coalesce((p_metrics->>'wrongPageVisits')::integer,0))),
    least(10000,greatest(0,coalesce((p_metrics->>'reformulations')::integer,0))),
    least(10000,greatest(0,coalesce((p_metrics->>'backtracks')::integer,0))),
    least(10000,greatest(0,coalesce((p_metrics->>'assistanceRequests')::integer,0))),
    case when p_metrics ? 'sourceIdentificationCorrect' then (p_metrics->>'sourceIdentificationCorrect')::boolean else null end,
    case when p_metrics ? 'seqScore' then least(7,greatest(1,(p_metrics->>'seqScore')::integer)) else null end,
    nullif(left(coalesce(p_metrics->>'notes',''),2000),'')
  ) on conflict(session_id,task_id,condition) do update set success=excluded.success,duration_ms=excluded.duration_ms,navigation_steps=excluded.navigation_steps,wrong_page_visits=excluded.wrong_page_visits,reformulations=excluded.reformulations,backtracks=excluded.backtracks,assistance_requests=excluded.assistance_requests,source_identification_correct=excluded.source_identification_correct,seq_score=excluded.seq_score,notes=excluded.notes,created_at=now()
  returning id into v_attempt_id;return v_attempt_id;
end
$$;

create or replace function public.submit_research_response(p_token text,p_item_id uuid,p_condition text,p_numeric_value numeric default null,p_text_value text default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_participant_id uuid;v_session public.research_sessions%rowtype;v_item public.research_questionnaire_items%rowtype;v_questionnaire public.research_questionnaires%rowtype;v_id uuid;
begin
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  select * into v_session from public.research_sessions where participant_id=v_participant_id and status in ('started','paused');if not found then raise exception 'Session is not active' using errcode='55000';end if;
  select i.* into v_item from public.research_questionnaire_items i join public.research_questionnaires q on q.id=i.questionnaire_id where i.id=p_item_id and q.study_version_id=v_session.study_version_id;if not found then raise exception 'Questionnaire item does not belong to this protocol' using errcode='23503';end if;
  select * into v_questionnaire from public.research_questionnaires where id=v_item.questionnaire_id;
  if (p_numeric_value is null)=(p_text_value is null) then raise exception 'Exactly one response value is required' using errcode='22023';end if;
  if v_item.response_type='likert5' and (p_numeric_value<1 or p_numeric_value>5) then raise exception 'Likert-5 value out of range' using errcode='22023';end if;
  if v_item.response_type='likert7' and (p_numeric_value<1 or p_numeric_value>7) then raise exception 'Likert-7 value out of range' using errcode='22023';end if;
  if v_item.response_type='text' and (p_text_value is null or length(p_text_value)>5000) then raise exception 'Text response is invalid' using errcode='22023';end if;
  insert into public.research_responses(session_id,questionnaire_id,item_id,condition,numeric_value,text_value) values(v_session.id,v_questionnaire.id,v_item.id,p_condition,p_numeric_value,nullif(trim(p_text_value),''))
  on conflict(session_id,item_id,condition) do update set numeric_value=excluded.numeric_value,text_value=excluded.text_value,created_at=now() returning id into v_id;return v_id;
end
$$;

create or replace function public.withdraw_research_participation(p_token text,p_delete_now boolean default false)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_participant_id uuid;
begin
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  update public.research_consent_records set withdrawn_at=now() where participant_id=v_participant_id and withdrawn_at is null;
  update public.research_sessions set status='withdrawn',completed_at=coalesce(completed_at,now()) where participant_id=v_participant_id;
  update public.research_participants set status='withdrawn' where id=v_participant_id;
  update public.research_participant_tokens set revoked_at=now() where participant_id=v_participant_id;
  if p_delete_now then delete from public.research_sessions where participant_id=v_participant_id;delete from public.research_participants where id=v_participant_id;end if;
  return true;
end
$$;

create or replace function public.research_sus_score(p_session_id uuid,p_condition text)
returns numeric
language sql
security invoker
set search_path=''
stable
as $$
  select case when count(*)=10 then round(sum(case when i.ordinal%2=1 then r.numeric_value-1 else 5-r.numeric_value end)*2.5,2) else null end
  from public.research_responses r join public.research_questionnaire_items i on i.id=r.item_id join public.research_questionnaires q on q.id=i.questionnaire_id
  where r.session_id=p_session_id and r.condition=p_condition and q.instrument='SUS' and i.response_type='likert5'
$$;

revoke all on function public.public_research_study(text,text),public.begin_research_participation(text,uuid,text,text,boolean,text),public.get_research_session(text,text),public.submit_research_attempt(text,uuid,text,jsonb),public.submit_research_response(text,uuid,text,numeric,text),public.withdraw_research_participation(text,boolean) from public;
grant execute on function public.public_research_study(text,text),public.begin_research_participation(text,uuid,text,text,boolean,text),public.get_research_session(text,text),public.submit_research_attempt(text,uuid,text,jsonb),public.submit_research_response(text,uuid,text,numeric,text),public.withdraw_research_participation(text,boolean) to anon,authenticated;
grant execute on function public.research_sus_score(uuid,text) to authenticated;

comment on table public.research_participant_tokens is 'Revocable pseudonymous study access; only SHA-256 token hashes are stored and no Data API table role can read them.';
