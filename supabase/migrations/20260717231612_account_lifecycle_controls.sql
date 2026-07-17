alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status_reason text,
  drop constraint if exists profiles_account_status_check,
  add constraint profiles_account_status_check
    check (account_status in ('active', 'suspended', 'archived'));

create table if not exists public.account_lifecycle_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists account_lifecycle_target_created_idx
  on public.account_lifecycle_audit (target_profile_id, created_at desc);

alter table public.account_lifecycle_audit enable row level security;

drop policy if exists account_lifecycle_audit_read_governance
  on public.account_lifecycle_audit;
create policy account_lifecycle_audit_read_governance
  on public.account_lifecycle_audit for select to authenticated
  using ((select private.has_role(array['admin'])));

revoke all on public.account_lifecycle_audit from public, anon, authenticated;
grant select on public.account_lifecycle_audit to authenticated;

grant select (account_status, status_changed_at, status_changed_by, status_reason)
  on public.profiles to authenticated;

comment on table public.account_lifecycle_audit is
  'Immutable owner-controlled activation, suspension, archival, and restoration history.';
