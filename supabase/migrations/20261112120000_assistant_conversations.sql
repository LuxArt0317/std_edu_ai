-- Private, owner-only chats. An administrator cannot read another user's chats.
create table public.affairs_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  messages jsonb not null default '[]' check (jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=24 and octet_length(messages::text)<=190000),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affairs_conversations_owner on public.affairs_conversations(user_id,updated_at desc,id);
alter table public.affairs_conversations enable row level security;
revoke all on public.affairs_conversations from public,anon,authenticated;
grant select,delete on public.affairs_conversations to authenticated;
create policy conversations_owner_read on public.affairs_conversations for select to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));
create policy conversations_owner_delete on public.affairs_conversations for delete to authenticated
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity()));

create function public.affairs_save_conversation(p_id uuid,p_title text,p_messages jsonb,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_row public.affairs_conversations; v_message jsonb;
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or char_length(btrim(p_title)) not between 1 and 100
    or p_messages is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>24 or octet_length(p_messages::text)>190000
    then raise exception 'Invalid conversation' using errcode='22023'; end if;
  for v_message in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_message)<>'object' or coalesce(v_message->>'role','') not in ('user','assistant')
      or jsonb_typeof(v_message->'content') is distinct from 'string' or char_length(v_message->>'content')>7000
      or jsonb_typeof(v_message->'id') is distinct from 'string'
      or (v_message->'result') ? 'proposedAction' or v_message::text ~ '"dataUrl"\s*:' then
      raise exception 'Only bounded text, citations and observed activity may be saved' using errcode='22023';
    end if;
  end loop;
  -- Serialize per-account creates and edits, including the conversation quota.
  perform pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0));
  select * into v_row from public.affairs_conversations where id=p_id for update;
  if found then
    if v_row.user_id<>v_uid then raise exception 'Conversation not available' using errcode='42501'; end if;
    if v_row.title=btrim(p_title) and v_row.messages=p_messages then return to_jsonb(v_row)-'user_id'; end if;
    if v_row.version<>p_expected_version then raise exception 'Conversation changed; reload before saving' using errcode='PT409'; end if;
    update public.affairs_conversations set title=btrim(p_title),messages=p_messages,version=version+1,updated_at=now() where id=p_id returning * into v_row;
  else
    if p_expected_version<>0 then raise exception 'Conversation was deleted or changed' using errcode='PT409'; end if;
    if (select count(*) from public.affairs_conversations where user_id=v_uid)>=100 then raise exception 'Delete an older conversation before creating another' using errcode='PT409'; end if;
    insert into public.affairs_conversations(id,user_id,title,messages) values(p_id,v_uid,btrim(p_title),p_messages) returning * into v_row;
  end if;
  return to_jsonb(v_row)-'user_id';
end;
$$;
revoke all on function public.affairs_save_conversation(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.affairs_save_conversation(uuid,text,jsonb,integer) to authenticated;

-- Reviewed actions have durable replay receipts. A retry never creates two tasks.
create table private.affairs_assistant_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
revoke all on private.affairs_assistant_operations from public,anon,authenticated;
alter table public.affairs_profiles add column preferred_name text check (char_length(preferred_name) between 1 and 80);

create function public.affairs_reviewed_action(p_request_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_previous private.affairs_assistant_operations;v_result jsonb;v_id uuid;v_summary text;v_row public.affairs_assignments;v_name text;
begin
  if v_uid is null or not private.affairs_google_identity() or not exists(select 1 from public.affairs_profiles where user_id=v_uid) then
    raise exception 'School Affairs sign-in required' using errcode='42501'; end if;
  if p_request_id is null or p_kind is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4000 then raise exception 'Invalid action' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('assistant-action:'||v_uid::text||':'||p_request_id::text,0));
  select * into v_previous from private.affairs_assistant_operations where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_previous.kind<>p_kind or v_previous.payload<>p_payload then raise exception 'Action request was already used' using errcode='PT409'; end if;
    return v_previous.result;
  end if;
  if p_kind in ('create_task','complete_task','create_service_request','publish_announcement') then
    v_result:=public.affairs_execute_action(p_kind,p_payload);
  elsif p_kind='update_display_name' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('display_name','expected_name')) then raise exception 'Unknown profile field' using errcode='22023'; end if;
    v_name:=btrim(p_payload->>'display_name');
    if v_name is null or char_length(v_name) not between 1 and 80 then raise exception 'Invalid display name' using errcode='22023'; end if;
    update public.affairs_profiles set preferred_name=v_name,updated_at=now()
      where user_id=v_uid and coalesce(preferred_name,display_name)=p_payload->>'expected_name' returning user_id into v_id;
    if v_id is null then raise exception 'Profile changed; ask again' using errcode='PT409'; end if;
    v_summary:='Updated your stu.best display name';
  elsif p_kind='set_assignment_status' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('id','status','expected_status'))
      or coalesce(p_payload->>'status','') not in ('open','submitted') then raise exception 'Invalid assignment status' using errcode='22023'; end if;
    select a.* into v_row from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id
      join public.dtm_courses c on c.id=a.dtm_course_id
      where a.id=(p_payload->>'id')::uuid and s.user_id=v_uid and c.user_id=v_uid and a.source_mode='personal' and c.source_mode='personal' for update of a;
    if not found then raise exception 'Only your personal DTM assignment can be changed' using errcode='42501'; end if;
    if v_row.status='graded' or v_row.status is distinct from p_payload->>'expected_status' then raise exception 'Assignment changed; ask again' using errcode='PT409'; end if;
    update public.affairs_assignments set status=p_payload->>'status',submitted_at=case when p_payload->>'status'='submitted' then now() else null end,updated_at=now()
      where id=v_row.id returning id into v_id;
    v_summary:='Updated your personal DTM assignment tracker to '||(p_payload->>'status')||'; no university submission was made';
  else raise exception 'Unsupported reviewed action' using errcode='22023';
  end if;
  if v_result is null then
    insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(v_uid,p_kind,v_id,v_summary);
    v_result:=jsonb_build_object('id',v_id,'kind',p_kind,'summary',v_summary);
  end if;
  insert into private.affairs_assistant_operations(user_id,request_id,kind,payload,result) values(v_uid,p_request_id,p_kind,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.affairs_reviewed_action(uuid,text,jsonb) from public,anon;
grant execute on function public.affairs_reviewed_action(uuid,text,jsonb) to authenticated;
