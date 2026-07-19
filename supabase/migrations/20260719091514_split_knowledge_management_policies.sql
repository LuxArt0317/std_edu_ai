-- Issue #122: keep one authenticated SELECT policy and split mutation policies.
drop policy knowledge_sources_manage on public.knowledge_sources;
create policy knowledge_sources_insert on public.knowledge_sources for insert to authenticated with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_sources_update on public.knowledge_sources for update to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_sources_delete on public.knowledge_sources for delete to authenticated using ((select private.has_role(array['owner','admin','librarian'])));

drop policy knowledge_documents_manage on public.knowledge_documents;
create policy knowledge_documents_insert on public.knowledge_documents for insert to authenticated with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy knowledge_documents_update on public.knowledge_documents for update to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy knowledge_documents_delete on public.knowledge_documents for delete to authenticated using ((select private.has_role(array['owner','admin','librarian','support'])));

drop policy knowledge_chunks_manage on public.knowledge_chunks;
create policy knowledge_chunks_insert on public.knowledge_chunks for insert to authenticated with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_chunks_update on public.knowledge_chunks for update to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_chunks_delete on public.knowledge_chunks for delete to authenticated using ((select private.has_role(array['owner','admin','librarian'])));
