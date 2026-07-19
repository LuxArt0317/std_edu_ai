-- Issue #104 research completion foundation.
-- The public research surface is read-only. Authoring, review, study operations,
-- and internal evidence remain behind canonical profile roles and RLS.

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 200),
  source_type text not null check (source_type in ('website','pdf','form','api','manual','directory','map','policy','service')),
  canonical_url text not null unique check (canonical_url ~ '^https://'),
  official_domain boolean not null default false,
  authority_level text not null check (authority_level in ('primary_official','delegated_official','reviewed_internal','reference')),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  default_audience_scope text not null default 'public' check (default_audience_scope in ('public','institution','role','class','staff')),
  default_language text not null default 'zh-Hant' check (default_language in ('zh-Hant','en','mixed')),
  crawl_policy text not null default 'manual' check (crawl_policy in ('manual','scheduled','webhook','prohibited')),
  crawl_interval interval,
  robots_reviewed_at timestamptz,
  terms_reviewed_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (crawl_policy <> 'scheduled' or crawl_interval is not null),
  check (not active or robots_reviewed_at is not null)
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  logical_key text not null check (char_length(trim(logical_key)) between 2 and 240),
  title text not null check (char_length(trim(title)) between 2 and 300),
  domain text not null check (domain in ('admissions','enrollment','graduation','academic_rules','programs','administrative_services','student_services','campus_places','faq','other')),
  document_type text not null,
  language text not null check (language in ('zh-Hant','en','mixed')),
  source_url text not null check (source_url ~ '^https://'),
  content_checksum text not null check (content_checksum ~ '^[a-f0-9]{64}$'),
  source_published_at timestamptz,
  source_updated_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  version integer not null check (version > 0),
  supersedes_id uuid references public.knowledge_documents(id) on delete restrict,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','fetched','parsed','normalized','failed','quarantined')),
  review_status text not null default 'awaiting_review' check (review_status in ('awaiting_review','approved','rejected','changes_requested')),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','expired','superseded','archived')),
  sensitivity text not null default 'public' check (sensitivity in ('public','institution','restricted')),
  audience_scope text not null default 'public' check (audience_scope in ('public','institution','role','class','staff')),
  audience_roles text[] not null default '{}',
  section_id uuid references public.course_sections(id) on delete restrict,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  reviewer_profile_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  published_at timestamptz,
  review_due_at timestamptz,
  normalized_content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, logical_key, version),
  unique(source_id, content_checksum),
  check (expires_at is null or effective_at is null or expires_at > effective_at),
  check (publication_status <> 'published' or (review_status='approved' and reviewer_profile_id is not null and reviewed_at is not null and published_at is not null)),
  check (audience_scope <> 'role' or cardinality(audience_roles) > 0),
  check (audience_scope <> 'class' or section_id is not null)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_key text not null,
  heading_path text[] not null default '{}',
  ordinal integer not null check (ordinal >= 0),
  content text not null check (char_length(trim(content)) between 1 and 12000),
  content_checksum text not null check (content_checksum ~ '^[a-f0-9]{64}$'),
  token_count integer check (token_count is null or token_count > 0),
  language text not null check (language in ('zh-Hant','en','mixed')),
  embedding extensions.vector(1536),
  embedding_model text,
  source_locator text,
  metadata jsonb not null default '{}'::jsonb,
  effective_at timestamptz,
  expires_at timestamptz,
  active boolean not null default false,
  search_document tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_key),
  unique(document_id, ordinal),
  check ((embedding is null and embedding_model is null) or (embedding is not null and embedding_model is not null)),
  check (expires_at is null or effective_at is null or expires_at > effective_at)
);

create table public.knowledge_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete restrict,
  trigger_type text not null check (trigger_type in ('manual','scheduled','webhook','retry')),
  status text not null default 'discovered' check (status in ('discovered','fetched','parsed','normalized','deduplicated','awaiting_review','approved','indexed','published','failed_fetch','failed_parse','failed_embedding','rejected','superseded','expired','quarantined')),
  input_checksum text,
  output_checksum text,
  parser_version text,
  chunker_version text,
  embedding_model text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  published_count integer not null default 0 check (published_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  estimated_cost_usd numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.knowledge_review_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('submitted','approved','rejected','changes_requested','published','expired','superseded','quarantined','restored')),
  reason text not null check (char_length(trim(reason)) between 2 and 4000),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campus_sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_zh text not null,
  name_en text not null,
  center_latitude numeric(9,6),
  center_longitude numeric(9,6),
  official_source_id uuid references public.knowledge_sources(id) on delete restrict,
  verified_at timestamptz,
  active boolean not null default true
);

