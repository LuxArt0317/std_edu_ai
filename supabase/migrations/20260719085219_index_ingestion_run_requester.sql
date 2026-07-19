-- Issue #121: cover the ingestion run requester foreign key used by RLS and cleanup.
create index knowledge_ingestion_runs_requested_by_idx
  on public.knowledge_ingestion_runs(requested_by);
