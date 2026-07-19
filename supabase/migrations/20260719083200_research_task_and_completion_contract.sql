create or replace function public.get_research_session(p_token text, p_language text default 'en')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_participant_id uuid; v_result jsonb;
begin
  v_participant_id:=private.research_token_participant(p_token); if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000'; end if;
  update public.research_participant_tokens set last_used_at=now() where participant_id=v_participant_id;
  select jsonb_build_object('participantCode',p.participant_code,'participantStatus',p.status,'sessionId',s.id,'sessionStatus',s.status,'sequence',s.sequence,'study',jsonb_build_object('code',st.code,'title',st.title,'purpose',st.purpose,'version',sv.version),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'key',t.task_key,'domain',t.domain,'promptCurrent',t.variant_a,'promptEnhanced',t.variant_b,'maxSeconds',t.max_seconds,'ordinal',t.ordinal) order by t.ordinal) from public.research_tasks t where t.study_version_id=s.study_version_id),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(jsonb_build_object('taskId',a.task_id,'condition',a.condition,'success',a.success,'durationMs',a.duration_ms,'seqScore',a.seq_score,'createdAt',a.created_at) order by a.created_at) from public.research_task_attempts a where a.session_id=s.id),'[]'::jsonb),
    'questionnaires',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'instrument',q.instrument,'version',q.version,'perCondition',q.instrument in ('SUS','SEQ'),'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'key',i.item_key,'ordinal',i.ordinal,'prompt',i.prompt,'responseType',i.response_type) order by i.ordinal),'[]'::jsonb) from public.research_questionnaire_items i where i.questionnaire_id=q.id)) order by q.instrument) from public.research_questionnaires q where q.study_version_id=s.study_version_id and q.language=case when p_language='zh-Hant' then 'zh-Hant' else 'en' end),'[]'::jsonb)
  ) into v_result from public.research_participants p join public.research_sessions s on s.participant_id=p.id join public.research_study_versions sv on sv.id=s.study_version_id join public.research_studies st on st.id=sv.study_id where p.id=v_participant_id;
  return v_result;
end $$;

create or replace function public.complete_research_session(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_participant_id uuid;v_session public.research_sessions%rowtype;v_tasks integer;v_attempts integer;v_sus_items integer;v_sus_responses integer;
begin
  v_participant_id:=private.research_token_participant(p_token);if v_participant_id is null then raise exception 'Invalid or expired participation token' using errcode='28000';end if;
  select * into v_session from public.research_sessions where participant_id=v_participant_id and status in ('started','paused');if not found then raise exception 'Session is not active' using errcode='55000';end if;
  select count(*) into v_tasks from public.research_tasks where study_version_id=v_session.study_version_id;select count(*) into v_attempts from public.research_task_attempts where session_id=v_session.id;
  if v_tasks=0 or v_attempts<v_tasks*2 then raise exception 'Both conditions must be completed for every task' using errcode='23514';end if;
  select count(*) into v_sus_items from public.research_questionnaire_items i join public.research_questionnaires q on q.id=i.questionnaire_id where q.study_version_id=v_session.study_version_id and q.instrument='SUS';
  select count(*) into v_sus_responses from public.research_responses r join public.research_questionnaires q on q.id=r.questionnaire_id where r.session_id=v_session.id and q.instrument='SUS' and r.condition in ('current_site','enhanced_platform');
  if v_sus_items>0 and v_sus_responses<v_sus_items*2 then raise exception 'SUS responses are required for both conditions' using errcode='23514';end if;
  update public.research_sessions set status='completed',completed_at=now() where id=v_session.id;update public.research_participants set status='completed' where id=v_participant_id;return true;
end $$;
