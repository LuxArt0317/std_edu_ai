-- DRAFT: independent stu.best file submissions, not university Moodle writes.
-- Apply only after a rollback preflight and hosted Storage limit verification.
create table public.dtm_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.affairs_assignments(id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  course_id uuid not null references public.dtm_courses(id) on delete cascade,
  current_upload_id uuid,
  version integer not null default 0 check(version between 0 and 999999999),
  submitted_at timestamptz, content_modified_at timestamptz, due_at_at_submission timestamptz,
  source_mode text not null default 'local_submission' check(source_mode='local_submission'),
  created_at timestamptz not null default now(),
  check((current_upload_id is null and version=0 and submitted_at is null and content_modified_at is null)
    or (current_upload_id is not null and version>0 and submitted_at is not null and content_modified_at is not null))
);
create table private.dtm_submission_uploads (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.dtm_assignment_submissions(id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  object_path text not null unique,
  filename text not null check(octet_length(filename) between 1 and 255),
  size_bytes bigint not null check(size_bytes between 0 and 10485760),
  content_type text not null,
  expected_version integer not null check(expected_version between 0 and 999999999),
  state text not null default 'pending' check(state in ('pending','current','retired','cancelled','expired')),
  object_id uuid, object_etag text,
  created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '30 minutes'),
  committed_at timestamptz,
  unique(id,submission_id),
  check((state in ('pending','cancelled','expired') and committed_at is null)
    or (state in ('current','retired') and committed_at is not null and object_id is not null and object_etag is not null))
);
create unique index dtm_submission_one_pending on private.dtm_submission_uploads(submission_id) where state='pending';
create unique index dtm_submission_one_current on private.dtm_submission_uploads(submission_id) where state='current';
alter table public.dtm_assignment_submissions add constraint dtm_submission_current_file
  foreign key(current_upload_id,id) references private.dtm_submission_uploads(id,submission_id) deferrable initially deferred;
create table public.dtm_submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.dtm_assignment_submissions(id) on delete cascade,
  upload_id uuid not null unique,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  status text not null check(status in ('not_graded','graded')),
  grade_text text check(grade_text is null or char_length(grade_text)<=80),
  feedback text check(feedback is null or char_length(feedback)<=2000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  version integer not null default 1 check(version between 1 and 999999999),
  foreign key(upload_id,submission_id) references private.dtm_submission_uploads(id,submission_id) on delete cascade,
  check(status='graded' or grade_text is null)
);
create table private.dtm_submission_operations (
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null, kind text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,request_id)
);
-- Deliberately no user/file FK: physical object cleanup survives parent deletion.
create table private.dtm_submission_cleanup (
  object_path text primary key,user_id uuid not null,queued_at timestamptz not null default now()
);
create index dtm_submission_owner_idx on public.dtm_assignment_submissions(user_id,assignment_id);
create index dtm_submission_review_owner_idx on public.dtm_submission_reviews(user_id,submission_id);
do $$ declare t text;begin
  foreach t in array array['dtm_assignment_submissions','dtm_submission_reviews'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy dtm_submission_private_read on public.%I for select to authenticated using ((select private.affairs_google_identity()) and (user_id=(select auth.uid()) or (select private.affairs_is_admin())))',t);
  end loop;
  foreach t in array array['dtm_submission_uploads','dtm_submission_operations','dtm_submission_cleanup'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated',t);
  end loop;
end;$$;

create function private.dtm_submission_owner_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.user_id,new.assignment_id,new.course_id) is distinct from (old.user_id,old.assignment_id,old.course_id) then
    raise exception 'Submission ownership and assignment are immutable' using errcode='42501';
  end if;
  if not exists(select 1 from public.affairs_assignments a join public.affairs_students s on s.id=a.student_id
    join public.dtm_courses c on c.id=a.dtm_course_id and c.user_id=s.user_id and c.source_mode=a.source_mode
    where a.id=new.assignment_id and s.user_id=new.user_id and c.id=new.course_id and a.source_mode in ('sample','personal')) then
    raise exception 'The assignment must belong to this DTM account' using errcode='42501';
  end if;
  return new;
end;$$;
create trigger dtm_submission_owner before insert or update on public.dtm_assignment_submissions
  for each row execute function private.dtm_submission_owner_guard();
-- Existing assignment manager actions may edit title/due date, never reparent a submission.
create function private.dtm_submission_assignment_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.student_id,new.dtm_course_id,new.source_mode) is distinct from (old.student_id,old.dtm_course_id,old.source_mode)
    and exists(select 1 from public.dtm_assignment_submissions where assignment_id=old.id) then
    raise exception 'An assignment with submissions cannot be reassigned' using errcode='42501';
  end if;
  return new;
