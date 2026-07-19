create or replace function public.sync_campaign_recipients(p_campaign_id uuid, p_student_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_campaign public.campaigns; v_count integer;
begin
  if auth.uid() is null or not (select private.has_role(array['owner','admin','admissions','advisor','support'])) then raise exception 'Not authorized to manage campaign recipients' using errcode='42501'; end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'Campaign was not found'; end if;
  if v_campaign.status not in ('draft','scheduled','paused') then raise exception 'Recipients cannot change after campaign delivery begins'; end if;
  delete from public.campaign_recipients where campaign_id=p_campaign_id and delivery_status='pending';
  if v_campaign.audience_scope='institution' then
    insert into public.campaign_recipients(campaign_id,student_id) select p_campaign_id,s.id from public.students s where s.record_status='active' on conflict do nothing;
  elsif v_campaign.audience_scope='program' then
    insert into public.campaign_recipients(campaign_id,student_id) select p_campaign_id,s.id from public.students s where s.record_status='active' and s.program_id=v_campaign.program_id on conflict do nothing;
  elsif v_campaign.audience_scope='class' then
    insert into public.campaign_recipients(campaign_id,student_id) select p_campaign_id,e.student_id from public.section_enrollments e join public.students s on s.id=e.student_id where e.section_id=v_campaign.section_id and e.status in ('enrolled','waitlisted') and s.record_status='active' and e.student_id is not null on conflict do nothing;
  elsif v_campaign.audience_scope='role' then
    if jsonb_array_length(coalesce(v_campaign.audience_definition->'roles','[]'::jsonb))=0 then raise exception 'Choose at least one canonical role'; end if;
    insert into public.campaign_recipients(campaign_id,student_id)
    select p_campaign_id,s.id from public.students s join public.profiles p on p.id=s.profile_id
    where s.record_status='active' and coalesce(v_campaign.audience_definition->'roles','[]'::jsonb) ? p.role on conflict do nothing;
  elsif v_campaign.audience_scope='risk' then
    insert into public.campaign_recipients(campaign_id,student_id) select p_campaign_id,s.id from public.students s where s.record_status='active' and (coalesce(v_campaign.audience_definition->'riskLevels','[]'::jsonb) ? s.risk_level or coalesce(v_campaign.audience_definition->'yearLevels','[]'::jsonb) ? s.year_level) on conflict do nothing;
  elsif v_campaign.audience_scope='explicit' then
    if coalesce(array_length(p_student_ids,1),0)=0 then raise exception 'Choose at least one student for an explicit audience'; end if;
    if exists(select 1 from unnest(p_student_ids) as selected(student_id) left join public.students s on s.id=selected.student_id where s.id is null or s.record_status<>'active') then raise exception 'One or more selected students are unavailable'; end if;
    insert into public.campaign_recipients(campaign_id,student_id) select p_campaign_id,selected.student_id from unnest(p_student_ids) as selected(student_id) on conflict do nothing;
  end if;
  select count(*) into v_count from public.campaign_recipients where campaign_id=p_campaign_id;
  return jsonb_build_object('campaignId',p_campaign_id,'recipients',v_count,'scope',v_campaign.audience_scope);
end;
$$;

revoke all on function public.sync_campaign_recipients(uuid,uuid[]) from public,anon;
grant execute on function public.sync_campaign_recipients(uuid,uuid[]) to authenticated;
