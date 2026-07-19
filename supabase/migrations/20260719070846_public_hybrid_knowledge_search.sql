create or replace function public.search_public_knowledge(
  p_query text,
  p_embedding extensions.vector(1536),
  p_language text default 'unknown',
  p_domain text default null,
  p_limit integer default 8
)
returns table(
  chunk_id uuid,
  document_id uuid,
  source_id uuid,
  source_name text,
  authority_level text,
  document_title text,
  document_domain text,
  document_language text,
  source_url text,
  source_locator text,
  effective_at timestamptz,
  reviewed_at timestamptz,
  content text,
  keyword_score real,
  vector_score real,
  exact_score real,
  fused_score real,
  document_version integer,
  content_checksum text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      c.id as chunk_id, c.document_id, d.source_id, s.name as source_name,
      s.authority_level, d.title as document_title, d.domain as document_domain,
      d.language as document_language, d.source_url, c.source_locator,
      d.effective_at, d.reviewed_at, c.content, d.version as document_version,
      c.content_checksum,
      ts_rank_cd(c.search_document, websearch_to_tsquery('simple', left(trim(p_query),500)), 32)::real as keyword_score,
      greatest(0,1-(c.embedding operator(extensions.<=>) p_embedding))::real as vector_score,
      case
        when lower(trim(d.title))=lower(trim(p_query)) then 1.0
        when lower(d.title) like '%'||lower(trim(p_query))||'%' then 0.8
        when lower(c.content) like '%'||lower(trim(p_query))||'%' then 0.6
        else 0.0
      end::real as exact_score,
      case s.authority_level
        when 'primary_official' then 0.08
        when 'delegated_official' then 0.05
        when 'reviewed_internal' then 0.02
        else 0.0
      end::real as authority_boost,
      case when d.language=p_language or d.language='mixed' or p_language='unknown' then 0.03 else 0 end::real as language_boost
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id=c.document_id
    join public.knowledge_sources s on s.id=d.source_id
    where c.active
      and c.embedding is not null
      and s.active and s.robots_reviewed_at is not null
      and d.review_status='approved' and d.publication_status='published'
      and d.sensitivity='public' and d.audience_scope='public'
      and (d.effective_at is null or d.effective_at<=now())
      and (d.expires_at is null or d.expires_at>now())
      and (c.effective_at is null or c.effective_at<=now())
      and (c.expires_at is null or c.expires_at>now())
      and (p_domain is null or d.domain=p_domain)
  ), ranked as (
    select *,
      row_number() over(order by keyword_score desc, chunk_id) as keyword_rank,
      row_number() over(order by vector_score desc, chunk_id) as vector_rank
    from eligible
  ), fused as (
    select *,
      (
        0.42*(1.0/(60+keyword_rank)) +
        0.42*(1.0/(60+vector_rank)) +
        0.08*exact_score +
        authority_boost +
        language_boost
      )::real as fused_score
    from ranked
  )
  select chunk_id,document_id,source_id,source_name,authority_level,document_title,
    document_domain,document_language,source_url,source_locator,effective_at,reviewed_at,
    content,keyword_score,vector_score,exact_score,fused_score,document_version,content_checksum
  from fused
  order by fused_score desc, vector_score desc, keyword_score desc, chunk_id
  limit least(20,greatest(1,p_limit));
$$;

revoke all on function public.search_public_knowledge(text,extensions.vector,text,text,integer) from public;
grant execute on function public.search_public_knowledge(text,extensions.vector,text,text,integer) to anon, authenticated;

comment on function public.search_public_knowledge(text,extensions.vector,text,text,integer)
is 'Public research retrieval boundary. It returns only active, approved, published, public, effective, unexpired chunks from active governed sources.';
