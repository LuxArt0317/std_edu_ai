create or replace function public.submit_assessment(p_assessment_id uuid, p_answers jsonb)
returns table (attempt_id uuid, score numeric, max_score numeric, status text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); created_attempt uuid; next_attempt integer;
  allowed_attempts integer; computed_score numeric(8,2); possible_score numeric(8,2);
  needs_review boolean; release_now boolean;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  if (select private.current_role()) <> 'student' then raise exception 'Only students can submit an assessment attempt' using errcode = '42501'; end if;
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'Answers must be an array' using errcode = '22023'; end if;

  select a.attempt_limit, a.max_score, a.release_scores_immediately
    into allowed_attempts, possible_score, release_now
  from public.assessments a
  where a.id = p_assessment_id and a.status = 'published'
    and (a.opens_at is null or a.opens_at <= now()) and (a.due_at is null or a.due_at >= now())
    and (select private.can_access_section(a.section_id));
  if allowed_attempts is null then raise exception 'Assessment is not available' using errcode = '42501'; end if;

  select coalesce(max(aa.attempt_number), 0) + 1 into next_attempt
  from public.assessment_attempts aa where aa.assessment_id = p_assessment_id and aa.student_profile_id = actor_id;
  if next_attempt > allowed_attempts then raise exception 'Attempt limit reached' using errcode = '23514'; end if;

  insert into public.assessment_attempts (assessment_id, student_profile_id, attempt_number, max_score)
  values (p_assessment_id, actor_id, next_attempt, possible_score) returning id into created_attempt;
  insert into public.assessment_answers (attempt_id, question_id, selected_option_id, response_text)
  select created_attempt, q.id,
    case when answer.value ? 'optionId' and nullif(answer.value ->> 'optionId', '') is not null then (answer.value ->> 'optionId')::uuid else null end,
    nullif(trim(answer.value ->> 'text'), '')
  from jsonb_array_elements(p_answers) answer(value)
  join public.assessment_questions q on q.id = (answer.value ->> 'questionId')::uuid and q.assessment_id = p_assessment_id;

  update public.assessment_answers aa set
    is_correct = case when key.correct_option_id is not null then aa.selected_option_id = key.correct_option_id when cardinality(key.acceptable_answers) > 0 then lower(trim(coalesce(aa.response_text, ''))) = any(key.acceptable_answers) else null end,
    points_awarded = case when key.correct_option_id is not null and aa.selected_option_id = key.correct_option_id then q.points when cardinality(key.acceptable_answers) > 0 and lower(trim(coalesce(aa.response_text, ''))) = any(key.acceptable_answers) then q.points when key.correct_option_id is not null or cardinality(key.acceptable_answers) > 0 then 0 else null end,
    updated_at = now()
  from public.assessment_questions q left join public.assessment_answer_keys key on key.question_id = q.id
  where aa.attempt_id = created_attempt and aa.question_id = q.id;
  select coalesce(sum(aa.points_awarded), 0), bool_or(aa.is_correct is null) into computed_score, needs_review
  from public.assessment_answers aa where aa.attempt_id = created_attempt;
  update public.assessment_attempts aa set score = computed_score,
    status = case when coalesce(needs_review, false) then 'needs_review' else 'graded' end,
    submitted_at = now(), graded_at = case when coalesce(needs_review, false) then null else now() end
  where aa.id = created_attempt;

  return query select aa.id,
    case when release_now then aa.score else null end,
    case when release_now then aa.max_score else null end,
    aa.status from public.assessment_attempts aa where aa.id = created_attempt;
end $$;

create or replace function public.read_assessment_attempts()
returns table (id uuid, assessment_id uuid, student_profile_id uuid, attempt_number integer, status text, score numeric, max_score numeric, started_at timestamptz, submitted_at timestamptz, graded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select aa.id, aa.assessment_id, aa.student_profile_id, aa.attempt_number, aa.status,
    case when (select private.can_manage_section(a.section_id)) or a.release_scores_immediately then aa.score else null end,
    case when (select private.can_manage_section(a.section_id)) or a.release_scores_immediately then aa.max_score else null end,
    aa.started_at, aa.submitted_at, aa.graded_at
  from public.assessment_attempts aa join public.assessments a on a.id = aa.assessment_id
  where aa.student_profile_id = (select auth.uid()) or (select private.can_manage_section(a.section_id));
$$;

revoke all on function public.submit_assessment(uuid, jsonb) from public, anon;
grant execute on function public.submit_assessment(uuid, jsonb) to authenticated;
revoke all on function public.read_assessment_attempts() from public, anon;
grant execute on function public.read_assessment_attempts() to authenticated;
revoke select on public.assessment_attempts from authenticated;
grant select (id, assessment_id, student_profile_id, attempt_number, status, started_at, submitted_at, graded_at) on public.assessment_attempts to authenticated;
