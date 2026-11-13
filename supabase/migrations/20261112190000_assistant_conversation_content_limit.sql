-- Match the chat sanitizer's 8,000-character content limit without changing
-- ownership, concurrency, replay, conversation-count or JSON payload limits.
create or replace function public.affairs_save_conversation(p_id uuid,p_title text,p_messages jsonb,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_row public.affairs_conversations; v_message jsonb;
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or char_length(btrim(p_title)) not between 1 and 100
    or p_messages is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>24 or octet_length(p_messages::text)>190000
    then raise exception 'Invalid conversation' using errcode='22023'; end if;
  for v_message in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_message)<>'object' or coalesce(v_message->>'role','') not in ('user','assistant')
      or jsonb_typeof(v_message->'content') is distinct from 'string' or char_length(v_message->>'content')>8000
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
