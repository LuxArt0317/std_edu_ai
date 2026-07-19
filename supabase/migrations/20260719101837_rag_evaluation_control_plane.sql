-- Issue #124: immutable, reviewable RAG evaluation control plane.
-- Existing ai_eval_* rows remain readable; new production evaluation must use a dataset version.

create table public.ai_eval_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_eval_dataset_versions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.ai_eval_datasets(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','frozen','retired')),
  required_case_count integer not null default 150 check (required_case_count >= 150),
  checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  coverage jsonb not null default '{}'::jsonb,
  frozen_at timestamptz,
  frozen_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(dataset_id, version),
  check ((status = 'frozen') = (frozen_at is not null and frozen_by is not null and checksum is not null))
);

alter table public.ai_eval_cases
  add column dataset_version_id uuid references public.ai_eval_dataset_versions(id) on delete restrict,
  add column author_id uuid references public.profiles(id) on delete restrict,
  add column failure_class text not null default 'answerable' check (failure_class in ('answerable','ambiguous','conflict','expired','private','unanswerable','official_decision')),
  add column critical boolean not null default false,
  add column expected_terminal_state text not null default 'answered' check (expected_terminal_state in ('answered','clarification','abstained','handoff')),
  add column forbidden_chunk_ids uuid[] not null default '{}',
  add column case_checksum text check (case_checksum is null or case_checksum ~ '^[0-9a-f]{64}$'),
  add column lifecycle_status text not null default 'legacy' check (lifecycle_status in ('draft','review','eligible','rejected','legacy')),
  add column updated_at timestamptz not null default now();
alter table public.ai_eval_cases alter column reviewed_by drop not null;
alter table public.ai_eval_cases alter column reviewed_at drop not null;

create table public.ai_eval_case_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.ai_eval_cases(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approve','request_changes','reject')),
  evidence_accuracy numeric(4,3) not null check (evidence_accuracy between 0 and 1),
  rubric_clarity numeric(4,3) not null check (rubric_clarity between 0 and 1),
  notes text not null check (char_length(btrim(notes)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique(case_id, reviewer_id)
);

alter table public.ai_eval_runs
  add column dataset_version_id uuid references public.ai_eval_dataset_versions(id) on delete restrict,
  add column evaluator_version text,
  add column top_k integer not null default 5 check (top_k between 1 and 20),
  add column configuration_checksum text check (configuration_checksum is null or configuration_checksum ~ '^[0-9a-f]{64}$'),
  add column gate_status text not null default 'pending' check (gate_status in ('pending','passed','failed','invalid')),
  add column baseline_run_id uuid references public.ai_eval_runs(id) on delete restrict,
  add column failure_message text check (failure_message is null or char_length(failure_message) <= 2000);

alter table public.ai_eval_results
  add column recall_at_k numeric(8,6) check (recall_at_k between 0 and 1),
  add column precision_at_k numeric(8,6) check (precision_at_k between 0 and 1),
  add column citation_supported_count integer not null default 0 check (citation_supported_count >= 0),
  add column citation_total_count integer not null default 0 check (citation_total_count >= 0),
  add column expected_citation_count integer not null default 0 check (expected_citation_count >= 0),
  add column supported_answer_correctness numeric(8,6) check (supported_answer_correctness between 0 and 1),
  add column unsupported_material_claims integer not null default 0 check (unsupported_material_claims >= 0),
  add column material_claims integer not null default 0 check (material_claims >= 0),
  add column contradiction_correct boolean,
  add column bilingual_equivalence numeric(8,6) check (bilingual_equivalence between 0 and 1),
  add column private_or_expired_leakage boolean not null default false,
  add column evaluator_version text,
  add column scored_at timestamptz not null default now();

create index ai_eval_versions_dataset_idx on public.ai_eval_dataset_versions(dataset_id, version desc);
create index ai_eval_cases_version_status_idx on public.ai_eval_cases(dataset_version_id, lifecycle_status, domain, language, failure_class);
create index ai_eval_reviews_case_decision_idx on public.ai_eval_case_reviews(case_id, decision);
create index ai_eval_runs_version_created_idx on public.ai_eval_runs(dataset_version_id, created_at desc);
create index ai_eval_results_run_case_idx on public.ai_eval_results(run_id, case_id);

alter table public.ai_eval_datasets enable row level security;
alter table public.ai_eval_dataset_versions enable row level security;
alter table public.ai_eval_case_reviews enable row level security;

drop policy if exists ai_eval_cases_manage on public.ai_eval_cases;
drop policy if exists ai_eval_runs_manage on public.ai_eval_runs;
drop policy if exists ai_eval_results_manage on public.ai_eval_results;

create policy ai_eval_datasets_read on public.ai_eval_datasets for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_versions_read on public.ai_eval_dataset_versions for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_cases_read on public.ai_eval_cases for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_reviews_read on public.ai_eval_case_reviews for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_runs_read on public.ai_eval_runs for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_results_read on public.ai_eval_results for select to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])));

