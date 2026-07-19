-- Issue #121: content-free operational telemetry for governed ingestion.
alter table public.knowledge_ingestion_runs
  add column queued_at timestamptz not null default now(),
  add column last_heartbeat_at timestamptz,
  add column next_retry_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  add column chunk_count integer not null default 0 check (chunk_count >= 0),
  add column input_token_count integer not null default 0 check (input_token_count >= 0),
  add column cost_rate_usd_per_million numeric(12,6) not null default 0 check (cost_rate_usd_per_million >= 0),
  add column cost_estimation_status text not null default 'unconfigured' check (cost_estimation_status in ('configured','unconfigured','provider_reported'));

create table public.knowledge_ingestion_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.knowledge_ingestion_runs(id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 5),
  state text not null check (state in ('running','succeeded','transient_failure','permanent_failure','dead_letter')),
  failure_class text check (failure_class is null or failure_class in ('network','timeout','rate_limit','provider_5xx','provider_4xx','invalid_response','database','stale_worker')),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z0-9_]{2,80}$'),
  provider text not null default 'openai' check (provider in ('openai','none')),
  model text not null,
  provider_request_id_hash text check (provider_request_id_hash is null or provider_request_id_hash ~ '^[a-f0-9]{64}$'),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  input_token_count integer not null default 0 check (input_token_count >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  fetch_ms integer not null default 0 check (fetch_ms >= 0),
  normalize_ms integer not null default 0 check (normalize_ms >= 0),
  embedding_ms integer not null default 0 check (embedding_ms >= 0),
  persistence_ms integer not null default 0 check (persistence_ms >= 0),
  retry_delay_ms integer not null default 0 check (retry_delay_ms between 0 and 60000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id,attempt_number),
  check ((state='running' and finished_at is null and failure_class is null and failure_code is null) or (state='succeeded' and finished_at is not null and failure_class is null and failure_code is null) or (state in ('transient_failure','permanent_failure','dead_letter') and finished_at is not null and failure_class is not null and failure_code is not null))
);
alter table public.knowledge_ingestion_attempts enable row level security;
create index knowledge_ingestion_attempts_run_idx on public.knowledge_ingestion_attempts(run_id,attempt_number);
create index knowledge_ingestion_runs_operational_idx on public.knowledge_ingestion_runs(status,started_at) where finished_at is null;

create or replace function private.validate_ingestion_telemetry()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_max integer; v_previous text;
begin
  select max_attempts into v_max from public.knowledge_ingestion_runs where id=new.run_id;
  if new.attempt_number>v_max then raise exception 'Attempt exceeds the configured retry ceiling'; end if;
  if new.attempt_number>1 then
    select state into v_previous from public.knowledge_ingestion_attempts where run_id=new.run_id and attempt_number=new.attempt_number-1;
    if v_previous<>'transient_failure' then raise exception 'Only a transient failure may be retried'; end if;
  end if;
  return new;
end;$$;
create trigger validate_ingestion_telemetry before insert on public.knowledge_ingestion_attempts for each row execute function private.validate_ingestion_telemetry();

create policy ingestion_attempts_read on public.knowledge_ingestion_attempts for select to authenticated using ((select private.has_role(array['owner','admin','librarian'])));
create policy ingestion_attempts_insert on public.knowledge_ingestion_attempts for insert to authenticated with check ((select private.has_role(array['owner','admin','librarian'])) and exists(select 1 from public.knowledge_ingestion_runs r where r.id=run_id and r.requested_by=(select auth.uid())));
create policy ingestion_attempts_update on public.knowledge_ingestion_attempts for update to authenticated using (state='running' and exists(select 1 from public.knowledge_ingestion_runs r where r.id=run_id and r.requested_by=(select auth.uid()))) with check (exists(select 1 from public.knowledge_ingestion_runs r where r.id=run_id and r.requested_by=(select auth.uid())));
revoke all on public.knowledge_ingestion_attempts from public,anon;
grant select,insert,update on public.knowledge_ingestion_attempts to authenticated;

create or replace function public.knowledge_ingestion_operational_summary(p_since timestamptz default now()-interval '30 days')
returns jsonb language plpgsql security invoker stable set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized to read ingestion operations'; end if;
  select jsonb_build_object(
    'runCount',count(distinct r.id),'attemptCount',count(a.id),'successCount',count(distinct r.id) filter(where r.status='awaiting_review'),
    'failureCount',count(distinct r.id) filter(where r.status like 'failed_%' or r.status in ('quarantined','rejected')),
    'retriedRuns',count(distinct r.id) filter(where r.attempt_count>1),'deadLetterCount',count(distinct r.id) filter(where r.dead_lettered_at is not null),
    'totalInputTokens',coalesce(max(tokens.total_tokens),0),'estimatedCostUsd',coalesce(max(costs.total_cost),0),
    'durationP50Ms',coalesce(percentile_cont(.5) within group(order by r.duration_ms) filter(where r.duration_ms is not null),0),
    'durationP95Ms',coalesce(percentile_cont(.95) within group(order by r.duration_ms) filter(where r.duration_ms is not null),0),
    'oldestBacklogSeconds',coalesce(extract(epoch from now()-min(r.queued_at) filter(where r.finished_at is null))::bigint,0),
    'failureClasses',coalesce(max(failures.classes),'{}'::jsonb),
    'caveat','Operational telemetry only; it contains no document content, prompts, credentials, or raw provider payloads.'
  ) into v_result
  from public.knowledge_ingestion_runs r
  left join public.knowledge_ingestion_attempts a on a.run_id=r.id
  cross join lateral (select coalesce(sum(input_token_count),0) total_tokens from public.knowledge_ingestion_runs where created_at>=p_since) tokens
  cross join lateral (select coalesce(sum(estimated_cost_usd),0) total_cost from public.knowledge_ingestion_runs where created_at>=p_since) costs
  cross join lateral (select coalesce(jsonb_object_agg(failure_class,total),'{}'::jsonb) classes from (select failure_class,count(*) total from public.knowledge_ingestion_attempts where created_at>=p_since and failure_class is not null group by failure_class) x) failures
  where r.created_at>=p_since;
  return v_result;
end;$$;

create or replace function public.recover_stale_ingestion_runs(p_stale_before timestamptz default now()-interval '15 minutes')
returns integer language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_count integer;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian'])) then raise exception 'Not authorized to recover ingestion runs'; end if;
  update public.knowledge_ingestion_attempts a set state='transient_failure',failure_class='stale_worker',failure_code='STALE_WORKER',finished_at=now(),retry_delay_ms=0
  from public.knowledge_ingestion_runs r where a.run_id=r.id and a.state='running' and coalesce(r.last_heartbeat_at,a.started_at)<p_stale_before;
  update public.knowledge_ingestion_runs set status='quarantined',error_code='STALE_WORKER',error_message='Worker heartbeat expired; manual retry review required.',finished_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer) where finished_at is null and coalesce(last_heartbeat_at,started_at)<p_stale_before;
  get diagnostics v_count=row_count; return v_count;
end;$$;

revoke all on function public.knowledge_ingestion_operational_summary(timestamptz) from public,anon;
revoke all on function public.recover_stale_ingestion_runs(timestamptz) from public,anon;
grant execute on function public.knowledge_ingestion_operational_summary(timestamptz),public.recover_stale_ingestion_runs(timestamptz) to authenticated;
comment on table public.knowledge_ingestion_attempts is 'Content-free attempt telemetry. Never store source content, prompts, credentials, or raw provider payloads.';
