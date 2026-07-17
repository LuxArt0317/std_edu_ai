create or replace function public.create_lms_assessment(
  p_section_id uuid,
  p_title text,
  p_instructions text,
  p_type text,
  p_due_at timestamptz,
  p_max_score numeric,
  p_publish boolean,
  p_questions jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assessment_id uuid;
  question jsonb;
  question_id uuid;
  option_text text;
  option_id uuid;
  correct_option uuid;
  question_position integer := 0;
  option_position integer;
  computed_score numeric := 0;
begin
  if not (select private.can_manage_section(p_section_id)) then
    raise exception 'You cannot manage this course section' using errcode = '42501';
  end if;
  if p_type not in ('quiz','exam','assignment','project') then raise exception 'Invalid assessment type'; end if;
  if char_length(trim(p_title)) not between 2 and 180 then raise exception 'Assessment title must contain 2 to 180 characters'; end if;
  if p_type in ('quiz','exam') and jsonb_array_length(p_questions) = 0 then raise exception 'A quiz or exam requires at least one question'; end if;

  if p_type in ('quiz','exam') then
    select coalesce(sum((value->>'points')::numeric),0) into computed_score from jsonb_array_elements(p_questions);
  else computed_score := p_max_score; end if;
  if computed_score <= 0 or computed_score > 10000 then raise exception 'Maximum score must be between 1 and 10000'; end if;

  insert into public.assessments(section_id,title,instructions,assessment_type,status,due_at,max_score,created_by)
  values(p_section_id,trim(p_title),left(coalesce(p_instructions,''),10000),p_type,case when p_publish then 'published' else 'draft' end,p_due_at,computed_score,(select auth.uid()))
  returning id into assessment_id;

  for question in select value from jsonb_array_elements(p_questions) loop
    question_position := question_position + 1;
    if jsonb_array_length(question->'options') < 2 then raise exception 'Question % requires at least two choices', question_position; end if;
    insert into public.assessment_questions(assessment_id,prompt,question_type,points,position,explanation)
    values(assessment_id,left(trim(question->>'prompt'),10000),'multiple_choice',(question->>'points')::numeric,question_position,left(coalesce(question->>'explanation',''),10000)) returning id into question_id;
    option_position := 0; correct_option := null;
    for option_text in select value #>> '{}' from jsonb_array_elements(question->'options') loop
      option_position := option_position + 1;
      insert into public.assessment_options(question_id,label,position) values(question_id,left(trim(option_text),1000),option_position) returning id into option_id;
      if option_position = (question->>'correctOption')::integer then correct_option := option_id; end if;
    end loop;
    if correct_option is null then raise exception 'Question % has no valid correct choice', question_position; end if;
    insert into public.assessment_answer_keys(question_id,correct_option_id,grading_notes) values(question_id,correct_option,left(coalesce(question->>'gradingNotes',''),4000));
  end loop;
  return assessment_id;
end; $$;

revoke all on function public.create_lms_assessment(uuid,text,text,text,timestamptz,numeric,boolean,jsonb) from public, anon;
grant execute on function public.create_lms_assessment(uuid,text,text,text,timestamptz,numeric,boolean,jsonb) to authenticated;
comment on function public.create_lms_assessment(uuid,text,text,text,timestamptz,numeric,boolean,jsonb) is 'Atomic RLS-governed builder for assignments/projects and objective quizzes/exams with protected answer keys.';
