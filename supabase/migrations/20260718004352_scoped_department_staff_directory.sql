create or replace function public.update_department_staff_profile(p_profile_id uuid,p_full_name text,p_department text,p_job_title text,p_reason text)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare v_actor public.profiles; v_target public.profiles; v_before jsonb;
begin
 select * into v_actor from public.profiles where id=auth.uid();
 if v_actor.role not in ('owner','admin','department_head') then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_target from public.profiles where id=p_profile_id for update; if v_target.id is null then raise exception 'Profile not found'; end if;
 if v_target.is_platform_owner then raise exception 'The protected owner cannot be edited'; end if;
 if v_actor.role='department_head' and (v_actor.department_id is null or v_actor.department_id is distinct from v_target.department_id) then raise exception 'Department heads may edit only staff in their assigned department' using errcode='42501'; end if;
 v_before=to_jsonb(v_target);
 update public.profiles set full_name=trim(p_full_name),department=nullif(trim(p_department),''),job_title=nullif(trim(p_job_title),''),updated_at=now() where id=p_profile_id returning * into v_target;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('update_department_staff_directory','profile',p_profile_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_target)); return v_target;
end $$;
revoke all on function public.update_department_staff_profile(uuid,text,text,text,text) from public,anon;
grant execute on function public.update_department_staff_profile(uuid,text,text,text,text) to authenticated;
