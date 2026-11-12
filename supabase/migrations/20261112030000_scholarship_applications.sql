-- Account-owned stu.best scholarship applications. No university records are seeded or changed.
create table public.affairs_scholarship_periods (
  id uuid primary key default gen_random_uuid(),
  term_label text not null unique check (char_length(btrim(term_label)) between 1 and 80),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  published boolean not null default false,
  instructions text not null default '' check (char_length(instructions) <= 2000),
  source_mode text not null default 'local_demo' check (source_mode='local_demo'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at < closes_at and opens_at >= '2000-01-01Z'::timestamptz and closes_at < '2101-01-01Z'::timestamptz)
);
create table public.affairs_scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  period_id uuid not null references public.affairs_scholarship_periods(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  award_amount numeric(12,2) check (award_amount between 0 and 10000000),
  required_hours numeric(8,2) check (required_hours between 0 and 10000),
  actual_hours numeric(8,2) check (actual_hours between 0 and 10000),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, period_id),
  check ((status in ('approved','rejected')) = (reviewed_at is not null)),
  check ((status='cancelled') = (cancelled_at is not null)),
  check (status='approved' or (award_amount is null and required_hours is null and actual_hours is null)),
  check (status<>'approved' or (award_amount is not null and required_hours is not null and actual_hours is not null))
);
create index affairs_scholarship_applications_period_idx on public.affairs_scholarship_applications(period_id, submitted_at desc);

-- Receipts make a timed-out request safe to retry even after a later state change.
create table private.affairs_scholarship_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.affairs_scholarship_periods enable row level security;
alter table public.affairs_scholarship_applications enable row level security;
alter table private.affairs_scholarship_operations enable row level security;
revoke all on public.affairs_scholarship_periods, public.affairs_scholarship_applications,
  private.affairs_scholarship_operations from public, anon, authenticated;
grant select on public.affairs_scholarship_periods, public.affairs_scholarship_applications to authenticated;
create policy scholarship_periods_read on public.affairs_scholarship_periods for select to authenticated using (
  (select private.affairs_google_identity()) and (published or (select private.affairs_is_admin()))
);
create policy scholarship_applications_read on public.affairs_scholarship_applications for select to authenticated using (
  (select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin()))
);

