-- Hosted Answer Lab: administrator-only, per-account state and private image inputs.
-- Independent of pending student-service drafts; uses the existing administrator helper.
create table public.evaluation_lab_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  document jsonb not null check (jsonb_typeof(document)='object' and octet_length(document::text)<=20000000),
  updated_at timestamptz not null default now()
);
create table public.evaluation_lab_attachments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-f0-9]{64}\.(png|jpeg|webp)$'),
  content text not null check (octet_length(content) between 32 and 2000000),
  created_at timestamptz not null default now(),
  primary key (owner_id,id)
);
alter table public.evaluation_lab_workspaces enable row level security;
alter table public.evaluation_lab_attachments enable row level security;
revoke all on public.evaluation_lab_workspaces,public.evaluation_lab_attachments from public,anon,authenticated;

create function public.evaluation_lab_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.affairs_is_admin()) then
    raise exception 'Answer Lab administrator access required' using errcode='42501';
  end if;
  return jsonb_build_object('allowed',true);
end; $$;
create function public.evaluation_lab_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.evaluation_lab_access();
  select jsonb_build_object('revision',w.revision,'document',w.document) into result
    from public.evaluation_lab_workspaces w where w.owner_id=(select auth.uid());
  return coalesce(result,jsonb_build_object('revision',0,'document',null));
end; $$;
create function public.evaluation_lab_save(p_expected_revision bigint,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; next_revision bigint;
begin
  perform public.evaluation_lab_access();
  if p_expected_revision is null or p_expected_revision<0 or p_document is null
    or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>20000000
    or jsonb_typeof(p_document->'cases') is distinct from 'array'
    or jsonb_typeof(p_document->'runs') is distinct from 'array' then
    raise exception 'Invalid evaluation document' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('evaluation-lab:'||(select auth.uid())::text,0));
  select revision into current_revision from public.evaluation_lab_workspaces where owner_id=(select auth.uid());
  if coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'Evaluation document changed' using errcode='PT409';
  end if;
  next_revision=coalesce(current_revision,0)+1;
  insert into public.evaluation_lab_workspaces(owner_id,revision,document)
    values((select auth.uid()),next_revision,p_document)
    on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now();
  return jsonb_build_object('revision',next_revision);
end; $$;
create function public.evaluation_lab_attachment_read(p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
  perform public.evaluation_lab_access();
  select content into result from public.evaluation_lab_attachments where owner_id=(select auth.uid()) and id=p_id;
  if result is null then raise exception 'Attachment unavailable' using errcode='PT404'; end if;
  return jsonb_build_object('content',result);
end; $$;
create function public.evaluation_lab_attachment_save(p_id text,p_content text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.evaluation_lab_access();
  if p_id is null or p_id !~ '^[a-f0-9]{64}\.(png|jpeg|webp)$' or p_content is null
    or octet_length(p_content) not between 32 and 2000000 or p_content !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Invalid attachment' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('evaluation-images:'||(select auth.uid())::text,0));
  if not exists(select 1 from public.evaluation_lab_attachments where owner_id=(select auth.uid()) and id=p_id)
    and (select coalesce(sum(octet_length(content)),0) from public.evaluation_lab_attachments where owner_id=(select auth.uid()))+octet_length(p_content)>50000000 then
    raise exception 'Evaluation image quota reached' using errcode='22023';
  end if;
  insert into public.evaluation_lab_attachments(owner_id,id,content) values((select auth.uid()),p_id,p_content) on conflict do nothing;
  return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.evaluation_lab_access(),public.evaluation_lab_read(),public.evaluation_lab_save(bigint,jsonb),public.evaluation_lab_attachment_read(text),public.evaluation_lab_attachment_save(text,text) from public,anon;
grant execute on function public.evaluation_lab_access(),public.evaluation_lab_read(),public.evaluation_lab_save(bigint,jsonb),public.evaluation_lab_attachment_read(text),public.evaluation_lab_attachment_save(text,text) to authenticated;
