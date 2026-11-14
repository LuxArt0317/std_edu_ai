create table public.affairs_announcement_email_preferences (
  user_id uuid primary key references public.affairs_profiles(user_id) on delete cascade,
  enabled boolean not null,
  effective_at timestamptz not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
create index on public.affairs_announcement_email_preferences(effective_at) where enabled;

create table private.affairs_announcement_email_changes (
  user_id uuid not null references public.affairs_announcement_email_preferences(user_id) on delete cascade,
  request_id uuid not null,
  requested boolean not null,
  expected_version integer not null,
  receipt jsonb not null,
  primary key (user_id,request_id)
);

create table private.affairs_announcement_email_messages (
  announcement_id uuid primary key references public.affairs_announcements(id) on delete cascade,
  title text not null,
  body text not null
);
create table private.affairs_announcement_email_queue (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references private.affairs_announcement_email_messages(announcement_id) on delete cascade,
  user_id uuid not null references public.affairs_announcement_email_preferences(user_id) on delete cascade,
  preference_version integer not null,
  created_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','accepted','failed','skipped')),
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  recipient_digest bytea,
  envelope_digest text,
  lease_token uuid,
  provider_id text,
  unique (announcement_id,user_id)
);
create index on private.affairs_announcement_email_queue(next_attempt_at,id) where status in ('queued','sending');
create index on private.affairs_announcement_email_queue(user_id);

alter table public.affairs_announcement_email_preferences enable row level security;
alter table private.affairs_announcement_email_changes enable row level security;
alter table private.affairs_announcement_email_messages enable row level security;
alter table private.affairs_announcement_email_queue enable row level security;
revoke all on public.affairs_announcement_email_preferences, private.affairs_announcement_email_changes,
  private.affairs_announcement_email_messages, private.affairs_announcement_email_queue from public,anon,authenticated;

create function public.affairs_read_announcement_email() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  saved public.affairs_announcement_email_preferences;
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Announcement preference access denied' using errcode='42501';
  end if;
  select * into saved from public.affairs_announcement_email_preferences where user_id=caller;
  return jsonb_build_object('userId',caller,'enabled',coalesce(saved.enabled,false),
    'active',coalesce(saved.enabled and saved.effective_at<=now(),false),
    'effectiveAt',saved.effective_at,'version',coalesce(saved.version,0));
end;
$$;

create function public.affairs_save_announcement_email(p_enabled boolean,p_expected_version integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  saved public.affairs_announcement_email_preferences;
  previous private.affairs_announcement_email_changes;
  receipt jsonb;
  activation timestamptz;
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Announcement preference access denied' using errcode='42501';
  end if;
  if p_enabled is null or p_expected_version is null or p_expected_version not between 0 and 2147483646 or p_request_id is null then
    raise exception 'Invalid announcement preference' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('announcement-email:'||caller,0));
  select * into previous from private.affairs_announcement_email_changes
    where user_id=caller and request_id=p_request_id;
  if found then
    if previous.requested<>p_enabled or previous.expected_version<>p_expected_version then
      raise exception 'Request ID already used' using errcode='PT409';
    end if;
    return previous.receipt;
  end if;
  select * into saved from public.affairs_announcement_email_preferences where user_id=caller for update;
  if coalesce(saved.version,0)<>p_expected_version then
    raise exception 'Announcement preference changed' using errcode='PT409';
  end if;
  if saved.enabled=p_enabled then
    receipt:=jsonb_build_object('userId',caller,'enabled',saved.enabled,'effectiveAt',saved.effective_at,'version',saved.version);
    insert into private.affairs_announcement_email_changes values(caller,p_request_id,p_enabled,p_expected_version,receipt);
    return receipt;
  end if;
  if not exists(select 1 from public.affairs_profiles where user_id=caller) then
    -- The route may be opened directly before the account has loaded the portal.
    perform public.affairs_initialize_account();
  end if;
  activation:=case when p_enabled then ((now() at time zone 'Asia/Taipei')::date+1)::timestamp at time zone 'Asia/Taipei'
    else now() end;
  insert into public.affairs_announcement_email_preferences(user_id,enabled,effective_at,version)
    values(caller,p_enabled,activation,p_expected_version+1)
    on conflict(user_id) do update set enabled=excluded.enabled,effective_at=excluded.effective_at,
      version=excluded.version,updated_at=now()
    returning * into saved;
  receipt:=jsonb_build_object('userId',caller,'enabled',saved.enabled,'effectiveAt',saved.effective_at,'version',saved.version);
  insert into private.affairs_announcement_email_changes values(caller,p_request_id,p_enabled,p_expected_version,receipt);
  return receipt;
end;
$$;

create function private.affairs_queue_announcement_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.source_mode not in ('site','verified') or new.published_at>now() or
    char_length(new.title) not between 3 and 160 or char_length(new.body) not between 5 and 2000 then
    return new;
  end if;
  insert into private.affairs_announcement_email_messages values(new.id,new.title,new.body);
  insert into private.affairs_announcement_email_queue(announcement_id,user_id,preference_version)
    select new.id,p.user_id,p.version
    from public.affairs_announcement_email_preferences p join public.affairs_profiles a on a.user_id=p.user_id
    where p.enabled and p.effective_at<=new.published_at and (new.audience='all' or a.role='student');
  return new;
end;
$$;
create trigger affairs_announcement_email_after_publish after insert on public.affairs_announcements
  for each row execute function private.affairs_queue_announcement_email();

-- One short, fenced lease at a time. The same provider key can be retried
-- only within its documented deduplication window.
create function public.affairs_claim_announcement_email(p_envelope_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  delivery private.affairs_announcement_email_queue;
  message private.affairs_announcement_email_messages;
  recipient text;
  digest bytea;
  claimed uuid;
  attempt integer;
begin
  if p_envelope_digest is null or p_envelope_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid announcement envelope' using errcode='22023';
  end if;
  for attempt in 1..20 loop
    select * into delivery from private.affairs_announcement_email_queue q
      where q.status in ('queued','sending') and q.next_attempt_at<=now()
      order by q.next_attempt_at,q.id limit 1 for update skip locked;
    if not found then return null; end if;
    if delivery.first_attempt_at<now()-interval '23 hours' or
      delivery.created_at<now()-interval '3 days' then
      update private.affairs_announcement_email_queue set status='failed',lease_token=null where id=delivery.id;
      continue;
    end if;
    select lower(u.email) into recipient
      from auth.users u join public.affairs_announcement_email_preferences p on p.user_id=u.id
      join public.affairs_profiles a on a.user_id=p.user_id
      join public.affairs_announcements n on n.id=delivery.announcement_id
      where u.id=delivery.user_id and u.email_confirmed_at is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())
        and p.enabled and p.version=delivery.preference_version and p.effective_at<=now()
        and (n.audience='all' or a.role='student')
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
    digest:=extensions.digest(recipient,'sha256');
    if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
      (delivery.recipient_digest is not null and delivery.recipient_digest<>digest) or
      (delivery.envelope_digest is not null and delivery.envelope_digest<>p_envelope_digest) then
      update private.affairs_announcement_email_queue set status='skipped',lease_token=null where id=delivery.id;
      continue;
    end if;
    claimed:=gen_random_uuid();
    update private.affairs_announcement_email_queue set status='sending',next_attempt_at=now()+interval '5 minutes',
      lease_token=claimed,first_attempt_at=coalesce(first_attempt_at,now()),recipient_digest=digest,
      envelope_digest=p_envelope_digest where id=delivery.id;
    select * into strict message from private.affairs_announcement_email_messages where announcement_id=delivery.announcement_id;
    return jsonb_build_object('id',delivery.id,'lease',claimed,'to',recipient,'title',message.title,'body',message.body);
  end loop;
  return null;
end;
$$;

create function public.affairs_finish_announcement_email(p_id uuid,p_lease uuid,p_result text,p_provider_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_id is null or p_lease is null or p_result is null or p_result not in ('accepted','failed','retry') or
    (p_result='accepted' and coalesce(p_provider_id,'') !~ '^[A-Za-z0-9_-]{1,100}$') or
    (p_result<>'accepted' and p_provider_id is not null) then
    raise exception 'Invalid announcement delivery result' using errcode='22023';
  end if;
  update private.affairs_announcement_email_queue
    set status=case when p_result='retry' then 'queued' else p_result end,
      provider_id=p_provider_id,lease_token=null,next_attempt_at=now()+interval '15 minutes'
    where id=p_id and lease_token=p_lease and status='sending';
  return found;
end;
$$;

revoke all on function private.affairs_queue_announcement_email() from public,anon,authenticated;
revoke all on function public.affairs_read_announcement_email(),public.affairs_save_announcement_email(boolean,integer,uuid) from public,anon;
grant execute on function public.affairs_read_announcement_email(),public.affairs_save_announcement_email(boolean,integer,uuid) to authenticated;
revoke all on function public.affairs_claim_announcement_email(text),public.affairs_finish_announcement_email(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.affairs_claim_announcement_email(text),public.affairs_finish_announcement_email(uuid,uuid,text,text) to service_role;
