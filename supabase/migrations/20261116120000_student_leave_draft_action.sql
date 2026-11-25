create function public.affairs_create_student_leave_draft(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=auth.uid();
  previous private.affairs_assistant_operations;
  input_digest jsonb;
  saved_id uuid;
  result jsonb;
  start_day date;
  end_day date;
  category text;
  category_title text;
  periods text;
  time_period text;
  notes text;
  action constant text:='create_student_leave_draft';
  summary constant text:='Saved your Student Leave draft';
begin
  if caller is null or not private.affairs_google_identity()
    or not exists(select 1 from public.affairs_profiles where user_id=caller) then
    raise exception 'School Affairs sign-in is required' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>10000 then
    raise exception 'Invalid Student Leave draft' using errcode='22023';
  end if;
  if (p_payload-'starts_on'-'ends_on'-'leave_category'-'periods'-'leave_time_period'-'notes')<>'{}'::jsonb
    or not (p_payload ?& array['starts_on','ends_on','leave_category','periods','leave_time_period','notes'])
    or exists(select 1 from jsonb_each(p_payload) field where jsonb_typeof(field.value)<>'string') then
    raise exception 'Invalid Student Leave draft fields' using errcode='22023';
  end if;

  -- Share the existing reviewed-action lock and request namespace. Keep the
  -- private reason only in the owned record, with a digest in the receipt.
  input_digest:=jsonb_build_object('sha256',encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'));
  perform pg_advisory_xact_lock(hashtextextended('assistant-action:'||caller::text||':'||p_request_id::text,0));
  select * into previous from private.affairs_assistant_operations
    where user_id=caller and request_id=p_request_id;
  if found then
    if previous.kind<>action or previous.payload<>input_digest then
      raise exception 'Action request was already used' using errcode='PT409';
    end if;
    return previous.result;
  end if;

  if p_payload->>'starts_on' !~ '^(20[0-9]{2}|2100)-[0-9]{2}-[0-9]{2}$'
    or p_payload->>'ends_on' !~ '^(20[0-9]{2}|2100)-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid Student Leave dates' using errcode='22023';
  end if;
  begin
    start_day:=(p_payload->>'starts_on')::date;
    end_day:=(p_payload->>'ends_on')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid Student Leave dates' using errcode='22023';
  end;
  category:=p_payload->>'leave_category';
  category_title:=case category
    when 'personal' then 'Personal leave' when 'sick' then 'Sick leave' when 'official' then 'Official duty'
    when 'bereavement' then 'Bereavement leave' when 'nursing' then 'Nursing leave'
    when 'mental_health' then 'Mental health leave' when 'maternity' then 'Maternity leave'
    when 'menstrual' then 'Menstrual leave' end;
  periods:=p_payload->>'periods';
  time_period:=p_payload->>'leave_time_period';
  notes:=p_payload->>'notes';
  if start_day>end_day or category_title is null
    or char_length(periods) not between 1 and 80 or periods<>btrim(periods) or periods~'[[:cntrl:]]'
    or char_length(notes)>2000 or notes<>btrim(notes) or notes~'[[:cntrl:]]'
    or (case when category='mental_health' then time_period not in ('am','pm','day') else time_period<>'' end) then
    raise exception 'Invalid Student Leave draft fields' using errcode='22023';
  end if;

  insert into public.affairs_service_records(
    id,user_id,service_key,record_type,title,notes,status,starts_on,ends_on,leave_category,periods,leave_time_period
  ) values(
    p_request_id,caller,'leave','leave',category_title||' · '||to_char(start_day,'YYYY-MM-DD'),
    notes,'draft',start_day,end_day,category,periods,nullif(time_period,'')
  ) on conflict(id) do nothing returning id into saved_id;
  if saved_id is null then raise exception 'Draft ID is unavailable' using errcode='PT409'; end if;

  result:=jsonb_build_object('id',saved_id,'kind',action,'summary',summary);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
    values(caller,action,saved_id,summary);
  insert into private.affairs_assistant_operations(user_id,request_id,kind,payload,result)
    values(caller,p_request_id,action,input_digest,result);
  return result;
end;
$$;
revoke all on function public.affairs_create_student_leave_draft(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.affairs_create_student_leave_draft(uuid,jsonb) to authenticated;
