-- Student-owned records in stu.best. None of these operations calls the university.
alter table public.dtm_courses drop constraint dtm_courses_source_mode_check;
alter table public.dtm_courses add check (source_mode in ('sample', 'personal'));
alter table public.dtm_materials drop constraint dtm_materials_source_mode_check;
alter table public.dtm_materials add check (source_mode in ('sample', 'personal'));
alter table public.dtm_materials add column source_url text check (
  source_url is null or source_url ~ '^https://dtm[.]stu[.]edu[.]tw/(course|mod/[a-z_]+)/view[.]php[?]id=[0-9]{1,12}$'
);

create table public.dtm_meetings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  meeting_on date not null check (meeting_on between date '2000-01-01' and date '2100-12-31'),
  starts_at time not null default '00:00',
  title text not null check (char_length(title) between 1 and 160),
  attendance text not null default 'unknown' check (attendance in ('unknown','present','late','absent','excused')),
  notes text not null default '' check (char_length(notes) <= 2000),
  unique (course_id, meeting_on, starts_at),
  unique (id, course_id)
);

create table public.dtm_grade_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 160),
  score numeric(10,2) not null check (score >= 0 and score <= maximum),
  maximum numeric(10,2) not null check (maximum > 0 and maximum <= 1000000),
  graded_on date check (graded_on between date '2000-01-01' and date '2100-12-31'),
  feedback text not null default '' check (char_length(feedback) <= 2000)
);
create index dtm_grade_items_course_idx on public.dtm_grade_items(course_id);

alter table public.affairs_assignments drop constraint affairs_assignments_source_mode_check;
alter table public.affairs_assignments add check (source_mode in ('sample', 'personal'));
alter table public.affairs_assignments add check (source_mode <> 'personal' or dtm_course_id is not null);
alter table public.affairs_assignments add check (
  source_mode <> 'personal' or due_at between '2000-01-01 00:00:00+00'::timestamptz and '2101-01-01 00:00:00+00'::timestamptz
);
alter table public.affairs_assignments
  add column meeting_id uuid,
  add column import_key text check (import_key is null or (source_mode='personal' and import_key ~ '^[0-9a-f]{64}$')),
  add check (meeting_id is null or (source_mode='personal' and dtm_course_id is not null)),
  add foreign key (meeting_id, dtm_course_id) references public.dtm_meetings(id, course_id) on delete set null (meeting_id);
create index affairs_assignments_meeting_idx on public.affairs_assignments(meeting_id, dtm_course_id) where meeting_id is not null;
drop index public.affairs_assignment_dtm_unique;
create unique index affairs_assignment_dtm_unique on public.affairs_assignments(student_id, dtm_course_id, title)
  where dtm_course_id is not null and source_mode='sample';
create unique index affairs_assignment_calendar_unique on public.affairs_assignments(dtm_course_id, import_key)
  where import_key is not null;

-- The site administrator manages the demonstration catalog only.
alter policy dtm_courses_admin_read on public.dtm_courses
  using (source_mode='sample' and (select private.affairs_is_admin()));
alter policy affairs_assignments_read on public.affairs_assignments using (
  (select private.affairs_google_identity()) and (
    student_id in (select id from public.affairs_students where user_id=(select auth.uid()))
    or (source_mode='sample' and (select private.affairs_is_admin()))
  )
);
create function private.dtm_check_assignment_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.dtm_course_id is not null and not exists (
    select 1 from public.dtm_courses c
    join public.affairs_students s on s.user_id=c.user_id
    where c.id=new.dtm_course_id and s.id=new.student_id and c.source_mode=new.source_mode
  ) then
    raise exception 'Assignment must belong to the same student and course source' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.dtm_check_assignment_owner() from public, anon, authenticated;
create trigger dtm_assignment_owner before insert or update of student_id, dtm_course_id, source_mode
  on public.affairs_assignments for each row execute function private.dtm_check_assignment_owner();

