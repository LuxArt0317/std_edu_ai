-- Issue #122: cover document relationships used by review, lineage, and RLS.
create index knowledge_documents_owner_idx on public.knowledge_documents(owner_profile_id);
create index knowledge_documents_reviewer_idx on public.knowledge_documents(reviewer_profile_id) where reviewer_profile_id is not null;
create index knowledge_documents_section_idx on public.knowledge_documents(section_id) where section_id is not null;
create index knowledge_documents_supersedes_idx on public.knowledge_documents(supersedes_id) where supersedes_id is not null;
