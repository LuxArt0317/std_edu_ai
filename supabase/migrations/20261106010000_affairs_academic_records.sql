-- Stu.best demonstration records only. These rows are never official university
-- enrollment, Moodle, or billing records. The protected Google admin manages them.
create table public.affairs_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.affairs_students(id) on delete cascade,
  enrollment_id uuid references public.affairs_enrollments(id) on delete cascade,
  dtm_course_id uuid references public.dtm_courses(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  details text not null default '',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','submitted','graded')),
  submitted_at timestamptz,
  source_mode text not null default 'sample' check (source_mode = 'sample'),
  updated_at timestamptz not null default now(),
  check ((enrollment_id is not null) <> (dtm_course_id is not null)),
  check ((status = 'open' and submitted_at is null) or (status <> 'open' and submitted_at is not null))
);
create unique index affairs_assignment_enrollment_unique on public.affairs_assignments(student_id,enrollment_id,title) where enrollment_id is not null;
create unique index affairs_assignment_dtm_unique on public.affairs_assignments(student_id,dtm_course_id,title) where dtm_course_id is not null;
create index affairs_assignments_student_due_idx on public.affairs_assignments(student_id,due_at);
alter table public.affairs_assignments enable row level security;
revoke all on public.affairs_assignments from anon,authenticated;
grant select on public.affairs_assignments to authenticated;
create policy affairs_assignments_read on public.affairs_assignments for select to authenticated
  using ((select private.affairs_google_identity()) and
    (student_id in (select id from public.affairs_students where user_id=(select auth.uid())) or (select private.affairs_is_admin())));
create policy dtm_courses_admin_read on public.dtm_courses for select to authenticated
  using ((select private.affairs_is_admin()));

insert into public.affairs_terms(code,label,starts_on,ends_on) values
  ('SAMPLE-2026-SPRING','Sample Spring 2026','2026-02-16','2026-06-26'),
  ('SAMPLE-2027-SPRING','Sample Spring 2027','2027-02-15','2027-06-25')
on conflict(code) do nothing;
insert into public.affairs_courses(code,title,credits,program_id)
select v.code,v.title,v.credits,p.id from (values
  ('SAMP090','Study Skills Foundations',2.0::numeric),
  ('SAMP103','Student Services Practice',2.0::numeric),
  ('SAMP201','Applied Digital Projects',3.0::numeric)
) v(code,title,credits) cross join public.affairs_programs p where p.code='SAMPLE-GEN'
on conflict(code) do nothing;
insert into public.affairs_sections(course_id,term_id,section_code,instructor,weekday,starts_at,ends_at,room)
select c.id,t.id,'A','Sample instructor',v.weekday,v.starts_at::time,v.ends_at::time,v.room
from (values
  ('SAMP090','SAMPLE-2026-SPRING',2,'09:00','10:30','Sample Room 104'),
  ('SAMP103','SAMPLE-2026-FALL',5,'10:00','11:30','Sample Room 305'),
  ('SAMP201','SAMPLE-2027-SPRING',2,'14:00','15:30','Sample Lab 202')
) v(code,term,weekday,starts_at,ends_at,room)
join public.affairs_courses c on c.code=v.code join public.affairs_terms t on t.code=v.term
on conflict(course_id,term_id,section_code) do nothing;

create function private.affairs_seed_student_records(p_student_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enrollment uuid;
begin
  insert into public.affairs_enrollments(student_id,section_id,status)
  select p_student_id,s.id,case when t.code='SAMPLE-2026-SPRING' then 'completed' else 'enrolled' end
  from public.affairs_sections s join public.affairs_terms t on t.id=s.term_id
  join public.affairs_courses c on c.id=s.course_id
  where c.code in ('SAMP090','SAMP103','SAMP201')
  on conflict(student_id,section_id) do nothing;
  insert into public.affairs_charges(student_id,label,amount_due,amount_paid,currency,due_on,source_mode)
  select p_student_id,'Sample Fall 2026 tuition',28000,5000,'TWD','2026-12-15','sample'
  where not exists(select 1 from public.affairs_charges where student_id=p_student_id and label='Sample Fall 2026 tuition');
  select e.id into v_enrollment from public.affairs_enrollments e
    join public.affairs_sections s on s.id=e.section_id join public.affairs_courses c on c.id=s.course_id
    where e.student_id=p_student_id and c.code='SAMP103' limit 1;
  if v_enrollment is not null then
    insert into public.affairs_assignments(student_id,enrollment_id,title,details,due_at)
    values(p_student_id,v_enrollment,'Student services worksheet','Complete the sample student services checklist.','2026-11-13 15:59:00+00')
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function private.affairs_seed_student_records(uuid) from public,anon,authenticated;
create function private.affairs_seed_student_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.affairs_seed_student_records(new.id);
  return new;
end;
$$;
revoke all on function private.affairs_seed_student_trigger() from public,anon,authenticated;
create trigger affairs_seed_student_after_insert after insert on public.affairs_students
  for each row execute function private.affairs_seed_student_trigger();
select private.affairs_seed_student_records(id) from public.affairs_students where source_mode='sample';

create function private.affairs_seed_dtm_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_student uuid;
begin
  if new.kind <> 'assignment' then return new; end if;
  select s.id into v_student from public.affairs_students s
  join public.dtm_courses c on c.user_id=s.user_id where c.id=new.course_id;
  if v_student is not null then
    insert into public.affairs_assignments(student_id,dtm_course_id,title,details,due_at)
    values(v_student,new.course_id,new.title,new.summary,'2026-11-18 15:59:00+00')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.affairs_seed_dtm_assignment() from public,anon,authenticated;
create trigger affairs_seed_dtm_after_insert after insert on public.dtm_materials
  for each row execute function private.affairs_seed_dtm_assignment();
insert into public.affairs_assignments(student_id,dtm_course_id,title,details,due_at)
select s.id,c.id,m.title,m.summary,'2026-11-18 15:59:00+00' from public.dtm_materials m
join public.dtm_courses c on c.id=m.course_id join public.affairs_students s on s.user_id=c.user_id
where m.kind='assignment' on conflict do nothing;

-- All manager writes are audited and preserve sample provenance. Ordinary
-- authenticated users retain SELECT-only access to academic and fee records.
create function public.affairs_manage_record(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_student uuid; v_enrollment uuid; v_dtm uuid; v_section uuid; v_title text; v_summary text;
begin
  if not (select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_kind='save_enrollment' then
    v_student=(p_payload->>'student_id')::uuid;
    v_section=(p_payload->>'section_id')::uuid;
    if not exists(select 1 from public.affairs_students where id=v_student) or
       not exists(select 1 from public.affairs_sections where id=v_section) or
       p_payload->>'status' not in ('enrolled','completed','withdrawn') then
      raise exception 'Invalid enrollment' using errcode='22023'; end if;
    insert into public.affairs_enrollments(student_id,section_id,status,source_mode)
    values(v_student,v_section,p_payload->>'status','sample')
    on conflict(student_id,section_id) do update set status=excluded.status
    returning id into v_id;
    v_summary='Saved sample enrollment';
  elsif p_kind='save_charge' then
    v_student=(p_payload->>'student_id')::uuid;
    if not exists(select 1 from public.affairs_students where id=v_student) then raise exception 'Student not found' using errcode='22023'; end if;
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
    if v_enrollment is not null and not exists(select 1 from public.affairs_enrollments where id=v_enrollment and student_id=v_student) then
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
