alter table public.affairs_service_records
  drop constraint affairs_service_records_leave_category_check,
  add constraint affairs_service_records_leave_category_check
    check (leave_category in ('personal','sick','official','bereavement','nursing','mental_health','maternity','menstrual','other')),
  add column contact_phone text check (contact_phone is null or
    (char_length(contact_phone) between 3 and 32 and contact_phone ~ '^[+0-9 ()#.-]+$')),
  add column leave_time_period text check (leave_time_period in ('am','pm','day')),
  add constraint affairs_service_records_leave_form_fields_check check (
    (contact_phone is null or service_key='leave')
    and (case when leave_category='mental_health' then leave_time_period is not null else leave_time_period is null end)
  );

create or replace function public.affairs_manage_service_record(p_kind text, p_payload jsonb) returns jsonb
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
      id, user_id, service_key, record_type, title, notes, status, starts_on, ends_on, leave_category, periods,
      contact_phone, leave_time_period
    ) values (
      (p_payload->>'id')::uuid, v_uid, p_payload->>'service_key', p_payload->>'record_type',
      btrim(p_payload->>'title'), coalesce(btrim(p_payload->>'notes'), ''), p_payload->>'status',
      nullif(p_payload->>'starts_on','')::date, nullif(p_payload->>'ends_on','')::date,
      nullif(p_payload->>'leave_category',''), nullif(btrim(p_payload->>'periods'),''),
      nullif(btrim(p_payload->>'contact_phone'),''),
      nullif(p_payload->>'leave_time_period','')
    )
    on conflict (id) do update set title=excluded.title, notes=excluded.notes, status=excluded.status,
      starts_on=excluded.starts_on, ends_on=excluded.ends_on, leave_category=excluded.leave_category,
      periods=excluded.periods,
      contact_phone=case when p_payload ? 'contact_phone' then excluded.contact_phone else affairs_service_records.contact_phone end,
      leave_time_period=excluded.leave_time_period, updated_at=now()
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
