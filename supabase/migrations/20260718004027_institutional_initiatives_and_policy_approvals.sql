create table public.institutional_initiatives (
 id uuid primary key default extensions.gen_random_uuid(),
 initiative_type text not null check(initiative_type in ('policy','initiative','teaching_plan','content_correction')),
 title text not null check(char_length(trim(title)) between 3 and 180), description text not null check(char_length(trim(description)) between 12 and 10000),
 scope text not null default 'institution', priority text not null default 'normal' check(priority in ('normal','high','urgent')),
 status text not null default 'proposed' check(status in ('proposed','approved','in_progress','completed','rejected','escalated')),
 owner_id uuid references public.profiles(id) on delete restrict, created_by uuid not null references public.profiles(id) on delete restrict,
 approved_by uuid references public.profiles(id) on delete restrict, approved_at timestamptz, due_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index institutional_initiatives_owner_idx on public.institutional_initiatives(owner_id,status,due_at);
create index institutional_initiatives_created_by_idx on public.institutional_initiatives(created_by);
create index institutional_initiatives_approved_by_idx on public.institutional_initiatives(approved_by);
alter table public.institutional_initiatives enable row level security;
grant select,insert on public.institutional_initiatives to authenticated;
create policy initiatives_read_leadership on public.institutional_initiatives for select to authenticated using ((select private.has_role(array['admin','president','vice_president','dean','registrar','department_head'])) or owner_id=(select auth.uid()) or created_by=(select auth.uid()));
create policy initiatives_create_leadership on public.institutional_initiatives for insert to authenticated with check (created_by=(select auth.uid()) and status='proposed' and (select private.has_role(array['admin','president','vice_president','dean','department_head'])));

create or replace function public.transition_institutional_initiative(p_initiative_id uuid,p_action text,p_owner_id uuid,p_reason text)
returns public.institutional_initiatives language plpgsql security definer set search_path='' as $$
declare v_row public.institutional_initiatives; v_before jsonb; v_role text=(select private.current_role());
begin
 if auth.uid() is null or v_role not in ('owner','admin','president','vice_president','dean','department_head') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_action not in ('approve','assign','complete','reject','escalate') then raise exception 'Invalid initiative action'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_row from public.institutional_initiatives where id=p_initiative_id for update; if v_row.id is null then raise exception 'Initiative not found'; end if; v_before=to_jsonb(v_row);
 if p_action in ('approve','reject') and v_role not in ('owner','admin','president','vice_president') then raise exception 'Only executive leadership can approve or reject' using errcode='42501'; end if;
 if p_action='assign' and p_owner_id is null then raise exception 'An initiative owner is required'; end if;
 update public.institutional_initiatives set
  status=case p_action when 'approve' then 'approved' when 'assign' then 'in_progress' when 'complete' then 'completed' when 'reject' then 'rejected' else 'escalated' end,
  owner_id=case when p_action='assign' then p_owner_id else owner_id end,
  approved_by=case when p_action='approve' then auth.uid() else approved_by end,
  approved_at=case when p_action='approve' then now() else approved_at end, updated_at=now()
 where id=p_initiative_id returning * into v_row;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values(p_action||'_institutional_initiative','institutional_initiative',p_initiative_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_row));
 return v_row;
end $$;
revoke all on function public.transition_institutional_initiative(uuid,text,uuid,text) from public,anon;
grant execute on function public.transition_institutional_initiative(uuid,text,uuid,text) to authenticated;
