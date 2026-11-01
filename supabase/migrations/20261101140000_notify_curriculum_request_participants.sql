-- Close the proposal/review loop using the existing private notification channel.
create function private.notify_curriculum_request_participants()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (tg_op='UPDATE' and new.status='withdrawn' and old.status is distinct from new.status) then
    insert into public.notifications(recipient_id,title,body,kind,action_url,created_by)
    select p.id,
      case when new.status='withdrawn' then 'Curriculum request withdrawn' else 'Curriculum proposal needs review' end,
      new.summary || case when new.status='withdrawn' then E'\nWithdrawal: ' || coalesce(new.review_reason,'') else E'\nAn assigned teacher has requested academic review. Open Academic Office to review the proposal.' end,
      'curriculum_request','/crm?curriculum_request=' || new.id::text,auth.uid()
    from public.profiles p
    where p.role in ('owner','admin','dean','registrar','department_head') and p.account_status='active' and p.id<>new.requester_id;
  elsif tg_op='UPDATE' and new.status in ('approved','rejected') and old.status is distinct from new.status then
    insert into public.notifications(recipient_id,title,body,kind,action_url,created_by)
    values(new.requester_id,'Curriculum proposal '||new.status,new.summary||E'\nDecision: '||coalesce(new.review_reason,'')||E'\nApproval does not publish an institutional curriculum. Your academic manager applies any approved changes.',
      'curriculum_decision','/crm?curriculum_request='||new.id::text,auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.notify_curriculum_request_participants() from public, anon, authenticated;
create trigger curriculum_request_participant_notifications
after insert or update of status on public.curriculum_change_requests
for each row execute function private.notify_curriculum_request_participants();