create table public.campus_buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.campus_sites(id) on delete restrict,
  code text not null,
  name_zh text not null,
  name_en text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  geometry jsonb not null default '{}'::jsonb,
  official_source_id uuid references public.knowledge_sources(id) on delete restrict,
  verified_at timestamptz,
  active boolean not null default true,
  unique(site_id, code)
);

create table public.campus_floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.campus_buildings(id) on delete cascade,
  level integer not null,
  label_zh text not null,
  label_en text not null,
  geometry jsonb not null default '{}'::jsonb,
  unique(building_id, level)
);

create table public.campus_places (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.campus_sites(id) on delete restrict,
  building_id uuid references public.campus_buildings(id) on delete restrict,
  floor_id uuid references public.campus_floors(id) on delete restrict,
  code text not null unique,
  name_zh text not null,
  name_en text not null,
  place_type text not null check (place_type in ('office','classroom','service','facility','landmark','entrance','restroom','elevator','stairs','parking','transit','emergency')),
  room text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  indoor_position jsonb not null default '{}'::jsonb,
  wheelchair_accessible boolean,
  contact_phone text,
  contact_email text,
  description_zh text not null default '',
  description_en text not null default '',
  official_source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  verified_at timestamptz not null,
  status text not null default 'active' check (status in ('active','temporarily_closed','inactive')),
  closure_reason text,
  updated_at timestamptz not null default now(),
  check (status <> 'temporarily_closed' or closure_reason is not null)
);

create table public.campus_place_aliases (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.campus_places(id) on delete cascade,
  language text not null check (language in ('zh-Hant','en','mixed')),
  alias text not null,
  normalized_alias text generated always as (lower(trim(alias))) stored,
  unique(place_id, language, normalized_alias)
);

create table public.campus_nodes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.campus_sites(id) on delete restrict,
  building_id uuid references public.campus_buildings(id) on delete restrict,
  floor_id uuid references public.campus_floors(id) on delete restrict,
  place_id uuid references public.campus_places(id) on delete set null,
  node_type text not null check (node_type in ('waypoint','entrance','door','intersection','elevator','stairs','ramp','destination')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  indoor_position jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table public.campus_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.campus_nodes(id) on delete cascade,
  to_node_id uuid not null references public.campus_nodes(id) on delete cascade,
  distance_m numeric(9,2) not null check (distance_m > 0),
  estimated_seconds integer not null check (estimated_seconds > 0),
  bidirectional boolean not null default true,
  environment text not null check (environment in ('indoor','outdoor','covered')),
  traversal_type text not null check (traversal_type in ('walk','stairs','elevator','ramp','crossing')),
  wheelchair_suitable boolean not null default true,
  instruction_zh text not null,
  instruction_en text not null,
  opens_at time,
  closes_at time,
  status text not null default 'active' check (status in ('active','temporarily_closed','inactive')),
  closure_reason text,
  verified_at timestamptz,
  unique(from_node_id, to_node_id),
  check (from_node_id <> to_node_id),
  check (status <> 'temporarily_closed' or closure_reason is not null)
);

