-- Issue #125: branch before accessing table-specific trigger record fields.
create or replace function private.guard_research_operations()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_setting('app.issue125_fixture_cleanup',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name='research_operational_events' then
    raise exception 'Operational events are append-only' using errcode='55000';
  elsif tg_table_name='research_slo_definitions' then
    if tg_op='DELETE' then
      raise exception 'Research operations evidence cannot be deleted' using errcode='55000';
    end if;
    if old.retired_at is not null or new.component<>old.component or new.operation<>old.operation or new.version<>old.version or new.availability_target<>old.availability_target or new.p95_latency_ms<>old.p95_latency_ms or new.error_budget_percent<>old.error_budget_percent or new.pilot_requests<>old.pilot_requests or new.pilot_concurrency<>old.pilot_concurrency or new.rto_minutes<>old.rto_minutes or new.rpo_minutes<>old.rpo_minutes then
      raise exception 'Published SLO definitions are immutable; retire and version instead' using errcode='55000';
    end if;
  elsif tg_table_name='research_operational_alerts' then
    if tg_op='DELETE' then
      raise exception 'Research operations evidence cannot be deleted' using errcode='55000';
    end if;
    if new.event_id<>old.event_id or new.severity<>old.severity or new.owner_role<>old.owner_role or new.created_at<>old.created_at then
      raise exception 'Alert origin is immutable' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
