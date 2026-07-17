-- Production academic operations: enrollment integrity and conflict-aware scheduling.

create or replace function private.validate_section_enrollment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_profile uuid;
  section_capacity integer;
  active_count integer;
begin
  if new.student_id is null and new.student_profile_id is null then
    raise exception 'A student identity is required' using errcode = '23514';
  end if;

  if new.student_id is not null then
    select s.profile_id into linked_profile
    from public.students s
    where s.id = new.student_id;

    if not found then
      raise exception 'The student record does not exist' using errcode = '23503';
    end if;
    if new.student_profile_id is null then
      new.student_profile_id := linked_profile;
    elsif linked_profile is not null and linked_profile <> new.student_profile_id then
      raise exception 'The student record and portal identity do not match' using errcode = '23514';
    end if;
  end if;

  if new.status = 'enrolled' then
    select cs.capacity into section_capacity
    from public.course_sections cs
    where cs.id = new.section_id
    for update;

    if section_capacity is null then
      raise exception 'The course section does not exist' using errcode = '23503';
    end if;

    select count(*) into active_count
    from public.section_enrollments se
    where se.section_id = new.section_id
      and se.status = 'enrolled'
      and se.id <> coalesce(new.id, extensions.gen_random_uuid());

    if active_count >= section_capacity then
      raise exception 'The course section is at capacity (% seats)', section_capacity using errcode = '23514';
    end if;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_section_enrollment() from public, anon, authenticated;
drop trigger if exists section_enrollments_validate on public.section_enrollments;
create trigger section_enrollments_validate
before insert or update on public.section_enrollments
for each row execute function private.validate_section_enrollment();

create or replace function public.manage_section_enrollment(
  p_section_id uuid,
  p_student_id uuid,
  p_status text default 'enrolled'
)
returns table (enrollment_id uuid, status text, enrolled_count bigint, capacity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := (select private.current_role());
  linked_profile uuid;
  target_id uuid;
  target_capacity integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if actor_role <> 'owner' and actor_role not in ('admin', 'registrar') then
    raise exception 'Only the owner, administrator, or registrar can manage enrollment' using errcode = '42501';
  end if;
  if p_status not in ('waitlisted', 'enrolled', 'dropped', 'completed') then
    raise exception 'The enrollment status is invalid' using errcode = '22023';
  end if;

  select cs.capacity into target_capacity
  from public.course_sections cs
  where cs.id = p_section_id
  for update;
  if target_capacity is null then
    raise exception 'The course section does not exist' using errcode = '23503';
  end if;

  select s.profile_id into linked_profile
  from public.students s
  where s.id = p_student_id;
  if not found then
    raise exception 'The student record does not exist' using errcode = '23503';
  end if;

  insert into public.section_enrollments (section_id, student_id, student_profile_id, status)
  values (p_section_id, p_student_id, linked_profile, p_status)
  on conflict (section_id, student_id) where student_id is not null
  do update set
    student_profile_id = excluded.student_profile_id,
    status = excluded.status,
    enrolled_at = case
      when public.section_enrollments.status in ('dropped', 'waitlisted') and excluded.status = 'enrolled' then now()
      else public.section_enrollments.enrolled_at
    end
  returning id into target_id;

  return query
  select target_id, p_status,
    (select count(*) from public.section_enrollments se where se.section_id = p_section_id and se.status = 'enrolled'),
    target_capacity;
end;
$$;

revoke all on function public.manage_section_enrollment(uuid, uuid, text) from public, anon;
grant execute on function public.manage_section_enrollment(uuid, uuid, text) to authenticated;

create or replace function private.validate_schedule_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_faculty uuid;
  conflict_title text;
  target_term_start date;
  target_term_end date;
begin
  if new.event_type not in ('class', 'exam', 'meeting') then
    return new;
  end if;

  if new.section_id is not null then
    select cs.faculty_id, t.starts_on, t.ends_on
    into target_faculty, target_term_start, target_term_end
    from public.course_sections cs
    join public.academic_terms t on t.id = cs.term_id
    where cs.id = new.section_id;

    if target_term_start is null then
      raise exception 'The course section does not exist' using errcode = '23503';
    end if;
    if new.starts_at::date < target_term_start or new.ends_at::date > target_term_end then
      raise exception 'The event must fall within the section academic term (% through %)', target_term_start, target_term_end using errcode = '23514';
    end if;
  else
    target_faculty := new.owner_profile_id;
  end if;

  if nullif(lower(trim(coalesce(new.location, ''))), '') is not null then
    select se.title into conflict_title
    from public.schedule_events se
    where se.id <> coalesce(new.id, extensions.gen_random_uuid())
      and se.event_type in ('class', 'exam', 'meeting')
      and lower(trim(coalesce(se.location, ''))) = lower(trim(new.location))
      and tstzrange(se.starts_at, se.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    limit 1;
    if conflict_title is not null then
      raise exception 'Room conflict with "%"', conflict_title using errcode = '23P01';
    end if;
  end if;

  conflict_title := null;
  if target_faculty is not null then
    select se.title into conflict_title
    from public.schedule_events se
    left join public.course_sections cs on cs.id = se.section_id
    where se.id <> coalesce(new.id, extensions.gen_random_uuid())
      and se.event_type in ('class', 'exam', 'meeting')
      and coalesce(cs.faculty_id, se.owner_profile_id) = target_faculty
      and tstzrange(se.starts_at, se.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    limit 1;
    if conflict_title is not null then
      raise exception 'Faculty schedule conflict with "%"', conflict_title using errcode = '23P01';
    end if;
  end if;

  conflict_title := null;
  if new.section_id is not null then
    select se.title into conflict_title
    from public.schedule_events se
    where se.id <> coalesce(new.id, extensions.gen_random_uuid())
      and se.section_id is not null
      and se.event_type in ('class', 'exam')
      and tstzrange(se.starts_at, se.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
      and exists (
        select 1
        from public.section_enrollments a
        join public.section_enrollments b
          on coalesce(a.student_id::text, a.student_profile_id::text) = coalesce(b.student_id::text, b.student_profile_id::text)
        where a.section_id = new.section_id
          and b.section_id = se.section_id
          and a.status = 'enrolled'
          and b.status = 'enrolled'
      )
    limit 1;
    if conflict_title is not null then
      raise exception 'Student schedule conflict with "%"', conflict_title using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_schedule_conflict() from public, anon, authenticated;
drop trigger if exists schedule_events_validate_conflicts on public.schedule_events;
create trigger schedule_events_validate_conflicts
before insert or update on public.schedule_events
for each row execute function private.validate_schedule_conflict();

create index if not exists schedule_events_conflict_idx
on public.schedule_events (starts_at, ends_at, event_type);

comment on function public.manage_section_enrollment(uuid, uuid, text) is
  'Transactional owner/admin/registrar enrollment workflow with identity synchronization and capacity enforcement.';
comment on function private.validate_schedule_conflict() is
  'Rejects overlapping room, assigned-faculty, and enrolled-student class/exam schedules.';
