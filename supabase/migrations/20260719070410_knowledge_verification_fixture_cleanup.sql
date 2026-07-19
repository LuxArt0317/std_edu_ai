create or replace function public.purge_knowledge_verification_fixture(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.knowledge_sources%rowtype;
  v_documents integer;
  v_events integer;
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner'])) then
    raise exception 'Only the protected owner can purge a verification fixture';
  end if;
  select * into v_source from public.knowledge_sources where id=p_source_id for update;
  if not found
    or v_source.name not like 'Ingestion verification %'
    or v_source.canonical_url not like 'https://www.stu.edu.tw/ingestion/%'
  then
    raise exception 'Only a recognized reversible ingestion fixture can be purged';
  end if;
  delete from public.knowledge_review_events
  where document_id in (select id from public.knowledge_documents where source_id=p_source_id);
  get diagnostics v_events = row_count;
  delete from public.knowledge_documents where source_id=p_source_id;
  get diagnostics v_documents = row_count;
  delete from public.knowledge_sources where id=p_source_id;
  return jsonb_build_object('source_id',p_source_id,'documents',v_documents,'review_events',v_events,'purged',true);
end;
$$;

revoke all on function public.purge_knowledge_verification_fixture(uuid) from public, anon;
grant execute on function public.purge_knowledge_verification_fixture(uuid) to authenticated;