end;$$;
create trigger dtm_submission_assignment_owner before update on public.affairs_assignments
  for each row execute function private.dtm_submission_assignment_guard();
create function private.dtm_submission_delete_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- A student's tracker/course delete must not erase saved work or an admin
  -- review. Auth-user deletion still cascades and queues all private objects.
  if (select auth.uid()) is not null and exists(select 1 from auth.users where id=(select auth.uid()))
    and not(select private.affairs_is_admin()) and exists(select 1 from public.dtm_assignment_submissions where assignment_id=old.id and current_upload_id is not null) then
    raise exception 'Saved submissions cannot be deleted through the personal tracker' using errcode='42501';
  end if;
  return old;
end;$$;
create trigger dtm_submission_assignment_delete before delete on public.affairs_assignments
  for each row execute function private.dtm_submission_delete_guard();
create function private.dtm_submission_queue_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.dtm_submission_cleanup(object_path,user_id) values(old.object_path,old.user_id) on conflict do nothing;
  return old;
end;$$;
create trigger dtm_submission_deleted_file before delete on private.dtm_submission_uploads
  for each row execute function private.dtm_submission_queue_deleted();

create function private.dtm_submission_payload_valid(p_kind text,p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[];key text;n numeric;
begin
  fields:=array['assignment_id','request_id','expected_version'];
  if p_kind='begin_dtm_submission_upload' then fields:=fields||array['filename','size_bytes','content_type'];
  elsif p_kind in ('commit_dtm_submission_upload','cancel_dtm_submission_upload') then fields:=fields||array['upload_id'];
  elsif p_kind='save_dtm_submission_review' then fields:=fields||array['upload_id','status','grade_text','feedback'];
  else return false;end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>12000 or not(p ?& fields) or p-fields<>'{}'::jsonb then return false;end if;
  foreach key in array (array['assignment_id','request_id']||(case when p_kind<>'begin_dtm_submission_upload' then array['upload_id'] else array[]::text[] end)) loop
    if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
  end loop;
  if jsonb_typeof(p->'expected_version') is distinct from 'number' then return false;end if;
  n:=(p->>'expected_version')::numeric;if n<>trunc(n) or n<0 or n>999999998 then return false;end if;
  if p_kind='begin_dtm_submission_upload' then
    -- Exact ECMAScript trim whitespace set, matching JS/UI. Preserve the
    -- original filename; only reject values containing whitespace alone.
    if jsonb_typeof(p->'filename') is distinct from 'string' or octet_length(p->>'filename') not between 1 and 255
      or btrim(p->>'filename',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
      or p->>'filename' in ('.','..') or p->>'filename' ~ '[[:cntrl:]/\\]' then return false;end if;
    if jsonb_typeof(p->'content_type') is distinct from 'string' or char_length(p->>'content_type')>120
      or p->>'content_type' !~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$' then return false;end if;
    if jsonb_typeof(p->'size_bytes') is distinct from 'number' then return false;end if;
    n:=(p->>'size_bytes')::numeric;if n<>trunc(n) or n<0 or n>10485760 then return false;end if;
  elsif p_kind='save_dtm_submission_review' then
    if jsonb_typeof(p->'status') is distinct from 'string' or p->>'status' not in ('graded','not_graded') then return false;end if;
    foreach key in array array['grade_text','feedback'] loop
      if p->key='null'::jsonb then continue;end if;
      if jsonb_typeof(p->key) is distinct from 'string' or char_length(p->>key)>(case when key='grade_text' then 80 else 2000 end) then return false;end if;
    end loop;
    if p->>'status'='not_graded' and p->'grade_text'<>'null'::jsonb then return false;end if;
  end if;
  return true;
exception when others then return false;
end;$$;

create function public.dtm_submission_action(p_kind text,p_payload jsonb,p_verified_object jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());a public.affairs_assignments;s public.dtm_assignment_submissions;
  u private.dtm_submission_uploads;old_file private.dtm_submission_uploads;r public.dtm_submission_reviews;
  receipt private.dtm_submission_operations;obj storage.objects;result jsonb;review_id uuid;
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google account required' using errcode='42501';end if;
  if not private.dtm_submission_payload_valid(p_kind,p_payload) then raise exception 'Invalid submission fields' using errcode='22023';end if;
  if p_kind='save_dtm_submission_review' and not(select private.affairs_is_admin()) then raise exception 'Administrator required' using errcode='42501';end if;
  perform 1 from public.affairs_profiles where user_id=actor for update;
  if not found then raise exception 'Account unavailable' using errcode='42501';end if;
  select * into receipt from private.dtm_submission_operations where user_id=actor and request_id=(p_payload->>'request_id')::uuid;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID reused with different fields' using errcode='PT409';end if;
    return receipt.result;
  end if;
  select * into a from public.affairs_assignments where id=(p_payload->>'assignment_id')::uuid for update;
  if a.id is null or a.dtm_course_id is null or a.source_mode not in ('sample','personal') or not exists(
    select 1 from public.affairs_students st join public.dtm_courses c on c.user_id=st.user_id and c.source_mode=a.source_mode
    where st.id=a.student_id and c.id=a.dtm_course_id and (st.user_id=actor or p_kind='save_dtm_submission_review')) then
    raise exception 'Assignment unavailable for this account' using errcode='42501';end if;
  select * into s from public.dtm_assignment_submissions where assignment_id=a.id for update;
  if p_kind='begin_dtm_submission_upload' then
    if coalesce(s.version,0)<>(p_payload->>'expected_version')::integer then raise exception 'Submission changed' using errcode='PT409';end if;
    if s.id is null then
      insert into public.dtm_assignment_submissions(assignment_id,user_id,course_id) values(a.id,actor,a.dtm_course_id) returning * into s;
    end if;
    -- Expiry releases the slot, but physical deletion is a separate retryable job.
    update private.dtm_submission_uploads set state='expired' where submission_id=s.id and state='pending' and expires_at<=clock_timestamp() returning * into u;
    if found then insert into private.dtm_submission_cleanup values(u.object_path,u.user_id,now()) on conflict do nothing;end if;
    if exists(select 1 from private.dtm_submission_uploads where submission_id=s.id and state='pending') then
      raise exception 'An upload is already pending; resume or cancel it' using errcode='PT409';end if;
    u.id:=gen_random_uuid();
    insert into private.dtm_submission_uploads(id,submission_id,user_id,object_path,filename,size_bytes,content_type,expected_version)
      values(u.id,s.id,actor,actor::text||'/'||s.id::text||'/'||u.id::text,p_payload->>'filename',(p_payload->>'size_bytes')::bigint,p_payload->>'content_type',s.version) returning * into u;
    result:=jsonb_build_object('assignmentId',a.id,'submissionId',s.id,'uploadId',u.id,'version',s.version,'bucket','dtm-submissions','path',u.object_path,'expiresAt',u.expires_at,'maxBytes',10485760);
  else
    if s.id is null then raise exception 'Submission unavailable' using errcode='42501';end if;
    select * into u from private.dtm_submission_uploads where id=(p_payload->>'upload_id')::uuid and submission_id=s.id for update;
    if u.id is null then raise exception 'Upload unavailable' using errcode='42501';end if;
    if p_kind='save_dtm_submission_review' then
      if u.state<>'current' or s.current_upload_id<>u.id then raise exception 'The submitted file changed; refresh before grading' using errcode='PT409';end if;
      select * into r from public.dtm_submission_reviews where upload_id=u.id for update;
      if coalesce(r.version,0)<>(p_payload->>'expected_version')::integer then raise exception 'Review changed' using errcode='PT409';end if;
      insert into public.dtm_submission_reviews(submission_id,upload_id,user_id,status,grade_text,feedback,reviewed_by)
        values(s.id,u.id,s.user_id,p_payload->>'status',p_payload->>'grade_text',p_payload->>'feedback',actor)
        on conflict(upload_id) do update set status=excluded.status,grade_text=excluded.grade_text,feedback=excluded.feedback,
          reviewed_by=actor,reviewed_at=now(),version=dtm_submission_reviews.version+1 returning id,version into review_id,r.version;
      result:=jsonb_build_object('assignmentId',a.id,'submissionId',s.id,'uploadId',u.id,'reviewId',review_id,'version',r.version);
    else
      if s.user_id<>actor or u.user_id<>actor then raise exception 'Upload owner required' using errcode='42501';end if;
      if s.version<>(p_payload->>'expected_version')::integer or u.expected_version<>s.version or u.state<>'pending' then
        raise exception 'Submission or pending upload changed' using errcode='PT409';end if;
      if p_kind='cancel_dtm_submission_upload' then
        update private.dtm_submission_uploads set state='cancelled' where id=u.id;
        insert into private.dtm_submission_cleanup values(u.object_path,u.user_id,now()) on conflict do nothing;
        result:=jsonb_build_object('assignmentId',a.id,'submissionId',s.id,'uploadId',u.id,'version',s.version,'cancelled',true);
      else
        if u.expires_at<=clock_timestamp() then raise exception 'Upload reservation expired' using errcode='PT409';end if;
        -- Server checks the live Storage API first. SQL repeats authoritative
        -- metadata checks because an authenticated client can call this RPC.
        select * into obj from storage.objects where bucket_id='dtm-submissions' and name=u.object_path for update;
        if obj.id is null then raise exception 'Upload has not completed' using errcode='PT409';end if;
        if jsonb_typeof(obj.metadata->'size') is distinct from 'number' or (obj.metadata->>'size')::numeric<>u.size_bytes
          or obj.metadata->>'mimetype' is distinct from u.content_type or coalesce(obj.metadata->>'eTag','')='' then
          raise exception 'Stored file metadata does not match the reservation' using errcode='22023';end if;
        if p_verified_object is distinct from jsonb_build_object('id',obj.id,'size_bytes',u.size_bytes,'content_type',u.content_type,'etag',obj.metadata->>'eTag') then
          raise exception 'Stored file verification is missing or changed' using errcode='PT409';end if;
        select * into old_file from private.dtm_submission_uploads where id=s.current_upload_id for update;
        if old_file.id is not null then
          update private.dtm_submission_uploads set state='retired' where id=old_file.id;
          if not exists(select 1 from public.dtm_submission_reviews where upload_id=old_file.id) then
            insert into private.dtm_submission_cleanup values(old_file.object_path,old_file.user_id,now()) on conflict do nothing;
          end if;
        end if;
        update private.dtm_submission_uploads set state='current',object_id=obj.id,object_etag=obj.metadata->>'eTag',committed_at=now() where id=u.id;
        update public.dtm_assignment_submissions set current_upload_id=u.id,version=version+1,submitted_at=now(),content_modified_at=now(),due_at_at_submission=a.due_at
          where id=s.id returning * into s;
        result:=jsonb_build_object('assignmentId',a.id,'submissionId',s.id,'uploadId',u.id,'version',s.version,'submittedAt',s.submitted_at,'contentModifiedAt',s.content_modified_at);
      end if;
    end if;
  end if;
  result:=result||jsonb_build_object('kind',p_kind);
  insert into private.dtm_submission_operations(user_id,request_id,kind,payload,result) values(actor,(p_payload->>'request_id')::uuid,p_kind,p_payload,result);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary) values(actor,p_kind,s.id,'Changed a private local DTM file submission.');
  return result;
end;$$;

-- Called before a commit to recover a prior receipt before touching a file
-- which may already have been replaced/cleaned up. Returns no cross-owner data.
create function public.dtm_submission_prepare(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt private.dtm_submission_operations;u private.dtm_submission_uploads;
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google account required' using errcode='42501';end if;
  if p_kind<>'commit_dtm_submission_upload' or not private.dtm_submission_payload_valid(p_kind,p_payload) then raise exception 'Invalid commit fields' using errcode='22023';end if;
  select * into receipt from private.dtm_submission_operations where user_id=(select auth.uid()) and request_id=(p_payload->>'request_id')::uuid;
  if found then
    if receipt.kind<>p_kind or receipt.payload<>p_payload then raise exception 'Request ID reused' using errcode='PT409';end if;
    return jsonb_build_object('receipt',receipt.result);
  end if;
  select f.* into u from private.dtm_submission_uploads f join public.dtm_assignment_submissions s on s.id=f.submission_id
    where f.id=(p_payload->>'upload_id')::uuid and s.assignment_id=(p_payload->>'assignment_id')::uuid
      and s.user_id=(select auth.uid()) and f.user_id=s.user_id;
  if u.id is null then raise exception 'Upload unavailable' using errcode='42501';end if;
  if u.state<>'pending' or u.expires_at<=clock_timestamp() or u.expected_version<>(p_payload->>'expected_version')::integer then
    raise exception 'Upload changed or expired' using errcode='PT409';end if;
  return jsonb_build_object('upload',jsonb_build_object('id',u.id,'userId',u.user_id,'submissionId',u.submission_id,'path',u.object_path,'sizeBytes',u.size_bytes,'contentType',u.content_type));
end;$$;

create function public.dtm_submission_workspace(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.affairs_assignments;s public.dtm_assignment_submissions;owner_id uuid;
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google account required' using errcode='42501';end if;
  select * into a from public.affairs_assignments where id=p_assignment_id;
  select user_id into owner_id from public.affairs_students where id=a.student_id;
  if a.id is null or a.dtm_course_id is null or not(owner_id=(select auth.uid()) or (select private.affairs_is_admin())) then raise exception 'Assignment unavailable' using errcode='42501';end if;
  select * into s from public.dtm_assignment_submissions where assignment_id=a.id;
  return jsonb_build_object('assignmentId',a.id,'userId',owner_id,'courseId',a.dtm_course_id,'dueAt',a.due_at,'maxBytes',10485760,
    'submission',(case when s.id is not null then to_jsonb(s) else null end),
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'filename',f.filename,'sizeBytes',f.size_bytes,'contentType',f.content_type,'path',f.object_path,'state',f.state,'expiresAt',f.expires_at,'committedAt',f.committed_at) order by f.created_at,f.id)
      from private.dtm_submission_uploads f where f.submission_id=s.id and (f.state='current' or f.state='retired' and exists(select 1 from public.dtm_submission_reviews r where r.upload_id=f.id)
        or f.state='pending' and owner_id=(select auth.uid()))),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.reviewed_at,r.id) from public.dtm_submission_reviews r where r.submission_id=s.id),'[]'::jsonb));
