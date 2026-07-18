alter table public.notifications
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists notifications_created_by_idx on public.notifications(created_by);

create table public.communication_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (char_length(trim(subject)) between 2 and 160),
  body text not null check (char_length(trim(body)) between 2 and 10000),
  channel text not null default 'portal' check (channel in ('portal','email','sms')),
  status text not null default 'pending' check (status in ('draft','pending','approved','sent','rejected','cancelled')),
  approved_by uuid references public.profiles(id) on delete restrict,
  approval_reason text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index communication_requests_sender_idx on public.communication_requests(sender_id, created_at desc);
create index communication_requests_recipient_idx on public.communication_requests(recipient_id, created_at desc);
create index communication_requests_approved_by_idx on public.communication_requests(approved_by);
alter table public.communication_requests enable row level security;
grant select, insert, update on public.communication_requests to authenticated;

drop policy if exists notifications_owner_only on public.notifications;
create policy notifications_read_self on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create policy notifications_update_self on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
create policy notifications_insert_authorized on public.notifications for insert to authenticated
with check (
  created_by = (select auth.uid()) and
  ((select private.has_role(array['admin','president','vice_president','dean','registrar','department_head','faculty','advisor','admissions','finance','support','librarian']))
   or recipient_id = (select auth.uid()))
);

create policy communications_read_participant_or_staff on public.communication_requests for select to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()) or (select private.has_role(array['admin','support'])));
create policy communications_insert_sender on public.communication_requests for insert to authenticated
with check (
  sender_id = (select auth.uid()) and
  status = 'pending' and
  exists (
    select 1 from public.profiles recipient
    where recipient.id = recipient_id
      and recipient.account_status = 'active'
      and (
        (select private.current_role()) <> 'student'
        or recipient.role = any(array['faculty','advisor','support','admin'])
      )
  )
);
create policy communications_cancel_sender on public.communication_requests for update to authenticated
using (sender_id = (select auth.uid()) and status in ('draft','pending'))
with check (sender_id = (select auth.uid()) and status = 'cancelled');

create or replace function public.decide_communication_request(p_request_id uuid, p_approve boolean, p_reason text)
returns public.communication_requests
language plpgsql security definer set search_path = '' as $$
declare v_request public.communication_requests; v_before jsonb;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','support'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A decision reason of at least 12 characters is required'; end if;
  select * into v_request from public.communication_requests where id=p_request_id and status='pending' for update;
  if v_request.id is null then raise exception 'Pending communication not found'; end if;
  v_before:=to_jsonb(v_request);
  update public.communication_requests set status=case when p_approve then 'sent' else 'rejected' end, approved_by=auth.uid(), approval_reason=trim(p_reason), approved_at=now(), sent_at=case when p_approve then now() else null end, updated_at=now() where id=p_request_id returning * into v_request;
  if p_approve then
    insert into public.notifications(recipient_id,title,body,kind,action_url,created_by) values (v_request.recipient_id,v_request.subject,v_request.body,'message','/crm',auth.uid());
  end if;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values (case when p_approve then 'approve_and_send_communication' else 'reject_communication' end,'communication',v_request.id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_request));
  return v_request;
end $$;
revoke all on function public.decide_communication_request(uuid,boolean,text) from public,anon;
grant execute on function public.decide_communication_request(uuid,boolean,text) to authenticated;
