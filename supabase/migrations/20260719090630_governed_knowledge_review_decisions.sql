-- Issue #122: atomic, audited non-public review decisions for ingested versions.
create or replace function public.review_knowledge_document(
  p_document_id uuid,
  p_decision text,
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
  v_review_status text;
  v_extraction_status text;
  v_action text;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then
    raise exception 'Knowledge review requires owner, administrator, or librarian authority';
  end if;
  if p_decision not in ('rejected','changes_requested','quarantined') then
    raise exception 'Unsupported knowledge review decision';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then
    raise exception 'A review reason of at least 12 characters is required';
  end if;

  select * into v_document from public.knowledge_documents where id=p_document_id for update;
  if not found then raise exception 'Knowledge document not found'; end if;
  if v_document.publication_status <> 'draft' then
    raise exception 'Only a draft document can receive this review decision';
  end if;

  if p_decision='quarantined' then
    v_review_status := 'changes_requested';
    v_extraction_status := 'quarantined';
    v_action := 'quarantined';
  elsif p_decision='rejected' then
    v_review_status := 'rejected';
    v_extraction_status := v_document.extraction_status;
    v_action := 'rejected';
  else
    v_review_status := 'changes_requested';
    v_extraction_status := v_document.extraction_status;
    v_action := 'changes_requested';
  end if;

  update public.knowledge_chunks set active=false where document_id=p_document_id;
  update public.knowledge_documents
  set review_status=v_review_status, extraction_status=v_extraction_status,
      reviewer_profile_id=v_actor, reviewed_at=now(), updated_at=now()
  where id=p_document_id;
  insert into public.knowledge_review_events(document_id,actor_profile_id,action,reason,before_state,after_state)
  values(p_document_id,v_actor,v_action,trim(p_reason),
    jsonb_build_object('review_status',v_document.review_status,'extraction_status',v_document.extraction_status,'publication_status',v_document.publication_status),
    jsonb_build_object('review_status',v_review_status,'extraction_status',v_extraction_status,'publication_status','draft'));
  return jsonb_build_object('document_id',p_document_id,'decision',p_decision,'review_status',v_review_status,'extraction_status',v_extraction_status,'status','complete');
end;
$$;

revoke all on function public.review_knowledge_document(uuid,text,text) from public,anon;
grant execute on function public.review_knowledge_document(uuid,text,text) to authenticated;
