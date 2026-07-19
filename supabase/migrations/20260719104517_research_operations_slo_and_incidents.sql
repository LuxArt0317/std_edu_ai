-- Issue #125: unified privacy-safe operations, SLO, alert, and incident evidence.
create table public.research_slo_definitions (
  id uuid primary key default gen_random_uuid(),
  component text not null check (component in ('public_shell','retrieval','model','citation','campus_route','study','ingestion','evaluation')),
  operation text not null check (operation ~ '^[a-z][a-z0-9_]{1,63}$'),
  version integer not null check (version > 0),
  availability_target numeric(7,6) not null check (availability_target between .90 and 1),
  p95_latency_ms integer not null check (p95_latency_ms between 50 and 120000),
  error_budget_percent numeric(6,3) not null check (error_budget_percent between 0 and 10),
  pilot_requests integer not null check (pilot_requests between 10 and 100000),
  pilot_concurrency integer not null check (pilot_concurrency between 1 and 1000),
  rto_minutes integer not null check (rto_minutes between 1 and 10080),
  rpo_minutes integer not null check (rpo_minutes between 0 and 1440),
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(component,operation,version),
  check (retired_at is null or retired_at > effective_at)
);

create table public.research_operational_events (
  id uuid primary key default gen_random_uuid(),
  component text not null check (component in ('public_shell','retrieval','model','citation','campus_route','study','ingestion','evaluation')),
  operation text not null check (operation ~ '^[a-z][a-z0-9_]{1,63}$'),
  outcome text not null check (outcome in ('success','failure','degraded','denied')),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  http_status integer check (http_status is null or http_status between 100 and 599),
  latency_ms integer not null check (latency_ms between 0 and 120000),
  item_count integer check (item_count is null or item_count between 0 and 1000000),
  correlation_hash text not null check (correlation_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and pg_column_size(metadata)<=2048),
  fixture_marker text check (fixture_marker is null or fixture_marker ~ '^Issue125-[A-Z0-9]{6,32}$'),
  created_at timestamptz not null default now()
);