create table public.campus_service_hours (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.campus_places(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  note text,
  unique(place_id, weekday),
  check (closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.ai_queries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  anonymous_session_hash text,
  surface text not null check (surface in ('public_research','authenticated_qa','authenticated_agentic')),
  language text not null check (language in ('zh-Hant','en','mixed','unknown')),
  intent text,
  query_text text,
  query_hash text not null,
  consented_research_use boolean not null default false,
  created_at timestamptz not null default now(),
  check (profile_id is not null or anonymous_session_hash is not null)
);

create table public.ai_answers (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.ai_queries(id) on delete cascade,
  answer_text text not null default '',
  terminal_state text not null check (terminal_state in ('answered','clarification','abstained','handoff','failed')),
  model text,
  prompt_version text not null,
  retriever_version text not null,
  corpus_version text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost_usd numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create table public.ai_retrieval_results (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.ai_queries(id) on delete cascade,
  chunk_id uuid not null references public.knowledge_chunks(id) on delete restrict,
  rank integer not null check (rank > 0),
  keyword_score numeric,
  vector_score numeric,
  fused_score numeric not null,
  eligible boolean not null,
  exclusion_reason text,
  unique(query_id, rank),
  unique(query_id, chunk_id)
);

create table public.ai_answer_citations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.ai_answers(id) on delete cascade,
  chunk_id uuid not null references public.knowledge_chunks(id) on delete restrict,
  claim_text text not null,
  claim_start integer,
  claim_end integer,
  created_at timestamptz not null default now(),
  unique(answer_id, chunk_id, claim_text),
  check (claim_start is null or claim_start >= 0),
  check (claim_end is null or claim_start is null or claim_end > claim_start)
);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.ai_answers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  anonymous_session_hash text,
  helpful boolean,
  resolved_need boolean,
  correction_category text check (correction_category is null or correction_category in ('incorrect','stale','missing_source','unclear','unsafe','wrong_route','other')),
  comment text check (comment is null or char_length(comment) <= 4000),
  created_at timestamptz not null default now(),
  check (profile_id is not null or anonymous_session_hash is not null)
);

create table public.ai_eval_cases (
  id uuid primary key default gen_random_uuid(),
  case_key text not null unique,
  domain text not null,
  language text not null check (language in ('zh-Hant','en','mixed')),
  query text not null,
  expected_chunk_ids uuid[] not null default '{}',
  expected_claims jsonb not null default '[]'::jsonb,
  expect_abstention boolean not null default false,
  rubric jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null,
  active boolean not null default true,
  check (expect_abstention or cardinality(expected_chunk_ids) > 0)
);

create table public.ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  corpus_version text not null,
  retriever_version text not null,
  prompt_version text not null,
  model text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_eval_runs(id) on delete cascade,
  case_id uuid not null references public.ai_eval_cases(id) on delete restrict,
  answer_id uuid references public.ai_answers(id) on delete set null,
  retrieved_chunk_ids uuid[] not null default '{}',
  reciprocal_rank numeric not null default 0,
  ndcg numeric not null default 0,
  correctness numeric,
  citation_precision numeric,
  citation_completeness numeric,
  groundedness numeric,
  abstention_correct boolean,
  latency_ms integer,
  estimated_cost_usd numeric(12,6),
  reviewer_notes text,
  unique(run_id, case_id)
);

create table public.research_studies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  purpose text not null,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','pilot','frozen','recruiting','active','analysis','completed','suspended','archived')),
  retention_days integer not null check (retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_study_versions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.research_studies(id) on delete cascade,
  version integer not null check (version > 0),
  protocol jsonb not null,
  consent_text_zh text not null,
  consent_text_en text not null,
  analysis_plan jsonb not null,
  frozen_at timestamptz,
  frozen_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(study_id, version),
  check ((frozen_at is null) = (frozen_by is null))
);

create table public.research_participants (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.research_studies(id) on delete restrict,
  participant_code text not null,
  contact_ciphertext text,
  population_role text not null check (population_role in ('student','prospective_student','visitor','faculty','administrative_staff')),
  familiarity_level text not null check (familiarity_level in ('new','occasional','frequent')),
  status text not null default 'invited' check (status in ('invited','consented','active','completed','withdrawn','deleted')),
  created_at timestamptz not null default now(),
  unique(study_id, participant_code)
);

create table public.research_consent_records (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.research_participants(id) on delete cascade,
  study_version_id uuid not null references public.research_study_versions(id) on delete restrict,
  consented boolean not null,
  consented_at timestamptz not null,
  withdrawn_at timestamptz,
  ip_hash text,
  user_agent_family text,
  check (withdrawn_at is null or withdrawn_at >= consented_at)
);

