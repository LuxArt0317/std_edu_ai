-- #82: Class knowledge follows both profile-linked and SIS-roster-linked enrollment.
-- #82: Query-term OR matching, no rank credit for zero matches, bounded document diversity.
-- #82: Use caller RLS and published/current evidence even for knowledge managers.
create or replace function public.search_assistant_knowledge(
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
security invoker
set search_path = ''
as $$
  with query_terms as (
    select coalesce(string_agg(quote_literal(term),' | '),'') as query from (
      select distinct token as term
      from regexp_split_to_table(lower(left(trim(p_query),500)), '[^[:alnum:]_一-龥]+') token
      where char_length(token)>1 and token not in ('what','which','where','when','how','does','the','are','can','could','please','tell','about','have','with','for','and','from','this','that','your','my','is','of','to','me')
      limit 24
    ) words
  ), eligible as (
    select
      c.id as chunk_id, c.document_id, d.source_id, s.name as source_name,
      s.authority_level, d.title as document_title, d.domain as document_domain,
      d.language as document_language, d.source_url, c.source_locator,
      d.effective_at, d.reviewed_at, c.content, d.version as document_version,
      c.content_checksum,
      ts_rank_cd(c.search_document, (select to_tsquery('simple',query) from query_terms), 32)::real as keyword_score,
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
      and (select auth.uid()) is not null
      and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.account_status='active')
      and (d.audience_scope in ('public','institution')
        or (d.audience_scope='role' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role=any(d.audience_roles)))
        or (d.audience_scope='staff' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role<>'student'))
        or (d.audience_scope='class' and (exists(select 1 from public.section_enrollments e where e.section_id=d.section_id and (e.student_profile_id=(select auth.uid()) or exists(select 1 from public.students st where st.id=e.student_id and st.profile_id=(select auth.uid()))) and e.status='enrolled') or (select private.can_manage_section(d.section_id))))
        or exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role in ('owner','admin','librarian')))
      and (d.sensitivity<>'restricted' or d.audience_scope in ('role','class','staff') or exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role in ('owner','admin','librarian')))
      and (d.review_due_at is null or d.review_due_at>now())
      and d.extraction_status='normalized'
      and (d.effective_at is null or d.effective_at<=now())
      and (d.expires_at is null or d.expires_at>now())
      and (c.effective_at is null or c.effective_at<=now())
      and (c.expires_at is null or c.expires_at>now())
      and (p_domain is null or d.domain=p_domain)
  ), candidates as (
    select * from eligible where keyword_score>0 or exact_score>0 or vector_score>=0.42
  ), ranked as (
    select *,
      row_number() over(order by keyword_score desc, chunk_id) as keyword_rank,
      row_number() over(order by vector_score desc, chunk_id) as vector_rank
    from candidates
  ), fused as (
    select *,
      (
        case when keyword_score>0 then 0.42*(1.0/(60+keyword_rank)) else 0 end +
        case when vector_score>=0.42 then 0.42*(1.0/(60+vector_rank)) else 0 end +
        0.08*exact_score +
        authority_boost +
        language_boost
      )::real as fused_score
    from ranked
  )
  , diverse as (
    select *, row_number() over(partition by document_id order by fused_score desc,vector_score desc,keyword_score desc,chunk_id) as within_document
    from fused
  )
  select chunk_id,document_id,source_id,source_name,authority_level,document_title,
    document_domain,document_language,source_url,source_locator,effective_at,reviewed_at,
    content,keyword_score,vector_score,exact_score,fused_score,document_version,content_checksum
  from diverse where within_document<=2
  order by fused_score desc, vector_score desc, keyword_score desc, chunk_id
  limit least(20,greatest(1,p_limit));
$$;

revoke all on function public.search_assistant_knowledge(text,extensions.vector,text,text,integer) from public;
grant execute on function public.search_assistant_knowledge(text,extensions.vector,text,text,integer) to authenticated;


