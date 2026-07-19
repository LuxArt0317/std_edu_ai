create or replace function public.publish_knowledge_document(
  p_document_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_document public.knowledge_documents%rowtype;
  v_superseded integer := 0;
  v_chunks integer := 0;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then
    raise exception 'Knowledge publication requires reviewer authority';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then
    raise exception 'A publication reason of at least 12 characters is required';
  end if;

  select d.* into v_document
  from public.knowledge_documents d
  join public.knowledge_sources s on s.id=d.source_id
  where d.id=p_document_id and s.active
  for update of d;
  if not found then raise exception 'Document or active governed source not found'; end if;
  if v_document.publication_status not in ('draft','expired','superseded') then
    raise exception 'Document is not in a publishable state';
  end if;
  if v_document.expires_at is not null and v_document.expires_at <= now() then
    raise exception 'An expired document cannot be published';
  end if;
  if v_document.effective_at is null or v_document.review_due_at is null then
    raise exception 'Effective and review due dates are required';
  end if;
  if v_document.sensitivity='public' and v_document.audience_scope<>'public' then
    raise exception 'Public sensitivity requires public audience scope';
  end if;

  select count(*) into v_chunks from public.knowledge_chunks
  where document_id=p_document_id and embedding is not null;
  if v_chunks=0 then raise exception 'Document has no embedded chunks'; end if;

  update public.knowledge_chunks c set active=false
  where c.document_id in (
    select d.id from public.knowledge_documents d
    where d.source_id=v_document.source_id
      and d.logical_key=v_document.logical_key
      and d.id<>p_document_id
      and d.publication_status='published'
  );
  update public.knowledge_documents d
  set publication_status='superseded', updated_at=now()
  where d.source_id=v_document.source_id
    and d.logical_key=v_document.logical_key
    and d.id<>p_document_id
    and d.publication_status='published';
  get diagnostics v_superseded = row_count;

  update public.knowledge_documents
  set review_status='approved', publication_status='published',
      reviewer_profile_id=v_actor, reviewed_at=now(), published_at=now(), updated_at=now()
  where id=p_document_id;
  update public.knowledge_chunks set active=true where document_id=p_document_id;
  insert into public.knowledge_review_events(document_id,actor_profile_id,action,reason,before_state,after_state)
  values(p_document_id,v_actor,'published',trim(p_reason),
    jsonb_build_object('review_status',v_document.review_status,'publication_status',v_document.publication_status),
    jsonb_build_object('review_status','approved','publication_status','published','active_chunks',v_chunks,'superseded_versions',v_superseded));

  return jsonb_build_object('document_id',p_document_id,'active_chunks',v_chunks,'superseded_versions',v_superseded,'status','published');
end;
$$;

create or replace function public.rollback_knowledge_document(
  p_document_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.knowledge_documents%rowtype;
  v_current_ids uuid[];
  v_chunks integer;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then
    raise exception 'Knowledge rollback requires reviewer authority';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then
    raise exception 'A rollback reason of at least 12 characters is required';
  end if;
  select * into v_target from public.knowledge_documents where id=p_document_id for update;
  if not found or v_target.publication_status not in ('superseded','expired') then
    raise exception 'Only a prior superseded or expired version can be restored';
  end if;
  if v_target.expires_at is not null and v_target.expires_at <= now() then
    raise exception 'The selected prior version is expired';
  end if;
  select count(*) into v_chunks from public.knowledge_chunks where document_id=p_document_id and embedding is not null;
  if v_chunks=0 then raise exception 'The selected version has no embedded chunks'; end if;

  select coalesce(array_agg(id),'{}'::uuid[]) into v_current_ids
  from public.knowledge_documents
  where source_id=v_target.source_id and logical_key=v_target.logical_key and publication_status='published' and id<>p_document_id;
  update public.knowledge_chunks set active=false where document_id=any(v_current_ids);
  update public.knowledge_documents set publication_status='superseded', updated_at=now() where id=any(v_current_ids);
  update public.knowledge_documents
  set review_status='approved', publication_status='published', reviewer_profile_id=v_actor,
      reviewed_at=now(), published_at=now(), updated_at=now()
  where id=p_document_id;
  update public.knowledge_chunks set active=true where document_id=p_document_id;
  insert into public.knowledge_review_events(document_id,actor_profile_id,action,reason,before_state,after_state)
  values(p_document_id,v_actor,'restored',trim(p_reason),
    jsonb_build_object('publication_status',v_target.publication_status),
    jsonb_build_object('publication_status','published','active_chunks',v_chunks,'replaced_document_ids',v_current_ids));
  return jsonb_build_object('document_id',p_document_id,'active_chunks',v_chunks,'replaced_document_ids',v_current_ids,'status','published');
end;
$$;

revoke all on function public.publish_knowledge_document(uuid,text) from public, anon;
revoke all on function public.rollback_knowledge_document(uuid,text) from public, anon;
grant execute on function public.publish_knowledge_document(uuid,text) to authenticated;
grant execute on function public.rollback_knowledge_document(uuid,text) to authenticated;
