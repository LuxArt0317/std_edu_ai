-- Two specifically authorized lab admins share the existing Lux-owned workspace.
-- Existing School Affairs/Nexus roles and all non-lab records are untouched.
create function private.evaluation_lab_shared_owner() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare shared_owners uuid[];
begin
  if (select auth.uid()) is null or not exists (
    select 1 from auth.users u where u.id=(select auth.uid())
      and u.email_confirmed_at is not null
      and lower(u.email) in ('luxart0317@gmail.com','winsonbaring10@gmail.com')
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
  ) then
    raise exception 'Answer Lab administrator access required' using errcode='42501';
  end if;
  select array_agg(u.id) into shared_owners from auth.users u
    where lower(u.email)='luxart0317@gmail.com' and u.email_confirmed_at is not null;
  if coalesce(cardinality(shared_owners),0)<>1 then
    raise exception 'Shared Answer Lab owner is unavailable' using errcode='PT503';
  end if;
  return shared_owners[1];
end; $$;
revoke all on function private.evaluation_lab_shared_owner() from public,anon,authenticated;

create or replace function public.evaluation_lab_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.evaluation_lab_shared_owner();
  return jsonb_build_object('allowed',true,'role','admin','workspace','shared-answer-lab');
end; $$;
create or replace function public.evaluation_lab_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; shared_owner uuid;
begin
  shared_owner=private.evaluation_lab_shared_owner();
  select jsonb_build_object('revision',w.revision,'document',w.document) into result
    from public.evaluation_lab_workspaces w where w.owner_id=shared_owner;
  return coalesce(result,jsonb_build_object('revision',0,'document',null));
end; $$;
create or replace function public.evaluation_lab_save(p_expected_revision bigint,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; next_revision bigint; shared_owner uuid;
begin
  shared_owner=private.evaluation_lab_shared_owner();
  if p_expected_revision is null or p_expected_revision<0 or p_document is null
    or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>20000000
    or jsonb_typeof(p_document->'cases') is distinct from 'array'
    or jsonb_typeof(p_document->'runs') is distinct from 'array' then
    raise exception 'Invalid evaluation document' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('evaluation-lab:'||shared_owner::text,0));
  select revision into current_revision from public.evaluation_lab_workspaces where owner_id=shared_owner;
  if coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'Evaluation document changed' using errcode='PT409';
  end if;
  next_revision=coalesce(current_revision,0)+1;
  insert into public.evaluation_lab_workspaces(owner_id,revision,document)
    values(shared_owner,next_revision,p_document)
    on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now();
  return jsonb_build_object('revision',next_revision);
end; $$;
create or replace function public.evaluation_lab_attachment_read(p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result text; shared_owner uuid;
begin
  shared_owner=private.evaluation_lab_shared_owner();
  select content into result from public.evaluation_lab_attachments where owner_id=shared_owner and id=p_id;
  if result is null then raise exception 'Attachment unavailable' using errcode='PT404'; end if;
  return jsonb_build_object('content',result);
end; $$;
create or replace function public.evaluation_lab_attachment_save(p_id text,p_content text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shared_owner uuid;
begin
  shared_owner=private.evaluation_lab_shared_owner();
  if p_id is null or p_id !~ '^[a-f0-9]{64}\.(png|jpeg|webp)$' or p_content is null
    or octet_length(p_content) not between 32 and 2000000 or p_content !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Invalid attachment' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('evaluation-images:'||shared_owner::text,0));
  if not exists(select 1 from public.evaluation_lab_attachments where owner_id=shared_owner and id=p_id)
    and (select coalesce(sum(octet_length(content)),0) from public.evaluation_lab_attachments where owner_id=shared_owner)+octet_length(p_content)>50000000 then
    raise exception 'Evaluation image quota reached' using errcode='22023';
  end if;
  insert into public.evaluation_lab_attachments(owner_id,id,content) values(shared_owner,p_id,p_content) on conflict do nothing;
  return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.evaluation_lab_access(),public.evaluation_lab_read(),public.evaluation_lab_save(bigint,jsonb),public.evaluation_lab_attachment_read(text),public.evaluation_lab_attachment_save(text,text) from public,anon;
grant execute on function public.evaluation_lab_access(),public.evaluation_lab_read(),public.evaluation_lab_save(bigint,jsonb),public.evaluation_lab_attachment_read(text),public.evaluation_lab_attachment_save(text,text) to authenticated;
