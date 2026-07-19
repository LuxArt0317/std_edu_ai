-- Issue #127: protected official-source discovery inventory.
-- Discovery and acceptance create no public knowledge. Accepted candidates become
-- inactive governed sources and still require acquisition, review, and publication.

create table public.knowledge_source_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique
    check (canonical_url ~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)' and position('#' in canonical_url)=0),
  canonical_identity text generated always as (
    regexp_replace(canonical_url, '/+$', '')
  ) stored unique,
  title text not null check (char_length(trim(title)) between 2 and 300),
  inventory_domain text not null check (inventory_domain in (
    'admissions','enrollment','graduation','academic_rules','programs',
    'administrative_services','student_services','campus_places','faq','forms_policies'
  )),
  language text not null check (language in ('zh-Hant','en','mixed')),
  source_type text not null check (source_type in ('website','pdf','form','directory','map','policy','service')),
  official_host text not null check (official_host ~ '^([a-z0-9-]+\.)*stu\.edu\.tw$'),
  owning_unit text not null check (char_length(trim(owning_unit)) between 2 and 180),
  discovery_method text not null check (discovery_method in (
    'official_navigation','official_sitemap','official_directory','owner_submission','scheduled_refresh'
  )),
  discovered_from text not null check (
    discovered_from ~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)'
  ),
  http_status integer check (http_status is null or http_status between 100 and 599),
  final_url text check (
    final_url is null or final_url ~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)'
  ),
  status text not null default 'review_needed' check (status in (
    'review_needed','accepted','rejected','unreachable','duplicate'
  )),
  source_id uuid references public.knowledge_sources(id) on delete restrict,
  discovered_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_reason text,
  last_checked_at timestamptz,
  fixture_marker text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='accepted')=(source_id is not null)),
  check (
    status='review_needed'
    or (reviewed_by is not null and char_length(trim(review_reason)) between 12 and 2000)
  )
);

create index knowledge_candidates_domain_status_idx
  on public.knowledge_source_candidates(inventory_domain,status);
create index knowledge_candidates_review_idx
  on public.knowledge_source_candidates(status,updated_at desc);
create index knowledge_candidates_discovered_by_idx
  on public.knowledge_source_candidates(discovered_by);
create index knowledge_candidates_reviewed_by_idx
  on public.knowledge_source_candidates(reviewed_by) where reviewed_by is not null;
create index knowledge_candidates_source_idx
  on public.knowledge_source_candidates(source_id) where source_id is not null;

create trigger knowledge_source_candidates_updated_at
before update on public.knowledge_source_candidates
for each row execute function public.set_updated_at();

create or replace function private.guard_source_candidate_governance()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (new.status,new.source_id,new.reviewed_by,new.review_reason)
      is distinct from
     (old.status,old.source_id,old.reviewed_by,old.review_reason)
     and coalesce(current_setting('app.source_candidate_review',true),'') <> 'authorized'
  then
    raise exception 'Use the governed source-candidate review action' using errcode='42501';
  end if;
  return new;
end $$;

create trigger guard_source_candidate_governance
before update on public.knowledge_source_candidates
for each row execute function private.guard_source_candidate_governance();

alter table public.knowledge_source_candidates enable row level security;
revoke all on public.knowledge_source_candidates from public,anon,authenticated;
grant select,insert,update,delete on public.knowledge_source_candidates to authenticated;
grant all on public.knowledge_source_candidates to service_role;

create policy knowledge_candidates_review_read
on public.knowledge_source_candidates for select to authenticated
using ((select private.has_role(array['owner','admin','librarian'])));

create policy knowledge_candidates_review_insert
on public.knowledge_source_candidates for insert to authenticated
with check (
  (select private.has_role(array['owner','admin','librarian']))
  and discovered_by=(select auth.uid())
  and status='review_needed' and source_id is null and reviewed_by is null and review_reason is null
);

create policy knowledge_candidates_review_update
on public.knowledge_source_candidates for update to authenticated
using ((select private.has_role(array['owner','admin','librarian'])))
with check ((select private.has_role(array['owner','admin','librarian'])));

create policy knowledge_candidates_fixture_delete
on public.knowledge_source_candidates for delete to authenticated
using (
  (select private.has_role(array['owner']))
  and fixture_marker like 'Issue127-%'
  and status='review_needed'
);

