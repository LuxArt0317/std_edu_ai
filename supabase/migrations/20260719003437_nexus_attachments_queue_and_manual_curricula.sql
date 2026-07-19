alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add constraint chat_messages_attachments_array check (jsonb_typeof(attachments) = 'array'),
  add constraint chat_messages_attachments_limit check (jsonb_array_length(attachments) <= 5);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'nexus-attachments',
  'nexus-attachments',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/json','text/markdown']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists nexus_attachments_owner_read on storage.objects;
create policy nexus_attachments_owner_read on storage.objects for select to authenticated
using (bucket_id='nexus-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists nexus_attachments_owner_insert on storage.objects;
create policy nexus_attachments_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='nexus-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists nexus_attachments_owner_delete on storage.objects;
create policy nexus_attachments_owner_delete on storage.objects for delete to authenticated
using (bucket_id='nexus-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

create table if not exists public.nexus_prompt_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 1 and 10000),
  mode text not null check (mode in ('qa','agentic')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=5),
  status text not null default 'queued' check (status in ('queued','processing','completed','cancelled','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists nexus_prompt_queue_owner_status_created_idx
  on public.nexus_prompt_queue(owner_id,status,created_at);
create index if not exists nexus_prompt_queue_thread_created_idx
  on public.nexus_prompt_queue(thread_id,created_at);
alter table public.nexus_prompt_queue enable row level security;
drop policy if exists nexus_prompt_queue_owner_only on public.nexus_prompt_queue;
create policy nexus_prompt_queue_owner_only on public.nexus_prompt_queue for all to authenticated
using (owner_id=(select auth.uid()))
with check (owner_id=(select auth.uid()) and exists(select 1 from public.chat_threads t where t.id=thread_id and t.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.nexus_prompt_queue to authenticated;

create or replace function public.create_manual_academic_curriculum(
  p_program_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_program public.academic_programs;
  v_plan public.curriculum_plans;
  v_result jsonb;
begin
  if auth.uid() is null or not (select private.has_role(array['owner','admin','dean','registrar','department_head'])) then
    raise exception 'Not authorized to create an academic curriculum' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 12 then
    raise exception 'A curriculum creation reason of at least 12 characters is required';
  end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then
    raise exception 'A valid curriculum request key is required';
  end if;
  select * into v_program from public.academic_programs where id=p_program_id and status='active' for update;
  if v_program.id is null then raise exception 'Select an active program before creating the curriculum'; end if;
  if trim(coalesce(p_payload->>'programCode','')) <> v_program.code then raise exception 'Curriculum program code does not match the selected program'; end if;
  if jsonb_array_length(coalesce(p_payload->'subjects','[]'::jsonb)) < 1 then raise exception 'Add at least one subject before saving the curriculum'; end if;

  select * into v_plan from public.curriculum_plans where idempotency_key=trim(p_idempotency_key);
  if v_plan.id is not null then
    return jsonb_build_object('status','reused','planId',v_plan.id,'programId',v_plan.program_id,
      'subjects',(select count(*) from public.curriculum_plan_courses where plan_id=v_plan.id),
      'blocks',(select count(*) from public.curriculum_block_templates where plan_id=v_plan.id),
      'prerequisites',(select count(*) from public.curriculum_course_prerequisites cp join public.curriculum_plan_courses pc on pc.id=cp.plan_course_id where pc.plan_id=v_plan.id));
  end if;
  if exists(select 1 from public.curriculum_plans where program_id=p_program_id and effective_year=(p_payload->>'effectiveYear')::integer) then
    raise exception 'That program already has a curriculum for the effective year';
  end if;

  insert into public.curriculum_plans(program_id,effective_year,status,idempotency_key,source_payload,created_by)
  values(p_program_id,(p_payload->>'effectiveYear')::integer,'draft',trim(p_idempotency_key),p_payload,auth.uid())
  returning * into v_plan;

  v_result := public.update_academic_curriculum(v_plan.id,'draft',p_payload,p_reason);
  return jsonb_build_object(
    'status','created','planId',v_plan.id,'programId',p_program_id,
    'subjects',(v_result->>'subjects')::integer,
    'blocks',(v_result->>'blocks')::integer,
    'prerequisites',(v_result->>'prerequisites')::integer
  );
exception when others then
  raise;
end;
$$;

revoke all on function public.create_manual_academic_curriculum(uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_manual_academic_curriculum(uuid,text,jsonb,text) to authenticated;

create or replace function public.delete_draft_academic_curriculum(p_plan_id uuid,p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_plan public.curriculum_plans;
begin
  if auth.uid() is null or not (select private.has_role(array['owner','admin','dean','registrar','department_head'])) then
    raise exception 'Not authorized to delete a draft curriculum' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,'')))<12 then raise exception 'A deletion reason of at least 12 characters is required'; end if;
  select * into v_plan from public.curriculum_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception 'Curriculum plan was not found'; end if;
  if v_plan.status<>'draft' then raise exception 'Only a draft curriculum can be deleted; approved curricula must be retired'; end if;
  insert into public.controlled_action_audit(action,entity_type,entity_id,actor_id,reason,before_state,after_state)
  values('delete_draft_academic_curriculum','curriculum_plan',v_plan.id,auth.uid(),trim(p_reason),to_jsonb(v_plan),jsonb_build_object('deleted',true));
  delete from public.curriculum_plans where id=v_plan.id;
  return jsonb_build_object('status','deleted','planId',v_plan.id,'programId',v_plan.program_id);
end;
$$;

revoke all on function public.delete_draft_academic_curriculum(uuid,text) from public,anon;
grant execute on function public.delete_draft_academic_curriculum(uuid,text) to authenticated;

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