create table public.research_tasks (
  id uuid primary key default gen_random_uuid(),
  study_version_id uuid not null references public.research_study_versions(id) on delete cascade,
  task_key text not null,
  domain text not null,
  variant_a text not null,
  variant_b text not null,
  gold_answer jsonb not null,
  max_seconds integer not null check (max_seconds > 0),
  ordinal integer not null check (ordinal >= 0),
  unique(study_version_id, task_key)
);

create table public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.research_participants(id) on delete restrict,
  study_version_id uuid not null references public.research_study_versions(id) on delete restrict,
  sequence text not null check (sequence in ('AB','BA')),
  status text not null default 'started' check (status in ('started','paused','completed','abandoned','withdrawn')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(participant_id, study_version_id)
);

create table public.research_task_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  task_id uuid not null references public.research_tasks(id) on delete restrict,
  condition text not null check (condition in ('current_site','enhanced_platform')),
  variant text not null check (variant in ('A','B')),
  success text not null check (success in ('complete','partial','failed','abandoned')),
  duration_ms integer not null check (duration_ms >= 0),
  navigation_steps integer not null default 0 check (navigation_steps >= 0),
  wrong_page_visits integer not null default 0 check (wrong_page_visits >= 0),
  reformulations integer not null default 0 check (reformulations >= 0),
  backtracks integer not null default 0 check (backtracks >= 0),
  assistance_requests integer not null default 0 check (assistance_requests >= 0),
  source_identification_correct boolean,
  seq_score smallint check (seq_score between 1 and 7),
  notes text,
  created_at timestamptz not null default now(),
  unique(session_id, task_id, condition)
);

create table public.research_questionnaires (
  id uuid primary key default gen_random_uuid(),
  study_version_id uuid not null references public.research_study_versions(id) on delete cascade,
  instrument text not null check (instrument in ('SUS','SEQ','custom','open_feedback')),
  language text not null check (language in ('zh-Hant','en')),
  version text not null,
  scoring_spec jsonb not null default '{}'::jsonb,
  unique(study_version_id, instrument, language, version)
);

create table public.research_questionnaire_items (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.research_questionnaires(id) on delete cascade,
  item_key text not null,
  ordinal integer not null,
  prompt text not null,
  response_type text not null check (response_type in ('likert5','likert7','text','boolean')),
  reverse_scored boolean not null default false,
  construct text,
  unique(questionnaire_id, item_key),
  unique(questionnaire_id, ordinal)
);

create table public.research_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  questionnaire_id uuid not null references public.research_questionnaires(id) on delete restrict,
  item_id uuid not null references public.research_questionnaire_items(id) on delete restrict,
  condition text check (condition is null or condition in ('current_site','enhanced_platform')),
  numeric_value numeric,
  text_value text,
  created_at timestamptz not null default now(),
  unique(session_id, item_id, condition),
  check ((numeric_value is null) <> (text_value is null))
);

create table public.administrative_inquiry_metrics (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.research_studies(id) on delete restrict,
  window_type text not null check (window_type in ('baseline','pilot')),
  period_start date not null,
  period_end date not null,
  category text not null,
  inquiry_count integer not null check (inquiry_count >= 0),
  duplicate_count integer not null check (duplicate_count >= 0),
  confirmed_resolved_count integer not null check (confirmed_resolved_count >= 0),
  escalated_count integer not null check (escalated_count >= 0),
  total_first_response_seconds bigint not null default 0 check (total_first_response_seconds >= 0),
  total_handling_seconds bigint not null default 0 check (total_handling_seconds >= 0),
  source_note text not null,
  entered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(study_id, window_type, period_start, period_end, category),
  check (period_end >= period_start),
  check (duplicate_count <= inquiry_count and confirmed_resolved_count <= inquiry_count and escalated_count <= inquiry_count)
);