create or replace function public.upsert_stu_source_candidates(
  p_candidates jsonb,
  p_fixture_marker text default null
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_item jsonb;
  v_seen integer:=0;
  v_inserted integer:=0;
  v_updated integer:=0;
  v_url text;
  v_host text;
  v_discovered_from text;
  v_final_url text;
  v_id uuid;
begin
  if not private.has_role(array['owner','admin','librarian']) then
    raise exception 'Source inventory authority required' using errcode='42501';
  end if;
  if jsonb_typeof(p_candidates)<>'array'
     or jsonb_array_length(p_candidates) not between 1 and 500 then
    raise exception 'Candidate inventory must contain 1 to 500 records' using errcode='22023';
  end if;
  if p_fixture_marker is not null and (
    not private.has_role(array['owner']) or p_fixture_marker !~ '^Issue127-[A-Z0-9]+$'
  ) then
    raise exception 'Invalid inventory fixture marker' using errcode='22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_candidates) loop
    v_seen:=v_seen+1;
    v_url:=trim(v_item->>'canonical_url');
    v_discovered_from:=trim(v_item->>'discovered_from');
    v_final_url:=nullif(trim(v_item->>'final_url'),'');
    v_host:=lower((regexp_match(v_url,'^https://([^/:?#]+)'))[1]);

    if v_url !~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)'
       or position('#' in v_url)>0
       or v_host is null or v_host !~ '^([a-z0-9-]+\.)*stu\.edu\.tw$'
       or v_discovered_from !~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)'
       or (v_final_url is not null and v_final_url !~ '^https://([a-z0-9-]+\.)*stu\.edu\.tw(?:/|$)')
       or v_item->>'inventory_domain' not in (
         'admissions','enrollment','graduation','academic_rules','programs',
         'administrative_services','student_services','campus_places','faq','forms_policies'
       )
       or v_item->>'language' not in ('zh-Hant','en','mixed')
       or v_item->>'source_type' not in ('website','pdf','form','directory','map','policy','service')
       or v_item->>'discovery_method' not in (
         'official_navigation','official_sitemap','official_directory','owner_submission','scheduled_refresh'
       )
       or char_length(trim(v_item->>'title')) not between 2 and 300
       or char_length(trim(v_item->>'owning_unit')) not between 2 and 180
       or nullif(v_item->>'http_status','')::integer not between 100 and 599
    then
      raise exception 'Invalid official STU source candidate at position %',v_seen using errcode='22023';
    end if;

    select id into v_id from public.knowledge_source_candidates
    where canonical_identity=regexp_replace(v_url,'/+$','');
    if v_id is null then
      insert into public.knowledge_source_candidates(
        canonical_url,title,inventory_domain,language,source_type,official_host,
        owning_unit,discovery_method,discovered_from,http_status,final_url,status,
        discovered_by,last_checked_at,fixture_marker
      ) values(
        v_url,trim(v_item->>'title'),v_item->>'inventory_domain',v_item->>'language',
        v_item->>'source_type',v_host,trim(v_item->>'owning_unit'),
        v_item->>'discovery_method',v_discovered_from,
        nullif(v_item->>'http_status','')::integer,v_final_url,'review_needed',
        auth.uid(),now(),p_fixture_marker
      );
      v_inserted:=v_inserted+1;
    else
      update public.knowledge_source_candidates set
        title=trim(v_item->>'title'),inventory_domain=v_item->>'inventory_domain',
        language=v_item->>'language',source_type=v_item->>'source_type',
        official_host=v_host,owning_unit=trim(v_item->>'owning_unit'),
        discovery_method=v_item->>'discovery_method',discovered_from=v_discovered_from,
        http_status=nullif(v_item->>'http_status','')::integer,final_url=v_final_url,
        last_checked_at=now()
      where id=v_id;
      v_updated:=v_updated+1;
    end if;
  end loop;

  return jsonb_build_object(
    'seen',v_seen,'inserted',v_inserted,'updated',v_updated,'autoPublished',0
  );
end $$;

create or replace function public.review_stu_source_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_reason text,
  p_department_id uuid default null
)
returns public.knowledge_source_candidates
language plpgsql security invoker set search_path='' as $$
declare
  v_candidate public.knowledge_source_candidates%rowtype;
  v_source_id uuid;
