create or replace function public.transition_institutional_initiative(p_initiative_id uuid,p_action text,p_owner_id uuid,p_reason text)
returns public.institutional_initiatives language plpgsql security definer set search_path='' as $$
declare v_row public.institutional_initiatives; v_before jsonb; v_role text=(select private.current_role()); v_executive boolean;
begin
 v_executive:=v_role in ('owner','admin','president','vice_president');
 if auth.uid() is null or v_role not in ('owner','admin','president','vice_president','dean','department_head') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_action not in ('approve','assign','complete','reject','escalate') then raise exception 'Invalid initiative action'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_row from public.institutional_initiatives where id=p_initiative_id for update; if v_row.id is null then raise exception 'Initiative not found'; end if; v_before=to_jsonb(v_row);
 if p_action in ('approve','reject') and not (v_executive or (v_role='dean' and v_row.initiative_type in ('teaching_plan','content_correction'))) then raise exception 'This role cannot approve or reject this initiative type' using errcode='42501'; end if;
 if p_action='assign' and p_owner_id is null then raise exception 'An initiative owner is required'; end if;
 if p_action='complete' and not (v_executive or v_row.owner_id=auth.uid()) then raise exception 'Only the assigned owner or executive leadership can complete this work' using errcode='42501'; end if;
 if p_action='escalate' and v_role not in ('vice_president','dean','department_head') then raise exception 'This role cannot escalate the initiative' using errcode='42501'; end if;
 update public.institutional_initiatives set status=case p_action when 'approve' then 'approved' when 'assign' then 'in_progress' when 'complete' then 'completed' when 'reject' then 'rejected' else 'escalated' end, owner_id=case when p_action='assign' then p_owner_id else owner_id end, approved_by=case when p_action='approve' then auth.uid() else approved_by end, approved_at=case when p_action='approve' then now() else approved_at end, updated_at=now() where id=p_initiative_id returning * into v_row;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values(p_action||'_institutional_initiative','institutional_initiative',p_initiative_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_row)); return v_row;
end $$;
revoke all on function public.transition_institutional_initiative(uuid,text,uuid,text) from public,anon;
grant execute on function public.transition_institutional_initiative(uuid,text,uuid,text) to authenticated;
