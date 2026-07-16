-- Auth identities and credentials are created through the owner-only
-- provision-role-account Edge Function before this migration. This migration
-- validates the complete directory and atomically synchronizes trusted Auth
-- metadata with profile roles. No generated IDs or credentials are persisted.

do $$
declare
  expected_accounts jsonb := '[
    {"email":"winsonbaring10@gmail.com","role":"owner","full_name":"Winson Baring","job_title":"Platform Owner","department":null},
    {"email":"winsonbaring10+admin@gmail.com","role":"admin","full_name":"Role Admin","job_title":"System Administrator","department":"Office of Information Technology"},
    {"email":"winsonbaring10+president@gmail.com","role":"president","full_name":"Role President","job_title":"University President","department":"Office of the President"},
    {"email":"winsonbaring10+vice-president@gmail.com","role":"vice_president","full_name":"Role Vice President","job_title":"Vice President","department":"Executive Office"},
    {"email":"winsonbaring10+dean@gmail.com","role":"dean","full_name":"Role Dean","job_title":"College Dean","department":"College Administration"},
    {"email":"winsonbaring10+registrar@gmail.com","role":"registrar","full_name":"Role Registrar","job_title":"University Registrar","department":"Registrar"},
    {"email":"winsonbaring10+department-head@gmail.com","role":"department_head","full_name":"Role Department Head","job_title":"Department Head","department":"Information Management"},
    {"email":"winsonbaring10+faculty@gmail.com","role":"faculty","full_name":"Demo Faculty","job_title":"Information Management Faculty","department":"Information Management"},
    {"email":"winsonbaring10+advisor@gmail.com","role":"advisor","full_name":"Role Advisor","job_title":"Academic Advisor","department":"Student Success"},
    {"email":"winsonbaring10+admissions@gmail.com","role":"admissions","full_name":"Role Admissions","job_title":"Admissions Officer","department":"Admissions"},
    {"email":"winsonbaring10+finance@gmail.com","role":"finance","full_name":"Role Finance","job_title":"Finance Officer","department":"Finance"},
    {"email":"winsonbaring10+support@gmail.com","role":"support","full_name":"Role Support","job_title":"Student Support Officer","department":"Student Affairs"},
    {"email":"winsonbaring10+librarian@gmail.com","role":"librarian","full_name":"Role Librarian","job_title":"Librarian","department":"University Library"},
    {"email":"winsonbaring10+student@gmail.com","role":"student","full_name":"Demo Student A","job_title":null,"department":"Information Management"}
  ]'::jsonb;
  missing_emails text;
  mismatch_count integer;
begin
  select string_agg(e.email, ', ' order by e.email)
  into missing_emails
  from jsonb_to_recordset(expected_accounts) as e(email text, role text)
  left join auth.users u on lower(u.email) = e.email
  where u.id is null;

  if missing_emails is not null then
    raise exception 'Expected STU Nexus Auth identities are missing: %', missing_emails;
  end if;

  update auth.users u
  set raw_app_meta_data = case
        when e.role = 'owner' then
          coalesce(u.raw_app_meta_data, '{}'::jsonb)
          || jsonb_build_object('role', 'owner', 'platform_owner', true)
        else
          (coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'platform_owner')
          || jsonb_build_object('role', e.role)
      end,
      email_confirmed_at = coalesce(u.email_confirmed_at, now()),
      updated_at = now()
  from jsonb_to_recordset(expected_accounts) as e(email text, role text)
  where lower(u.email) = e.email;

  update public.profiles p
  set full_name = e.full_name,
      role = e.role,
      job_title = e.job_title,
      department = e.department,
      is_platform_owner = e.role = 'owner',
      updated_at = now()
  from auth.users u
  join jsonb_to_recordset(expected_accounts) as e(
    email text,
    role text,
    full_name text,
    job_title text,
    department text
  ) on lower(u.email) = e.email
  where p.id = u.id;

  select count(*)
  into mismatch_count
  from jsonb_to_recordset(expected_accounts) as e(email text, role text)
  join auth.users u on lower(u.email) = e.email
  left join public.profiles p on p.id = u.id
  where u.email_confirmed_at is null
     or u.raw_app_meta_data ->> 'role' is distinct from e.role
     or p.role is distinct from e.role
     or p.is_platform_owner is distinct from (e.role = 'owner');

  if mismatch_count <> 0 then
    raise exception 'STU Nexus role account synchronization failed for % identities', mismatch_count;
  end if;

  if (select count(*) from public.profiles where is_platform_owner) <> 1 then
    raise exception 'STU Nexus must have exactly one protected platform owner';
  end if;
end;
$$;

comment on function private.handle_new_user() is
'Creates the matching profile for trusted Auth users. Production account creation is restricted to the protected owner through the provision-role-account Edge Function.';
