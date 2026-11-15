-- Introduce the protected protocol without taking down legacy production tabs.
-- Its UUIDv7 rows are visible and writable only through the versioned RPCs.
create function private.affairs_conversation_creation_time(p_id uuid) returns timestamptz
language sql immutable strict set search_path='' as $$
  select case
    when substring(p_id::text,15,1)='7' and substring(p_id::text,20,1) in ('8','9','a','b')
    then to_timestamp((('x'||left(replace(p_id::text,'-',''),12))::bit(48)::bigint)/1000.0)
  end
$$;
revoke all on function private.affairs_conversation_creation_time(uuid) from public,anon,authenticated;
grant execute on function private.affairs_conversation_creation_time(uuid) to authenticated;

alter policy conversations_owner_read on public.affairs_conversations
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity())
    and private.affairs_conversation_creation_time(id) is null);
alter policy conversations_owner_delete on public.affairs_conversations
  using (user_id=(select auth.uid()) and (select private.affairs_google_identity())
    and private.affairs_conversation_creation_time(id) is null);

-- A UUIDv7 marker is needed only until the ID's first-save window closes.
-- Legacy IDs have no timestamp. In coexistence only existing owned legacy rows
-- can acquire a stable marker, and their separate quota is also bounded.
create table private.affairs_conversation_delete_markers (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  expires_at timestamptz,
  primary key (user_id,conversation_id)
);
alter table private.affairs_conversation_delete_markers enable row level security;
revoke all on private.affairs_conversation_delete_markers from public,anon,authenticated;

-- Once expiry has authorized deletion or pruning, a DB clock adjustment must
-- never reopen any affected ID's first-save window.
create table private.affairs_conversation_creation_floors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  closed_through timestamptz not null
);
alter table private.affairs_conversation_creation_floors enable row level security;
revoke all on private.affairs_conversation_creation_floors from public,anon,authenticated;

create function public.affairs_read_conversations_v2(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is not null then
    return (select jsonb_build_object('id',id,'title',title,'messages',messages,'version',version,'updated_at',updated_at)
      from public.affairs_conversations where user_id=v_uid and id=p_id);
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(items) order by updated_at desc,id),'[]'::jsonb)
    from (select id,title,version,updated_at from public.affairs_conversations where user_id=v_uid
      order by updated_at desc,id limit 100) items);
end;
$$;
revoke all on function public.affairs_read_conversations_v2(uuid) from public,anon;
grant execute on function public.affairs_read_conversations_v2(uuid) to authenticated;