-- Indexes for foreign-key joins, freshness queues, retrieval, routing, and study analysis.
create index knowledge_sources_owner_idx on public.knowledge_sources(owner_profile_id);
create index knowledge_sources_department_idx on public.knowledge_sources(department_id);
create index knowledge_documents_source_status_idx on public.knowledge_documents(source_id, publication_status, review_status);
create index knowledge_documents_review_due_idx on public.knowledge_documents(review_due_at) where publication_status='published';
create index knowledge_documents_audience_roles_idx on public.knowledge_documents using gin(audience_roles);
create index knowledge_chunks_document_idx on public.knowledge_chunks(document_id, ordinal);
create index knowledge_chunks_search_idx on public.knowledge_chunks using gin(search_document);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null and active;
create index knowledge_ingestion_source_idx on public.knowledge_ingestion_runs(source_id, created_at desc);
create index knowledge_review_document_idx on public.knowledge_review_events(document_id, created_at desc);
create index campus_places_site_type_idx on public.campus_places(site_id, place_type, status);
create index campus_place_alias_lookup_idx on public.campus_place_aliases(normalized_alias);
create index campus_nodes_site_idx on public.campus_nodes(site_id, active);
create index campus_edges_from_idx on public.campus_edges(from_node_id, status);
create index campus_edges_to_idx on public.campus_edges(to_node_id, status);
create index ai_queries_created_idx on public.ai_queries(created_at desc);
create index ai_answers_query_idx on public.ai_answers(query_id);
create index ai_retrieval_query_idx on public.ai_retrieval_results(query_id, rank);
create index ai_citations_answer_idx on public.ai_answer_citations(answer_id);
create index ai_eval_results_run_idx on public.ai_eval_results(run_id);
create index research_participants_study_idx on public.research_participants(study_id, status);
create index research_sessions_version_idx on public.research_sessions(study_version_id, status);
create index research_attempts_session_idx on public.research_task_attempts(session_id);
create index research_responses_session_idx on public.research_responses(session_id);
create index administrative_metrics_study_idx on public.administrative_inquiry_metrics(study_id, window_type, period_start);

-- Existing project trigger function keeps mutable rows consistent.
create trigger knowledge_sources_updated_at before update on public.knowledge_sources for each row execute function public.set_updated_at();
create trigger knowledge_documents_updated_at before update on public.knowledge_documents for each row execute function public.set_updated_at();
create trigger campus_places_updated_at before update on public.campus_places for each row execute function public.set_updated_at();
create trigger research_studies_updated_at before update on public.research_studies for each row execute function public.set_updated_at();

-- All new public-schema tables use RLS, even where Data API grants are withheld.
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_ingestion_runs enable row level security;
alter table public.knowledge_review_events enable row level security;
alter table public.campus_sites enable row level security;
alter table public.campus_buildings enable row level security;
alter table public.campus_floors enable row level security;
alter table public.campus_places enable row level security;
alter table public.campus_place_aliases enable row level security;
alter table public.campus_nodes enable row level security;
alter table public.campus_edges enable row level security;
alter table public.campus_service_hours enable row level security;
alter table public.ai_queries enable row level security;
alter table public.ai_answers enable row level security;
alter table public.ai_retrieval_results enable row level security;
alter table public.ai_answer_citations enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_eval_cases enable row level security;
alter table public.ai_eval_runs enable row level security;
alter table public.ai_eval_results enable row level security;
alter table public.research_studies enable row level security;
alter table public.research_study_versions enable row level security;
alter table public.research_participants enable row level security;
alter table public.research_consent_records enable row level security;
alter table public.research_tasks enable row level security;
alter table public.research_sessions enable row level security;
alter table public.research_task_attempts enable row level security;
alter table public.research_questionnaires enable row level security;
alter table public.research_questionnaire_items enable row level security;
alter table public.research_responses enable row level security;
alter table public.administrative_inquiry_metrics enable row level security;