create table public.affairs_service_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  service_key text not null,
  record_type text not null,
  title text not null check (char_length(title) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'draft' check (status in ('draft','filed','withdrawn')),
  starts_on date check (starts_on between date '2000-01-01' and date '2100-12-31'),
  ends_on date check (ends_on between date '2000-01-01' and date '2100-12-31'),
  leave_category text check (leave_category in ('personal','sick','official','bereavement','other')),
  periods text check (char_length(periods) between 1 and 80),
  review_request_id uuid unique references public.affairs_service_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((starts_on is null) = (ends_on is null) and (starts_on is null or starts_on <= ends_on)),
  check (
    (service_key='leave' and record_type='leave' and starts_on is not null and leave_category is not null and periods is not null)
    or (service_key='internship' and record_type in ('contract','self_assessment','company') and leave_category is null and periods is null)
    or (service_key ~ '^[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$' and record_type='note' and starts_on is null and leave_category is null and periods is null)
  )
);
create index affairs_service_records_owner_idx on public.affairs_service_records(user_id, updated_at desc);

alter table public.dtm_meetings enable row level security;
alter table public.dtm_grade_items enable row level security;
alter table public.affairs_service_records enable row level security;
revoke all on public.dtm_meetings, public.dtm_grade_items, public.affairs_service_records from public, anon, authenticated;
grant select on public.dtm_meetings, public.dtm_grade_items, public.affairs_service_records to authenticated;
create policy dtm_meetings_own on public.dtm_meetings for select to authenticated using (
  (select private.affairs_google_identity()) and exists (
    select 1 from public.dtm_courses c where c.id=course_id and c.user_id=(select auth.uid())
  )
);
create policy dtm_grade_items_own on public.dtm_grade_items for select to authenticated using (
  (select private.affairs_google_identity()) and exists (
    select 1 from public.dtm_courses c where c.id=course_id and c.user_id=(select auth.uid())
  )
);
create policy affairs_service_records_own on public.affairs_service_records for select to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));

