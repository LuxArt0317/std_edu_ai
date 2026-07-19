create or replace function private.validate_relationship_invariants()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_program public.academic_programs; v_profile public.profiles; v_case public.cases; v_course public.courses;
begin
  if tg_table_name='courses' then
    if new.program_id is not null then select * into v_program from public.academic_programs where id=new.program_id and status='active'; if v_program.id is null or v_program.department_id<>new.department_id then raise exception 'Choose a program in the selected subject department'; end if; end if;
  elsif tg_table_name='profiles' then
    if new.program_id is not null then select * into v_program from public.academic_programs where id=new.program_id and status='active'; if v_program.id is null or new.department_id is null or v_program.department_id<>new.department_id then raise exception 'Choose a profile program in the selected department'; end if; end if;
  elsif tg_table_name='students' then
    if new.advisor_id is not null then
      select * into v_profile from public.profiles where id=new.advisor_id and account_status='active' and role in ('advisor','faculty','department_head');
      if v_profile.id is null then raise exception 'Choose an active eligible advisor'; end if;
      select * into v_program from public.academic_programs where id=new.program_id;
      if v_profile.program_id is not null and v_profile.program_id<>new.program_id then raise exception 'Advisor belongs to another program'; end if;
      if v_profile.program_id is null and v_profile.department_id is distinct from v_program.department_id then raise exception 'Advisor belongs to another department'; end if;
    end if;
  elsif tg_table_name='cases' then
    if new.owner_id is null then raise exception 'Choose an accountable case owner'; end if;
    select * into v_profile from public.profiles where id=new.owner_id and account_status='active' and role in ('owner','admin','advisor','support','registrar');
    if v_profile.id is null then raise exception 'Choose an active support, advising, registrar, or administrative owner'; end if;
  elsif tg_table_name='admission_leads' then
    if new.owner_id is not null then select * into v_profile from public.profiles where id=new.owner_id and account_status='active' and role in ('owner','admin','admissions','registrar'); if v_profile.id is null then raise exception 'Choose an active admissions owner'; end if; end if;
  elsif tg_table_name='crm_tasks' then
    select * into v_profile from public.profiles where id=new.assigned_to and account_status='active' and role<>'student'; if v_profile.id is null then raise exception 'Choose an active staff assignee'; end if;
    if new.case_id is not null then select * into v_case from public.cases where id=new.case_id; if v_case.id is null then raise exception 'Selected case is unavailable'; end if; if new.student_id is null then new.student_id:=v_case.student_id; elsif new.student_id<>v_case.student_id then raise exception 'The selected case belongs to another student'; end if; end if;
  elsif tg_table_name='course_sections' then
    select * into v_course from public.courses where id=new.course_id and status='active'; if v_course.id is null then raise exception 'Choose an active catalog subject'; end if;
    if new.faculty_id is not null then select * into v_profile from public.profiles where id=new.faculty_id and account_status='active' and role in ('faculty','department_head','dean'); if v_profile.id is null then raise exception 'Choose an active eligible teacher'; end if; if v_profile.program_id is not null and v_course.program_id is distinct from v_profile.program_id then raise exception 'Teacher belongs to another program'; end if; if v_profile.program_id is null and v_profile.department_id is distinct from v_course.department_id then raise exception 'Teacher belongs to another department'; end if; end if;
  elsif tg_table_name='profile_section_assignments' then
    select * into v_profile from public.profiles where id=new.profile_id and account_status='active'; select c.* into v_course from public.course_sections s join public.courses c on c.id=s.course_id where s.id=new.section_id;
    if v_profile.id is null or v_course.id is null then raise exception 'Choose an active profile and class'; end if;
    if v_profile.program_id is not null and v_course.program_id is distinct from v_profile.program_id then raise exception 'Class responsibility belongs to another program'; end if;
    if v_profile.program_id is null and v_profile.department_id is distinct from v_course.department_id then raise exception 'Class responsibility belongs to another department'; end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_relationship_invariants() from public,anon,authenticated;

create trigger courses_relationship_invariants before insert or update of department_id,program_id on public.courses for each row execute function private.validate_relationship_invariants();
create trigger profiles_relationship_invariants before insert or update of department_id,program_id on public.profiles for each row execute function private.validate_relationship_invariants();
create trigger students_relationship_invariants before insert or update of program_id,advisor_id on public.students for each row execute function private.validate_relationship_invariants();
create trigger cases_relationship_invariants before insert or update of owner_id on public.cases for each row execute function private.validate_relationship_invariants();
create trigger admission_leads_owner_invariants before insert or update of owner_id on public.admission_leads for each row execute function private.validate_relationship_invariants();
create trigger crm_tasks_relationship_invariants before insert or update of student_id,case_id,assigned_to on public.crm_tasks for each row execute function private.validate_relationship_invariants();
create trigger course_sections_relationship_invariants before insert or update of course_id,faculty_id on public.course_sections for each row execute function private.validate_relationship_invariants();
create trigger profile_section_relationship_invariants before insert or update of profile_id,section_id on public.profile_section_assignments for each row execute function private.validate_relationship_invariants();
