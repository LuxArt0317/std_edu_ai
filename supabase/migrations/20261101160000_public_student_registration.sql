-- Public signups receive only the student role. Trusted administrator provisioning remains unchanged.
create or replace function private.assign_public_student_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(new.raw_app_meta_data ->> 'role', '') is null then
    new.raw_app_meta_data := (coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'platform_owner') || jsonb_build_object('role', 'student');
  end if;
  return new;
end;
$$;
revoke all on function private.assign_public_student_role() from public, anon, authenticated;
create trigger on_auth_user_assign_student_role before insert on auth.users
for each row execute function private.assign_public_student_role();
comment on function private.assign_public_student_role() is 'Assigns student access to public registrations without trusting user metadata; preserves administrator-supplied roles.';