-- Public reads are restricted to approved, current public content and active verified places.
create policy knowledge_sources_public_read on public.knowledge_sources for select to anon using (active and default_audience_scope='public');
create policy knowledge_documents_public_read on public.knowledge_documents for select to anon using (
  publication_status='published' and review_status='approved' and sensitivity='public' and audience_scope='public'
  and (effective_at is null or effective_at <= now()) and (expires_at is null or expires_at > now())
  and exists(select 1 from public.knowledge_sources s where s.id=source_id and s.active and s.default_audience_scope='public')
);
create policy campus_sites_public_read on public.campus_sites for select to anon using (active and verified_at is not null);
create policy campus_buildings_public_read on public.campus_buildings for select to anon using (active and verified_at is not null);
create policy campus_floors_public_read on public.campus_floors for select to anon using (exists(select 1 from public.campus_buildings b where b.id=building_id and b.active and b.verified_at is not null));
create policy campus_places_public_read on public.campus_places for select to anon using (status <> 'inactive');
create policy campus_place_aliases_public_read on public.campus_place_aliases for select to anon using (exists(select 1 from public.campus_places p where p.id=place_id and p.status <> 'inactive'));
create policy campus_nodes_public_read on public.campus_nodes for select to anon using (active);
create policy campus_edges_public_read on public.campus_edges for select to anon using (status <> 'inactive');
create policy campus_hours_public_read on public.campus_service_hours for select to anon using (exists(select 1 from public.campus_places p where p.id=place_id and p.status <> 'inactive'));