create policy ai_eval_datasets_insert on public.ai_eval_datasets for insert to authenticated
  with check (owner_profile_id=(select auth.uid()) and (select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_versions_insert on public.ai_eval_dataset_versions for insert to authenticated
  with check ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_cases_insert on public.ai_eval_cases for insert to authenticated
  with check (author_id=(select auth.uid()) and (select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_reviews_insert on public.ai_eval_case_reviews for insert to authenticated
  with check (reviewer_id=(select auth.uid()) and (select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_runs_insert on public.ai_eval_runs for insert to authenticated
  with check (requested_by=(select auth.uid()) and (select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_results_insert on public.ai_eval_results for insert to authenticated
  with check (exists(select 1 from public.ai_eval_runs r where r.id=run_id and r.requested_by=(select auth.uid()) and r.status='running'));

create policy ai_eval_datasets_update on public.ai_eval_datasets for update to authenticated
  using ((select private.has_role(array['owner','admin','librarian'])))
  with check ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_versions_update on public.ai_eval_dataset_versions for update to authenticated
  using (status='draft' and (select private.has_role(array['owner','admin','librarian'])))
  with check ((select private.has_role(array['owner','admin','librarian'])));
create policy ai_eval_cases_update on public.ai_eval_cases for update to authenticated
  using (author_id=(select auth.uid()) and lifecycle_status in ('draft','review') and (select private.has_role(array['owner','admin','librarian'])))
  with check (author_id=(select auth.uid()));
create policy ai_eval_runs_update on public.ai_eval_runs for update to authenticated
  using (requested_by=(select auth.uid()) and status in ('queued','running') and (select private.has_role(array['owner','admin','librarian'])))
  with check (requested_by=(select auth.uid()));

grant select,insert,update on public.ai_eval_datasets, public.ai_eval_dataset_versions to authenticated;
grant select,insert,update on public.ai_eval_cases, public.ai_eval_runs to authenticated;
grant select,insert on public.ai_eval_case_reviews to authenticated;
grant select,insert on public.ai_eval_results to authenticated;
revoke all on public.ai_eval_datasets, public.ai_eval_dataset_versions, public.ai_eval_case_reviews from anon, public;
revoke delete on public.ai_eval_datasets, public.ai_eval_dataset_versions, public.ai_eval_cases,
  public.ai_eval_case_reviews, public.ai_eval_runs, public.ai_eval_results from authenticated;

create or replace function private.guard_ai_eval_immutability()
returns trigger language plpgsql set search_path='' as $$
declare v_frozen boolean := false;
begin
  if current_setting('app.ai_eval_fixture_cleanup', true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name='ai_eval_dataset_versions' then
    if old.status='frozen' or old.status='retired' then raise exception 'Frozen evaluation versions are immutable' using errcode='55000'; end if;
  elsif tg_table_name='ai_eval_cases' then
    select v.status='frozen' into v_frozen from public.ai_eval_dataset_versions v where v.id=old.dataset_version_id;
    if v_frozen or old.lifecycle_status in ('eligible','rejected') then raise exception 'Reviewed evaluation cases are immutable' using errcode='55000'; end if;
  elsif tg_table_name='ai_eval_case_reviews' then
    raise exception 'Evaluation reviews are append-only' using errcode='55000';
  elsif tg_table_name='ai_eval_runs' then
    if old.status in ('completed','failed','cancelled') then raise exception 'Terminal evaluation runs are immutable' using errcode='55000'; end if;
  elsif tg_table_name='ai_eval_results' then
    raise exception 'Evaluation results are append-only' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger guard_ai_eval_versions before update or delete on public.ai_eval_dataset_versions
  for each row execute function private.guard_ai_eval_immutability();
create trigger guard_ai_eval_cases before update or delete on public.ai_eval_cases
  for each row execute function private.guard_ai_eval_immutability();
create trigger guard_ai_eval_reviews before update or delete on public.ai_eval_case_reviews
  for each row execute function private.guard_ai_eval_immutability();
create trigger guard_ai_eval_runs before update or delete on public.ai_eval_runs
  for each row execute function private.guard_ai_eval_immutability();
create trigger guard_ai_eval_results before update or delete on public.ai_eval_results
  for each row execute function private.guard_ai_eval_immutability();

create or replace function public.review_ai_eval_case(
  p_case_id uuid, p_decision text, p_evidence_accuracy numeric, p_rubric_clarity numeric, p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_case public.ai_eval_cases; v_approvals integer; v_rejections integer;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_case from public.ai_eval_cases where id=p_case_id for update;
  if not found or v_case.lifecycle_status not in ('draft','review') or v_case.dataset_version_id is null then raise exception 'Case is not reviewable' using errcode='22023'; end if;
  if v_case.author_id=v_actor then raise exception 'Case authors cannot review their own cases' using errcode='42501'; end if;
  if p_decision not in ('approve','request_changes','reject') or p_evidence_accuracy not between 0 and 1 or p_rubric_clarity not between 0 and 1 or char_length(btrim(coalesce(p_notes,''))) not between 3 and 2000 then raise exception 'Invalid review' using errcode='22023'; end if;
  insert into public.ai_eval_case_reviews(case_id,reviewer_id,decision,evidence_accuracy,rubric_clarity,notes)
  values(p_case_id,v_actor,p_decision,p_evidence_accuracy,p_rubric_clarity,btrim(p_notes));
  select count(*) filter(where decision='approve'),count(*) filter(where decision in ('reject','request_changes'))
    into v_approvals,v_rejections from public.ai_eval_case_reviews where case_id=p_case_id;
  update public.ai_eval_cases set lifecycle_status=case when v_rejections>0 then 'rejected' when v_approvals>=2 then 'eligible' else 'review' end,
    reviewed_by=case when v_approvals>=2 then v_actor else reviewed_by end,
    reviewed_at=case when v_approvals>=2 then now() else reviewed_at end,
    case_checksum=encode(extensions.digest(concat_ws('|',case_key,domain,language,query,expected_chunk_ids::text,expected_claims::text,expect_abstention::text,rubric::text,failure_class,expected_terminal_state,forbidden_chunk_ids::text),'sha256'),'hex'),
    updated_at=now() where id=p_case_id;
  return jsonb_build_object('case_id',p_case_id,'approvals',v_approvals,'adverse_reviews',v_rejections,'status',
    case when v_rejections>0 then 'rejected' when v_approvals>=2 then 'eligible' else 'review' end);
end $$;

create or replace function public.freeze_ai_eval_dataset(p_version_id uuid, p_fixture_override boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_version public.ai_eval_dataset_versions; v_dataset public.ai_eval_datasets;
  v_count integer; v_domains integer; v_languages integer; v_failures integer; v_checksum text; v_coverage jsonb;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_version from public.ai_eval_dataset_versions where id=p_version_id for update;
  select * into v_dataset from public.ai_eval_datasets where id=v_version.dataset_id;
  if v_version.status<>'draft' then raise exception 'Only draft versions can freeze' using errcode='22023'; end if;
  select count(*),count(distinct domain),count(distinct language),count(distinct failure_class)
    into v_count,v_domains,v_languages,v_failures from public.ai_eval_cases where dataset_version_id=p_version_id and lifecycle_status='eligible';
  if p_fixture_override then
    if not (select private.has_role(array['owner'])) or not v_dataset.is_fixture or v_dataset.name not like 'Issue124 verification %' then raise exception 'Fixture override denied' using errcode='42501'; end if;
  elsif v_count<v_version.required_case_count or v_domains<7 or v_languages<3 or v_failures<7 then
    raise exception 'Dataset requires >=% eligible cases, 7 domains, 3 languages, and 7 failure classes',v_version.required_case_count using errcode='22023';
  end if;
  if exists(select 1 from public.ai_eval_cases c where c.dataset_version_id=p_version_id and c.lifecycle_status='eligible'
    and (select count(*) from public.ai_eval_case_reviews r where r.case_id=c.id and r.decision='approve')<2) then
    raise exception 'Eligible case lacks two independent approvals' using errcode='22023';
  end if;
  select jsonb_build_object('cases',v_count,'domains',v_domains,'languages',v_languages,'failure_classes',v_failures) into v_coverage;
  select encode(extensions.digest(coalesce(string_agg(case_checksum,'' order by case_key),''),'sha256'),'hex') into v_checksum
    from public.ai_eval_cases where dataset_version_id=p_version_id and lifecycle_status='eligible';
  update public.ai_eval_dataset_versions set status='frozen',checksum=v_checksum,coverage=v_coverage,frozen_at=now(),frozen_by=v_actor where id=p_version_id;
  return jsonb_build_object('version_id',p_version_id,'checksum',v_checksum,'coverage',v_coverage,'fixture_override',p_fixture_override);
end $$;

create or replace function public.start_ai_eval_run(
  p_dataset_version_id uuid,p_corpus_version text,p_retriever_version text,p_prompt_version text,p_model text,p_evaluator_version text,p_top_k integer default 5,p_baseline_run_id uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_config text;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.ai_eval_dataset_versions where id=p_dataset_version_id and status='frozen') then raise exception 'A frozen dataset version is required' using errcode='22023'; end if;
  if p_top_k not between 1 and 20 or exists(select 1 from unnest(array[p_corpus_version,p_retriever_version,p_prompt_version,p_model,p_evaluator_version]) x where char_length(btrim(coalesce(x,'')))<2) then raise exception 'Complete version configuration is required' using errcode='22023'; end if;
  v_config:=encode(extensions.digest(concat_ws('|',p_dataset_version_id,p_corpus_version,p_retriever_version,p_prompt_version,p_model,p_evaluator_version,p_top_k,p_baseline_run_id),'sha256'),'hex');
  insert into public.ai_eval_runs(requested_by,dataset_version_id,corpus_version,retriever_version,prompt_version,model,evaluator_version,top_k,configuration_checksum,status,started_at,baseline_run_id)
  values(v_actor,p_dataset_version_id,btrim(p_corpus_version),btrim(p_retriever_version),btrim(p_prompt_version),btrim(p_model),btrim(p_evaluator_version),p_top_k,v_config,'running',now(),p_baseline_run_id) returning id into v_id;
  return v_id;
end $$;

create or replace function public.record_ai_eval_result(
  p_run_id uuid,p_case_id uuid,p_answer_id uuid,p_retrieved_chunk_ids uuid[],p_cited_chunk_ids uuid[],
  p_supported_answer_correctness numeric,p_unsupported_material_claims integer,p_material_claims integer,
  p_contradiction_correct boolean,p_bilingual_equivalence numeric,p_latency_ms integer,p_estimated_cost_usd numeric,p_reviewer_notes text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_run public.ai_eval_runs; v_case public.ai_eval_cases; v_id uuid;
  v_k integer; v_hits integer; v_expected integer; v_actual integer; v_first integer; v_dcg numeric:=0; v_idcg numeric:=0;
  v_recall numeric; v_precision numeric; v_mrr numeric:=0; v_ndcg numeric:=0; v_cite_supported integer; v_cite_total integer;
  v_citation_precision numeric; v_citation_completeness numeric; v_leak boolean;
begin
  select * into v_run from public.ai_eval_runs where id=p_run_id for update;
  if v_actor is null or v_run.requested_by<>v_actor or v_run.status<>'running' then raise exception 'Run is not writable' using errcode='42501'; end if;
  select * into v_case from public.ai_eval_cases where id=p_case_id and dataset_version_id=v_run.dataset_version_id and lifecycle_status='eligible';
  if not found then raise exception 'Case is not eligible for this run' using errcode='22023'; end if;
  if p_supported_answer_correctness not between 0 and 1 or p_unsupported_material_claims<0 or p_material_claims<0 or p_unsupported_material_claims>p_material_claims or p_bilingual_equivalence is not null and p_bilingual_equivalence not between 0 and 1 or p_latency_ms<0 or p_estimated_cost_usd<0 then raise exception 'Invalid score input' using errcode='22023'; end if;
  v_k:=v_run.top_k; v_expected:=cardinality(v_case.expected_chunk_ids); v_actual:=least(cardinality(coalesce(p_retrieved_chunk_ids,'{}')),v_k);
  select count(*) into v_hits from unnest(coalesce(p_retrieved_chunk_ids,'{}')) with ordinality r(id,pos) where pos<=v_k and id=any(v_case.expected_chunk_ids);
  select min(pos) into v_first from unnest(coalesce(p_retrieved_chunk_ids,'{}')) with ordinality r(id,pos) where pos<=v_k and id=any(v_case.expected_chunk_ids);
  if v_first is not null then v_mrr:=1.0/v_first; end if;
  select coalesce(sum(1.0/(ln(pos+1)/ln(2))),0) into v_dcg from unnest(coalesce(p_retrieved_chunk_ids,'{}')) with ordinality r(id,pos) where pos<=v_k and id=any(v_case.expected_chunk_ids);
  select coalesce(sum(1.0/(ln(pos+1)/ln(2))),0) into v_idcg from generate_series(1,least(v_expected,v_k)) pos;
  v_recall:=case when v_expected=0 then case when v_actual=0 then 1 else 0 end else v_hits::numeric/v_expected end;
  v_precision:=case when v_actual=0 then case when v_expected=0 then 1 else 0 end else v_hits::numeric/v_actual end;
  v_ndcg:=case when v_idcg=0 then case when v_expected=0 and v_actual=0 then 1 else 0 end else v_dcg/v_idcg end;
  v_cite_total:=cardinality(coalesce(p_cited_chunk_ids,'{}'));
  select count(*) into v_cite_supported from unnest(coalesce(p_cited_chunk_ids,'{}')) id where id=any(v_case.expected_chunk_ids);
  v_citation_precision:=case when v_cite_total=0 then case when v_expected=0 then 1 else 0 end else v_cite_supported::numeric/v_cite_total end;
  v_citation_completeness:=case when v_expected=0 then 1 else (select count(distinct id)::numeric/v_expected from unnest(coalesce(p_cited_chunk_ids,'{}')) id where id=any(v_case.expected_chunk_ids)) end;
  v_leak:=exists(select 1 from unnest(coalesce(p_retrieved_chunk_ids,'{}')||coalesce(p_cited_chunk_ids,'{}')) id where id=any(v_case.forbidden_chunk_ids));
  insert into public.ai_eval_results(run_id,case_id,answer_id,retrieved_chunk_ids,reciprocal_rank,ndcg,correctness,citation_precision,citation_completeness,groundedness,abstention_correct,latency_ms,estimated_cost_usd,reviewer_notes,recall_at_k,precision_at_k,citation_supported_count,citation_total_count,expected_citation_count,supported_answer_correctness,unsupported_material_claims,material_claims,contradiction_correct,bilingual_equivalence,private_or_expired_leakage,evaluator_version)
  values(p_run_id,p_case_id,p_answer_id,coalesce(p_retrieved_chunk_ids,'{}'),v_mrr,v_ndcg,p_supported_answer_correctness,v_citation_precision,v_citation_completeness,v_citation_precision,(v_case.expect_abstention=(cardinality(coalesce(p_cited_chunk_ids,'{}'))=0)),p_latency_ms,p_estimated_cost_usd,p_reviewer_notes,v_recall,v_precision,v_cite_supported,v_cite_total,v_expected,p_supported_answer_correctness,p_unsupported_material_claims,p_material_claims,p_contradiction_correct,p_bilingual_equivalence,v_leak,v_run.evaluator_version) returning id into v_id;
  return v_id;
end $$;

create or replace function public.finalize_ai_eval_run(p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_run public.ai_eval_runs; v_total integer; v_expected integer; v_metrics jsonb; v_gate text;
begin
  select * into v_run from public.ai_eval_runs where id=p_run_id for update;
  if v_actor is null or v_run.requested_by<>v_actor or v_run.status<>'running' then raise exception 'Run is not finalizable' using errcode='42501'; end if;
  select count(*) into v_expected from public.ai_eval_cases where dataset_version_id=v_run.dataset_version_id and lifecycle_status='eligible';
  select count(*) into v_total from public.ai_eval_results where run_id=p_run_id;
  if v_total<>v_expected then raise exception 'Run has % of % required results',v_total,v_expected using errcode='22023'; end if;
  select jsonb_build_object(
    'case_count',count(*),'recall_at_5',avg(recall_at_k) filter(where cardinality(c.expected_chunk_ids)>0),'mrr',avg(reciprocal_rank) filter(where cardinality(c.expected_chunk_ids)>0),'ndcg',avg(ndcg) filter(where cardinality(c.expected_chunk_ids)>0),
    'citation_precision',avg(citation_precision),'citation_completeness',avg(citation_completeness),
    'supported_correctness',avg(supported_answer_correctness),
    'unsupported_claim_rate',case when sum(material_claims)=0 then 0 else sum(unsupported_material_claims)::numeric/sum(material_claims) end,
    'abstention_accuracy',avg(case when abstention_correct then 1 else 0 end),
    'contradiction_accuracy',avg(case when contradiction_correct is null then null when contradiction_correct then 1 else 0 end),
    'bilingual_equivalence',avg(bilingual_equivalence),'leakage_count',count(*) filter(where private_or_expired_leakage),
    'p50_latency_ms',percentile_disc(.5) within group(order by latency_ms),'p95_latency_ms',percentile_disc(.95) within group(order by latency_ms),
    'estimated_cost_usd',sum(estimated_cost_usd)
  ) into v_metrics from public.ai_eval_results x join public.ai_eval_cases c on c.id=x.case_id where x.run_id=p_run_id;
  v_gate:=case when (v_metrics->>'recall_at_5')::numeric>=.90 and (v_metrics->>'mrr')::numeric>=.80
    and (v_metrics->>'citation_precision')::numeric>=.95 and (v_metrics->>'citation_completeness')::numeric>=.90
    and (v_metrics->>'supported_correctness')::numeric>=.90 and (v_metrics->>'unsupported_claim_rate')::numeric<=.02
    and (v_metrics->>'abstention_accuracy')::numeric>=.90 and (v_metrics->>'leakage_count')::integer=0 then 'passed' else 'failed' end;
  update public.ai_eval_runs set status='completed',gate_status=v_gate,metrics=v_metrics,finished_at=now() where id=p_run_id;
  return jsonb_build_object('run_id',p_run_id,'gate_status',v_gate,'metrics',v_metrics);
end $$;

create or replace function public.ai_eval_report(p_run_id uuid)
returns table(section text,dimension text,case_count bigint,metrics jsonb)
language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query
  select 'overall'::text,'all'::text,count(*),r.metrics from public.ai_eval_runs r where r.id=p_run_id group by r.metrics
  union all
  select 'domain',c.domain,count(*),jsonb_build_object('recall_at_k',avg(x.recall_at_k),'mrr',avg(x.reciprocal_rank),'ndcg',avg(x.ndcg),'citation_precision',avg(x.citation_precision),'correctness',avg(x.supported_answer_correctness),'leakage_count',count(*) filter(where x.private_or_expired_leakage))
    from public.ai_eval_results x join public.ai_eval_cases c on c.id=x.case_id where x.run_id=p_run_id group by c.domain
  union all
  select 'language',c.language,count(*),jsonb_build_object('recall_at_k',avg(x.recall_at_k),'mrr',avg(x.reciprocal_rank),'citation_precision',avg(x.citation_precision),'correctness',avg(x.supported_answer_correctness),'leakage_count',count(*) filter(where x.private_or_expired_leakage))
    from public.ai_eval_results x join public.ai_eval_cases c on c.id=x.case_id where x.run_id=p_run_id group by c.language
  union all
  select 'failure_class',c.failure_class,count(*),jsonb_build_object('recall_at_k',avg(x.recall_at_k),'abstention_accuracy',avg(case when x.abstention_correct then 1 else 0 end),'contradiction_accuracy',avg(case when x.contradiction_correct is null then null when x.contradiction_correct then 1 else 0 end),'leakage_count',count(*) filter(where x.private_or_expired_leakage))
    from public.ai_eval_results x join public.ai_eval_cases c on c.id=x.case_id where x.run_id=p_run_id group by c.failure_class;
end $$;

create or replace function public.purge_ai_eval_fixture(p_dataset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_dataset public.ai_eval_datasets; v_versions integer; v_cases integer; v_reviews integer; v_runs integer; v_results integer;
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner'])) then raise exception 'Only owner may purge fixtures' using errcode='42501'; end if;
  select * into v_dataset from public.ai_eval_datasets where id=p_dataset_id for update;
  if not found or not v_dataset.is_fixture or v_dataset.name not like 'Issue124 verification %' then raise exception 'Not a guarded fixture' using errcode='22023'; end if;
  perform set_config('app.ai_eval_fixture_cleanup','on',true);
  select count(*) into v_results from public.ai_eval_results r join public.ai_eval_runs u on u.id=r.run_id join public.ai_eval_dataset_versions v on v.id=u.dataset_version_id where v.dataset_id=p_dataset_id;
  select count(*) into v_runs from public.ai_eval_runs u join public.ai_eval_dataset_versions v on v.id=u.dataset_version_id where v.dataset_id=p_dataset_id;
  select count(*) into v_reviews from public.ai_eval_case_reviews r join public.ai_eval_cases c on c.id=r.case_id join public.ai_eval_dataset_versions v on v.id=c.dataset_version_id where v.dataset_id=p_dataset_id;
  select count(*) into v_cases from public.ai_eval_cases c join public.ai_eval_dataset_versions v on v.id=c.dataset_version_id where v.dataset_id=p_dataset_id;
  select count(*) into v_versions from public.ai_eval_dataset_versions where dataset_id=p_dataset_id;
  delete from public.ai_eval_results where run_id in(select u.id from public.ai_eval_runs u join public.ai_eval_dataset_versions v on v.id=u.dataset_version_id where v.dataset_id=p_dataset_id);
  delete from public.ai_eval_runs where dataset_version_id in(select id from public.ai_eval_dataset_versions where dataset_id=p_dataset_id);
  delete from public.ai_eval_case_reviews where case_id in(select c.id from public.ai_eval_cases c join public.ai_eval_dataset_versions v on v.id=c.dataset_version_id where v.dataset_id=p_dataset_id);
  delete from public.ai_eval_cases where dataset_version_id in(select id from public.ai_eval_dataset_versions where dataset_id=p_dataset_id);
  delete from public.ai_eval_dataset_versions where dataset_id=p_dataset_id;
  delete from public.ai_eval_datasets where id=p_dataset_id;
  return jsonb_build_object('purged',true,'versions',v_versions,'cases',v_cases,'reviews',v_reviews,'runs',v_runs,'results',v_results);
end $$;

grant execute on function public.review_ai_eval_case(uuid,text,numeric,numeric,text) to authenticated;
grant execute on function public.freeze_ai_eval_dataset(uuid,boolean) to authenticated;
grant execute on function public.start_ai_eval_run(uuid,text,text,text,text,text,integer,uuid) to authenticated;
grant execute on function public.record_ai_eval_result(uuid,uuid,uuid,uuid[],uuid[],numeric,integer,integer,boolean,numeric,integer,numeric,text) to authenticated;
grant execute on function public.finalize_ai_eval_run(uuid) to authenticated;
grant execute on function public.ai_eval_report(uuid) to authenticated;
grant execute on function public.purge_ai_eval_fixture(uuid) to authenticated;
revoke all on function public.review_ai_eval_case(uuid,text,numeric,numeric,text),
  public.freeze_ai_eval_dataset(uuid,boolean),
  public.start_ai_eval_run(uuid,text,text,text,text,text,integer,uuid),
  public.record_ai_eval_result(uuid,uuid,uuid,uuid[],uuid[],numeric,integer,integer,boolean,numeric,integer,numeric,text),
  public.finalize_ai_eval_run(uuid),public.ai_eval_report(uuid),public.purge_ai_eval_fixture(uuid) from anon, public;

comment on table public.ai_eval_dataset_versions is 'Frozen, checksummed gold-set versions for Issue #124; production freeze requires >=150 independently approved cases.';
comment on table public.ai_eval_case_reviews is 'Append-only independent review evidence; authors cannot approve their own evaluation cases.';
comment on function public.record_ai_eval_result is 'Deterministically reconciles retrieval, citation, answer, abstention, leakage, latency, and cost evidence for one frozen case.';
