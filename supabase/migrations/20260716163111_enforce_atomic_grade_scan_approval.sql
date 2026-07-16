-- Grade imports must be bounded by the grade item and commit atomically.

create or replace function private.validate_grade_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_max numeric(8,2);
begin
  select gi.max_score into allowed_max
  from public.grade_items gi
  where gi.id = new.grade_item_id;

  if allowed_max is null then
    raise exception 'The grade item does not exist' using errcode = '23503';
  end if;
  if new.score < 0 or new.score > allowed_max then
    raise exception 'Grade score must be between 0 and %', allowed_max using errcode = '23514';
  end if;

  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_grade_score() from public, anon, authenticated;
drop trigger if exists grades_validate_score on public.grades;
create trigger grades_validate_score
before insert or update of grade_item_id, score, status, published_at on public.grades
for each row execute function private.validate_grade_score();

create or replace function public.approve_grade_scan(p_job_id uuid, p_rows jsonb)
returns table (saved_count integer)
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  job_record public.grade_scan_jobs%rowtype;
  item_max numeric(8,2);
  candidate jsonb;
  candidate_student uuid;
  candidate_score numeric(8,2);
  candidate_feedback text;
  candidate_profile uuid;
  seen_students uuid[] := '{}';
  affected integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 150 then
    raise exception 'Reviewed grade rows must be an array of at most 150 entries' using errcode = '22023';
  end if;

  select * into job_record
  from public.grade_scan_jobs
  where id = p_job_id
    and uploaded_by = actor_id
    and status = 'needs_review'
  for update;

  if not found or not (select private.can_manage_section(job_record.section_id)) then
    raise exception 'The grade scan is unavailable for review' using errcode = '42501';
  end if;
  if job_record.grade_item_id is null then
    raise exception 'The grade scan is not linked to a grade item' using errcode = '23503';
  end if;

  select max_score into item_max
  from public.grade_items
  where id = job_record.grade_item_id and section_id = job_record.section_id;
  if item_max is null then
    raise exception 'The grade item does not belong to the scanned section' using errcode = '23503';
  end if;

  for candidate in select value from jsonb_array_elements(p_rows)
  loop
    begin
      candidate_student := nullif(candidate ->> 'studentId', '')::uuid;
      candidate_score := nullif(candidate ->> 'score', '')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'A reviewed grade row is invalid' using errcode = '22023';
    end;
    candidate_feedback := left(coalesce(candidate ->> 'feedback', 'Imported from reviewed grade-sheet scan.'), 2000);

    if candidate_student is null or candidate_score is null or candidate_score < 0 or candidate_score > item_max then
      raise exception 'Each reviewed score must be between 0 and %', item_max using errcode = '23514';
    end if;
    if candidate_student = any(seen_students) then
      raise exception 'A student appears more than once in the reviewed scan' using errcode = '23505';
    end if;
    seen_students := array_append(seen_students, candidate_student);

    if not exists (
      select 1 from public.section_enrollments se
      where se.section_id = job_record.section_id
        and se.student_id = candidate_student
        and se.status in ('enrolled', 'completed')
    ) then
      raise exception 'A reviewed student is not enrolled in this section' using errcode = '42501';
    end if;

    select profile_id into candidate_profile from public.students where id = candidate_student;
    insert into public.grades (
      grade_item_id, student_id, student_profile_id, score, feedback,
      status, graded_by, graded_at, published_at
    ) values (
      job_record.grade_item_id, candidate_student, candidate_profile, candidate_score, candidate_feedback,
      'reviewed', actor_id, now(), null
    )
    on conflict (grade_item_id, student_id) where student_id is not null
    do update set
      student_profile_id = excluded.student_profile_id,
      score = excluded.score,
      feedback = excluded.feedback,
      status = 'reviewed',
      graded_by = excluded.graded_by,
      graded_at = excluded.graded_at,
      published_at = null;
    affected := affected + 1;
  end loop;

  update public.grade_scan_jobs
  set status = 'approved', reviewed_by = actor_id, reviewed_at = now(), updated_at = now()
  where id = job_record.id;

  return query select affected;
end;
$$;

revoke all on function public.approve_grade_scan(uuid, jsonb) from public, anon;
grant execute on function public.approve_grade_scan(uuid, jsonb) to authenticated;

comment on function public.approve_grade_scan(uuid, jsonb) is
'Atomically saves human-reviewed grade-scan rows as bounded reviewed grades for the scan uploader.';
