-- Durable historical conversation memory. Client-supplied claims cannot be inserted.
create table public.assistant_memory_state(owner_id uuid primary key references auth.users(id) on delete cascade, generation bigint not null default 0);
create table public.assistant_memory_entries(
 owner_id uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null check(length(fingerprint)=64),
 question text not null check(octet_length(question)<=3200),
 answer text not null check(octet_length(answer)<=9600),
 sources jsonb not null check(jsonb_typeof(sources)='array' and jsonb_array_length(sources) between 1 and 6),
 observed_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 primary key(owner_id,fingerprint)
);
alter table public.assistant_memory_entries enable row level security;
alter table public.assistant_memory_state enable row level security;
revoke all on public.assistant_memory_entries,public.assistant_memory_state from anon,authenticated;
grant select on public.assistant_memory_entries,public.assistant_memory_state to authenticated;
grant all on public.assistant_memory_entries,public.assistant_memory_state to service_role;
create policy memory_own_read on public.assistant_memory_entries for select to authenticated using(owner_id=(select auth.uid()) and expires_at>now());
create policy memory_state_own_read on public.assistant_memory_state for select to authenticated using(owner_id=(select auth.uid()));
create function public.assistant_memory_clear() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,115));
 insert into public.assistant_memory_state(owner_id,generation) values(auth.uid(),1)
 on conflict(owner_id) do update set generation=assistant_memory_state.generation+1;
 delete from public.assistant_memory_entries where owner_id=auth.uid();
end $$;
revoke all on function public.assistant_memory_clear() from public,anon;
grant execute on function public.assistant_memory_clear() to authenticated;
create function public.assistant_memory_save(p_owner uuid,p_generation bigint,p_fingerprint text,p_question text,p_answer text,p_sources jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_generation bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,115));
 insert into public.assistant_memory_state(owner_id) values(p_owner) on conflict do nothing;
 select generation into current_generation from public.assistant_memory_state where owner_id=p_owner;
 if current_generation<>p_generation then return false; end if;
 delete from public.assistant_memory_entries where owner_id=p_owner and expires_at<=now();
 insert into public.assistant_memory_entries(owner_id,fingerprint,question,answer,sources) values(p_owner,p_fingerprint,p_question,p_answer,p_sources)
 on conflict(owner_id,fingerprint) do update set answer=excluded.answer,sources=excluded.sources,observed_at=now(),expires_at=now()+interval '30 days';
 delete from public.assistant_memory_entries where owner_id=p_owner and fingerprint in
 (select fingerprint from public.assistant_memory_entries where owner_id=p_owner order by observed_at desc,fingerprint offset 80);
 return true;
end $$;
revoke all on function public.assistant_memory_save(uuid,bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assistant_memory_save(uuid,bigint,text,text,text,jsonb) to service_role;
-- Invoke daily from the database scheduler; expired rows are already invisible via RLS.
create function public.assistant_memory_purge_expired() returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.assistant_memory_entries where expires_at<=now();
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.assistant_memory_purge_expired() from public,anon,authenticated;
grant execute on function public.assistant_memory_purge_expired() to service_role;
create index assistant_memory_expiry on public.assistant_memory_entries(expires_at);
