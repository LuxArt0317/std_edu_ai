-- Complete the remaining governed academic and responsibility workflows.

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists program_id uuid references public.academic_programs(id) on delete set null;

create index if not exists profiles_department_id_idx on public.profiles(department_id);
create index if not exists profiles_program_id_idx on public.profiles(program_id);

create table public.profile_section_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.course_sections(id) on delete cascade,
  responsibility text not null check (responsibility in ('faculty', 'assistant', 'coordinator', 'observer')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 12 and 500),
  created_at timestamptz not null default now(),
  unique(profile_id, section_id, responsibility)
);

create index profile_section_assignments_section_idx on public.profile_section_assignments(section_id);
alter table public.profile_section_assignments enable row level security;
grant select, insert, update, delete on public.profile_section_assignments to authenticated;
create policy profile_section_assignments_read on public.profile_section_assignments for select to authenticated
using ((select private.has_role(array['admin','registrar','dean','department_head','faculty'])) or profile_id = (select auth.uid()));
create policy profile_section_assignments_manage on public.profile_section_assignments for all to authenticated
using ((select private.has_role(array['admin','registrar','dean','department_head'])))
with check ((select private.has_role(array['admin','registrar','dean','department_head'])) and assigned_by = (select auth.uid()));

create table public.controlled_action_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 12 and 1000),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index controlled_action_audit_entity_idx on public.controlled_action_audit(entity_type, entity_id, created_at desc);
create index controlled_action_audit_actor_idx on public.controlled_action_audit(actor_id);
alter table public.controlled_action_audit enable row level security;
grant select on public.controlled_action_audit to authenticated;
create policy controlled_action_audit_read on public.controlled_action_audit for select to authenticated
using ((select private.has_role(array['admin','president','vice_president','dean','registrar','department_head'])) or actor_id = (select auth.uid()));

create table public.attendance_correction_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id) on delete restrict,
  student_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_status text not null check (requested_status in ('present','absent','late','excused')),
  reason text not null check (char_length(trim(reason)) between 12 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decision_reason text,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attendance_record_id, student_profile_id, status)
);
create index attendance_correction_requests_student_idx on public.attendance_correction_requests(student_profile_id, created_at desc);
create index attendance_correction_requests_record_idx on public.attendance_correction_requests(attendance_record_id);
alter table public.attendance_correction_requests enable row level security;
grant select, insert, update on public.attendance_correction_requests to authenticated;
create policy attendance_corrections_read on public.attendance_correction_requests for select to authenticated
using (student_profile_id = (select auth.uid()) or (select private.has_role(array['admin','registrar','department_head','faculty'])));
create policy attendance_corrections_request on public.attendance_correction_requests for insert to authenticated
with check (
  student_profile_id = (select auth.uid()) and status = 'pending' and
  exists (select 1 from public.attendance_records ar where ar.id = attendance_record_id and ar.student_profile_id = (select auth.uid()))
);

create or replace function public.publish_final_grade(p_grade_id uuid, p_reason text)
returns public.grades language plpgsql security definer set search_path = '' as $$
declare v_grade public.grades; v_before jsonb;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','registrar','department_head','faculty'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A reason of at least 12 characters is required'; end if;
  select * into v_grade from public.grades where id=p_grade_id for update;
  if v_grade.id is null then raise exception 'Grade not found'; end if;
  if not (select private.can_manage_section(gi.section_id) from public.grade_items gi where gi.id=v_grade.grade_item_id) and not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized for this class' using errcode='42501'; end if;
  v_before := to_jsonb(v_grade);
  update public.grades set status='published', published_at=now(), updated_at=now() where id=p_grade_id returning * into v_grade;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values ('publish_final_grade','grade',p_grade_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_grade));
  return v_grade;
end $$;

