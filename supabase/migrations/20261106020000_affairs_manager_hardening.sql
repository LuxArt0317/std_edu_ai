-- Keep site admin writes within sample academic records, including after future verified imports.
create or replace function public.affairs_manage_record(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_student uuid; v_enrollment uuid; v_dtm uuid; v_section uuid; v_title text; v_summary text;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind='save_enrollment' then
    v_student=(p_payload->>'student_id')::uuid;
    v_section=(p_payload->>'section_id')::uuid;
    if not exists(select 1 from public.affairs_students where id=v_student and source_mode='sample') or
       not exists(select 1 from public.affairs_sections where id=v_section and source_mode='sample') or
       p_payload->>'status' not in ('enrolled','completed','withdrawn') then
      raise exception 'Invalid enrollment' using errcode='22023'; end if;
    insert into public.affairs_enrollments(student_id,section_id,status,source_mode)
    values(v_student,v_section,p_payload->>'status','sample')
    on conflict(student_id,section_id) do update set status=excluded.status
    where public.affairs_enrollments.source_mode='sample'
    returning id into v_id;
    if v_id is null then raise exception 'Sample enrollment not found' using errcode='22023'; end if;
    v_summary='Saved sample enrollment';
  elsif p_kind='save_charge' then
    v_student=(p_payload->>'student_id')::uuid;
    if not exists(select 1 from public.affairs_students where id=v_student and source_mode='sample') then raise exception 'Sample student not found' using errcode='22023'; end if;
    v_title=btrim(p_payload->>'label');
    if char_length(v_title) not between 3 and 160 then raise exception 'Invalid charge label' using errcode='22023'; end if;
    if (p_payload->>'amount_due')::numeric < 0 or (p_payload->>'amount_paid')::numeric < 0
       or (p_payload->>'amount_paid')::numeric > (p_payload->>'amount_due')::numeric then
      raise exception 'Invalid charge amounts' using errcode='22023'; end if;
    v_id=nullif(p_payload->>'id','')::uuid;
    if v_id is null then
      insert into public.affairs_charges(student_id,label,amount_due,amount_paid,due_on,source_mode)
      values(v_student,v_title,(p_payload->>'amount_due')::numeric,(p_payload->>'amount_paid')::numeric,nullif(p_payload->>'due_on','')::date,'sample')
      returning id into v_id;
    else
      update public.affairs_charges set label=v_title,amount_due=(p_payload->>'amount_due')::numeric,
        amount_paid=(p_payload->>'amount_paid')::numeric,due_on=nullif(p_payload->>'due_on','')::date
      where id=v_id and student_id=v_student and source_mode='sample' returning id into v_id;
      if v_id is null then raise exception 'Sample charge not found' using errcode='22023'; end if;
    end if;
    v_summary='Saved sample charge: '||v_title;
  elsif p_kind='delete_charge' then
    delete from public.affairs_charges where id=(p_payload->>'id')::uuid and source_mode='sample'
      returning id,label into v_id,v_title;
    if v_id is null then raise exception 'Sample charge not found' using errcode='22023'; end if;
    v_summary='Deleted sample charge: '||v_title;
  elsif p_kind='save_assignment' then
    v_student=(p_payload->>'student_id')::uuid;
    v_enrollment=nullif(p_payload->>'enrollment_id','')::uuid;
    v_dtm=nullif(p_payload->>'dtm_course_id','')::uuid;
    if (v_enrollment is null)=(v_dtm is null) then raise exception 'Choose one linked course' using errcode='22023'; end if;
    if not exists(select 1 from public.affairs_students where id=v_student and source_mode='sample') then
      raise exception 'Sample student not found' using errcode='22023'; end if;
    if v_enrollment is not null and not exists(select 1 from public.affairs_enrollments where id=v_enrollment and student_id=v_student and source_mode='sample') then
      raise exception 'Enrollment does not belong to student' using errcode='22023'; end if;
    if v_dtm is not null and not exists(select 1 from public.dtm_courses c join public.affairs_students s on s.user_id=c.user_id
      where c.id=v_dtm and s.id=v_student) then raise exception 'DTM course does not belong to student' using errcode='22023'; end if;
    v_title=btrim(p_payload->>'title');
    if char_length(v_title) not between 3 and 160 then raise exception 'Invalid assignment title' using errcode='22023'; end if;
    v_id=nullif(p_payload->>'id','')::uuid;
    if v_id is null then
      insert into public.affairs_assignments(student_id,enrollment_id,dtm_course_id,title,details,due_at)
      values(v_student,v_enrollment,v_dtm,v_title,left(coalesce(p_payload->>'details',''),2000),nullif(p_payload->>'due_at','')::timestamptz)
      returning id into v_id;
    else
      update public.affairs_assignments set enrollment_id=v_enrollment,dtm_course_id=v_dtm,title=v_title,
        details=left(coalesce(p_payload->>'details',''),2000),due_at=nullif(p_payload->>'due_at','')::timestamptz,updated_at=now()
      where id=v_id and student_id=v_student and source_mode='sample' returning id into v_id;
      if v_id is null then raise exception 'Sample assignment not found' using errcode='22023'; end if;
    end if;
    v_summary='Saved sample assignment: '||v_title;
  elsif p_kind='delete_assignment' then
    delete from public.affairs_assignments where id=(p_payload->>'id')::uuid and source_mode='sample'
      returning id,title into v_id,v_title;
    if v_id is null then raise exception 'Sample assignment not found' using errcode='22023'; end if;
    v_summary='Deleted sample assignment: '||v_title;
  else raise exception 'Unsupported manager action' using errcode='22023';
  end if;
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
  values((select auth.uid()),p_kind,v_id,v_summary);
  return jsonb_build_object('id',v_id,'kind',p_kind,'summary',v_summary);
end;
$$;
revoke all on function public.affairs_manage_record(text,jsonb) from public,anon;