end;$$;

insert into storage.buckets(id,name,public,file_size_limit)
values('dtm-submissions','dtm-submissions',false,10485760)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

-- All paths are minted by the RPC. Storage insert/delete helpers acquire the
-- same assignment -> upload locks as Save/Cancel; UPDATE/upsert is never granted.
create function private.dtm_submission_object_access(p_path text,p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare u private.dtm_submission_uploads;assignment_id_value uuid;queued private.dtm_submission_cleanup;
begin
  if not(select private.affairs_google_identity()) then return false;end if;
  select s.assignment_id into assignment_id_value from private.dtm_submission_uploads f join public.dtm_assignment_submissions s on s.id=f.submission_id where f.object_path=p_path;
  if p_operation in ('insert','delete') and assignment_id_value is not null then perform 1 from public.affairs_assignments where id=assignment_id_value for update;end if;
  if p_operation in ('insert','delete') then select * into u from private.dtm_submission_uploads where object_path=p_path for update;
  else select * into u from private.dtm_submission_uploads where object_path=p_path;end if;
  if p_operation='insert' then return u.id is not null and u.user_id=(select auth.uid()) and u.state='pending' and u.expires_at>clock_timestamp();end if;
  if p_operation='select' then
    return u.id is not null and (u.user_id=(select auth.uid()) and u.state='pending'
      or (u.state='current' or u.state='retired' and exists(select 1 from public.dtm_submission_reviews where upload_id=u.id))
        and (u.user_id=(select auth.uid()) or (select private.affairs_is_admin())))
      or exists(select 1 from private.dtm_submission_cleanup q where q.object_path=p_path and (q.user_id=(select auth.uid()) or (select private.affairs_is_admin())));
  end if;
  if p_operation='delete' then
    select * into queued from private.dtm_submission_cleanup where object_path=p_path for update;
    return queued.object_path is not null and (queued.user_id=(select auth.uid()) or (select private.affairs_is_admin()))
      and (u.id is null or u.state in ('cancelled','expired','retired'))
      and not exists(select 1 from public.dtm_submission_reviews where upload_id=u.id);
  end if;
  return false;
end;$$;
create policy dtm_submission_storage_read on storage.objects for select to authenticated using(bucket_id='dtm-submissions' and private.dtm_submission_object_access(name,'select'));
create policy dtm_submission_storage_insert on storage.objects for insert to authenticated with check(bucket_id='dtm-submissions' and private.dtm_submission_object_access(name,'insert'));
create policy dtm_submission_storage_delete on storage.objects for delete to authenticated using(bucket_id='dtm-submissions' and private.dtm_submission_object_access(name,'delete'));

-- Consumer: delete each returned path with Storage.remove(), then acknowledge.
-- Failed deletes remain queued. An authenticated admin sweep is required for
-- deleted users' objects; merely deleting Storage metadata would leak the bytes.
create function public.dtm_submission_cleanup_batch(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row_value record;
begin
  if not(select private.affairs_google_identity()) or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid cleanup request' using errcode='42501';end if;
  for row_value in select s.assignment_id,f.id from private.dtm_submission_uploads f join public.dtm_assignment_submissions s on s.id=f.submission_id
    where f.state='pending' and f.expires_at<=clock_timestamp() and (f.user_id=(select auth.uid()) or (select private.affairs_is_admin())) order by s.assignment_id,f.id limit p_limit loop
    perform 1 from public.affairs_assignments where id=row_value.assignment_id for update;
    update private.dtm_submission_uploads set state='expired' where id=row_value.id and state='pending' and expires_at<=clock_timestamp();
    if found then insert into private.dtm_submission_cleanup select object_path,user_id,now() from private.dtm_submission_uploads where id=row_value.id on conflict do nothing;end if;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('path',q.object_path)) from
    (select object_path from private.dtm_submission_cleanup where user_id=(select auth.uid()) or (select private.affairs_is_admin()) order by queued_at,object_path limit p_limit) q),'[]'::jsonb);
