create index if not exists knowledge_articles_source_profile_idx
  on public.knowledge_articles (source_profile_id)
  where source_profile_id is not null;

create index if not exists knowledge_articles_reviewer_idx
  on public.knowledge_articles (reviewed_by)
  where reviewed_by is not null;