create function public.affairs_scholarship_action(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_request uuid;
  v_id uuid;
  v_period_id uuid;
  v_version integer;
  v_period public.affairs_scholarship_periods;
  v_application public.affairs_scholarship_applications;
  v_receipt private.affairs_scholarship_operations;
  v_result jsonb;
  v_summary text;
begin
  if not (select private.affairs_google_identity()) then
    raise exception 'School Affairs sign-in is required' using errcode='42501';
  end if;
  -- Serialize each actor's writes and receipt lookup; different students remain independent.
  perform 1 from public.affairs_profiles where user_id=v_uid for update;
  if not found then raise exception 'School Affairs profile is required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>12000
    or p_kind is null or p_kind not in ('apply_scholarship','cancel_scholarship','save_scholarship_period','review_scholarship_application') then
    raise exception 'Invalid scholarship action' using errcode='22023';
  end if;
  if p_kind in ('save_scholarship_period','review_scholarship_application') and not (select private.affairs_is_admin()) then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  v_request := (p_payload->>'request_id')::uuid;
  v_version := (p_payload->>'expected_version')::integer;
  if v_request is null or v_version is null or v_version<0 then
    raise exception 'A request ID and record version are required' using errcode='22023';
  end if;
  select * into v_receipt from private.affairs_scholarship_operations where user_id=v_uid and request_id=v_request;
  if found then
    if v_receipt.kind<>p_kind or v_receipt.payload<>p_payload then
      raise exception 'Request ID was already used for another operation' using errcode='PT409';
    end if;
    return v_receipt.result;
  end if;

  if p_kind='save_scholarship_period' then
    v_id := (p_payload->>'id')::uuid;
    if v_id is null then raise exception 'Period ID is required' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scholarship-period:'||v_id::text,0));
    select * into v_period from public.affairs_scholarship_periods where id=v_id for update;
    if coalesce(v_period.version,0)<>v_version then
      raise exception 'The application period changed. Refresh and try again.' using errcode='PT409';
    end if;
    if v_period.published and not coalesce((p_payload->>'published')::boolean,false) and exists (
      select 1 from public.affairs_scholarship_applications where period_id=v_id
    ) then raise exception 'A period with application history must remain published.' using errcode='PT409'; end if;
    insert into public.affairs_scholarship_periods(id,term_label,opens_at,closes_at,published,instructions)
    values(v_id,btrim(p_payload->>'term_label'),(p_payload->>'opens_at')::timestamptz,
      (p_payload->>'closes_at')::timestamptz,coalesce((p_payload->>'published')::boolean,false),coalesce(btrim(p_payload->>'instructions'),''))
    on conflict (id) do update set term_label=excluded.term_label, opens_at=excluded.opens_at,
      closes_at=excluded.closes_at, published=excluded.published, instructions=excluded.instructions,
      version=affairs_scholarship_periods.version+1, updated_at=now()
    returning * into v_period;
    v_version := v_period.version;
    v_summary := 'Saved a local demonstration scholarship period.';
  else
    if p_kind='review_scholarship_application' then
      select period_id into v_period_id from public.affairs_scholarship_applications where id=(p_payload->>'id')::uuid;
    else v_period_id := (p_payload->>'period_id')::uuid;
    end if;
    -- Period locks precede application locks in every path, including administrator reviews.
    select * into v_period from public.affairs_scholarship_periods where id=v_period_id and published for share;
    if v_period.id is null then raise exception 'Scholarship period is unavailable' using errcode='42501'; end if;
    if p_kind='review_scholarship_application' then
      select * into v_application from public.affairs_scholarship_applications where id=(p_payload->>'id')::uuid for update;
    else
      select * into v_application from public.affairs_scholarship_applications where user_id=v_uid and period_id=v_period_id for update;
    end if;
    if coalesce(v_application.version,0)<>v_version then
      raise exception 'This application changed. Refresh and try again.' using errcode='PT409';
    end if;
    if p_kind in ('apply_scholarship','cancel_scholarship') then
      if statement_timestamp()<v_period.opens_at or statement_timestamp()>=v_period.closes_at then
        raise exception 'This application period is not open.' using errcode='PT409';
      end if;
      if v_application.status in ('approved','rejected') then
        raise exception 'Reviewed applications cannot be changed.' using errcode='PT409';
      end if;
    end if;
    if p_kind='apply_scholarship' then
      if v_application.id is null then
        insert into public.affairs_scholarship_applications(user_id,period_id) values(v_uid,v_period_id)
        returning * into v_application;
      elsif v_application.status='cancelled' then
        update public.affairs_scholarship_applications set status='pending',submitted_at=now(),cancelled_at=null,
          review_note='',version=version+1,updated_at=now() where id=v_application.id returning * into v_application;
      end if;
      v_summary := 'Applied for a local demonstration scholarship.';
    elsif p_kind='cancel_scholarship' then
      if v_application.id is null then raise exception 'Application unavailable' using errcode='42501'; end if;
      if v_application.status='pending' then
        update public.affairs_scholarship_applications set status='cancelled',cancelled_at=now(),version=version+1,
          updated_at=now() where id=v_application.id returning * into v_application;
      end if;
      v_summary := 'Cancelled a local demonstration scholarship application.';
    else
      if v_application.id is null or v_application.status='cancelled' then
        raise exception 'This application cannot be reviewed.' using errcode='PT409';
      end if;
      if p_payload->>'status' is null or p_payload->>'status' not in ('approved','rejected') then
        raise exception 'Choose an approved or rejected review decision.' using errcode='22023';
      end if;
      update public.affairs_scholarship_applications set status=p_payload->>'status',
        award_amount=case when p_payload->>'status'='approved' then (p_payload->>'award_amount')::numeric else null end,
        required_hours=case when p_payload->>'status'='approved' then (p_payload->>'required_hours')::numeric else null end,
        actual_hours=case when p_payload->>'status'='approved' then (p_payload->>'actual_hours')::numeric else null end,
        review_note=coalesce(btrim(p_payload->>'review_note'),''),reviewed_at=now(),version=version+1,updated_at=now()
      where id=v_application.id returning * into v_application;
      v_summary := 'Reviewed a local demonstration scholarship application.';
    end if;
    v_id := v_application.id;
    v_version := v_application.version;
  end if;
  v_result := jsonb_build_object('id',v_id,'kind',p_kind,'version',v_version,'summary',v_summary);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,p_kind,v_id,v_summary);
  insert into private.affairs_scholarship_operations(user_id,request_id,kind,payload,result)
    values(v_uid,v_request,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_scholarship_action(text,jsonb) from public, anon;
grant execute on function public.affairs_scholarship_action(text,jsonb) to authenticated;