end;$$;
create function public.dtm_submission_cleanup_ack(p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google account required' using errcode='42501';end if;
  if exists(select 1 from storage.objects where bucket_id='dtm-submissions' and name=p_path) then raise exception 'File has not been deleted' using errcode='PT409';end if;
  delete from private.dtm_submission_cleanup where object_path=p_path and (user_id=(select auth.uid()) or (select private.affairs_is_admin()));
end;$$;

revoke all on function private.dtm_submission_owner_guard(),private.dtm_submission_assignment_guard(),private.dtm_submission_delete_guard(),private.dtm_submission_queue_deleted(),private.dtm_submission_payload_valid(text,jsonb),private.dtm_submission_object_access(text,text) from public,anon,authenticated;
grant execute on function private.dtm_submission_object_access(text,text) to authenticated;
revoke all on function public.dtm_submission_action(text,jsonb,jsonb),public.dtm_submission_prepare(text,jsonb),public.dtm_submission_workspace(uuid),public.dtm_submission_cleanup_batch(integer),public.dtm_submission_cleanup_ack(text) from public,anon;
grant execute on function public.dtm_submission_action(text,jsonb,jsonb),public.dtm_submission_prepare(text,jsonb),public.dtm_submission_workspace(uuid),public.dtm_submission_cleanup_batch(integer),public.dtm_submission_cleanup_ack(text) to authenticated;
