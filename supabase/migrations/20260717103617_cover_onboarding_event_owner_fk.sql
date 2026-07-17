-- Cover the complete composite ownership foreign key used for event cleanup and
-- integrity checks. The former progress-only index is a left-prefix subset.
drop index if exists public.onboarding_events_progress_idx;
create index onboarding_events_progress_owner_idx
  on public.onboarding_events (progress_id, user_id, role, created_at desc);
