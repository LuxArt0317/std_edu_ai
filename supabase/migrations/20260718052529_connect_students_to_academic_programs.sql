alter table public.students
  add column program_id uuid references public.academic_programs(id) on delete restrict;

create index students_program_id_idx on public.students(program_id)
  where program_id is not null;

update public.students s
set program_id = coalesce(
  (select p.program_id from public.profiles p where p.id = s.profile_id),
  (
    select ap.id
    from public.academic_programs ap
    where upper(trim(ap.code)) = upper(trim(s.program))
       or upper(trim(ap.name)) = upper(trim(s.program))
       or upper(trim(ap.name)) like '%' || upper(trim(s.program)) || '%'
    order by case
      when upper(trim(ap.code)) = upper(trim(s.program)) then 0
      when upper(trim(ap.name)) = upper(trim(s.program)) then 1
      else 2
    end
    limit 1
  )
)
where s.program_id is null;

update public.profiles p
set program_id = s.program_id
from public.students s
where s.profile_id = p.id
  and p.program_id is null
  and s.program_id is not null;

create or replace function public.sync_student_program_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_program public.academic_programs;
begin
  if new.program_id is null then
    return new;
  end if;
  select * into selected_program
  from public.academic_programs
  where id = new.program_id;
  if selected_program.id is null then
    raise exception 'The selected academic program does not exist';
  end if;
  new.program := selected_program.code;
  return new;
end;
$$;

revoke all on function public.sync_student_program_identity() from public, anon, authenticated;

create trigger students_sync_program_identity
before insert or update of program_id on public.students
for each row execute function public.sync_student_program_identity();

comment on column public.students.program_id is
  'Authoritative academic program relationship. The legacy program label remains synchronized for compatibility.';