create table public.research_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.research_operational_events(id) on delete restrict,
  severity text not null check (severity in ('warning','critical')),
  owner_role text not null check (owner_role in ('owner','admin','librarian','support')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved','false_positive')),
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_code text check (resolution_code is null or resolution_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  created_at timestamptz not null default now(),
  check ((acknowledged_by is null)=(acknowledged_at is null)),
  check ((resolved_by is null)=(resolved_at is null))
);

create index research_slo_active_idx on public.research_slo_definitions(component,operation,effective_at desc) where retired_at is null;
create index research_ops_component_time_idx on public.research_operational_events(component,operation,created_at desc);
create index research_ops_outcome_time_idx on public.research_operational_events(outcome,created_at desc);
create index research_ops_fixture_idx on public.research_operational_events(fixture_marker) where fixture_marker is not null;
create index research_alerts_status_idx on public.research_operational_alerts(status,severity,created_at desc);
create index research_alerts_ack_idx on public.research_operational_alerts(acknowledged_by) where acknowledged_by is not null;
create index research_alerts_resolved_idx on public.research_operational_alerts(resolved_by) where resolved_by is not null;

alter table public.research_slo_definitions enable row level security;
alter table public.research_operational_events enable row level security;
alter table public.research_operational_alerts enable row level security;

create policy research_slo_read on public.research_slo_definitions for select to authenticated using ((select private.has_role(array['owner','admin','librarian','support'])));
create policy research_ops_read on public.research_operational_events for select to authenticated using ((select private.has_role(array['owner','admin','librarian','support'])));
create policy research_alerts_read on public.research_operational_alerts for select to authenticated using ((select private.has_role(array['owner','admin','librarian','support'])));
create policy research_alerts_update on public.research_operational_alerts for update to authenticated
  using ((select private.has_role(array['owner','admin','librarian','support'])))
  with check ((select private.has_role(array['owner','admin','librarian','support'])));

grant select on public.research_slo_definitions,public.research_operational_events,public.research_operational_alerts to authenticated;
grant update(status,acknowledged_by,acknowledged_at,resolved_by,resolved_at,resolution_code) on public.research_operational_alerts to authenticated;
revoke all on public.research_slo_definitions,public.research_operational_events,public.research_operational_alerts from anon,public;

create or replace function private.guard_research_operations()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_setting('app.issue125_fixture_cleanup',true)='on' then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_table_name='research_operational_events' then raise exception 'Operational events are append-only' using errcode='55000'; end if;
  if tg_table_name='research_slo_definitions' and (old.retired_at is not null or new.component<>old.component or new.operation<>old.operation or new.version<>old.version or new.availability_target<>old.availability_target or new.p95_latency_ms<>old.p95_latency_ms or new.error_budget_percent<>old.error_budget_percent or new.pilot_requests<>old.pilot_requests or new.pilot_concurrency<>old.pilot_concurrency or new.rto_minutes<>old.rto_minutes or new.rpo_minutes<>old.rpo_minutes) then raise exception 'Published SLO definitions are immutable; retire and version instead' using errcode='55000'; end if;
  if tg_table_name='research_operational_alerts' and (new.event_id<>old.event_id or new.severity<>old.severity or new.owner_role<>old.owner_role or new.created_at<>old.created_at) then raise exception 'Alert origin is immutable' using errcode='55000'; end if;
  if tg_op='DELETE' then raise exception 'Research operations evidence cannot be deleted' using errcode='55000'; end if;
  return new;
end $$;
create trigger guard_research_slos before update or delete on public.research_slo_definitions for each row execute function private.guard_research_operations();
create trigger guard_research_ops before update or delete on public.research_operational_events for each row execute function private.guard_research_operations();
create trigger guard_research_alerts before update or delete on public.research_operational_alerts for each row execute function private.guard_research_operations();

insert into public.research_slo_definitions(component,operation,version,availability_target,p95_latency_ms,error_budget_percent,pilot_requests,pilot_concurrency,rto_minutes,rpo_minutes) values
('public_shell','load',1,.995,2500,.5,100,10,15,0),
('retrieval','search',1,.990,2000,1,100,10,15,0),
('model','answer',1,.990,6000,1,50,5,30,0),
('citation','persist',1,.995,1500,.5,100,10,15,0),
('campus_route','route',1,.995,2000,.5,100,10,30,60),
('study','action',1,.995,2000,.5,100,10,30,0),
('ingestion','process',1,.980,120000,2,20,2,60,60),
('evaluation','score',1,.990,5000,1,50,5,30,0);

create or replace function public.record_research_operational_event(
  p_component text,p_operation text,p_outcome text,p_error_code text,p_http_status integer,p_latency_ms integer,
  p_item_count integer,p_correlation_hash text,p_metadata jsonb default '{}'::jsonb,p_fixture_marker text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_slo public.research_slo_definitions; v_owner text; v_severity text; v_actor uuid:=(select auth.uid());
  v_key text; v_value jsonb; v_recent integer;
begin
  if p_component not in ('public_shell','retrieval','model','citation','campus_route','study','ingestion','evaluation') or p_operation !~ '^[a-z][a-z0-9_]{1,63}$' or p_outcome not in ('success','failure','degraded','denied') or p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$' or p_http_status is not null and p_http_status not between 100 and 599 or p_latency_ms not between 0 and 120000 or p_item_count is not null and p_item_count not between 0 and 1000000 or p_correlation_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_metadata,'{}'::jsonb))>2048 then raise exception 'Invalid operational event' using errcode='22023'; end if;
  for v_key,v_value in select key,value from jsonb_each(coalesce(p_metadata,'{}'::jsonb)) loop
    if v_key not in ('retrieval_count','citation_count','attempt','max_attempts','status_family','cache_hit','fallback_used','result_count') or jsonb_typeof(v_value) not in ('number','boolean','null') then raise exception 'Operational metadata must use approved non-content fields' using errcode='22023'; end if;
  end loop;
  if p_fixture_marker is not null and (v_actor is null or not (select private.has_role(array['owner'])) or p_fixture_marker !~ '^Issue125-[A-Z0-9]{6,32}$') then raise exception 'Fixture marker denied' using errcode='42501'; end if;
  select count(*) into v_recent from public.research_operational_events where component=p_component and created_at>now()-interval '1 minute';
  if v_recent>=600 then raise exception 'Operational event rate exceeded' using errcode='54000'; end if;
  insert into public.research_operational_events(component,operation,outcome,error_code,http_status,latency_ms,item_count,correlation_hash,metadata,fixture_marker)
  values(p_component,p_operation,p_outcome,p_error_code,p_http_status,p_latency_ms,p_item_count,p_correlation_hash,coalesce(p_metadata,'{}'::jsonb),p_fixture_marker) returning id into v_id;
  select * into v_slo from public.research_slo_definitions where component=p_component and operation=p_operation and effective_at<=now() and retired_at is null order by version desc limit 1;
  if p_outcome in ('failure','degraded') or found and p_latency_ms>v_slo.p95_latency_ms then
    v_owner:=case p_component when 'ingestion' then 'librarian' when 'campus_route' then 'support' when 'study' then 'admin' else 'owner' end;
    v_severity:=case when p_outcome='failure' or p_error_code in ('PRIVATE_LEAKAGE','EXPIRED_LEAKAGE','SECRET_EXPOSURE','PROMPT_INJECTION') then 'critical' else 'warning' end;
    insert into public.research_operational_alerts(event_id,severity,owner_role) values(v_id,v_severity,v_owner);
  end if;
  return v_id;
end $$;

create or replace function public.research_operations_report(p_since timestamptz default now()-interval '24 hours')
returns table(component text,operation text,event_count bigint,success_count bigint,failure_count bigint,degraded_count bigint,denied_count bigint,p50_latency_ms numeric,p95_latency_ms numeric,slo_latency_ms integer,availability numeric,error_budget_consumed_percent numeric,open_alerts bigint)
language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner','admin','librarian','support'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_since<now()-interval '90 days' or p_since>now() then raise exception 'Report window must be within 90 days' using errcode='22023'; end if;
  return query select e.component,e.operation,count(*),count(*) filter(where e.outcome='success'),count(*) filter(where e.outcome='failure'),count(*) filter(where e.outcome='degraded'),count(*) filter(where e.outcome='denied'),percentile_disc(.5) within group(order by e.latency_ms)::numeric,percentile_disc(.95) within group(order by e.latency_ms)::numeric,s.p95_latency_ms,(count(*) filter(where e.outcome='success'))::numeric/nullif(count(*),0),greatest(0,(count(*) filter(where e.outcome in ('failure','degraded')))::numeric/nullif(count(*),0)*100-s.error_budget_percent),count(distinct a.id) filter(where a.status='open')
  from public.research_operational_events e left join lateral(select x.* from public.research_slo_definitions x where x.component=e.component and x.operation=e.operation and x.effective_at<=e.created_at and (x.retired_at is null or x.retired_at>e.created_at) order by x.version desc limit 1)s on true left join public.research_operational_alerts a on a.event_id=e.id where e.created_at>=p_since group by e.component,e.operation,s.p95_latency_ms,s.error_budget_percent order by e.component,e.operation;
end $$;

create or replace function public.transition_research_operational_alert(p_alert_id uuid,p_status text,p_resolution_code text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_alert public.research_operational_alerts;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','librarian','support'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_alert from public.research_operational_alerts where id=p_alert_id for update;
  if not found or p_status not in ('acknowledged','resolved','false_positive') then raise exception 'Invalid alert transition' using errcode='22023'; end if;
  if p_status='acknowledged' and v_alert.status<>'open' then raise exception 'Only open alerts can be acknowledged' using errcode='22023'; end if;
  if p_status in ('resolved','false_positive') and v_alert.status not in ('open','acknowledged') then raise exception 'Alert is already terminal' using errcode='22023'; end if;
  if p_status in ('resolved','false_positive') and coalesce(p_resolution_code,'') !~ '^[A-Z][A-Z0-9_]{1,63}$' then raise exception 'Resolution code required' using errcode='22023'; end if;
  update public.research_operational_alerts set status=p_status,
    acknowledged_by=case when p_status='acknowledged' then v_actor else coalesce(acknowledged_by,v_actor) end,
    acknowledged_at=case when p_status='acknowledged' then now() else coalesce(acknowledged_at,now()) end,
    resolved_by=case when p_status in ('resolved','false_positive') then v_actor else resolved_by end,
    resolved_at=case when p_status in ('resolved','false_positive') then now() else resolved_at end,
    resolution_code=case when p_status in ('resolved','false_positive') then p_resolution_code else resolution_code end where id=p_alert_id;
end $$;

create or replace function public.purge_issue125_fixture(p_fixture_marker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_events integer;v_alerts integer;
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner'])) or p_fixture_marker !~ '^Issue125-[A-Z0-9]{6,32}$' then raise exception 'Only owner may purge a guarded Issue125 fixture' using errcode='42501'; end if;
  perform set_config('app.issue125_fixture_cleanup','on',true);
  select count(*) into v_alerts from public.research_operational_alerts where event_id in(select id from public.research_operational_events where fixture_marker=p_fixture_marker);
  select count(*) into v_events from public.research_operational_events where fixture_marker=p_fixture_marker;
  delete from public.research_operational_alerts where event_id in(select id from public.research_operational_events where fixture_marker=p_fixture_marker);
  delete from public.research_operational_events where fixture_marker=p_fixture_marker;
  return jsonb_build_object('purged',true,'events',v_events,'alerts',v_alerts);
end $$;

grant execute on function public.record_research_operational_event(text,text,text,text,integer,integer,integer,text,jsonb,text) to anon,authenticated;
grant execute on function public.research_operations_report(timestamptz),public.transition_research_operational_alert(uuid,text,text),public.purge_issue125_fixture(text) to authenticated;
revoke all on function public.research_operations_report(timestamptz),public.transition_research_operational_alert(uuid,text,text),public.purge_issue125_fixture(text) from anon,public;

comment on table public.research_operational_events is 'Content-free Issue #125 events. No prompts, questions, tokens, private chunks, identities, provider payloads, or arbitrary strings are accepted.';
comment on function public.record_research_operational_event is 'Strict public operational boundary accepting only enumerated codes, counts, booleans, timing, and non-reversible correlation hashes.';
