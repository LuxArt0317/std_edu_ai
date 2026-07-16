create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), 'student');
$$;

create or replace function private.has_role(allowed_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select private.current_role()) = any(allowed_roles);
$$;

grant execute on function private.current_role() to authenticated;
grant execute on function private.has_role(text[]) to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  role text not null default 'student' check (role in ('admin', 'advisor', 'admissions', 'support', 'faculty', 'student')),
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.bootstrap_settings (
  singleton boolean primary key default true check (singleton),
  allowed_email text,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.bootstrap_settings (singleton) values (true);
alter table private.bootstrap_settings enable row level security;
revoke all on table private.bootstrap_settings from public, anon, authenticated;

create table public.students (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  student_number text not null unique,
  full_name text not null,
  preferred_name text,
  email text,
  phone text,
  program text not null,
  year_level text not null,
  advisor_id uuid references public.profiles(id) on delete set null,
  gpa numeric(3,2) not null default 0 check (gpa between 0 and 4.3),
  attendance_percent smallint not null default 100 check (attendance_percent between 0 and 100),
  engagement_score smallint not null default 50 check (engagement_score between 0 and 100),
  outstanding_balance numeric(12,2) not null default 0 check (outstanding_balance >= 0),
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  tags text[] not null default '{}',
  next_best_action text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_signals (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  signal_type text not null,
  label text not null,
  detail text not null,
  severity text not null check (severity in ('positive', 'neutral', 'warning', 'critical')),
  source_system text not null,
  observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  interaction_type text not null check (interaction_type in ('email', 'call', 'meeting', 'note', 'campaign', 'portal')),
  subject text not null,
  summary text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default extensions.gen_random_uuid(),
  case_number bigint generated always as identity unique,
  student_id uuid not null references public.students(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved')),
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_tasks_has_context check (student_id is not null or case_id is not null)
);

create table public.admission_leads (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  program_interest text not null,
  source text not null,
  stage text not null default 'inquiry' check (stage in ('inquiry', 'engaged', 'application', 'review', 'admitted', 'closed')),
  probability smallint not null default 10 check (probability between 0 and 100),
  owner_id uuid references public.profiles(id) on delete set null,
  next_step text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  audience_definition jsonb not null default '{}'::jsonb,
  channel text not null check (channel in ('email', 'sms', 'line', 'portal', 'multichannel')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'completed', 'paused')),
  message_template text not null default '',
  scheduled_for timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_recipients (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'delivered', 'opened', 'clicked', 'failed')),
  delivered_at timestamptz,
  opened_at timestamptz,
  primary key (campaign_id, student_id)
);

create table public.knowledge_articles (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  category text not null,
  summary text not null,
  content text not null,
  source_url text,
  status text not null default 'draft' check (status in ('draft', 'review_due', 'verified', 'archived')),
  owner_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  review_due_at timestamptz,
  usage_count bigint not null default 0 check (usage_count >= 0),
  embedding extensions.vector(1536),
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  use_case text not null check (use_case in ('answer', 'brief', 'draft')),
  model text not null,
  context_fields text[] not null default '{}',
  output_citations text[] not null default '{}',
  outcome text not null check (outcome in ('success', 'fallback', 'blocked', 'error')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index students_advisor_risk_idx on public.students (advisor_id, risk_level, risk_score desc);
create index students_program_year_idx on public.students (program, year_level);
create index student_signals_student_observed_idx on public.student_signals (student_id, observed_at desc);
create index student_signals_active_severity_idx on public.student_signals (severity, observed_at desc) where resolved_at is null;
create index interactions_student_occurred_idx on public.interactions (student_id, occurred_at desc);
create index interactions_actor_idx on public.interactions (actor_id);
create index cases_student_status_idx on public.cases (student_id, status, updated_at desc);
create index cases_owner_status_due_idx on public.cases (owner_id, status, due_at) where status <> 'resolved';
create index crm_tasks_assigned_due_idx on public.crm_tasks (assigned_to, due_at) where completed_at is null;
create index crm_tasks_student_idx on public.crm_tasks (student_id);
create index crm_tasks_case_idx on public.crm_tasks (case_id);
create index admission_leads_stage_activity_idx on public.admission_leads (stage, last_activity_at desc);
create index admission_leads_owner_idx on public.admission_leads (owner_id);
create index campaigns_creator_idx on public.campaigns (created_by);
create index campaign_recipients_student_idx on public.campaign_recipients (student_id);
create index knowledge_articles_owner_idx on public.knowledge_articles (owner_id);
create index knowledge_articles_search_idx on public.knowledge_articles using gin (search_document);
create index knowledge_articles_embedding_idx on public.knowledge_articles using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index ai_audit_logs_user_created_idx on public.ai_audit_logs (user_id, created_at desc);
create index ai_audit_logs_student_idx on public.ai_audit_logs (student_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := new.raw_app_meta_data ->> 'role';
  if requested_role is null or requested_role not in ('admin', 'advisor', 'admissions', 'support', 'faculty', 'student') then
    requested_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'STU user'
    ),
    requested_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.claim_initial_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  allowed_email text;
  existing_claim uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select lower(email) into actor_email
  from auth.users
  where id = actor_id;

  select lower(bs.allowed_email), bs.claimed_by
  into allowed_email, existing_claim
  from private.bootstrap_settings bs
  where bs.singleton = true
  for update;

  if allowed_email is null or actor_email is distinct from allowed_email then
    raise exception 'This account is not authorized to bootstrap the CRM' using errcode = '42501';
  end if;

  if existing_claim is not null then
    return existing_claim = actor_id;
  end if;

  if exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> actor_id) then
    raise exception 'An administrator already exists' using errcode = '42501';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
  where id = actor_id;

  update public.profiles
  set role = 'admin', updated_at = now()
  where id = actor_id;

  update private.bootstrap_settings
  set claimed_by = actor_id, claimed_at = now(), updated_at = now()
  where singleton = true;

  return true;
end;
$$;

revoke all on function public.claim_initial_admin() from public, anon;
grant execute on function public.claim_initial_admin() to authenticated;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students for each row execute function public.set_updated_at();
create trigger cases_set_updated_at before update on public.cases for each row execute function public.set_updated_at();
create trigger admission_leads_set_updated_at before update on public.admission_leads for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger knowledge_articles_set_updated_at before update on public.knowledge_articles for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_signals enable row level security;
alter table public.interactions enable row level security;
alter table public.cases enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.admission_leads enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.ai_audit_logs enable row level security;

create policy profiles_read_self_or_staff on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.has_role(array['admin', 'advisor', 'admissions', 'support', 'faculty'])));
create policy profiles_update_self on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = (select private.current_role()));
create policy profiles_update_admin on public.profiles for update to authenticated
using ((select private.has_role(array['admin'])))
with check ((select private.has_role(array['admin'])));

