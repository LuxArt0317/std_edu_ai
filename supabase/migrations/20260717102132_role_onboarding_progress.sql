-- Durable, role-aware onboarding evidence. This is a usability/readiness signal;
-- it never grants application permissions or replaces database authorization.

create table public.onboarding_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in (
    'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
    'department_head', 'faculty', 'advisor', 'admissions', 'finance',
    'support', 'librarian', 'student'
  )),
  journey_key text not null default 'stu-nexus-role-foundations'
    check (char_length(journey_key) between 3 and 100),
  journey_version smallint not null default 1 check (journey_version > 0),
  current_step_key text not null default '' check (char_length(current_step_key) <= 100),
  completed_step_keys text[] not null default '{}',
  verified_action_keys text[] not null default '{}',
  check_results jsonb not null default '{}'::jsonb check (jsonb_typeof(check_results) = 'object'),
  understanding_score smallint not null default 0 check (understanding_score between 0 and 100),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'ready')),
  started_at timestamptz,
  completed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role, journey_key, journey_version),
  unique (id, user_id, role)
);

create table public.onboarding_events (
  id uuid primary key default extensions.gen_random_uuid(),
  progress_id uuid not null,
  user_id uuid not null,
  role text not null check (role in (
    'owner', 'admin', 'president', 'vice_president', 'dean', 'registrar',
    'department_head', 'faculty', 'advisor', 'admissions', 'finance',
    'support', 'librarian', 'student'
  )),
  step_key text not null check (char_length(step_key) between 1 and 100),
  event_type text not null check (event_type in (
    'journey_started', 'step_viewed', 'action_verified', 'answer_submitted',
    'step_completed', 'journey_completed', 'journey_restarted'
  )),
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object' and octet_length(event_data::text) <= 4096),
  created_at timestamptz not null default now(),
  constraint onboarding_events_progress_owner_fk
    foreign key (progress_id, user_id, role)
    references public.onboarding_progress(id, user_id, role)
    on delete cascade
);

create index onboarding_progress_readiness_idx
  on public.onboarding_progress (role, status, updated_at desc);
create index onboarding_progress_user_idx
  on public.onboarding_progress (user_id, updated_at desc);
create index onboarding_events_progress_idx
  on public.onboarding_events (progress_id, created_at desc);
create index onboarding_events_user_idx
  on public.onboarding_events (user_id, created_at desc);

create trigger onboarding_progress_set_updated_at
before update on public.onboarding_progress
for each row execute function public.set_updated_at();

alter table public.onboarding_progress enable row level security;
alter table public.onboarding_events enable row level security;

create policy onboarding_progress_read_authorized
on public.onboarding_progress
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.has_role(array['admin']))
);

create policy onboarding_progress_insert_self
on public.onboarding_progress
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and role = (select private.current_role())
);

create policy onboarding_progress_update_self
on public.onboarding_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and role = (select private.current_role())
);

create policy onboarding_events_read_authorized
on public.onboarding_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.has_role(array['admin']))
);

create policy onboarding_events_insert_self
on public.onboarding_events
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and role = (select private.current_role())
  and exists (
    select 1
    from public.onboarding_progress progress
    where progress.id = progress_id
      and progress.user_id = (select auth.uid())
      and progress.role = (select private.current_role())
  )
);

revoke all on table public.onboarding_progress from public, anon, authenticated;
revoke all on table public.onboarding_events from public, anon, authenticated;
grant select, insert, update on table public.onboarding_progress to authenticated;
grant select, insert on table public.onboarding_events to authenticated;
grant select, insert, update, delete on table public.onboarding_progress to service_role;
grant select, insert, update, delete on table public.onboarding_events to service_role;

comment on table public.onboarding_progress is
'Role-and-version-specific onboarding readiness. Scores are UX evidence only and never authorize school data access.';
comment on table public.onboarding_events is
'Append-only evidence of viewed instructions, verified interface actions, and answered onboarding checks.';