create function public.affairs_delete_conversation_v2(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_now timestamptz;
  v_created timestamptz;
  v_expires timestamptz;
  v_closed_through timestamptz;
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is null then raise exception 'Invalid conversation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0));
  v_now:=clock_timestamp();
  v_created:=private.affairs_conversation_creation_time(p_id);
  v_expires:=v_created+interval '24 hours';

  with expired as (
    delete from private.affairs_conversation_delete_markers where user_id=v_uid and expires_at<=v_now returning expires_at
  )
  select greatest(max(expired.expires_at),case when v_expires<=v_now then v_expires end) into v_closed_through from expired;
  if v_closed_through is not null then
    insert into private.affairs_conversation_creation_floors(user_id,closed_through) values(v_uid,v_closed_through)
      on conflict (user_id) do update set closed_through=greatest(affairs_conversation_creation_floors.closed_through,excluded.closed_through);
  end if;
  select closed_through into v_closed_through from private.affairs_conversation_creation_floors where user_id=v_uid;

  if not exists(select 1 from private.affairs_conversation_delete_markers where user_id=v_uid and conversation_id=p_id) then
    if v_created is null then
      -- The v1 protocol may still create a missing legacy ID. During coexistence
      -- there is no safe acknowledgment for its missing and pending cases.
      if not exists(select 1 from public.affairs_conversations where id=p_id and user_id=v_uid) then
        raise exception 'Legacy conversation deletion could not be confirmed' using errcode='PT409';
      end if;
      if (select count(*) from private.affairs_conversation_delete_markers where user_id=v_uid and expires_at is null)>=256 then
        raise exception 'Legacy conversation deletion capacity reached' using errcode='PT429';
      end if;
      insert into private.affairs_conversation_delete_markers(user_id,conversation_id) values(v_uid,p_id);
    elsif v_expires>greatest(v_now,v_closed_through) then
      -- Do not allow a caller to reserve arbitrarily far-future markers.
      if v_created>v_now+interval '2 minutes' then
        raise exception 'Conversation identifier is outside its creation window' using errcode='PT409';
      end if;
      if (select count(*) from private.affairs_conversation_delete_markers where user_id=v_uid and expires_at is not null)>=512 then
        raise exception 'Conversation deletion capacity reached' using errcode='PT429';
      end if;
      insert into private.affairs_conversation_delete_markers(user_id,conversation_id,expires_at) values(v_uid,p_id,v_expires);
    end if;
  end if;
  delete from public.affairs_conversations where id=p_id and user_id=v_uid;
  return jsonb_build_object('deleted',true,'protection','conversation-delete-v2');
end;
$$;
revoke all on function public.affairs_delete_conversation_v2(uuid) from public,anon;
grant execute on function public.affairs_delete_conversation_v2(uuid) to authenticated;

create function private.affairs_save_conversation(p_id uuid,p_title text,p_messages jsonb,p_expected_version integer,p_protected boolean) returns jsonb
language plpgsql set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.affairs_conversations;
  v_message jsonb;
  v_created timestamptz;
  v_now timestamptz;
  v_closed_through timestamptz;
begin
  if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or char_length(btrim(p_title)) not between 1 and 100
    or p_messages is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>24 or octet_length(p_messages::text)>190000
    then raise exception 'Invalid conversation' using errcode='22023'; end if;
  v_created:=private.affairs_conversation_creation_time(p_id);
  if not p_protected and v_created is not null then
    raise exception 'Use the current protocol for this conversation' using errcode='PT409';
  end if;
  for v_message in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_message)<>'object' or coalesce(v_message->>'role','') not in ('user','assistant')
      or jsonb_typeof(v_message->'content') is distinct from 'string' or char_length(v_message->>'content')>8000
      or jsonb_typeof(v_message->'id') is distinct from 'string'
      or (v_message->'result') ? 'proposedAction' or v_message::text ~ '"dataUrl"\s*:' then
      raise exception 'Only bounded text, citations and observed activity may be saved' using errcode='22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('affairs-chat:'||v_uid::text,0));
  if exists(select 1 from private.affairs_conversation_delete_markers where user_id=v_uid and conversation_id=p_id)
    then raise exception 'Conversation was deleted' using errcode='PT409'; end if;
  select * into v_row from public.affairs_conversations where id=p_id and user_id=v_uid for update;
  if found then
    if v_row.title=btrim(p_title) and v_row.messages=p_messages then return to_jsonb(v_row)-'user_id'; end if;
    if v_row.version<>p_expected_version then raise exception 'Conversation changed; reload before saving' using errcode='PT409'; end if;
    update public.affairs_conversations set title=btrim(p_title),messages=p_messages,version=version+1,updated_at=now()
      where id=p_id and user_id=v_uid returning * into v_row;
  else
    if p_expected_version<>0 then raise exception 'Conversation was deleted or changed' using errcode='PT409'; end if;
    if p_protected then
      v_now:=clock_timestamp();
      select closed_through into v_closed_through from private.affairs_conversation_creation_floors where user_id=v_uid;
      if v_created is null or v_created>v_now+interval '2 minutes' or v_created+interval '24 hours'<=greatest(v_now,v_closed_through) then
        raise exception 'Conversation identifier is outside its creation window' using errcode='PT409';
      end if;
    end if;
    if (select count(*) from public.affairs_conversations where user_id=v_uid)>=100 then raise exception 'Delete an older conversation before creating another' using errcode='PT409'; end if;
    -- A foreign row must never be locked before the account's own row; a UUID
    -- collision is rejected without reading or disclosing its owner or body.
    insert into public.affairs_conversations(id,user_id,title,messages) values(p_id,v_uid,btrim(p_title),p_messages)
      on conflict (id) do nothing returning * into v_row;
    if not found then raise exception 'Conversation not available' using errcode='42501'; end if;
  end if;
  return to_jsonb(v_row)-'user_id';
end;
$$;
revoke all on function private.affairs_save_conversation(uuid,text,jsonb,integer,boolean) from public,anon,authenticated;

create or replace function public.affairs_save_conversation(p_id uuid,p_title text,p_messages jsonb,p_expected_version integer) returns jsonb
language sql security definer set search_path='' as $$
  select private.affairs_save_conversation(p_id,p_title,p_messages,p_expected_version,false)
$$;

create function public.affairs_save_conversation_v2(p_id uuid,p_title text,p_messages jsonb,p_expected_version integer) returns jsonb
language sql security definer set search_path='' as $$
  select private.affairs_save_conversation(p_id,p_title,p_messages,p_expected_version,true)
$$;
revoke all on function public.affairs_save_conversation_v2(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.affairs_save_conversation_v2(uuid,text,jsonb,integer) to authenticated;