create policy students_read_authorized on public.students for select to authenticated
using (profile_id = (select auth.uid()) or (select private.has_role(array['admin', 'advisor', 'admissions', 'support', 'faculty'])));
create policy students_manage_staff on public.students for all to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'support'])));

create policy signals_read_authorized on public.student_signals for select to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])) or exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())));
create policy signals_manage_staff on public.student_signals for all to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])))
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));

create policy interactions_read_authorized on public.interactions for select to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])) or exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())));
create policy interactions_manage_staff on public.interactions for all to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])))
with check ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])));

create policy cases_read_authorized on public.cases for select to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support', 'faculty'])) or exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())));
create policy cases_manage_staff on public.cases for all to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'support'])));

create policy tasks_manage_assignee_or_admin on public.crm_tasks for all to authenticated
using (assigned_to = (select auth.uid()) or (select private.has_role(array['admin'])))
with check (assigned_to = (select auth.uid()) or (select private.has_role(array['admin'])));

create policy leads_manage_enrollment_staff on public.admission_leads for all to authenticated
using ((select private.has_role(array['admin', 'admissions'])))
with check ((select private.has_role(array['admin', 'admissions'])));
create policy campaigns_manage_enrollment_staff on public.campaigns for all to authenticated
using ((select private.has_role(array['admin', 'admissions', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'admissions', 'advisor', 'support'])));
create policy campaign_recipients_manage_staff on public.campaign_recipients for all to authenticated
using ((select private.has_role(array['admin', 'admissions', 'advisor', 'support'])))
with check ((select private.has_role(array['admin', 'admissions', 'advisor', 'support'])));

create policy knowledge_read_verified_or_staff on public.knowledge_articles for select to authenticated
using (status = 'verified' or (select private.has_role(array['admin', 'advisor', 'admissions', 'support', 'faculty'])));
create policy knowledge_manage_staff on public.knowledge_articles for all to authenticated
using ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])))
with check ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])));

