-- Issue #121: compute each aggregate once without multiplying runs by attempts.
create or replace function public.knowledge_ingestion_operational_summary(p_since timestamptz default now()-interval '30 days')
returns jsonb language plpgsql security invoker stable set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_run_count bigint; v_attempt_count bigint; v_success bigint; v_failure bigint; v_retried bigint; v_dead bigint; v_tokens bigint; v_cost numeric; v_p50 numeric; v_p95 numeric; v_backlog bigint; v_classes jsonb;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized to read ingestion operations'; end if;
  select count(*),count(*) filter(where status in ('awaiting_review','approved','indexed','published')),count(*) filter(where status like 'failed_%' or status in ('quarantined','rejected')),count(*) filter(where attempt_count>1),count(*) filter(where dead_lettered_at is not null),coalesce(sum(input_token_count),0),coalesce(sum(estimated_cost_usd),0),coalesce(percentile_cont(.5) within group(order by duration_ms) filter(where duration_ms is not null),0),coalesce(percentile_cont(.95) within group(order by duration_ms) filter(where duration_ms is not null),0),coalesce(extract(epoch from now()-min(queued_at) filter(where finished_at is null))::bigint,0)
  into v_run_count,v_success,v_failure,v_retried,v_dead,v_tokens,v_cost,v_p50,v_p95,v_backlog from public.knowledge_ingestion_runs where created_at>=p_since;
  select count(*) into v_attempt_count from public.knowledge_ingestion_attempts where created_at>=p_since;
  select coalesce(jsonb_object_agg(failure_class,total),'{}'::jsonb) into v_classes from (select failure_class,count(*) total from public.knowledge_ingestion_attempts where created_at>=p_since and failure_class is not null group by failure_class) x;
  return jsonb_build_object('runCount',v_run_count,'attemptCount',v_attempt_count,'successCount',v_success,'failureCount',v_failure,'retriedRuns',v_retried,'deadLetterCount',v_dead,'totalInputTokens',v_tokens,'estimatedCostUsd',v_cost,'durationP50Ms',v_p50,'durationP95Ms',v_p95,'oldestBacklogSeconds',v_backlog,'failureClasses',v_classes,'caveat','Operational telemetry only; it contains no document content, prompts, credentials, or raw provider payloads.');
end;$$;
revoke all on function public.knowledge_ingestion_operational_summary(timestamptz) from public,anon;
grant execute on function public.knowledge_ingestion_operational_summary(timestamptz) to authenticated;
