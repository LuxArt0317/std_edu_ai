alter table public.students
  add column if not exists record_status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists merged_into_id uuid references public.students(id) on delete restrict,
  add constraint students_record_status_check check (record_status in ('active','withdrawn','graduated','merged','archived'));
create index if not exists students_merged_into_idx on public.students(merged_into_id);

alter table public.assignment_submissions drop constraint if exists assignment_submissions_status_check;
alter table public.assignment_submissions add constraint assignment_submissions_status_check check (status in ('draft','submitted','returned','graded','voided'));

create or replace function public.withdraw_student_record(p_student_id uuid,p_reason text)
returns public.students language plpgsql security definer set search_path='' as $$
declare v_student public.students; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_student from public.students where id=p_student_id for update;
 if v_student.id is null or v_student.record_status<>'active' then raise exception 'Only an active student record can be withdrawn'; end if;
 v_before:=to_jsonb(v_student);
 update public.section_enrollments set status='dropped',completed_at=null where student_id=p_student_id and status in ('enrolled','waitlisted');
 update public.students set record_status='withdrawn',status_reason=trim(p_reason),status_changed_at=now(),updated_at=now() where id=p_student_id returning * into v_student;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('withdraw_student','student',p_student_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_student));
 return v_student;
end $$;

create or replace function public.merge_student_records(p_source_id uuid,p_target_id uuid,p_reason text)
returns public.students language plpgsql security definer set search_path='' as $$
declare v_source public.students; v_target public.students; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_source_id=p_target_id then raise exception 'Source and target must differ'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_source from public.students where id=p_source_id for update;
 select * into v_target from public.students where id=p_target_id for update;
 if v_source.id is null or v_target.id is null or v_source.record_status<>'active' or v_target.record_status<>'active' then raise exception 'Both records must be active'; end if;
 if exists(select 1 from public.section_enrollments s join public.section_enrollments t on t.section_id=s.section_id and t.student_id=p_target_id where s.student_id=p_source_id) then raise exception 'Resolve duplicate section enrollments before merging'; end if;
 if exists(select 1 from public.grades s join public.grades t on t.grade_item_id=s.grade_item_id and t.student_id=p_target_id where s.student_id=p_source_id) then raise exception 'Resolve duplicate grade records before merging'; end if;
 v_before:=jsonb_build_object('source',to_jsonb(v_source),'target',to_jsonb(v_target));
 update public.student_signals set student_id=p_target_id where student_id=p_source_id;
 update public.interactions set student_id=p_target_id where student_id=p_source_id;
 update public.cases set student_id=p_target_id where student_id=p_source_id;
 update public.crm_tasks set student_id=p_target_id where student_id=p_source_id;
 update public.section_enrollments set student_id=p_target_id where student_id=p_source_id;
 update public.grades set student_id=p_target_id where student_id=p_source_id;
 delete from public.campaign_recipients where student_id=p_source_id and exists(select 1 from public.campaign_recipients t where t.campaign_id=campaign_recipients.campaign_id and t.student_id=p_target_id);
 update public.campaign_recipients set student_id=p_target_id where student_id=p_source_id;
 update public.students set record_status='merged',merged_into_id=p_target_id,status_reason=trim(p_reason),status_changed_at=now(),profile_id=null,updated_at=now() where id=p_source_id;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('merge_student_records','student',p_source_id,auth.uid(),trim(p_reason),v_before,jsonb_build_object('source',to_jsonb((select s from public.students s where s.id=p_source_id)),'target',to_jsonb(v_target)));
 return v_target;
end $$;

create or replace function public.archive_academic_program(p_program_id uuid,p_reason text)
returns public.academic_programs language plpgsql security definer set search_path='' as $$
declare v_program public.academic_programs; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','dean','registrar'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A reason of at least 12 characters is required'; end if;
 select * into v_program from public.academic_programs where id=p_program_id for update;
 if v_program.id is null or v_program.status='inactive' then raise exception 'Active program not found'; end if;
 if exists(select 1 from public.courses c join public.course_sections cs on cs.course_id=c.id where c.program_id=p_program_id and cs.status in ('open','active')) then raise exception 'Complete or cancel active sections before archiving this program'; end if;
 v_before:=to_jsonb(v_program); update public.academic_programs set status='inactive',updated_at=now() where id=p_program_id returning * into v_program;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('archive_program','academic_program',p_program_id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_program)); return v_program;
end $$;

create or replace function public.transition_enrollment(p_enrollment_id uuid,p_status text,p_reason text)
returns public.section_enrollments language plpgsql security definer set search_path='' as $$
declare v_row public.section_enrollments; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','registrar'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_status not in ('waitlisted','enrolled','dropped','completed') or char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'Valid status and reason are required'; end if;
 select * into v_row from public.section_enrollments where id=p_enrollment_id for update; if v_row.id is null then raise exception 'Enrollment not found'; end if;
 v_before:=to_jsonb(v_row); update public.section_enrollments set status=p_status,completed_at=case when p_status='completed' then now() else null end where id=p_enrollment_id returning * into v_row;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values('transition_enrollment','enrollment',v_row.id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_row)); return v_row;
end $$;

create or replace function public.transition_assignment_submission(p_submission_id uuid,p_action text,p_reason text)
returns public.assignment_submissions language plpgsql security definer set search_path='' as $$
declare v_row public.assignment_submissions; v_before jsonb;
begin
 if auth.uid() is null or not (select private.has_role(array['admin','department_head','faculty'])) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_action not in ('return','void') or char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'Valid action and reason are required'; end if;
 select s.* into v_row from public.assignment_submissions s join public.assessments a on a.id=s.assessment_id where s.id=p_submission_id and (select private.can_manage_section(a.section_id)) for update of s;
 if v_row.id is null then raise exception 'Authorized submission not found'; end if;
 if p_action='return' and v_row.status not in ('submitted','graded') then raise exception 'Only submitted or graded work can be returned'; end if;
 if p_action='void' and v_row.status='voided' then raise exception 'Submission is already voided'; end if;
 v_before:=to_jsonb(v_row); update public.assignment_submissions set status=case when p_action='return' then 'returned' else 'voided' end,feedback=concat_ws(E'\n',nullif(feedback,''),trim(p_reason)),score=case when p_action='void' then null else score end,graded_at=case when p_action='void' then null else graded_at end,updated_at=now() where id=p_submission_id returning * into v_row;
 insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state) values(case when p_action='return' then 'return_submission' else 'void_submission' end,'submission',v_row.id,auth.uid(),trim(p_reason),v_before,to_jsonb(v_row)); return v_row;
end $$;

revoke all on function public.withdraw_student_record(uuid,text),public.merge_student_records(uuid,uuid,text),public.archive_academic_program(uuid,text),public.transition_enrollment(uuid,text,text),public.transition_assignment_submission(uuid,text,text) from public,anon;
grant execute on function public.withdraw_student_record(uuid,text),public.merge_student_records(uuid,uuid,text),public.archive_academic_program(uuid,text),public.transition_enrollment(uuid,text,text),public.transition_assignment_submission(uuid,text,text) to authenticated;
