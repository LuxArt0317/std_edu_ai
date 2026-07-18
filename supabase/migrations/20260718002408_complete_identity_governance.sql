alter table public.profiles add column if not exists phone text;

create or replace function public.remove_profile_section_assignment(p_assignment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_assignment public.profile_section_assignments;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','registrar','dean','department_head'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A removal reason of at least 12 characters is required'; end if;
  select * into v_assignment from public.profile_section_assignments where id=p_assignment_id for update;
  if v_assignment.id is null then raise exception 'Responsibility assignment not found'; end if;
  delete from public.profile_section_assignments where id=p_assignment_id;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state)
  values('remove_section_responsibility','profile_section_assignment',p_assignment_id,auth.uid(),trim(p_reason),to_jsonb(v_assignment),'{}'::jsonb);
end $$;

revoke all on function public.remove_profile_section_assignment(uuid,text) from public,anon;
grant execute on function public.remove_profile_section_assignment(uuid,text) to authenticated;

create table public.admission_handoffs (
  id uuid primary key default extensions.gen_random_uuid(),
  lead_id uuid not null unique references public.admission_leads(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','converted')),
  notes text not null check (char_length(trim(notes)) between 12 and 2000),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  student_profile_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index admission_handoffs_requested_by_idx on public.admission_handoffs(requested_by);
create index admission_handoffs_decided_by_idx on public.admission_handoffs(decided_by);
create index admission_handoffs_student_profile_idx on public.admission_handoffs(student_profile_id);
alter table public.admission_handoffs enable row level security;
grant select,insert on public.admission_handoffs to authenticated;
create policy admission_handoffs_read on public.admission_handoffs for select to authenticated using ((select private.has_role(array['admin','registrar','admissions'])));
create policy admission_handoffs_request on public.admission_handoffs for insert to authenticated with check (requested_by=(select auth.uid()) and (select private.has_role(array['admin','admissions'])) and status='pending' and exists(select 1 from public.admission_leads l where l.id=lead_id and l.stage='admitted'));

alter table public.campaigns add column if not exists approved_by uuid references public.profiles(id) on delete restrict, add column if not exists approved_at timestamptz, add column if not exists approval_reason text;
create index if not exists campaigns_approved_by_idx on public.campaigns(approved_by);

create table public.sensitive_case_access (
  id uuid primary key default extensions.gen_random_uuid(), case_id uuid not null references public.cases(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict, purpose text not null check(char_length(trim(purpose)) between 12 and 500), accessed_at timestamptz not null default now()
);
create index sensitive_case_access_case_idx on public.sensitive_case_access(case_id,accessed_at desc);
create index sensitive_case_access_actor_idx on public.sensitive_case_access(actor_id);
alter table public.sensitive_case_access enable row level security;
grant select on public.sensitive_case_access to authenticated;
create policy sensitive_case_access_governance_read on public.sensitive_case_access for select to authenticated using ((select private.has_role(array['admin','president','vice_president','support'])) or actor_id=(select auth.uid()));

create or replace function public.request_admission_handoff(p_lead_id uuid,p_notes text) returns public.admission_handoffs language plpgsql security definer set search_path='' as $$
declare v_row public.admission_handoffs;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','admissions'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_notes,'')))<12 then raise exception 'Handoff notes must contain at least 12 characters'; end if;
 insert into public.admission_handoffs(lead_id,requested_by,notes) values(p_lead_id,auth.uid(),trim(p_notes)) returning * into v_row;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,after_state) values('request_student_account_conversion','admission_lead',p_lead_id,auth.uid(),trim(p_notes),to_jsonb(v_row)); return v_row;
end $$;

create or replace function public.approve_and_send_campaign(p_campaign_id uuid,p_reason text) returns public.campaigns language plpgsql security definer set search_path='' as $$
declare v_row public.campaigns; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','president','vice_president','admissions','support'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'Approval reason must contain at least 12 characters'; end if;
 select * into v_row from public.campaigns where id=p_campaign_id for update; if v_row.id is null then raise exception 'Campaign not found'; end if; v_before=to_jsonb(v_row);
 update public.campaigns set status='active',approved_by=auth.uid(),approved_at=now(),approval_reason=trim(p_reason),updated_at=now() where id=p_campaign_id returning * into v_row;
 insert into public.notifications(recipient_id,title,body,kind,action_url,created_by)
 select s.profile_id,v_row.name,v_row.message_template,'campaign','/crm',auth.uid() from public.campaign_recipients cr join public.students s on s.id=cr.student_id where cr.campaign_id=p_campaign_id and s.profile_id is not null;
 update public.campaign_recipients set delivery_status='sent',delivered_at=now() where campaign_id=p_campaign_id;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('approve_and_send_bulk_campaign','campaign',p_campaign_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_row)); return v_row;
end $$;

create or replace function public.record_sensitive_case_access(p_case_id uuid,p_purpose text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (select private.has_role(array['admin','president','vice_president','dean','registrar','advisor','finance','support'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_purpose,'')))<12 then raise exception 'Access purpose must contain at least 12 characters'; end if;
 if not exists(select 1 from public.cases where id=p_case_id) then raise exception 'Case not found'; end if;
 insert into public.sensitive_case_access(case_id,actor_id,purpose) values(p_case_id,auth.uid(),trim(p_purpose));
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason) values('access_sensitive_case','case',p_case_id,auth.uid(),trim(p_purpose));
end $$;

revoke all on function public.request_admission_handoff(uuid,text),public.approve_and_send_campaign(uuid,text),public.record_sensitive_case_access(uuid,text) from public,anon;
grant execute on function public.request_admission_handoff(uuid,text),public.approve_and_send_campaign(uuid,text),public.record_sensitive_case_access(uuid,text) to authenticated;
