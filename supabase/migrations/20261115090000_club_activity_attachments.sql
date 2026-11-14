-- Small private documents are stored with their metadata in one transaction.
create table private.affairs_club_activity_documents (
  application_id uuid not null references public.affairs_club_applications(id) on delete cascade,
  kind text not null check (kind in ('proposal','closeout')),
  filename text,
  body bytea,
  version integer not null check (version between 1 and 1000000),
  updated_at timestamptz not null default now(),
  last_request_id uuid not null,
  last_digest bytea not null,
  primary key (application_id,kind),
  check ((body is null and filename is null) or
    (body is not null and filename is not null and octet_length(body) between 5 and 2097152))
);
alter table private.affairs_club_activity_documents enable row level security;
revoke all on private.affairs_club_activity_documents from public,anon,authenticated;

create function public.affairs_read_club_activity_documents(
  p_application_id uuid, p_download_kind text default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); application public.affairs_club_applications;
  rows jsonb; file jsonb; editable boolean;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_download_kind is not null and p_download_kind not in ('proposal','closeout') then
    raise exception 'Invalid document kind' using errcode='22023';
  end if;
  select * into application from public.affairs_club_applications a where a.id=p_application_id
    and (private.affairs_club_officer(a.club_id) or (select private.affairs_is_admin()));
  if not found then raise exception 'Application unavailable' using errcode='PT404'; end if;

  if p_download_kind is not null then
    select jsonb_build_object('kind',d.kind,'filename',d.filename,'version',d.version,'content',encode(d.body,'base64')) into file
    from private.affairs_club_activity_documents d
    where d.application_id=application.id and d.kind=p_download_kind and d.body is not null;
    if not found then raise exception 'Document unavailable' using errcode='PT404'; end if;
    return jsonb_build_object('userId',caller,'applicationId',application.id,'file',file);
  end if;

  editable:=application.applicant_id=caller and private.affairs_club_officer(application.club_id);
  select jsonb_agg(jsonb_build_object('kind',k.kind,'filename',d.filename,'version',coalesce(d.version,0),
    'size',octet_length(d.body),'updatedAt',d.updated_at,'editable',editable and
      (case k.kind when 'proposal' then application.status='submitted'
       else application.status='approved' and application.ends_at<=now() end)) order by k.ord)
  into rows
  from (values ('proposal',1),('closeout',2)) k(kind,ord)
  left join private.affairs_club_activity_documents d on d.application_id=application.id and d.kind=k.kind;
  return jsonb_build_object('userId',caller,'applicationId',application.id,'applicationVersion',application.version,'rows',rows);
end;
$$;

create function public.affairs_write_club_activity_document(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); application public.affairs_club_applications;
  saved private.affairs_club_activity_documents; key uuid; digest_value bytea; file_kind text;
  file_name text; file_data bytea; serialized text; expected integer; fields text[];
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  fields:=case p_operation
    when 'upload' then array['application_id','application_version','content','expected_version','filename','kind','request_id']
    when 'remove' then array['application_id','application_version','expected_version','kind','request_id'] end;
  if fields is null or jsonb_typeof(p_payload) is distinct from 'object'
    or array(select k from jsonb_object_keys(p_payload) k order by k)<>fields
    or jsonb_typeof(p_payload->'application_id') is distinct from 'string'
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
    or jsonb_typeof(p_payload->'application_version') is distinct from 'number'
    or coalesce(p_payload->>'application_version','') !~ '^[1-9][0-9]{0,5}$|^1000000$'
    or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or coalesce(p_payload->>'expected_version','') !~ '^([1-9][0-9]{0,5}|0)$'
    or jsonb_typeof(p_payload->'kind') is distinct from 'string'
    or p_payload->>'kind' not in ('proposal','closeout') then
    raise exception 'Invalid document request' using errcode='22023';
  end if;
  file_kind:=p_payload->>'kind';
  key:=(p_payload->>'request_id')::uuid;
  expected:=(p_payload->>'expected_version')::integer;

  if p_operation='upload' then
    file_name:=p_payload->>'filename';
    serialized:=p_payload->>'content';
    if jsonb_typeof(p_payload->'filename') is distinct from 'string' or char_length(file_name) not between 5 and 120
      or right(lower(file_name),4)<>'.pdf' or file_name~'[[:cntrl:]/\\]'
      or jsonb_typeof(p_payload->'content') is distinct from 'string'
      or char_length(serialized) not between 8 and 2796204 or serialized~'[^A-Za-z0-9+/=]' then
      raise exception 'Invalid PDF document' using errcode='22023';
    end if;
    file_data:=decode(serialized,'base64');
    if octet_length(file_data) not between 5 and 2097152
      or substring(file_data for 5)<>decode('255044462d','hex') then
      raise exception 'Invalid PDF document' using errcode='22023';
    end if;
  end if;

  select * into application from public.affairs_club_applications a where a.id=(p_payload->>'application_id')::uuid
    and a.applicant_id=caller and private.affairs_club_officer(a.club_id) for update;
  if not found then raise exception 'Application unavailable' using errcode='PT404'; end if;
  perform 1 from public.affairs_club_memberships m join public.affairs_clubs c on c.id=m.club_id
    where m.user_id=caller and m.club_id=application.club_id and m.officer and c.active for share of m,c;
  if not found then raise exception 'Club officer access required' using errcode='42501'; end if;

  select * into saved from private.affairs_club_activity_documents d
    where d.application_id=application.id and d.kind=file_kind;
  digest_value:=extensions.digest(p_operation||':'||p_payload::text,'sha256');
  if saved.last_request_id=key then
    if saved.last_digest<>digest_value then raise exception 'Request ID already used' using errcode='PT409'; end if;
  else
    if application.version<>(p_payload->>'application_version')::integer
      or application.version>=1000000 or expected<>coalesce(saved.version,0)
      or (file_kind='proposal' and application.status<>'submitted')
      or (file_kind='closeout' and (application.status<>'approved' or application.ends_at>now()))
      or (p_operation='remove' and saved.body is null) then
      raise exception 'Application or document has changed' using errcode='PT409';
    end if;
    insert into private.affairs_club_activity_documents as d
      (application_id,kind,filename,body,version,last_request_id,last_digest)
    values(application.id,file_kind,file_name,file_data,expected+1,key,digest_value)
    on conflict(application_id,kind) do update set filename=excluded.filename,body=excluded.body,
      version=excluded.version,updated_at=now(),last_request_id=excluded.last_request_id,last_digest=excluded.last_digest
    returning d.* into saved;
    -- A reviewer who has the old application version must reload before approving.
    update public.affairs_club_applications a set version=a.version+1,updated_at=now() where a.id=application.id;
  end if;
  return jsonb_build_object('applicationId',application.id,'kind',saved.kind,'version',saved.version,'filename',saved.filename);
exception when invalid_text_representation or invalid_parameter_value then
  raise exception 'Invalid document request' using errcode='22023';
end;
$$;
revoke all on function public.affairs_read_club_activity_documents(uuid,text),public.affairs_write_club_activity_document(text,jsonb) from public,anon;
grant execute on function public.affairs_read_club_activity_documents(uuid,text),public.affairs_write_club_activity_document(text,jsonb) to authenticated;
