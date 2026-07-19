-- Issue #126: observe terminal ingestion/evaluation states without storing content.
create or replace function private.observe_research_pipeline_terminal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_component text;v_operation text;v_outcome text;v_code text;v_latency integer;v_count integer;
begin
  if old.status is not distinct from new.status then return new;end if;
  if tg_table_name='knowledge_ingestion_runs' then
    if new.status not in ('published','deduplicated','failed_fetch','failed_parse','failed_embedding','rejected','expired','quarantined') then return new;end if;
    v_component:='ingestion';v_operation:='process';v_outcome:=case when new.status in ('published','deduplicated') then 'success' when new.status in ('rejected','expired','quarantined') then 'degraded' else 'failure' end;v_code:=case when v_outcome='success' then null else coalesce(new.error_code,upper(new.status)) end;v_latency:=least(120000,greatest(0,coalesce(new.duration_ms,0)));v_count:=coalesce(new.chunk_count,0);
  elsif tg_table_name='ai_eval_runs' then
    if new.status not in ('completed','failed') then return new;end if;
    v_component:='evaluation';v_operation:='score';v_outcome:=case when new.status='completed' and new.gate_status='passed' then 'success' when new.status='completed' then 'degraded' else 'failure' end;v_code:=case when v_outcome='success' then null when new.status='failed' then 'EVALUATION_FAILED' else 'EVALUATION_GATE_FAILED' end;v_latency:=least(120000,greatest(0,coalesce((new.metrics->>'p95_latency_ms')::integer,0)));v_count:=coalesce((new.metrics->>'case_count')::integer,0);
  else return new;end if;
  perform public.record_research_operational_event(v_component,v_operation,v_outcome,v_code,null,v_latency,v_count,encode(extensions.digest(new.id::text,'sha256'),'hex'),jsonb_build_object('result_count',v_count),null);
  return new;
end $$;

create trigger observe_ingestion_terminal after update of status on public.knowledge_ingestion_runs for each row execute function private.observe_research_pipeline_terminal();
create trigger observe_evaluation_terminal after update of status on public.ai_eval_runs for each row execute function private.observe_research_pipeline_terminal();