create policy ai_logs_read_admin_or_owner on public.ai_audit_logs for select to authenticated
using (user_id = (select auth.uid()) or (select private.has_role(array['admin'])));
create policy ai_logs_insert_owner on public.ai_audit_logs for insert to authenticated
with check (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
grant select, insert, update on public.profiles, public.students, public.student_signals, public.interactions, public.cases,
  public.crm_tasks, public.admission_leads, public.campaigns, public.campaign_recipients, public.knowledge_articles to authenticated;
grant select, insert on public.ai_audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace view public.student_success_summary
with (security_invoker = true)
as
select
  s.id,
  s.student_number,
  s.full_name,
  s.program,
  s.year_level,
  s.gpa,
  s.attendance_percent,
  s.engagement_score,
  s.risk_score,
  s.risk_level,
  s.next_best_action,
  count(distinct c.id) filter (where c.status <> 'resolved') as open_case_count,
  count(distinct sg.id) filter (where sg.resolved_at is null) as active_signal_count
from public.students s
left join public.cases c on c.student_id = s.id
left join public.student_signals sg on sg.student_id = s.id
group by s.id;

grant select on public.student_success_summary to authenticated;

comment on table public.ai_audit_logs is 'Privacy-minimized AI telemetry. Never store prompts, raw model output, or direct contact details here.';
comment on column public.students.risk_score is 'Decision-support signal only; a staff member must review before intervention.';
comment on function public.claim_initial_admin() is 'One-time, email-allowlisted CRM administrator bootstrap. Refresh the JWT immediately after a successful claim.';

insert into public.students (
  id, student_number, full_name, preferred_name, program, year_level, gpa,
  attendance_percent, engagement_score, outstanding_balance, risk_score, risk_level,
  tags, next_best_action, last_contact_at
) values
  ('10000000-0000-4000-8000-000000000001', 'STU-DEMO-001', 'Demo Student A', 'Student A', 'Information Management', 'Year 3', 3.42, 91, 78, 0, 18, 'low', array['Project team', 'Peer mentor'], 'Invite the student to share their capstone milestone.', now() - interval '2 days'),
  ('10000000-0000-4000-8000-000000000002', 'STU-DEMO-002', 'Demo Student B', 'Student B', 'Information Management', 'Year 2', 2.31, 62, 38, 18500, 82, 'critical', array['Registration support', 'Financial aid'], 'Coordinate a same-day financial-aid and advisor check-in.', now() - interval '12 days'),
  ('10000000-0000-4000-8000-000000000003', 'STU-DEMO-003', 'Demo Student C', 'Student C', 'Visual Communication Design', 'Year 1', 2.88, 76, 55, 0, 57, 'medium', array['First year', 'Academic support'], 'Offer a short study-planning appointment before the next assessment.', now() - interval '6 days')
on conflict (id) do nothing;

insert into public.student_signals (student_id, signal_type, label, detail, severity, source_system, observed_at) values
  ('10000000-0000-4000-8000-000000000002', 'attendance', 'Attendance decline', 'Attendance is below the advising threshold across two weeks.', 'critical', 'learning_system', now() - interval '4 hours'),
  ('10000000-0000-4000-8000-000000000002', 'financial', 'Registration balance', 'An unresolved balance may block the next registration step.', 'warning', 'finance_system', now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000003', 'academic', 'Assessment momentum', 'Recent performance suggests timely study-planning support may help.', 'warning', 'student_information_system', now() - interval '1 day');

insert into public.cases (id, student_id, title, category, description, priority, status, due_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Registration readiness support', 'Financial aid', 'Coordinate a reviewed support path without making assumptions about the student.', 'urgent', 'open', now() + interval '8 hours'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Study planning check-in', 'Academic advising', 'Offer the student a short appointment and a clear next step.', 'medium', 'in_progress', now() + interval '2 days')
on conflict (id) do nothing;

insert into public.admission_leads (id, full_name, program_interest, source, stage, probability, next_step) values
  ('30000000-0000-4000-8000-000000000001', 'Demo Applicant A', 'Information Management', 'Open House', 'application', 68, 'Review required documents'),
  ('30000000-0000-4000-8000-000000000002', 'Demo Applicant B', 'Visual Communication Design', 'Website', 'engaged', 44, 'Offer a portfolio information session')
on conflict (id) do nothing;

insert into public.knowledge_articles (id, title, category, summary, content, source_url, status, verified_at, review_due_at, usage_count) values
  ('40000000-0000-4000-8000-000000000001', 'Registration readiness checklist', 'Registrar', 'Verified steps for preparing for registration.', 'Confirm holds, required advising, payment arrangements, and published registration dates. Escalate exceptions to the Registrar.', 'https://www.stu.edu.tw', 'verified', now(), now() + interval '90 days', 0),
  ('40000000-0000-4000-8000-000000000002', 'Financial support routing', 'Financial aid', 'Staff routing guidance for student financial support.', 'Listen for the immediate blocker, avoid promising eligibility, and connect the student to the responsible financial-aid team for reviewed guidance.', 'https://www.stu.edu.tw', 'verified', now(), now() + interval '90 days', 0)
on conflict (id) do nothing;
