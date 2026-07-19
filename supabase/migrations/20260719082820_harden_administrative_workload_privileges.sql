-- Issue #120: protected workload evidence must never inherit public Data API access.
revoke all on public.administrative_workload_windows from public,anon;
revoke all on public.administrative_inquiry_metrics from public,anon;
grant select,insert,update,delete on public.administrative_workload_windows to authenticated;
grant select,insert on public.administrative_inquiry_metrics to authenticated;
