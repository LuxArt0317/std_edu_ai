create or replace function public.set_research_session_status(p_token text,p_status text)
returns text language plpgsql security definer set search_path='' as $$
declare v_participant_id uuid;v_status text;
begin
  if p_status not in ('started','paused') then raise exception 'Invalid session status' using errcode='22023';end if;
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  update public.research_sessions set status=p_status where participant_id=v_participant_id and status in ('started','paused') returning status into v_status;
  if v_status is null then raise exception 'Session cannot change status' using errcode='55000';end if;return v_status;
end $$;

create or replace function public.complete_research_session(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_participant_id uuid;v_session public.research_sessions%rowtype;v_tasks integer;v_attempts integer;v_responses integer;
begin
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  select * into v_session from public.research_sessions where participant_id=v_participant_id and status in ('started','paused');if not found then raise exception 'Session is not active' using errcode='55000';end if;
  select count(*) into v_tasks from public.research_tasks where study_version_id=v_session.study_version_id;
  select count(*) into v_attempts from public.research_task_attempts where session_id=v_session.id;
  select count(*) into v_responses from public.research_responses where session_id=v_session.id;
  if v_tasks=0 or v_attempts<v_tasks*2 then raise exception 'Both conditions must be completed for every task' using errcode='23514';end if;
  if v_responses=0 then raise exception 'Required questionnaire responses are missing' using errcode='23514';end if;
  update public.research_sessions set status='completed',completed_at=now() where id=v_session.id;
  update public.research_participants set status='completed' where id=v_participant_id;
  return true;
end $$;

create or replace function public.research_anonymized_export(p_study_id uuid)
returns jsonb language plpgsql security invoker set search_path='' stable as $$
declare v_result jsonb;
begin
  if not private.has_role(array['owner','admin','president','vice_president','dean','librarian']) then raise exception 'Research export authority required' using errcode='42501';end if;
  select jsonb_build_object(
    'schemaVersion',1,'generatedAt',now(),'study',jsonb_build_object('code',s.code,'title',s.title,'status',s.status),
    'codebook',jsonb_build_object('participantKey','Irreversible study-scoped SHA-256 pseudonym','sequence','Counterbalanced AB or BA','condition','current_site or enhanced_platform','success','complete, partial, failed, or abandoned','durationMs','Non-negative task duration','susScore','Standard 0-100 score; null unless exactly 10 items'),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object(
      'participantKey',encode(extensions.digest(p.participant_code||s.id::text,'sha256'),'hex'),'populationRole',p.population_role,'familiarity',p.familiarity_level,'participantStatus',p.status,
      'protocolVersion',sv.version,'sequence',rs.sequence,'sessionStatus',rs.status,'startedAt',rs.started_at,'completedAt',rs.completed_at,
      'attempts',coalesce((select jsonb_agg(jsonb_build_object('taskKey',t.task_key,'domain',t.domain,'condition',a.condition,'variant',a.variant,'success',a.success,'durationMs',a.duration_ms,'navigationSteps',a.navigation_steps,'wrongPageVisits',a.wrong_page_visits,'reformulations',a.reformulations,'backtracks',a.backtracks,'assistanceRequests',a.assistance_requests,'sourceIdentificationCorrect',a.source_identification_correct,'seqScore',a.seq_score) order by t.ordinal,a.condition) from public.research_task_attempts a join public.research_tasks t on t.id=a.task_id where a.session_id=rs.id),'[]'::jsonb),
      'responses',coalesce((select jsonb_agg(jsonb_build_object('instrument',q.instrument,'instrumentVersion',q.version,'itemKey',i.item_key,'condition',r.condition,'numericValue',r.numeric_value,'textValue',r.text_value) order by q.instrument,i.ordinal) from public.research_responses r join public.research_questionnaire_items i on i.id=r.item_id join public.research_questionnaires q on q.id=r.questionnaire_id where r.session_id=rs.id),'[]'::jsonb),
      'susCurrent',public.research_sus_score(rs.id,'current_site'),'susEnhanced',public.research_sus_score(rs.id,'enhanced_platform')
    ) order by rs.started_at) from public.research_sessions rs join public.research_participants p on p.id=rs.participant_id join public.research_study_versions sv on sv.id=rs.study_version_id where p.study_id=s.id),'[]'::jsonb)
  ) into v_result from public.research_studies s where s.id=p_study_id;
  if v_result is null then raise exception 'Study not found' using errcode='P0002';end if;return v_result;
end $$;

revoke all on function public.set_research_session_status(text,text),public.complete_research_session(text),public.research_anonymized_export(uuid) from public;
grant execute on function public.set_research_session_status(text,text),public.complete_research_session(text) to anon,authenticated;
grant execute on function public.research_anonymized_export(uuid) to authenticated;
