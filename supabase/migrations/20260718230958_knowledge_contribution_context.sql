alter table public.knowledge_articles
  add column if not exists source_type text not null default 'manual'
    check (source_type in ('manual','personal_event','class_event','campus_event','policy','service','learning')),
  add column if not exists source_event_id uuid references public.schedule_events(id) on delete set null,
  add column if not exists source_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists section_id uuid references public.course_sections(id) on delete set null,
  add column if not exists audience_scope text not null default 'institution'
    check (audience_scope in ('institution','role','class','staff')),
  add column if not exists audience_roles text[] not null default '{}',
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_notes text not null default '';

create index if not exists knowledge_articles_source_event_idx
  on public.knowledge_articles (source_event_id) where source_event_id is not null;
create index if not exists knowledge_articles_section_idx
  on public.knowledge_articles (section_id) where section_id is not null;
create index if not exists knowledge_articles_audience_roles_idx
  on public.knowledge_articles using gin (audience_roles);

drop policy if exists knowledge_read_verified_or_staff on public.knowledge_articles;
drop policy if exists knowledge_insert_staff on public.knowledge_articles;
drop policy if exists knowledge_update_staff on public.knowledge_articles;

create policy knowledge_read_authorized
on public.knowledge_articles for select to authenticated
using (
  owner_id = (select auth.uid())
  or (
    status = 'verified'
    and (
      audience_scope = 'institution'
      or (audience_scope = 'role' and (select private.current_role()) = any(audience_roles))
      or (audience_scope = 'class' and section_id is not null and (select private.can_access_section(section_id)))
      or (audience_scope = 'staff' and (select private.current_role()) <> 'student')
    )
  )
  or (select private.has_role(array['owner','admin','dean','department_head','registrar','faculty','advisor','admissions','support','librarian']))
);

create policy knowledge_insert_contributor
on public.knowledge_articles for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and source_profile_id = (select auth.uid())
  and (select private.has_role(array['owner','admin','dean','department_head','registrar','faculty','advisor','admissions','support','librarian']))
  and (
    status in ('draft','review_due')
    or (status = 'verified' and (select private.has_role(array['owner','admin','librarian'])))
  )
);

create policy knowledge_update_owner_or_reviewer
on public.knowledge_articles for update to authenticated
using (
  (owner_id = (select auth.uid()) and status in ('draft','review_due'))
  or (select private.has_role(array['owner','admin','librarian']))
)
with check (
  (
    owner_id = (select auth.uid())
    and source_profile_id = (select auth.uid())
    and status in ('draft','review_due')
  )
  or (select private.has_role(array['owner','admin','librarian']))
);

grant select, insert, update on public.knowledge_articles to authenticated;

comment on column public.knowledge_articles.source_type is
  'Origin of the contribution: manual, user-owned event, class event, campus event, policy, service, or learning.';
comment on column public.knowledge_articles.source_event_id is
  'Optional schedule event that supplied the knowledge context; visibility remains governed by knowledge RLS.';
