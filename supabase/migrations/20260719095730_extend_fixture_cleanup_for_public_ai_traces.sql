-- Issue #123: research traces intentionally restrict deletion of cited chunks.
-- The protected, name/URL-guarded verification cleanup is the only exception:
-- it removes complete synthetic traces before removing their fixture corpus.
create or replace function public.purge_knowledge_verification_fixture(p_source_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_source public.knowledge_sources%rowtype;
  v_documents integer;
  v_events integer;
  v_runs integer;
  v_attempts integer;
  v_traces integer;
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner'])) then
    raise exception 'Only the protected owner can purge a verification fixture';
  end if;
  select * into v_source from public.knowledge_sources where id=p_source_id for update;
  if not found or v_source.name not like 'Ingestion verification %' or not (
    v_source.canonical_url like 'https://www.stu.edu.tw/ingestion/%'
    or v_source.canonical_url like 'https://www.stu.best/research-fixtures/issue122-%'
  ) then
    raise exception 'Only a recognized reversible ingestion fixture can be purged';
  end if;

  select count(distinct q.id) into v_traces
  from public.ai_queries q
  left join public.ai_retrieval_results r on r.query_id=q.id
  left join public.knowledge_chunks rc on rc.id=r.chunk_id
  left join public.knowledge_documents rd on rd.id=rc.document_id
  left join public.ai_answers a on a.query_id=q.id
  left join public.ai_answer_citations c on c.answer_id=a.id
  left join public.knowledge_chunks cc on cc.id=c.chunk_id
  left join public.knowledge_documents cd on cd.id=cc.document_id
  where rd.source_id=p_source_id or cd.source_id=p_source_id;

  delete from public.ai_queries q where q.id in (
    select r.query_id from public.ai_retrieval_results r
    join public.knowledge_chunks c on c.id=r.chunk_id
    join public.knowledge_documents d on d.id=c.document_id
    where d.source_id=p_source_id
    union
    select a.query_id from public.ai_answers a
    join public.ai_answer_citations ac on ac.answer_id=a.id
    join public.knowledge_chunks c on c.id=ac.chunk_id
    join public.knowledge_documents d on d.id=c.document_id
    where d.source_id=p_source_id
  );

  select count(*) into v_attempts from public.knowledge_ingestion_attempts
  where run_id in(select id from public.knowledge_ingestion_runs where source_id=p_source_id);
  delete from public.knowledge_ingestion_runs where source_id=p_source_id;
  get diagnostics v_runs=row_count;
  delete from public.knowledge_review_events where document_id in(
    select id from public.knowledge_documents where source_id=p_source_id
  );
  get diagnostics v_events=row_count;
  delete from public.knowledge_documents where source_id=p_source_id;
  get diagnostics v_documents=row_count;
  delete from public.knowledge_sources where id=p_source_id;
  return jsonb_build_object(
    'source_id',p_source_id,
    'documents',v_documents,
    'review_events',v_events,
    'runs',v_runs,
    'attempts',v_attempts,
    'public_ai_traces',v_traces,
    'purged',true
  );
end;$$;

revoke all on function public.purge_knowledge_verification_fixture(uuid) from public,anon;
grant execute on function public.purge_knowledge_verification_fixture(uuid) to authenticated;
