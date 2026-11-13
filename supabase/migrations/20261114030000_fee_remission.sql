-- Account-owned tuition-reduction history. The source showed an empty results table.
create table public.affairs_fee_remission (
  id uuid primary key,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  academic_year_text text check (char_length(academic_year_text) <= 40),
  semester_text text check (char_length(semester_text) <= 40),
  student_number text check (char_length(student_number) <= 80),
  category_text text check (char_length(category_text) <= 160),
  amount_text text check (char_length(amount_text) <= 80),
  check_status_text text check (char_length(check_status_text) <= 160),
  notes_text text check (char_length(notes_text) <= 2000),
  row_order integer not null check (row_order between 0 and 10000),
  version integer not null default 1 check (version between 1 and 999999999),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.affairs_fee_remission is 'Account-owned literal tuition-reduction history maintained on stu.best.';
create index affairs_fee_remission_owner_idx on public.affairs_fee_remission(user_id, row_order, id) where deleted_at is null;
alter table public.affairs_fee_remission enable row level security;
revoke all on public.affairs_fee_remission from public, anon, authenticated;
grant select on public.affairs_fee_remission to authenticated;
create policy fee_remission_read on public.affairs_fee_remission for select to authenticated
  using (deleted_at is null and (select private.affairs_google_identity())
    and (user_id = (select auth.uid()) or (select private.affairs_is_admin())));

create table private.affairs_fee_remission_operations (
  actor_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(actor_id, request_id)
);
alter table private.affairs_fee_remission_operations enable row level security;
revoke all on private.affairs_fee_remission_operations from public, anon, authenticated;

create function public.affairs_read_fee_remission(p_user_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  owner_id uuid := coalesce(p_user_id, actor);
  records jsonb;
begin
  if not (select private.affairs_google_identity())
    or (p_user_id is not null and (not (select private.affairs_is_admin())
      or not exists (select 1 from public.affairs_profiles where user_id = owner_id))) then
    raise exception 'Fee remission history is unavailable to this account' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.row_order, entry.id), '[]'::jsonb) into records
  from (select id, version, academic_year_text, semester_text, student_number, category_text,
               amount_text, check_status_text, notes_text, row_order
        from public.affairs_fee_remission where user_id = owner_id and deleted_at is null
        order by row_order, id limit 251) entry;
  if jsonb_array_length(records) > 250 then
    raise exception 'Fee remission history exceeds the supported record count' using errcode = 'PT503';
  end if;
  return jsonb_build_object('userId', owner_id, 'records', records);
end;
$$;
revoke all on function public.affairs_read_fee_remission(uuid) from public, anon;
grant execute on function public.affairs_read_fee_remission(uuid) to authenticated;