create function public.affairs_manage_service_record(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_record public.affairs_service_records;
  v_request uuid;
begin
  if not (select private.affairs_google_identity()) or not exists (
    select 1 from public.affairs_profiles where user_id=v_uid
  ) then raise exception 'School Affairs sign-in is required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 10000 then
    raise exception 'Invalid service record' using errcode='22023';
  end if;
  if p_kind='save_service_record' then
    insert into public.affairs_service_records (
      id, user_id, service_key, record_type, title, notes, status, starts_on, ends_on, leave_category, periods
    ) values (
      (p_payload->>'id')::uuid, v_uid, p_payload->>'service_key', p_payload->>'record_type',
      btrim(p_payload->>'title'), coalesce(btrim(p_payload->>'notes'), ''), p_payload->>'status',
      nullif(p_payload->>'starts_on','')::date, nullif(p_payload->>'ends_on','')::date,
      nullif(p_payload->>'leave_category',''), nullif(btrim(p_payload->>'periods'),'')
    )
    on conflict (id) do update set title=excluded.title, notes=excluded.notes, status=excluded.status,
      starts_on=excluded.starts_on, ends_on=excluded.ends_on, leave_category=excluded.leave_category,
      periods=excluded.periods, updated_at=now()
    where affairs_service_records.user_id=v_uid and affairs_service_records.service_key=excluded.service_key
      and affairs_service_records.record_type=excluded.record_type
    returning id into v_id;
  elsif p_kind='submit_service_record_for_review' then
    select * into v_record from public.affairs_service_records
    where id=(p_payload->>'id')::uuid and user_id=v_uid and service_key in ('leave','internship')
      and status <> 'withdrawn' for update;
    if v_record.id is null then raise exception 'Service record unavailable' using errcode='42501'; end if;
    if v_record.review_request_id is not null then
      return jsonb_build_object('id', v_record.id, 'kind', p_kind);
    end if;
    insert into public.affairs_service_requests(user_id, request_type, title, details)
    values(v_uid, 'general',
      left((case when v_record.service_key='leave' then 'Student Leave: ' else 'Internship: ' end)||v_record.title, 160),
      concat_ws(E'\n', 'stu.best review of '||replace(v_record.record_type, '_', ' '),
        case when v_record.starts_on is not null then 'Dates: '||v_record.starts_on||' to '||v_record.ends_on end,
        case when v_record.periods is not null then 'Class periods: '||v_record.periods end))
    returning id into v_request;
    update public.affairs_service_records set review_request_id=v_request, updated_at=now() where id=v_record.id
    returning id into v_id;
  elsif p_kind='delete_service_record' then
    delete from public.affairs_service_records
    where id=(p_payload->>'id')::uuid and user_id=v_uid returning id into v_id;
  else
    raise exception 'Unsupported service record operation' using errcode='22023';
  end if;
  if v_id is null then raise exception 'Service record unavailable' using errcode='42501'; end if;
  insert into public.affairs_agent_audit(user_id, action_kind, target_id, summary)
    values (v_uid, p_kind, v_id, 'Changed a private student service record.');
  return jsonb_build_object('id', v_id, 'kind', p_kind);
end;
$$;

create function public.dtm_manage_record(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_course uuid;
  v_student uuid;
  v_position integer;
  v_imported integer := 0;
  v_status text;
begin
  if not (select private.affairs_google_identity()) or not exists (
    select 1 from public.affairs_profiles where user_id=v_uid
  ) then raise exception 'School Affairs sign-in is required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 50000 then
    raise exception 'Invalid DTM record' using errcode='22023';
  end if;
  if p_kind='save_dtm_course' then
    if not coalesce(char_length(btrim(p_payload->>'code')) between 1 and 32
      and char_length(btrim(p_payload->>'title')) between 1 and 160
      and char_length(btrim(p_payload->>'term')) between 1 and 80, false) then
      raise exception 'Course code, title and term are required' using errcode='22023';
    end if;
    insert into public.dtm_courses(id, user_id, code, title, term, source_mode)
    values ((p_payload->>'id')::uuid, v_uid, btrim(p_payload->>'code'), btrim(p_payload->>'title'), btrim(p_payload->>'term'), 'personal')
    on conflict (id) do update set code=excluded.code, title=excluded.title, term=excluded.term
    where dtm_courses.user_id=v_uid and dtm_courses.source_mode='personal' returning id into v_id;
  elsif p_kind='delete_dtm_course' then
    delete from public.dtm_courses where id=(p_payload->>'id')::uuid and user_id=v_uid and source_mode='personal'
    returning id into v_id;
  else
    select c.id into v_course from public.dtm_courses c
    where c.id=(p_payload->>'course_id')::uuid and c.user_id=v_uid and c.source_mode='personal'
    for update;
    if v_course is null then raise exception 'Personal course unavailable' using errcode='42501'; end if;

    case p_kind
      when 'save_dtm_meeting' then
        insert into public.dtm_meetings(id, course_id, meeting_on, starts_at, title, attendance, notes)
        values ((p_payload->>'id')::uuid, v_course, (p_payload->>'meeting_on')::date,
          coalesce(nullif(p_payload->>'starts_at','')::time, time '00:00'), btrim(p_payload->>'title'),
          p_payload->>'attendance', coalesce(btrim(p_payload->>'notes'), ''))
        on conflict (id) do update set meeting_on=excluded.meeting_on, starts_at=excluded.starts_at,
          title=excluded.title, attendance=excluded.attendance, notes=excluded.notes
        where dtm_meetings.course_id=v_course returning id into v_id;
      when 'delete_dtm_meeting' then
        delete from public.dtm_meetings where id=(p_payload->>'id')::uuid and course_id=v_course returning id into v_id;
      when 'save_dtm_grade' then
        insert into public.dtm_grade_items(id, course_id, label, score, maximum, graded_on, feedback)
        values ((p_payload->>'id')::uuid, v_course, btrim(p_payload->>'label'), (p_payload->>'score')::numeric,
          (p_payload->>'maximum')::numeric, nullif(p_payload->>'graded_on','')::date, coalesce(btrim(p_payload->>'feedback'), ''))
        on conflict (id) do update set label=excluded.label, score=excluded.score, maximum=excluded.maximum,
          graded_on=excluded.graded_on, feedback=excluded.feedback
        where dtm_grade_items.course_id=v_course returning id into v_id;
      when 'delete_dtm_grade' then
        delete from public.dtm_grade_items where id=(p_payload->>'id')::uuid and course_id=v_course returning id into v_id;
      when 'save_dtm_material' then
        if p_payload->>'kind' not in ('page','file') or not coalesce(
          char_length(btrim(p_payload->>'title')) between 1 and 160 and char_length(coalesce(p_payload->>'summary','')) <= 2000, false
        ) then raise exception 'Invalid course material' using errcode='22023'; end if;
        select coalesce(max(position),0)+1 into v_position from public.dtm_materials where course_id=v_course;
        insert into public.dtm_materials(id, course_id, title, kind, summary, position, source_mode, source_url)
        values ((p_payload->>'id')::uuid, v_course, btrim(p_payload->>'title'), p_payload->>'kind',
          coalesce(btrim(p_payload->>'summary'), ''), v_position, 'personal', nullif(btrim(p_payload->>'source_url'),''))
        on conflict (id) do update set title=excluded.title, kind=excluded.kind, summary=excluded.summary, source_url=excluded.source_url
        where dtm_materials.course_id=v_course and dtm_materials.source_mode='personal' returning id into v_id;
      when 'delete_dtm_material' then
        delete from public.dtm_materials where id=(p_payload->>'id')::uuid and course_id=v_course and source_mode='personal'
        returning id into v_id;
      when 'save_dtm_assignment', 'import_dtm_deadlines' then
        select id into v_student from public.affairs_students where user_id=v_uid;
        if v_student is null then raise exception 'Initialize the student workspace first' using errcode='42501'; end if;
        if p_kind='save_dtm_assignment' then
          v_status := p_payload->>'status';
          if char_length(coalesce(p_payload->>'details','')) > 2000 then
            raise exception 'Assignment notes are too long' using errcode='22023';
          end if;
          insert into public.affairs_assignments(id, student_id, dtm_course_id, title, details, due_at, status, submitted_at, source_mode, meeting_id)
          values ((p_payload->>'id')::uuid, v_student, v_course, btrim(p_payload->>'title'), coalesce(btrim(p_payload->>'details'),''),
            nullif(p_payload->>'due_at','')::timestamptz, v_status, case when v_status <> 'open' then now() end,
            'personal', nullif(p_payload->>'meeting_id','')::uuid)
          on conflict (id) do update set title=excluded.title, details=excluded.details, due_at=excluded.due_at,
            status=excluded.status, meeting_id=excluded.meeting_id, updated_at=now(),
            submitted_at=case when excluded.status <> 'open' then coalesce(affairs_assignments.submitted_at,now()) end
          where affairs_assignments.student_id=v_student and affairs_assignments.dtm_course_id=v_course
            and affairs_assignments.source_mode='personal' returning id into v_id;
        else
          if jsonb_typeof(p_payload->'events') is distinct from 'array'
            or jsonb_array_length(p_payload->'events') not between 1 and 50 then
            raise exception 'Select 1 to 50 calendar entries' using errcode='22023';
          end if;
          if exists (
            select 1 from jsonb_to_recordset(p_payload->'events') as e(title text, due_at timestamptz, import_key text)
            where not coalesce(char_length(btrim(e.title)) between 3 and 160
              and e.due_at between '2000-01-01 00:00:00+00'::timestamptz and '2101-01-01 00:00:00+00'::timestamptz
              and e.import_key ~ '^[0-9a-f]{64}$', false)
          ) then raise exception 'Invalid calendar deadline' using errcode='22023'; end if;
          insert into public.affairs_assignments(student_id, dtm_course_id, title, due_at, source_mode, import_key)
          select v_student, v_course, btrim(e.title), e.due_at, 'personal', e.import_key
          from jsonb_to_recordset(p_payload->'events') as e(title text, due_at timestamptz, import_key text)
          on conflict (dtm_course_id, import_key) where import_key is not null do nothing;
          get diagnostics v_imported = row_count;
          v_id := v_course;
        end if;
      when 'delete_dtm_assignment' then
        delete from public.affairs_assignments where id=(p_payload->>'id')::uuid and dtm_course_id=v_course and source_mode='personal'
        returning id into v_id;
      else
        raise exception 'Unsupported DTM record operation' using errcode='22023';
    end case;
  end if;
  if v_id is null then raise exception 'DTM record unavailable' using errcode='42501'; end if;
  insert into public.affairs_agent_audit(user_id, action_kind, target_id, summary)
    values (v_uid, p_kind, v_id, 'Changed a private DTM record.');
  return jsonb_build_object('id', v_id, 'kind', p_kind, 'imported', v_imported);
end;
$$;
revoke all on function public.affairs_manage_service_record(text,jsonb), public.dtm_manage_record(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.affairs_manage_service_record(text,jsonb), public.dtm_manage_record(text,jsonb) to authenticated;
