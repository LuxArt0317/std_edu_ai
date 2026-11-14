-- Download authorization is evaluated against the requesting student before
-- the application server issues a short-lived Storage capability.
drop policy affairs_health_report_read on storage.objects;
drop function private.affairs_can_read_health_report(text);

create function public.affairs_can_download_health_report(p_record_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select private.affairs_google_identity()) and exists (
    select 1
    from public.affairs_health_examinations e
    join storage.objects o
      on o.bucket_id='affairs-health-reports' and o.name=e.user_id::text||'/'||e.id::text||'.pdf'
    where e.user_id=(select auth.uid()) and e.id=p_record_id and e.report_available
  );
$$;
revoke all on function public.affairs_can_download_health_report(uuid) from public,anon;
grant execute on function public.affairs_can_download_health_report(uuid) to authenticated;
