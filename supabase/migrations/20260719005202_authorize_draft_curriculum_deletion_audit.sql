drop policy if exists controlled_action_audit_curriculum_delete_insert on public.controlled_action_audit;
create policy controlled_action_audit_curriculum_delete_insert
on public.controlled_action_audit for insert to authenticated
with check (
  action='delete_draft_academic_curriculum'
  and entity_type='curriculum_plan'
  and actor_id=(select auth.uid())
  and char_length(trim(reason)) between 12 and 1000
  and (select private.has_role(array['owner','admin','dean','registrar','department_head']))
  and before_state->>'id'=entity_id::text
  and before_state->>'status'='draft'
  and after_state=jsonb_build_object('deleted',true)
);
