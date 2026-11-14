alter table public.elearning_activities add column purpose text not null default 'link'
  check (purpose in ('link','video','slides','feedback','attendance') and
    ((kind='url' and purpose<>'attendance') or (kind='attendanceregister' and purpose in ('link','attendance'))));

update public.elearning_activities set purpose=case
    when id in (281284,281285) then 'slides'
    when id=281294 then 'feedback'
    when kind='attendanceregister' then 'attendance'
    else 'video'
  end
where (course_id=9408 and id between 293395 and 293399)
   or (course_id=9098 and id between 281284 and 281295);

-- Existing callers continue to receive the same course outline, with one
-- additional field per activity. No provider share links are stored here.
create or replace function public.elearning_course_outline(p_course_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  sections jsonb:='[]'::jsonb;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_course_id is null or p_course_id<=0 then
    raise exception 'Invalid remote-learning course' using errcode='22023';
  end if;
  if (select private.affairs_is_admin()) or exists(
    select 1 from public.elearning_course_access a where a.user_id=caller and a.course_id=p_course_id
  ) or exists(
    select 1 from public.elearning_enrollments e where e.user_id=caller and e.course_id=p_course_id
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'position',s.position,'title',s.title,'activities',
      (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'purpose',a.purpose) order by a.position),'[]'::jsonb)
        from public.elearning_activities a where a.course_id=s.course_id and a.section_position=s.position)
    ) order by s.position),'[]'::jsonb) into sections
    from public.elearning_sections s where s.course_id=p_course_id;
  end if;
  return jsonb_build_object('userId',caller,'courseId',p_course_id,'sections',sections);
end;
$$;
