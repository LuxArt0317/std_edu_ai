-- Issue #120: remove the advisor-visible SECURITY DEFINER cleanup surface.
create policy administrative_metrics_owner_fixture_delete on public.administrative_inquiry_metrics for delete to authenticated using (
  (select private.has_role(array['owner'])) and exists(select 1 from public.research_studies s where s.id=study_id and s.owner_profile_id=(select auth.uid()) and s.title like 'Synthetic workload validation%')
);
create policy administrative_windows_owner_fixture_delete on public.administrative_workload_windows for delete to authenticated using (
  (select private.has_role(array['owner'])) and exists(select 1 from public.research_studies s where s.id=study_id and s.owner_profile_id=(select auth.uid()) and s.title like 'Synthetic workload validation%')
);

create or replace function public.purge_administrative_workload_fixture(p_study_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
