-- A material's explicit destination is separate from its Moodle provenance URL.
-- Existing rows remain NULL; no school destination is inferred or imported.
-- The existing owner-only RLS, dtm_manage_record ACL and audit behavior remain.
create function private.dtm_material_target_url_valid(p_url text) returns boolean
language plpgsql immutable parallel safe set search_path='' as $$
declare matched text[]; host text; labels text[]; label text; suffix text;
begin
  if p_url is null or p_url='' then return true; end if;
  if char_length(p_url)>2048 or (p_url collate "C") !~ '^[!-~]+$'
    or strpos(p_url,chr(92))>0 or p_url ~ '["<>`{}|^]'
    or p_url ~ '%($|[^0-9A-Fa-f]|[0-9A-Fa-f]($|[^0-9A-Fa-f]))'
    or p_url ~* '%(0[0-9a-f]|1[0-9a-f]|7f|5c)' then return false; end if;
  matched:=regexp_match(p_url,'^https://([A-Za-z0-9.-]+)(:443)?([/?#].*)?$');
  if matched is null then return false; end if;
  host:=lower(matched[1]); labels:=string_to_array(host,'.');
  if char_length(host)>253 or cardinality(labels)<2 then return false; end if;
  foreach label in array labels loop
    if (label collate "C") !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' or left(label,4)='xn--' then return false; end if;
  end loop;
  suffix:=labels[cardinality(labels)];
  return (suffix collate "C") ~ '^[a-z]{2,63}$' and suffix not in
    ('localhost','local','localdomain','internal','intranet','lan','home','corp','test','invalid','example','onion','arpa');
end;
$$;
revoke all on function private.dtm_material_target_url_valid(text) from public,anon,authenticated;
alter table public.dtm_materials add column target_url text;
alter table public.dtm_materials add constraint dtm_materials_target_url_check
  check (target_url is null or (target_url<>'' and private.dtm_material_target_url_valid(target_url)));

-- Exact prior function, with only save_dtm_material destination validation,
-- INSERT and UPDATE changed. Omission preserves the old destination atomically;
-- explicit JSON null or empty string clears it. All other operations are intact.
create or replace function public.dtm_manage_record(p_kind text, p_payload jsonb) returns jsonb
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
        if p_payload ? 'target_url' and (jsonb_typeof(p_payload->'target_url') not in ('string','null')
          or not private.dtm_material_target_url_valid(p_payload->>'target_url')) then
          raise exception 'Use a bounded public HTTPS material destination' using errcode='22023';
        end if;
        select coalesce(max(position),0)+1 into v_position from public.dtm_materials where course_id=v_course;
        insert into public.dtm_materials(id, course_id, title, kind, summary, position, source_mode, source_url, target_url)
        values ((p_payload->>'id')::uuid, v_course, btrim(p_payload->>'title'), p_payload->>'kind',
          coalesce(btrim(p_payload->>'summary'), ''), v_position, 'personal', nullif(btrim(p_payload->>'source_url'),''), nullif(p_payload->>'target_url',''))
        on conflict (id) do update set title=excluded.title, kind=excluded.kind, summary=excluded.summary, source_url=excluded.source_url,
          target_url=case when p_payload ? 'target_url' then excluded.target_url else dtm_materials.target_url end
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
