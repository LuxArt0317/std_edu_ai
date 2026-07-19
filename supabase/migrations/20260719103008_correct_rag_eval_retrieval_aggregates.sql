-- Correct retrieval aggregates: cases expecting no evidence are scored by abstention, not ranking.
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