create or replace function public.correct_published_grade(p_grade_id uuid, p_score numeric, p_letter_grade text, p_feedback text, p_reason text)
returns public.grades language plpgsql security definer set search_path = '' as $$
declare v_grade public.grades; v_before jsonb; v_max numeric;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','registrar','department_head','faculty'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A reason of at least 12 characters is required'; end if;
  select g.* into v_grade from public.grades g where g.id=p_grade_id for update;
  select gi.max_score into v_max from public.grade_items gi where gi.id=v_grade.grade_item_id;
  if v_grade.id is null or v_grade.status <> 'published' then raise exception 'Only a published grade can use correction workflow'; end if;
  if p_score < 0 or p_score > v_max then raise exception 'Score must be between 0 and %', v_max; end if;
  if not (select private.can_manage_section(gi.section_id) from public.grade_items gi where gi.id=v_grade.grade_item_id) and not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized for this class' using errcode='42501'; end if;
  v_before := to_jsonb(v_grade);
  update public.grades set score=p_score, letter_grade=nullif(trim(p_letter_grade),''), feedback=coalesce(p_feedback,''), updated_at=now() where id=p_grade_id returning * into v_grade;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values ('correct_published_grade','grade',p_grade_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_grade));
  return v_grade;
end $$;

create or replace function public.close_academic_term(p_term_id uuid, p_reason text)
returns public.academic_terms language plpgsql security definer set search_path = '' as $$
declare v_term public.academic_terms; v_before jsonb;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A reason of at least 12 characters is required'; end if;
  select * into v_term from public.academic_terms where id=p_term_id for update;
  if v_term.id is null then raise exception 'Term not found'; end if;
  if exists(select 1 from public.course_sections cs join public.grade_items gi on gi.section_id=cs.id join public.grades g on g.grade_item_id=gi.id where cs.term_id=p_term_id and g.status <> 'published') then raise exception 'All recorded grades must be published before closing the term'; end if;
  v_before:=to_jsonb(v_term);
  update public.academic_terms set status='completed', updated_at=now() where id=p_term_id returning * into v_term;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values ('close_term','academic_term',p_term_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_term));
  return v_term;
end $$;

create or replace function public.decide_attendance_correction(p_request_id uuid, p_approve boolean, p_reason text)
returns public.attendance_correction_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.attendance_correction_requests; v_record public.attendance_records; v_before jsonb;
begin
  if auth.uid() is null or not (select private.has_role(array['admin','registrar','department_head','faculty'])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then raise exception 'A decision reason of at least 12 characters is required'; end if;
  select * into v_request from public.attendance_correction_requests where id=p_request_id and status='pending' for update;
  if v_request.id is null then raise exception 'Pending request not found'; end if;
  select ar.* into v_record from public.attendance_records ar join public.attendance_sessions ats on ats.id=ar.session_id where ar.id=v_request.attendance_record_id and ((select private.can_manage_section(ats.section_id)) or (select private.has_role(array['admin','registrar']))) for update of ar;
  if v_record.id is null then raise exception 'Not authorized for this attendance record' using errcode='42501'; end if;
  v_before:=to_jsonb(v_record);
  if p_approve then update public.attendance_records set status=v_request.requested_status, notes=concat_ws(E'\n',nullif(notes,''),'Correction approved: '||trim(p_reason)), updated_at=now() where id=v_record.id returning * into v_record; end if;
  update public.attendance_correction_requests set status=case when p_approve then 'approved' else 'rejected' end, decision_reason=trim(p_reason), decided_by=auth.uid(), decided_at=now(), updated_at=now() where id=p_request_id returning * into v_request;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values (case when p_approve then 'approve_attendance_correction' else 'reject_attendance_correction' end,'attendance_record',v_record.id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_record));
  return v_request;
end $$;

revoke all on function public.publish_final_grade(uuid,text) from public, anon;
revoke all on function public.correct_published_grade(uuid,numeric,text,text,text) from public, anon;
revoke all on function public.close_academic_term(uuid,text) from public, anon;
revoke all on function public.decide_attendance_correction(uuid,boolean,text) from public, anon;
grant execute on function public.publish_final_grade(uuid,text), public.correct_published_grade(uuid,numeric,text,text,text), public.close_academic_term(uuid,text), public.decide_attendance_correction(uuid,boolean,text) to authenticated;
