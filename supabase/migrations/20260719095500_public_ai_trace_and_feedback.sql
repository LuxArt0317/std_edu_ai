-- Privacy-safe public RAG evidence. Public callers can append only a tightly
-- validated, rate-bounded exchange and can never read the resulting evidence.

create table private.public_ai_feedback_tokens (
  answer_id uuid primary key references public.ai_answers(id) on delete cascade,
  anonymous_session_hash text not null check (anonymous_session_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index ai_feedback_anonymous_answer_once_idx
on public.ai_feedback(answer_id, anonymous_session_hash)
where anonymous_session_hash is not null;

create or replace function public.record_public_ai_exchange(
  p_session_hash text,
  p_query_hash text,
  p_language text,
  p_retrieval jsonb,
  p_terminal_state text,
  p_answer_text text,
  p_model text,
  p_prompt_version text,
  p_retriever_version text,
  p_corpus_version text,
  p_latency_ms integer,
  p_citations jsonb
)
returns table(answer_id uuid, feedback_token text, feedback_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query_id uuid;
  v_answer_id uuid;
  v_token text;
  v_expires timestamptz := now() + interval '30 days';
  v_item jsonb;
  v_chunk_id uuid;
  v_rank integer;
  v_claim text;
begin
  perform pg_advisory_xact_lock(hashtext('record_public_ai_exchange'));
  if (select count(*) from public.ai_queries where surface='public_research' and created_at > now()-interval '1 minute') >= 60 then
    raise exception 'Public research evidence is temporarily at capacity';
  end if;
  if p_session_hash !~ '^[0-9a-f]{64}$' or p_query_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid privacy hash'; end if;
  if (select count(*) from public.ai_queries where anonymous_session_hash=p_session_hash and created_at > now()-interval '1 minute') >= 12 then raise exception 'Public research evidence rate exceeded'; end if;
  if p_language not in ('zh-Hant','en','mixed','unknown') then raise exception 'Invalid language'; end if;
  if p_terminal_state not in ('answered','clarification','abstained','handoff','failed') then raise exception 'Invalid terminal state'; end if;
  if char_length(trim(coalesce(p_answer_text,''))) not between 1 and 8000 then raise exception 'Invalid answer'; end if;
  if char_length(coalesce(p_model,'')) > 120 or char_length(coalesce(p_prompt_version,'')) not between 1 and 120 or char_length(coalesce(p_retriever_version,'')) not between 1 and 120 or p_corpus_version !~ '^[0-9a-f]{64}$' then raise exception 'Invalid version metadata'; end if;
  if p_latency_ms not between 0 and 120000 then raise exception 'Invalid latency'; end if;
  if jsonb_typeof(p_retrieval) <> 'array' or jsonb_array_length(p_retrieval) > 8 or jsonb_typeof(p_citations) <> 'array' or jsonb_array_length(p_citations) > 12 then raise exception 'Invalid evidence arrays'; end if;

  -- Validate the complete evidence set before any write. Every chunk must still
  -- be eligible at commit time; expired/private/draft/superseded rows fail closed.
  for v_item in select value from jsonb_array_elements(p_retrieval) loop
    begin v_chunk_id := (v_item->>'chunkId')::uuid; v_rank := (v_item->>'rank')::integer;
    exception when others then raise exception 'Invalid retrieval identity'; end;
    if v_rank < 1 or v_rank > 8 or not exists (
      select 1 from public.knowledge_chunks c
      join public.knowledge_documents d on d.id=c.document_id
      join public.knowledge_sources s on s.id=d.source_id
      where c.id=v_chunk_id and c.active and c.embedding is not null and s.active
        and d.review_status='approved' and d.publication_status='published'
        and d.sensitivity='public' and d.audience_scope='public'
        and (d.effective_at is null or d.effective_at<=now()) and (d.expires_at is null or d.expires_at>now())
        and (c.effective_at is null or c.effective_at<=now()) and (c.expires_at is null or c.expires_at>now())
    ) then raise exception 'Ineligible retrieval evidence'; end if;
  end loop;
  if (select count(distinct (value->>'rank')::integer) from jsonb_array_elements(p_retrieval)) <> jsonb_array_length(p_retrieval)
     or (select count(distinct value->>'chunkId') from jsonb_array_elements(p_retrieval)) <> jsonb_array_length(p_retrieval) then
    raise exception 'Duplicate retrieval evidence';
  end if;
  for v_item in select value from jsonb_array_elements(p_citations) loop
    begin v_chunk_id := (v_item->>'chunkId')::uuid; exception when others then raise exception 'Invalid citation identity'; end;
    v_claim := trim(coalesce(v_item->>'claim',''));
    if char_length(v_claim) not between 1 and 800 or not exists (select 1 from jsonb_array_elements(p_retrieval) r where r->>'chunkId'=v_chunk_id::text) then raise exception 'Citation is not eligible retrieval evidence'; end if;
  end loop;
  if p_terminal_state='answered' and jsonb_array_length(p_citations)=0 then raise exception 'Answered responses require citations'; end if;

  insert into public.ai_queries(anonymous_session_hash,surface,language,query_hash,query_text,consented_research_use)
  values(p_session_hash,'public_research',p_language,p_query_hash,null,false) returning id into v_query_id;
  insert into public.ai_answers(query_id,answer_text,terminal_state,model,prompt_version,retriever_version,corpus_version,latency_ms)
  values(v_query_id,p_answer_text,p_terminal_state,nullif(p_model,''),p_prompt_version,p_retriever_version,p_corpus_version,p_latency_ms) returning id into v_answer_id;
  for v_item in select value from jsonb_array_elements(p_retrieval) loop
    insert into public.ai_retrieval_results(query_id,chunk_id,rank,keyword_score,vector_score,fused_score,eligible)
    values(v_query_id,(v_item->>'chunkId')::uuid,(v_item->>'rank')::integer,(v_item->>'keywordScore')::numeric,(v_item->>'vectorScore')::numeric,(v_item->>'fusedScore')::numeric,true);
  end loop;
  for v_item in select value from jsonb_array_elements(p_citations) loop
    insert into public.ai_answer_citations(answer_id,chunk_id,claim_text)
    values(v_answer_id,(v_item->>'chunkId')::uuid,trim(v_item->>'claim'));
  end loop;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.public_ai_feedback_tokens(answer_id,anonymous_session_hash,token_hash,expires_at)
  values(v_answer_id,p_session_hash,encode(extensions.digest(v_token,'sha256'),'hex'),v_expires);
  return query select v_answer_id,v_token,v_expires;
end;
$$;

create or replace function public.submit_public_ai_feedback(
  p_feedback_token text,
  p_session_hash text,
  p_helpful boolean,
  p_resolved_need boolean default null,
  p_correction_category text default null,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_token private.public_ai_feedback_tokens%rowtype; v_feedback_id uuid;
begin
  if p_session_hash !~ '^[0-9a-f]{64}$' or p_feedback_token !~ '^[0-9a-f]{64}$' or p_helpful is null then raise exception 'Invalid feedback capability'; end if;
  if p_correction_category is not null and p_correction_category not in ('incorrect','stale','missing_source','unclear','unsafe','wrong_route','other') then raise exception 'Invalid correction category'; end if;
  if char_length(coalesce(p_comment,'')) > 1000 then raise exception 'Feedback comment is too long'; end if;
  select * into v_token from private.public_ai_feedback_tokens
  where token_hash=encode(extensions.digest(p_feedback_token,'sha256'),'hex') and anonymous_session_hash=p_session_hash
  for update;
  if not found or v_token.used_at is not null or v_token.expires_at<=now() then raise exception 'Feedback capability is invalid, expired, or already used'; end if;
  insert into public.ai_feedback(answer_id,anonymous_session_hash,helpful,resolved_need,correction_category,comment)
  values(v_token.answer_id,p_session_hash,p_helpful,p_resolved_need,p_correction_category,nullif(trim(p_comment),'')) returning id into v_feedback_id;
  update private.public_ai_feedback_tokens set used_at=now() where answer_id=v_token.answer_id;
  return v_feedback_id;
end;
$$;

create or replace function public.public_ai_trace_report(p_days integer default 30)
returns table(query_id uuid,created_at timestamptz,language text,terminal_state text,latency_ms integer,retrieval_count bigint,citation_count bigint,helpful boolean,resolved_need boolean,correction_category text)
language sql
stable
security invoker
set search_path = ''
as $$
  select q.id,q.created_at,q.language,a.terminal_state,a.latency_ms,
    count(distinct r.id),count(distinct c.id),max(f.helpful::int)::boolean,max(f.resolved_need::int)::boolean,max(f.correction_category)
  from public.ai_queries q join public.ai_answers a on a.query_id=q.id
  left join public.ai_retrieval_results r on r.query_id=q.id
  left join public.ai_answer_citations c on c.answer_id=a.id
  left join public.ai_feedback f on f.answer_id=a.id
  where q.surface='public_research' and q.created_at>=now()-(least(365,greatest(1,p_days))*interval '1 day')
    and (select private.has_role(array['owner','admin','librarian']))
  group by q.id,q.created_at,q.language,a.terminal_state,a.latency_ms order by q.created_at desc limit 500;
$$;

revoke all on function public.record_public_ai_exchange(text,text,text,jsonb,text,text,text,text,text,text,integer,jsonb) from public;
revoke all on function public.submit_public_ai_feedback(text,text,boolean,boolean,text,text) from public;
revoke all on function public.public_ai_trace_report(integer) from public;
grant execute on function public.record_public_ai_exchange(text,text,text,jsonb,text,text,text,text,text,text,integer,jsonb) to anon,authenticated;
grant execute on function public.submit_public_ai_feedback(text,text,boolean,boolean,text,text) to anon,authenticated;
grant execute on function public.public_ai_trace_report(integer) to authenticated;

comment on function public.record_public_ai_exchange(text,text,text,jsonb,text,text,text,text,text,text,integer,jsonb)
is 'Atomically records content-minimized public RAG evidence. It stores no raw question, IP address, user agent, provider payload, or ineligible chunk.';
