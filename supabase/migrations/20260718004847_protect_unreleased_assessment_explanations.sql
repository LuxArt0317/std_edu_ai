create or replace function public.read_assessment_questions()
returns table(id uuid,assessment_id uuid,prompt text,question_type text,points numeric,"position" integer,explanation text)
language sql stable security definer set search_path='' as $$
 select q.id,q.assessment_id,q.prompt,q.question_type,q.points,q.position,
  case when (select private.can_manage_section(a.section_id)) or a.release_explanations then q.explanation else '' end
 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
 where (select private.can_access_section(a.section_id));
$$;
revoke all on function public.read_assessment_questions() from public,anon;
grant execute on function public.read_assessment_questions() to authenticated;
revoke select on public.assessment_questions from authenticated;
