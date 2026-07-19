-- Issue #120 reversible production evidence cleanup. Deliberately limited to
-- owner-created synthetic studies with an unmistakable title prefix.
create or replace function private.validate_administrative_inquiry_metric()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_window public.administrative_workload_windows%rowtype;
begin
  if tg_op='DELETE' and current_setting('stu.allow_workload_fixture_cleanup',true)='on' then return old; end if;
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

create or replace function public.purge_administrative_workload_fixture(p_study_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_title text; v_metrics integer; v_windows integer;
begin
  if (select auth.uid()) is null or not (select private.has_role(array['owner'])) then raise exception 'Only the protected owner may purge workload fixtures'; end if;
  select title into v_title from public.research_studies where id=p_study_id and owner_profile_id=(select auth.uid()) for update;
  if v_title is null or v_title not like 'Synthetic workload validation%' then raise exception 'Only synthetic workload validation studies may be purged'; end if;
  perform set_config('stu.allow_workload_fixture_cleanup','on',true);
  delete from public.administrative_inquiry_metrics where study_id=p_study_id; get diagnostics v_metrics=row_count;
  delete from public.administrative_workload_windows where study_id=p_study_id; get diagnostics v_windows=row_count;
  delete from public.research_studies where id=p_study_id;
  return jsonb_build_object('metricsDeleted',v_metrics,'windowsDeleted',v_windows,'studyDeleted',true);
end;$$;
revoke all on function public.purge_administrative_workload_fixture(uuid) from public,anon;
grant execute on function public.purge_administrative_workload_fixture(uuid) to authenticated;
