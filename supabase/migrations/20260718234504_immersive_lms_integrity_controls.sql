alter table public.assessments
  add column if not exists review_mode text not null default 'score_only'
    check (review_mode in ('closed', 'score_only', 'responses', 'full_review')),
  add column if not exists require_fullscreen boolean not null default false,
  add column if not exists monitor_focus boolean not null default false,
  add column if not exists detect_extended_display boolean not null default false,
  add column if not exists require_camera boolean not null default false,
  add column if not exists detect_multiple_cameras boolean not null default false,
  add column if not exists prevent_copy_paste boolean not null default false,
  add column if not exists integrity_instructions text not null default ''
    check (char_length(integrity_instructions) <= 2000);

comment on column public.assessments.review_mode is
  'Teacher-controlled post-attempt visibility: closed, score only, own responses, or full reviewed answers.';
comment on column public.assessments.monitor_focus is
  'Discloses and records browser focus/visibility changes; browsers cannot prevent operating-system app switching.';
comment on column public.assessments.detect_extended_display is
  'Best-effort Screen API signal. Unsupported browsers report unavailable rather than silently claiming enforcement.';
comment on column public.assessments.require_camera is
  'Requires a camera permission/device preflight. No camera stream or image is persisted by this platform.';

create table public.assessment_integrity_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (event_type in (
    'preflight_started', 'preflight_passed', 'preflight_failed',
    'focus_lost', 'focus_returned', 'fullscreen_entered', 'fullscreen_exited',
    'extended_display_detected', 'display_check_unavailable',
    'camera_verified', 'camera_missing', 'multiple_cameras_detected',
    'clipboard_blocked', 'assessment_submitted'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index assessment_integrity_assessment_student_idx
  on public.assessment_integrity_events(assessment_id, student_profile_id, occurred_at desc);
create index assessment_integrity_attempt_idx
  on public.assessment_integrity_events(attempt_id)
  where attempt_id is not null;
create index assessment_integrity_session_idx
  on public.assessment_integrity_events(session_id, occurred_at);

alter table public.assessment_integrity_events enable row level security;

create policy assessment_integrity_read
on public.assessment_integrity_events for select to authenticated
using (
  student_profile_id = (select auth.uid())
  or exists (
    select 1 from public.assessments a
    where a.id = assessment_id and (select private.can_manage_section(a.section_id))
  )
);

create policy assessment_integrity_student_insert
on public.assessment_integrity_events for insert to authenticated
with check (
  student_profile_id = (select auth.uid())
  and (select private.current_role()) = 'student'
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id
      and a.status = 'published'
      and (select private.can_access_section(a.section_id))
  )
  and (
    attempt_id is null
    or exists (
      select 1 from public.assessment_attempts aa
      where aa.id = attempt_id
        and aa.assessment_id = assessment_id
        and aa.student_profile_id = (select auth.uid())
    )
  )
  and jsonb_typeof(details) = 'object'
  and pg_column_size(details) <= 8192
);

revoke all on public.assessment_integrity_events from public, anon;
grant select, insert on public.assessment_integrity_events to authenticated;

create or replace function public.read_assessment_review(p_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  mode text;
  explanations_released boolean;
  payload jsonb;
begin
  if actor is null or (select private.current_role()) <> 'student' then
    raise exception 'Only an authenticated student can read an assessment review' using errcode = '42501';
  end if;
  select a.review_mode, a.release_explanations
    into mode, explanations_released
  from public.assessments a
  where a.id = p_assessment_id and (select private.can_access_section(a.section_id));
  if mode is null then raise exception 'Assessment is not visible' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.assessment_attempts aa
    where aa.assessment_id = p_assessment_id and aa.student_profile_id = actor and aa.submitted_at is not null
  ) then raise exception 'Submit an attempt before opening its review' using errcode = '42501'; end if;
  if mode in ('closed', 'score_only') then return jsonb_build_object('mode', mode, 'questions', '[]'::jsonb); end if;

  select jsonb_build_object(
    'mode', mode,
    'questions', coalesce(jsonb_agg(jsonb_build_object(
      'questionId', q.id,
      'correctOptionId', case when mode = 'full_review' then k.correct_option_id else null end,
      'explanation', case when mode = 'full_review' and explanations_released then q.explanation else '' end
    ) order by q.position), '[]'::jsonb)
  ) into payload
  from public.assessment_questions q
  left join public.assessment_answer_keys k on k.question_id = q.id
  where q.assessment_id = p_assessment_id;
  return coalesce(payload, jsonb_build_object('mode', mode, 'questions', '[]'::jsonb));
end $$;

revoke all on function public.read_assessment_review(uuid) from public, anon;
grant execute on function public.read_assessment_review(uuid) to authenticated;

-- Inline lesson media shares the existing public delivery bucket. Authoring remains
-- restricted by the existing section-manager storage policies.
update storage.buckets
set file_size_limit = 262144000,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm','video/quicktime'
    ]
where id = 'learning-media';
