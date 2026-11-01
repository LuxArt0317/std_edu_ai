-- Keep student self-service intake compatible with accountable staff triage.
-- RLS remains authoritative; this invoker trigger never grants extra access.
create or replace function private.validate_support_case_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is null then
    if tg_op = 'INSERT'
      and private.current_role() = 'student'
      and new.status = 'open'
      and new.priority in ('low', 'medium', 'high')
      and new.resolved_at is null
      and exists (
        select 1 from public.students s
        where s.id = new.student_id and s.profile_id = (select auth.uid())
      ) then
      return new;
    end if;
    raise exception 'Choose an accountable case owner';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = new.owner_id and p.account_status = 'active'
      and p.role in ('owner', 'admin', 'advisor', 'support', 'registrar')
  ) then
    raise exception 'Choose an active support, advising, registrar, or administrative owner';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_support_case_owner() from public, anon, authenticated;

drop trigger if exists cases_relationship_invariants on public.cases;
create trigger cases_relationship_invariants
before insert or update of owner_id, status on public.cases
for each row execute function private.validate_support_case_owner();
