-- Keep document mutation authority aligned with the governed ingestion and review APIs.
drop policy if exists knowledge_documents_insert on public.knowledge_documents;
drop policy if exists knowledge_documents_update on public.knowledge_documents;
drop policy if exists knowledge_documents_delete on public.knowledge_documents;

create policy knowledge_documents_insert
on public.knowledge_documents for insert to authenticated
with check ((select private.has_role(array['owner','admin','librarian'])));

create policy knowledge_documents_update
on public.knowledge_documents for update to authenticated
using ((select private.has_role(array['owner','admin','librarian'])))
with check ((select private.has_role(array['owner','admin','librarian'])));

create policy knowledge_documents_delete
on public.knowledge_documents for delete to authenticated
using ((select private.has_role(array['owner','admin','librarian'])));