create function public.affairs_manage_fee_remission(p_kind text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  owner_id uuid;
  record_id uuid;
  request_id_value uuid;
  expected integer;
  deleting boolean := p_kind = 'delete_fee_remission';
  fields text[] := array['academic_year_text','semester_text','student_number','category_text','amount_text','check_status_text','notes_text'];
  keys text[] := array['id','user_id','request_id','expected_version'];
  field text;
  n numeric;
  previous public.affairs_fee_remission;
  receipt private.affairs_fee_remission_operations;
  next_row public.affairs_fee_remission;
  result jsonb;
begin
  if not (select private.affairs_is_admin()) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('save_fee_remission','delete_fee_remission')
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid fee remission operation' using errcode = '22023';
  end if;
  if not deleting then keys := keys || fields || array['row_order']; end if;
  if not (p_payload ?& keys) or p_payload - keys <> '{}'::jsonb then
    raise exception 'Invalid fee remission fields' using errcode = '22023';
  end if;
  foreach field in array array['id','user_id','request_id'] loop
    if jsonb_typeof(p_payload->field) is distinct from 'string'
      or p_payload->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid fee remission identifier' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' then
    raise exception 'Invalid fee remission version' using errcode = '22023';
  end if;
  n := (p_payload->>'expected_version')::numeric;
  if n <> trunc(n) or n < (case when deleting then 1 else 0 end) or n > 999999998 then
    raise exception 'Invalid fee remission version' using errcode = '22023';
  end if;
  expected := n::integer;
  if not deleting then
    foreach field in array fields loop
      if jsonb_typeof(p_payload->field) not in ('string','null') then
        raise exception 'Use literal text or null for fee remission cells' using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(p_payload->'row_order') is distinct from 'number' then
      raise exception 'Invalid fee remission row order' using errcode = '22023';
    end if;
    n := (p_payload->>'row_order')::numeric;
    if n <> trunc(n) or n < 0 or n > 10000 then
      raise exception 'Invalid fee remission row order' using errcode = '22023';
    end if;
    next_row := jsonb_populate_record(null::public.affairs_fee_remission, p_payload - array['request_id','expected_version']);
  end if;
  owner_id := (p_payload->>'user_id')::uuid;
  record_id := (p_payload->>'id')::uuid;
  request_id_value := (p_payload->>'request_id')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('fee-remission:actor:' || actor::text, 0));
  select * into receipt from private.affairs_fee_remission_operations
    where actor_id = actor and request_id = request_id_value;
  if found then
    if receipt.kind <> p_kind or receipt.payload <> p_payload then
      raise exception 'Request ID already used' using errcode = 'PT409';
    end if;
    return receipt.result;
  end if;
  if not exists (select 1 from public.affairs_profiles where user_id = owner_id) then
    raise exception 'Student account unavailable' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fee-remission:owner:' || owner_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('fee-remission:record:' || record_id::text, 0));
  select * into previous from public.affairs_fee_remission where id = record_id for update;
  if previous.id is not null and previous.user_id <> owner_id then
    raise exception 'Fee remission records cannot be reassigned' using errcode = '42501';
  end if;
  if previous.deleted_at is not null or coalesce(previous.version, 0) <> expected then
    raise exception 'Fee remission history changed. Refresh and retry.' using errcode = 'PT409';
  end if;
  if deleting then
    update public.affairs_fee_remission set deleted_at = now(), updated_at = now(), version = expected + 1
      where id = record_id;
  elsif previous.id is null then
    if (select count(*) from public.affairs_fee_remission where user_id = owner_id and deleted_at is null) >= 250 then
      raise exception 'An account may hold at most 250 active fee remission records' using errcode = '22023';
    end if;
    insert into public.affairs_fee_remission (id, user_id, academic_year_text, semester_text, student_number,
      category_text, amount_text, check_status_text, notes_text, row_order)
    values (record_id, owner_id, next_row.academic_year_text, next_row.semester_text, next_row.student_number,
      next_row.category_text, next_row.amount_text, next_row.check_status_text, next_row.notes_text, next_row.row_order);
  else
    update public.affairs_fee_remission set academic_year_text = next_row.academic_year_text,
      semester_text = next_row.semester_text, student_number = next_row.student_number,
      category_text = next_row.category_text, amount_text = next_row.amount_text,
      check_status_text = next_row.check_status_text, notes_text = next_row.notes_text,
      row_order = next_row.row_order, updated_at = now(), version = expected + 1
    where id = record_id;
  end if;
  result := jsonb_build_object('id', record_id, 'kind', p_kind, 'version', expected + 1);
  insert into public.affairs_agent_audit(user_id, action_kind, target_id, summary)
    values (actor, p_kind, record_id, case when deleting then 'Deleted fee remission history row.' else 'Saved fee remission history row.' end);
  insert into private.affairs_fee_remission_operations(actor_id, user_id, request_id, kind, payload, result)
    values (actor, owner_id, request_id_value, p_kind, p_payload, result);
  return result;
exception when check_violation then
  raise exception 'Fee remission text exceeds its field limit' using errcode = '22023';
end;
$$;
revoke all on function public.affairs_manage_fee_remission(text,jsonb) from public, anon;
grant execute on function public.affairs_manage_fee_remission(text,jsonb) to authenticated;