-- Authenticated users inherit public reads and may see institution/role/class content only when eligible.
create policy knowledge_sources_authenticated_read on public.knowledge_sources for select to authenticated using (active or (select private.has_role(array['owner','admin','librarian','support'])));
create policy knowledge_documents_authenticated_read on public.knowledge_documents for select to authenticated using (
  (publication_status='published' and review_status='approved' and (expires_at is null or expires_at > now()) and (
    audience_scope in ('public','institution')
    or (audience_scope='role' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role=any(audience_roles)))
    or (audience_scope='class' and exists(select 1 from public.section_enrollments e join public.students st on st.id=e.student_id where e.section_id=knowledge_documents.section_id and st.profile_id=(select auth.uid()) and e.status='enrolled'))
    or (audience_scope='staff' and (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','department_head','faculty','advisor','admissions','finance','support','librarian'])))
  )) or (select private.has_role(array['owner','admin','librarian','support']))
);
create policy knowledge_chunks_authenticated_read on public.knowledge_chunks for select to authenticated using (
  exists(select 1 from public.knowledge_documents d where d.id=document_id)
);

-- Knowledge managers can manage sources/documents/runs; reviews remain append-only.
create policy knowledge_sources_manage on public.knowledge_sources for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_documents_manage on public.knowledge_documents for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy knowledge_chunks_manage on public.knowledge_chunks for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_ingestion_manage on public.knowledge_ingestion_runs for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy knowledge_review_read on public.knowledge_review_events for select to authenticated using ((select private.has_role(array['owner','admin','librarian','support'])));
create policy knowledge_review_insert on public.knowledge_review_events for insert to authenticated with check (actor_profile_id=(select auth.uid()) and (select private.has_role(array['owner','admin','librarian','support'])));

-- Campus editors are limited to governance/knowledge roles; authenticated reads mirror public visibility.
create policy campus_authenticated_read_sites on public.campus_sites for select to authenticated using (active or (select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_authenticated_read_buildings on public.campus_buildings for select to authenticated using (active or (select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_authenticated_read_floors on public.campus_floors for select to authenticated using (true);
create policy campus_authenticated_read_places on public.campus_places for select to authenticated using (status <> 'inactive' or (select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_authenticated_read_aliases on public.campus_place_aliases for select to authenticated using (true);
create policy campus_authenticated_read_nodes on public.campus_nodes for select to authenticated using (active or (select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_authenticated_read_edges on public.campus_edges for select to authenticated using (status <> 'inactive' or (select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_authenticated_read_hours on public.campus_service_hours for select to authenticated using (true);
create policy campus_manage_sites on public.campus_sites for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_buildings on public.campus_buildings for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_floors on public.campus_floors for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_places on public.campus_places for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_aliases on public.campus_place_aliases for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_nodes on public.campus_nodes for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_edges on public.campus_edges for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));
create policy campus_manage_hours on public.campus_service_hours for all to authenticated using ((select private.has_role(array['owner','admin','librarian','support']))) with check ((select private.has_role(array['owner','admin','librarian','support'])));

-- AI evidence is user-owned; evaluation is limited to research/governance roles.
create policy ai_queries_owner_read on public.ai_queries for select to authenticated using (profile_id=(select auth.uid()) or (select private.has_role(array['owner','admin','librarian'])));
create policy ai_queries_owner_insert on public.ai_queries for insert to authenticated with check (profile_id=(select auth.uid()));
create policy ai_answers_owner_read on public.ai_answers for select to authenticated using (exists(select 1 from public.ai_queries q where q.id=query_id and (q.profile_id=(select auth.uid()) or (select private.has_role(array['owner','admin','librarian'])))));
create policy ai_retrieval_owner_read on public.ai_retrieval_results for select to authenticated using (exists(select 1 from public.ai_queries q where q.id=query_id and (q.profile_id=(select auth.uid()) or (select private.has_role(array['owner','admin','librarian'])))));
create policy ai_citations_owner_read on public.ai_answer_citations for select to authenticated using (exists(select 1 from public.ai_answers a join public.ai_queries q on q.id=a.query_id where a.id=answer_id and (q.profile_id=(select auth.uid()) or (select private.has_role(array['owner','admin','librarian'])))));
create policy ai_feedback_owner_read on public.ai_feedback for select to authenticated using (profile_id=(select auth.uid()) or (select private.has_role(array['owner','admin','librarian'])));
create policy ai_feedback_owner_insert on public.ai_feedback for insert to authenticated with check (profile_id=(select auth.uid()));
create policy ai_eval_cases_manage on public.ai_eval_cases for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_runs_manage on public.ai_eval_runs for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_results_manage on public.ai_eval_results for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));

-- Study and workload data are restricted to the protected research/governance group.
create policy research_studies_manage on public.research_studies for all to authenticated using ((select private.has_role(array['owner','admin','president','vice_president','dean','librarian']))) with check ((select private.has_role(array['owner','admin','president','vice_president','dean','librarian'])));
create policy research_versions_manage on public.research_study_versions for all to authenticated using ((select private.has_role(array['owner','admin','president','vice_president','dean','librarian']))) with check ((select private.has_role(array['owner','admin','president','vice_president','dean','librarian'])));
create policy research_participants_manage on public.research_participants for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_consent_manage on public.research_consent_records for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_tasks_manage on public.research_tasks for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_sessions_manage on public.research_sessions for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_attempts_manage on public.research_task_attempts for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_questionnaires_manage on public.research_questionnaires for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_items_manage on public.research_questionnaire_items for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy research_responses_manage on public.research_responses for all to authenticated using ((select private.has_role(array['owner','admin','librarian']))) with check ((select private.has_role(array['owner','admin','librarian'])));
create policy administrative_metrics_manage on public.administrative_inquiry_metrics for all to authenticated using ((select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian']))) with check (entered_by=(select auth.uid()) and (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian'])));

-- Explicit grants follow the 2026 Data API behavior; no table is assumed exposed.
grant select on public.knowledge_sources, public.knowledge_documents,
  public.campus_sites, public.campus_buildings, public.campus_floors, public.campus_places,
  public.campus_place_aliases, public.campus_nodes, public.campus_edges, public.campus_service_hours to anon;

grant select,insert,update,delete on public.knowledge_sources, public.knowledge_documents, public.knowledge_chunks,
  public.knowledge_ingestion_runs, public.campus_sites, public.campus_buildings, public.campus_floors,
  public.campus_places, public.campus_place_aliases, public.campus_nodes, public.campus_edges,
  public.campus_service_hours, public.ai_eval_cases, public.ai_eval_runs, public.ai_eval_results,
  public.research_studies, public.research_study_versions, public.research_participants,
  public.research_consent_records, public.research_tasks, public.research_sessions,
  public.research_task_attempts, public.research_questionnaires, public.research_questionnaire_items,
  public.research_responses, public.administrative_inquiry_metrics to authenticated;
grant select,insert on public.knowledge_review_events, public.ai_queries, public.ai_feedback to authenticated;
grant select on public.ai_answers, public.ai_retrieval_results, public.ai_answer_citations to authenticated;

comment on table public.knowledge_sources is 'Governed registry of authoritative institutional origins for Issue #104 RAG.';
comment on table public.knowledge_chunks is 'Versioned retrieval units; public access occurs through the server retrieval boundary, not direct anonymous table grants.';
comment on table public.research_participants is 'Pseudonymous study identity; contact data is optional encrypted material and is separated from responses.';
