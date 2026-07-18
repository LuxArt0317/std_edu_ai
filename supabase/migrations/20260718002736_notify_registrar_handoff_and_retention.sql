create or replace function public.request_admission_handoff(p_lead_id uuid,p_notes text) returns public.admission_handoffs language plpgsql security definer set search_path='' as $$
declare v_row public.admission_handoffs; v_lead public.admission_leads;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','admissions'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_notes,'')))<12 then raise exception 'Handoff notes must contain at least 12 characters'; end if;
 select * into v_lead from public.admission_leads where id=p_lead_id and stage='admitted'; if v_lead.id is null then raise exception 'Only an admitted applicant can be handed off'; end if;
 insert into public.admission_handoffs(lead_id,requested_by,notes) values(p_lead_id,auth.uid(),trim(p_notes)) returning * into v_row;
 insert into public.notifications(recipient_id,title,body,kind,action_url,created_by)
 select p.id,'Accepted applicant ready for Registrar handoff',v_lead.full_name||' is ready for student-account conversion. '||trim(p_notes),'admission_handoff','/crm',auth.uid() from public.profiles p where p.role in ('registrar','admin') and p.account_status='active';
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,after_state) values('request_student_account_conversion','admission_lead',p_lead_id,auth.uid(),trim(p_notes),to_jsonb(v_row)); return v_row;
end $$;
revoke all on function public.request_admission_handoff(uuid,text) from public,anon;
grant execute on function public.request_admission_handoff(uuid,text) to authenticated;
