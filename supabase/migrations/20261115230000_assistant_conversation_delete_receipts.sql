-- A delete must win even when a version-zero save is still in transit.
-- Keep only the deleting account and conversation identifier, never chat data.
create table private.affairs_conversation_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  primary key (user_id,conversation_id)
);
alter table private.affairs_conversation_tombstones enable row level security;
revoke all on private.affairs_conversation_tombstones from public,anon,authenticated;

create function public.affairs_delete_conversation(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is null then raise exception 'Invalid conversation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0));
  insert into private.affairs_conversation_tombstones(user_id,conversation_id) values(v_uid,p_id)
    on conflict (user_id,conversation_id) do nothing;
  delete from public.affairs_conversations where id=p_id and user_id=v_uid;
  return jsonb_build_object('deleted',true);
end;
$$;
revoke all on function public.affairs_delete_conversation(uuid) from public,anon;
grant execute on function public.affairs_delete_conversation(uuid) to authenticated;

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
  if exists(select 1 from private.affairs_conversation_tombstones where user_id=v_uid and conversation_id=p_id)
    then raise exception 'Conversation was deleted' using errcode='PT409'; end if;
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
