-- Teachers can propose scoped curriculum changes; institutional approval stays governed.
create table public.curriculum_change_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete restrict,
  program_id uuid not null references public.academic_programs(id) on delete restrict,
  plan_id uuid references public.curriculum_plans(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  summary text not null check (char_length(trim(summary)) between 12 and 160),
  details text not null check (char_length(trim(details)) between 20 and 10000),
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index curriculum_requests_requester_idx on public.curriculum_change_requests(requester_id, created_at desc);
create index curriculum_requests_section_idx on public.curriculum_change_requests(section_id);
create index curriculum_requests_program_idx on public.curriculum_change_requests(program_id);
create index curriculum_requests_plan_idx on public.curriculum_change_requests(plan_id) where plan_id is not null;
create index curriculum_requests_reviewer_idx on public.curriculum_change_requests(reviewed_by) where reviewed_by is not null;
alter table public.curriculum_change_requests enable row level security;
revoke all on public.curriculum_change_requests from public, anon, authenticated;
grant select on public.curriculum_change_requests to authenticated;
grant all on public.curriculum_change_requests to service_role;
create policy curriculum_requests_read on public.curriculum_change_requests for select to authenticated
using (requester_id=(select auth.uid()) or (select private.has_role(array['owner','admin','dean','registrar','department_head'])));

create function public.manage_curriculum_change_request(
 p_action text, p_request_id uuid default null, p_section_id uuid default null,
 p_summary text default null, p_details text default null, p_decision text default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid();
 current_request public.curriculum_change_requests;
 result public.curriculum_change_requests;
 target_program uuid;
 target_plan uuid;
 allowed_reviewer boolean := (select private.has_role(array['owner','admin','dean','registrar','department_head']));
begin
 if actor is null then raise exception 'Authentication is required' using errcode='42501'; end if;
 if p_action not in ('create','edit','withdraw','review') then raise exception 'Unsupported request action' using errcode='22023'; end if;
 if p_action='create' then
   if not (select private.has_role(array['owner','admin','dean','registrar','department_head','faculty'])) or not private.can_manage_section(p_section_id) then
     raise exception 'An assigned teaching or academic management role is required' using errcode='42501';
   end if;
   select c.program_id into target_program from public.course_sections s join public.courses c on c.id=s.course_id where s.id=p_section_id;
   if target_program is null then raise exception 'The class must be linked to an academic program'; end if;
   select id into target_plan from public.curriculum_plans where program_id=target_program order by (status='approved') desc,effective_year desc limit 1;
   insert into public.curriculum_change_requests(section_id,program_id,plan_id,requester_id,summary,details)
   values(p_section_id,target_program,target_plan,actor,trim(p_summary),trim(p_details)) returning * into result;
 else
   select * into current_request from public.curriculum_change_requests where id=p_request_id for update;
   if current_request.id is null then raise exception 'Curriculum request was not found'; end if;
   if current_request.status<>'submitted' then raise exception 'Only a submitted request can be changed'; end if;
   if p_action='review' then
     if not allowed_reviewer or actor=current_request.requester_id then raise exception 'An independent academic reviewer is required' using errcode='42501'; end if;
     if p_decision not in ('approved','rejected') or char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A review decision and meaningful reason are required'; end if;
     update public.curriculum_change_requests set status=p_decision,reviewed_by=actor,review_reason=trim(p_reason),reviewed_at=now(),updated_at=now() where id=p_request_id returning * into result;
   else
     if actor<>current_request.requester_id or not private.can_manage_section(current_request.section_id) then raise exception 'Only the assigned requester may revise or withdraw this request' using errcode='42501'; end if;
     if p_action='edit' then
       update public.curriculum_change_requests set summary=trim(p_summary),details=trim(p_details),updated_at=now() where id=p_request_id returning * into result;
     else
       if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A withdrawal reason is required'; end if;
       update public.curriculum_change_requests set status='withdrawn',review_reason=trim(p_reason),updated_at=now() where id=p_request_id returning * into result;
     end if;
   end if;
 end if;
 insert into public.controlled_action_audit(action,entity_type,entity_id,changed_by,reason,before_state,after_state)
 values('curriculum_request_'||p_action,'curriculum_change_request',result.id,actor,coalesce(nullif(trim(p_reason),''),result.details),case when current_request.id is null then null else to_jsonb(current_request) end,to_jsonb(result));
 return to_jsonb(result);
end; $$;
revoke all on function public.manage_curriculum_change_request(text,uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.manage_curriculum_change_request(text,uuid,uuid,text,text,text,text) to authenticated;
