-- The questionnaire version is independent of the university's survey periods.
create table public.affairs_tutor_evaluations (
  user_id uuid not null references auth.users(id) on delete cascade,
  questionnaire_version smallint not null check (questionnaire_version > 0),
  ratings smallint[] not null check (
    array_ndims(ratings) = 1 and array_lower(ratings, 1) = 1 and cardinality(ratings) = 10
    and array_position(ratings, null) is null and 1 <= all(ratings) and 5 >= all(ratings)
  ),
  comment text not null check (char_length(comment) <= 4000),
  request_id uuid not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, questionnaire_version)
);

alter table public.affairs_tutor_evaluations enable row level security;
revoke all on public.affairs_tutor_evaluations from public, anon, authenticated;
grant select on public.affairs_tutor_evaluations to authenticated;
create policy tutor_evaluation_own_read on public.affairs_tutor_evaluations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.affairs_google_identity()));

create function public.affairs_read_tutor_evaluation() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  student jsonb;
  evaluation jsonb;
begin
  if actor is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode = '42501';
  end if;
  select jsonb_build_object('number', s.student_number, 'name', s.full_name,
    'department', p.department, 'year', s.year_level) into student
  from public.affairs_students s
  join public.affairs_programs p on p.id = s.program_id
  where s.user_id = actor and s.source_mode = 'verified';

  select jsonb_build_object('ratings', r.ratings, 'comment', r.comment, 'submittedAt', r.submitted_at)
  into evaluation from public.affairs_tutor_evaluations r
  where r.user_id = actor and r.questionnaire_version = 1;

  return jsonb_build_object('userId', actor, 'student', student, 'evaluation', evaluation);
end;
$$;

create function public.affairs_submit_tutor_evaluation(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  scores smallint[];
  key uuid;
  result public.affairs_tutor_evaluations;
begin
  if actor is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified Google sign-in required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 24576
    or not (p_payload ?& array['request_id','ratings','comment'])
    or p_payload - array['request_id','ratings','comment'] <> '{}'::jsonb
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
    or p_payload->>'request_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'ratings') is distinct from 'array'
    or jsonb_typeof(p_payload->'comment') is distinct from 'string'
    or char_length(p_payload->>'comment') > 4000 then
    raise exception 'Invalid tutor evaluation' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'ratings') <> 10 or exists (
    select 1 from jsonb_array_elements(p_payload->'ratings') as scores(score)
    where score not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)
  ) then
    raise exception 'Ten ratings from one to five are required' using errcode = '22023';
  end if;
  scores := array(select score::text::numeric::smallint
    from jsonb_array_elements(p_payload->'ratings') with ordinality as elements(score, position)
    order by position);
  key := (p_payload->>'request_id')::uuid;
  insert into public.affairs_tutor_evaluations(user_id,questionnaire_version,ratings,comment,request_id)
    values (actor,1,scores,p_payload->>'comment',key)
    on conflict (user_id,questionnaire_version) do nothing
    returning * into result;
  if not found then
    select * into result from public.affairs_tutor_evaluations
      where user_id = actor and questionnaire_version = 1;
    if not found or result.request_id <> key or result.ratings <> scores or result.comment <> p_payload->>'comment' then
      raise exception 'Tutor evaluation already submitted' using errcode = 'PT409';
    end if;
  end if;
  return jsonb_build_object('userId', actor, 'requestId', key, 'submittedAt', result.submitted_at);
end;
$$;

revoke all on function public.affairs_read_tutor_evaluation() from public, anon;
revoke all on function public.affairs_submit_tutor_evaluation(jsonb) from public, anon;
grant execute on function public.affairs_read_tutor_evaluation() to authenticated;
grant execute on function public.affairs_submit_tutor_evaluation(jsonb) to authenticated;