begin
  if not private.has_role(array['owner','admin','librarian']) then
    raise exception 'Source inventory authority required' using errcode='42501';
  end if;
  if p_decision not in ('accepted','rejected','unreachable','duplicate') then
    raise exception 'Unsupported source-candidate decision' using errcode='22023';
  end if;
  if char_length(trim(p_reason)) not between 12 and 2000 then
    raise exception 'A review reason of 12 to 2000 characters is required' using errcode='22023';
  end if;

  select * into v_candidate from public.knowledge_source_candidates
  where id=p_candidate_id for update;
  if v_candidate.id is null then
    raise exception 'Source candidate not found' using errcode='P0002';
  end if;
  if v_candidate.status<>'review_needed' then
    raise exception 'Only review-needed candidates can be decided' using errcode='23514';
  end if;
  if p_decision='accepted' then
    select id into v_source_id from public.knowledge_sources
    where canonical_url=v_candidate.canonical_url;
    if v_source_id is null then
      insert into public.knowledge_sources(
        name,source_type,canonical_url,official_domain,authority_level,
        owner_profile_id,department_id,default_audience_scope,default_language,
        crawl_policy,active
      ) values(
        v_candidate.title,v_candidate.source_type,v_candidate.canonical_url,true,
        'primary_official',auth.uid(),p_department_id,'public',v_candidate.language,
        'manual',false
      ) returning id into v_source_id;
    end if;
  end if;

  perform set_config('app.source_candidate_review','authorized',true);
  update public.knowledge_source_candidates set
    status=p_decision,source_id=v_source_id,reviewed_by=auth.uid(),review_reason=trim(p_reason)
  where id=p_candidate_id returning * into v_candidate;
  return v_candidate;
end $$;

create or replace function public.stu_source_inventory_report()
returns table(
  inventory_domain text,total bigint,review_needed bigint,accepted bigint,
  rejected bigint,unreachable bigint,duplicates bigint
)
language plpgsql security invoker set search_path='' stable as $$
begin
  if not private.has_role(array['owner','admin','librarian']) then
    raise exception 'Source inventory authority required' using errcode='42501';
  end if;
  return query
  select d.domain,count(c.id),
    count(c.id) filter(where c.status='review_needed'),
    count(c.id) filter(where c.status='accepted'),
    count(c.id) filter(where c.status='rejected'),
    count(c.id) filter(where c.status='unreachable'),
    count(c.id) filter(where c.status='duplicate')
  from unnest(array[
    'admissions','enrollment','graduation','academic_rules','programs',
    'administrative_services','student_services','campus_places','faq','forms_policies'
  ]) d(domain)
  left join public.knowledge_source_candidates c
    on c.inventory_domain=d.domain and c.fixture_marker is null
  group by d.domain order by d.domain;
end $$;

create or replace function public.purge_issue127_fixture(p_fixture_marker text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_candidates integer;
  v_sources integer;
  v_source_ids uuid[];
begin
  if not private.has_role(array['owner'])
     or p_fixture_marker !~ '^Issue127-[A-Z0-9]+$' then
    raise exception 'Owner fixture cleanup required' using errcode='42501';
  end if;
  select coalesce(array_agg(source_id) filter(where source_id is not null),'{}'::uuid[])
  into v_source_ids from public.knowledge_source_candidates
  where fixture_marker=p_fixture_marker;

  perform set_config('app.source_candidate_review','authorized',true);
  update public.knowledge_source_candidates set
    status='review_needed',source_id=null,reviewed_by=null,review_reason=null
  where fixture_marker=p_fixture_marker and status<>'review_needed';

  delete from public.knowledge_source_candidates where fixture_marker=p_fixture_marker;
  get diagnostics v_candidates=row_count;

  delete from public.knowledge_sources s
  where s.id=any(v_source_ids) and not s.active
    and not exists(select 1 from public.knowledge_documents d where d.source_id=s.id)
    and not exists(select 1 from public.knowledge_source_candidates c where c.source_id=s.id);
  get diagnostics v_sources=row_count;
  return jsonb_build_object('candidates',v_candidates,'inactiveSources',v_sources);
end $$;

revoke all on function public.upsert_stu_source_candidates(jsonb,text),
  public.review_stu_source_candidate(uuid,text,text,uuid),
  public.stu_source_inventory_report(),public.purge_issue127_fixture(text)
  from public,anon;
grant execute on function public.upsert_stu_source_candidates(jsonb,text),
  public.review_stu_source_candidate(uuid,text,text,uuid),
  public.stu_source_inventory_report() to authenticated,service_role;
grant execute on function public.purge_issue127_fixture(text) to authenticated;

comment on table public.knowledge_source_candidates is
  'Protected discovery candidates. No candidate is public knowledge until an authorized reviewer registers, ingests, approves, and publishes a governed source/document.';
comment on function public.review_stu_source_candidate(uuid,text,text,uuid) is
  'Accept creates or links an inactive governed source. It never acquires, approves, or publishes knowledge.';
