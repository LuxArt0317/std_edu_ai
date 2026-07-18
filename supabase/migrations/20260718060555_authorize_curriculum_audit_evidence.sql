grant insert on public.controlled_action_audit to authenticated;

create policy controlled_action_audit_curriculum_insert
on public.controlled_action_audit
for insert
to authenticated
with check (
  action = 'update_academic_curriculum'
  and entity_type = 'curriculum_plan'
  and actor_id = (select auth.uid())
  and char_length(trim(reason)) between 12 and 1000
  and (select private.has_role(array['owner','admin','dean','registrar','department_head']))
  and exists (
    select 1 from public.curriculum_plans plan
    where plan.id = entity_id
      and plan.updated_at >= transaction_timestamp()
      and (after_state->'plan'->>'id')::uuid = plan.id
      and after_state->'plan'->>'status' = plan.status
      and (after_state->'plan'->>'effective_year')::integer = plan.effective_year
  )
);
