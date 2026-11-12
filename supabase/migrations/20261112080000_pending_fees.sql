-- Source-observed pending-fee metadata. Due dates are not occurrence dates.
-- Existing charges keep NULL metadata; sample/verified provenance and RLS are unchanged.
alter table public.affairs_charges
  add column occurrence_on date check (occurrence_on between date '1900-01-01' and date '2100-12-31'),
  add column category text check (char_length(btrim(category)) between 1 and 80),
  add column contact_unit text check (char_length(btrim(contact_unit)) between 1 and 160),
  add column contact_extension text check (char_length(btrim(contact_extension)) between 1 and 40),
  add column payment_unit text check (char_length(btrim(payment_unit)) between 1 and 160);
comment on column public.affairs_charges.occurrence_on is 'Date the fee arose, supplied explicitly; never derived from due_on.';
create index affairs_charges_student_occurrence_idx on public.affairs_charges(student_id,occurrence_on desc nulls last,id);

create or replace function public.affairs_manage_record(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_student uuid; v_enrollment uuid; v_dtm uuid; v_section uuid; v_title text; v_summary text; v_due numeric; v_paid numeric; v_date_text text; v_key text;
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
    if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8000
      or (p_payload - array['id','student_id','label','amount_due','amount_paid','due_on','occurrence_on','category','contact_unit','contact_extension','payment_unit'])<>'{}'::jsonb then
      raise exception 'Invalid charge fields' using errcode='22023';
    end if;
    if jsonb_typeof(p_payload->'student_id') is distinct from 'string'
      or jsonb_typeof(p_payload->'label') is distinct from 'string'
      or coalesce(jsonb_typeof(p_payload->'amount_due'),'null') not in ('string','number')
      or coalesce(jsonb_typeof(p_payload->'amount_paid'),'null') not in ('string','number')
      or exists(select 1 from jsonb_each(p_payload) as supplied(key,value)
        where supplied.key not in ('amount_due','amount_paid') and jsonb_typeof(supplied.value) not in ('string','null')) then
      raise exception 'Invalid charge field types' using errcode='22023';
    end if;
    v_student=(p_payload->>'student_id')::uuid;
    if not exists(select 1 from public.affairs_students where id=v_student and source_mode='sample') then
      raise exception 'Sample student not found' using errcode='22023';
    end if;
    v_title=btrim(p_payload->>'label');
    if char_length(v_title) not between 3 and 160 then raise exception 'Invalid charge label' using errcode='22023'; end if;
    -- Validate before numeric(12,2) conversion, which otherwise silently rounds fractional cents.
    v_due=(p_payload->>'amount_due')::numeric;
    v_paid=(p_payload->>'amount_paid')::numeric;
    if v_due<0 or v_paid<0 or v_due>9999999999.99 or v_paid>v_due
      or v_due<>trunc(v_due,2) or v_paid<>trunc(v_paid,2) then
      raise exception 'Charge amounts must be nonnegative amounts with at most two decimal places, with paid not exceeding due' using errcode='22023';
    end if;
    foreach v_key in array array['due_on','occurrence_on'] loop
      v_date_text=nullif(btrim(p_payload->>v_key),'');
      if v_date_text is not null then
        if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Charge dates must use YYYY-MM-DD' using errcode='22023';
        end if;
        if v_key='occurrence_on' and (v_date_text::date<date '1900-01-01' or v_date_text::date>date '2100-12-31') then
          raise exception 'Occurrence date is outside the supported range' using errcode='22023';
        end if;
      end if;
    end loop;
    foreach v_key in array array['category','contact_unit','contact_extension','payment_unit'] loop
      if char_length(btrim(p_payload->>v_key))>(case v_key when 'category' then 80 when 'contact_extension' then 40 else 160 end) then
        raise exception 'Charge metadata is too long' using errcode='22023';
      end if;
    end loop;
    v_id=nullif(p_payload->>'id','')::uuid;
    if v_id is null then
      insert into public.affairs_charges(student_id,label,amount_due,amount_paid,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit)
      values(v_student,v_title,v_due,v_paid,nullif(btrim(p_payload->>'due_on'),'')::date,'sample',
        nullif(btrim(p_payload->>'occurrence_on'),'')::date,nullif(btrim(p_payload->>'category'),''),
        nullif(btrim(p_payload->>'contact_unit'),''),nullif(btrim(p_payload->>'contact_extension'),''),nullif(btrim(p_payload->>'payment_unit'),''))
      returning id into v_id;
    else
      update public.affairs_charges set label=v_title,amount_due=v_due,amount_paid=v_paid,due_on=nullif(btrim(p_payload->>'due_on'),'')::date,
        occurrence_on=case when p_payload ? 'occurrence_on' then nullif(btrim(p_payload->>'occurrence_on'),'')::date else occurrence_on end,
        category=case when p_payload ? 'category' then nullif(btrim(p_payload->>'category'),'') else category end,
        contact_unit=case when p_payload ? 'contact_unit' then nullif(btrim(p_payload->>'contact_unit'),'') else contact_unit end,
        contact_extension=case when p_payload ? 'contact_extension' then nullif(btrim(p_payload->>'contact_extension'),'') else contact_extension end,
        payment_unit=case when p_payload ? 'payment_unit' then nullif(btrim(p_payload->>'payment_unit'),'') else payment_unit end
      where id=v_id and student_id=v_student and source_mode='sample' returning id into v_id;
      if v_id is null then raise exception 'Sample charge not found' using errcode='22023'; end if;
    end if;
    v_summary='Saved sample charge: '||v_title;
  elsif p_kind='delete_charge' then
    if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload - 'id')<>'{}'::jsonb
      or jsonb_typeof(p_payload->'id') is distinct from 'string' then
      raise exception 'Invalid charge deletion' using errcode='22023';
    end if;
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
grant execute on function public.affairs_manage_record(text,jsonb) to authenticated;
