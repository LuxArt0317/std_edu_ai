-- A learner may only read a material when both the material and its parent
-- module are published. Qualify the outer row explicitly: the original policy
-- used an unqualified `status` inside the module subquery, which PostgreSQL
-- resolved to learning_modules.status and allowed drafts in published modules.

drop policy if exists materials_read on public.learning_materials;

create policy materials_read
on public.learning_materials
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_modules as module
    where module.id = learning_materials.module_id
      and (
        (
          learning_materials.status = 'published'
          and learning_materials.published_at is not null
          and module.status = 'published'
          and module.published_at is not null
          and (module.unlocks_at is null or module.unlocks_at <= now())
          and (select private.can_access_section(module.section_id))
        )
        or (select private.can_manage_section(module.section_id))
      )
  )
);

comment on policy materials_read on public.learning_materials is
  'Enrolled learners see only published materials in published, unlocked modules; section managers retain draft access.';
