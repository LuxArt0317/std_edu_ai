-- Issue #120: evidence-safe, privacy-minimized administrative workload measurement.
-- Real observations are entered only by approved offices. This schema never infers
-- resolution from an AI answer and never stores respondent-level data.

create table public.administrative_workload_windows (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.research_studies(id) on delete restrict,
  office_code text not null check (office_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  office_name text not null check (char_length(btrim(office_name)) between 2 and 120),
  window_type text not null check (window_type in ('baseline','pilot')),
  period_start date not null,
  period_end date not null,
  source_system text not null check (char_length(btrim(source_system)) between 2 and 120),
  source_extract_sha256 text not null check (source_extract_sha256 ~ '^[a-f0-9]{64}$'),
  source_record_count integer not null check (source_record_count >= 0),
  collection_method text not null check (collection_method in ('ticket_export','call_log_aggregate','email_log_aggregate','service_desk_aggregate','approved_manual_tally')),
  suppression_threshold integer not null default 5 check (suppression_threshold between 5 and 50),
  approval_reference text not null check (char_length(btrim(approval_reference)) between 3 and 160),
  status text not null default 'draft' check (status in ('draft','verified','rejected')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(study_id,office_code,window_type,period_start,period_end),
  check (period_end >= period_start),
  check ((status='verified' and verified_by is not null and verified_at is not null and verified_by<>created_by) or (status<>'verified' and verified_at is null))
);

alter table public.administrative_workload_windows enable row level security;
create index administrative_workload_windows_study_idx on public.administrative_workload_windows(study_id,office_code,window_type,period_start);

create or replace function private.validate_administrative_workload_window()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_other public.administrative_workload_windows%rowtype;
begin
  new.office_code:=upper(btrim(new.office_code));
  new.office_name:=btrim(new.office_name);
  if exists(select 1 from public.administrative_workload_windows w where w.study_id=new.study_id and w.office_code=new.office_code and w.id<>new.id and daterange(w.period_start,w.period_end,'[]') && daterange(new.period_start,new.period_end,'[]')) then
    raise exception 'Workload windows for the same office cannot overlap';
  end if;
  select * into v_other from public.administrative_workload_windows w where w.study_id=new.study_id and w.office_code=new.office_code and w.window_type<>new.window_type and w.status<>'rejected' and w.id<>new.id order by w.created_at desc limit 1;
  if found and (v_other.period_end-v_other.period_start)<>(new.period_end-new.period_start) then
    raise exception 'Baseline and pilot workload windows must have equal duration';
  end if;
  if tg_op='UPDATE' and old.status='verified' and row(new.*) is distinct from row(old.*) then
    raise exception 'Verified workload windows are immutable';
  end if;
  return new;
end;$$;
create trigger validate_administrative_workload_window before insert or update on public.administrative_workload_windows for each row execute function private.validate_administrative_workload_window();

alter table public.administrative_inquiry_metrics
  add column window_id uuid references public.administrative_workload_windows(id) on delete cascade,
  add column resolution_evidence_type text,
  add column resolution_evidence_count integer,
  add column supersedes_metric_id uuid references public.administrative_inquiry_metrics(id) on delete restrict;

alter table public.administrative_inquiry_metrics
  add constraint administrative_resolution_evidence_type_check check (resolution_evidence_type in ('explicit_user_confirmation','staff_verified_resolution','ticket_closed_with_confirmation')),
  add constraint administrative_resolution_evidence_count_check check (resolution_evidence_count >= 0 and resolution_evidence_count >= confirmed_resolved_count);

create unique index administrative_metrics_window_category_active_idx on public.administrative_inquiry_metrics(window_id,category) where supersedes_metric_id is null;
create index administrative_metrics_window_idx on public.administrative_inquiry_metrics(window_id);

create or replace function private.validate_administrative_inquiry_metric()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_window public.administrative_workload_windows%rowtype;
begin
  if tg_op<>'INSERT' then raise exception 'Workload observations are append-only'; end if;
  if new.window_id is null or new.resolution_evidence_type is null or new.resolution_evidence_count is null then raise exception 'A governed window and explicit resolution evidence are required'; end if;
  select * into v_window from public.administrative_workload_windows where id=new.window_id;
  if not found or v_window.status<>'draft' then raise exception 'Observations may be added only to a draft workload window'; end if;
  if v_window.created_by<>(select auth.uid()) then raise exception 'Only the window owner may add its aggregate observations'; end if;
  if new.confirmed_resolved_count>0 and new.resolution_evidence_count=0 then raise exception 'AI answers are not confirmed resolutions'; end if;
  new.category:=btrim(new.category);
  if char_length(new.category) not between 2 and 80 then raise exception 'Category must contain 2 to 80 characters'; end if;
  new.study_id:=v_window.study_id; new.window_type:=v_window.window_type; new.period_start:=v_window.period_start; new.period_end:=v_window.period_end; new.entered_by:=v_window.created_by;
  new.source_note:=format('Governed aggregate from %s; extract SHA-256 %s',v_window.source_system,v_window.source_extract_sha256);
  return new;
end;$$;
create trigger validate_administrative_inquiry_metric before insert or update or delete on public.administrative_inquiry_metrics for each row execute function private.validate_administrative_inquiry_metric();

drop policy if exists administrative_metrics_manage on public.administrative_inquiry_metrics;
create policy administrative_workload_windows_read on public.administrative_workload_windows for select to authenticated using ((select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian'])));
create policy administrative_workload_windows_insert on public.administrative_workload_windows for insert to authenticated with check (created_by=(select auth.uid()) and status='draft' and verified_by is null);
create policy administrative_workload_windows_update on public.administrative_workload_windows for update to authenticated using (status='draft' and (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian']))) with check ((created_by=(select auth.uid()) and status='draft') or (verified_by=(select auth.uid()) and verified_by<>created_by and status in ('verified','rejected')));
create policy administrative_workload_windows_delete on public.administrative_workload_windows for delete to authenticated using (status='draft' and created_by=(select auth.uid()));
create policy administrative_metrics_read on public.administrative_inquiry_metrics for select to authenticated using ((select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian'])));
create policy administrative_metrics_insert on public.administrative_inquiry_metrics for insert to authenticated with check (entered_by=(select auth.uid()) and exists(select 1 from public.administrative_workload_windows w where w.id=window_id and w.created_by=(select auth.uid()) and w.status='draft'));

grant select,insert,update,delete on public.administrative_workload_windows to authenticated;

create or replace function public.verify_administrative_workload_window(p_window_id uuid,p_decision text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_count integer; v_inquiries bigint; v_source_count integer;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','librarian'])) then raise exception 'Not authorized to verify workload evidence'; end if;
  if p_decision not in ('verified','rejected') then raise exception 'Decision must be verified or rejected'; end if;
  select count(*),coalesce(sum(inquiry_count),0) into v_count,v_inquiries from public.administrative_inquiry_metrics where window_id=p_window_id;
  select source_record_count into v_source_count from public.administrative_workload_windows where id=p_window_id;
  if p_decision='verified' and v_count=0 then raise exception 'At least one aggregate category is required'; end if;
  if p_decision='verified' and v_inquiries<>v_source_count then raise exception 'Category inquiry totals must equal the governed source record count'; end if;
  update public.administrative_workload_windows set status=p_decision,verified_by=case when p_decision='verified' then v_actor else null end,verified_at=case when p_decision='verified' then now() else null end where id=p_window_id and status='draft' and created_by<>v_actor;
  if not found then raise exception 'A different authorized reviewer must verify this draft'; end if;
end;$$;

create or replace function public.administrative_workload_report(p_study_id uuid,p_office_code text)
returns jsonb language plpgsql security invoker stable set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_base public.administrative_workload_windows%rowtype; v_pilot public.administrative_workload_windows%rowtype; v_rows jsonb; v_totals jsonb;
begin
  if v_actor is null or not (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','support','librarian'])) then raise exception 'Not authorized to read workload evidence'; end if;
  select * into v_base from public.administrative_workload_windows where study_id=p_study_id and office_code=upper(btrim(p_office_code)) and window_type='baseline' and status='verified' order by verified_at desc limit 1;
  select * into v_pilot from public.administrative_workload_windows where study_id=p_study_id and office_code=upper(btrim(p_office_code)) and window_type='pilot' and status='verified' order by verified_at desc limit 1;
  if not found or v_base.id is null then return jsonb_build_object('status','incomplete','claimPermitted',false,'message','Verified comparable baseline and pilot windows are required.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('category',case when least(b.inquiry_count,p.inquiry_count)<greatest(v_base.suppression_threshold,v_pilot.suppression_threshold) then 'Suppressed small cell' else b.category end,'suppressed',least(b.inquiry_count,p.inquiry_count)<greatest(v_base.suppression_threshold,v_pilot.suppression_threshold),'baseline',case when least(b.inquiry_count,p.inquiry_count)>=greatest(v_base.suppression_threshold,v_pilot.suppression_threshold) then jsonb_build_object('inquiries',b.inquiry_count,'duplicates',b.duplicate_count,'confirmedResolved',b.confirmed_resolved_count,'escalated',b.escalated_count,'meanFirstResponseSeconds',round(b.total_first_response_seconds::numeric/nullif(b.inquiry_count,0),2),'meanHandlingSeconds',round(b.total_handling_seconds::numeric/nullif(b.inquiry_count,0),2)) end,'pilot',case when least(b.inquiry_count,p.inquiry_count)>=greatest(v_base.suppression_threshold,v_pilot.suppression_threshold) then jsonb_build_object('inquiries',p.inquiry_count,'duplicates',p.duplicate_count,'confirmedResolved',p.confirmed_resolved_count,'escalated',p.escalated_count,'meanFirstResponseSeconds',round(p.total_first_response_seconds::numeric/nullif(p.inquiry_count,0),2),'meanHandlingSeconds',round(p.total_handling_seconds::numeric/nullif(p.inquiry_count,0),2)) end) order by b.category),'[]'::jsonb) into v_rows from public.administrative_inquiry_metrics b join public.administrative_inquiry_metrics p on p.window_id=v_pilot.id and p.category=b.category where b.window_id=v_base.id;
  select jsonb_build_object('baselineInquiries',coalesce(sum(case when window_id=v_base.id then inquiry_count end),0),'pilotInquiries',coalesce(sum(case when window_id=v_pilot.id then inquiry_count end),0),'baselineConfirmedResolved',coalesce(sum(case when window_id=v_base.id then confirmed_resolved_count end),0),'pilotConfirmedResolved',coalesce(sum(case when window_id=v_pilot.id then confirmed_resolved_count end),0)) into v_totals from public.administrative_inquiry_metrics where window_id in(v_base.id,v_pilot.id);
  return jsonb_build_object('status','descriptive','claimPermitted',false,'officeCode',v_base.office_code,'officeName',v_base.office_name,'comparable',true,'windowDays',(v_base.period_end-v_base.period_start)+1,'suppressionThreshold',greatest(v_base.suppression_threshold,v_pilot.suppression_threshold),'totals',v_totals,'categories',v_rows,'caveat','Descriptive comparison only. A workload-reduction claim requires the approved analysis, uncertainty, and participating-office sign-off.');
end;$$;

revoke all on function public.verify_administrative_workload_window(uuid,text) from public,anon;
revoke all on function public.administrative_workload_report(uuid,text) from public,anon;
grant execute on function public.verify_administrative_workload_window(uuid,text) to authenticated;
grant execute on function public.administrative_workload_report(uuid,text) to authenticated;

comment on table public.administrative_workload_windows is 'Governed aggregate observation windows for Issue #104; contains no respondent-level data or PII.';
comment on column public.administrative_inquiry_metrics.confirmed_resolved_count is 'Explicitly confirmed resolutions only; an AI response is never sufficient evidence.';
