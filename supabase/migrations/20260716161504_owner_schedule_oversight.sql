drop policy if exists schedules_read_authorized on public.schedule_events;
create policy schedules_read_authorized on public.schedule_events for select to authenticated
using (
  (select private.has_role(array['admin', 'president', 'vice_president', 'dean', 'registrar']))
  or owner_profile_id = (select auth.uid())
  or (section_id is not null and (select private.can_access_section(section_id)))
  or (select private.current_role()) = any(audience_roles)
);
