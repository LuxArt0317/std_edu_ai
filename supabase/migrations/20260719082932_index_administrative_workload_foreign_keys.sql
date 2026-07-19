-- Issue #120 advisor remediation for every workload-specific foreign key.
create index administrative_metrics_entered_by_idx on public.administrative_inquiry_metrics(entered_by);
create index administrative_metrics_supersedes_idx on public.administrative_inquiry_metrics(supersedes_metric_id) where supersedes_metric_id is not null;
create index administrative_workload_windows_created_by_idx on public.administrative_workload_windows(created_by);
create index administrative_workload_windows_verified_by_idx on public.administrative_workload_windows(verified_by) where verified_by is not null;
