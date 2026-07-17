create table public.learning_material_pages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.learning_materials(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  content_html text not null default '' check (char_length(content_html) <= 150000),
  position integer not null default 1 check (position between 1 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, position)
);

create index learning_material_pages_material_position_idx
  on public.learning_material_pages(material_id, position);
create index learning_material_pages_created_by_idx
  on public.learning_material_pages(created_by);

create trigger learning_material_pages_set_updated_at
before update on public.learning_material_pages
for each row execute function public.set_updated_at();

alter table public.learning_material_pages enable row level security;

create policy learning_material_pages_read
on public.learning_material_pages for select to authenticated
using (exists (
  select 1 from public.learning_materials lm
  join public.learning_modules m on m.id = lm.module_id
  where lm.id = material_id
    and ((lm.status = 'published' and m.status = 'published' and private.can_access_section(m.section_id))
      or private.can_manage_section(m.section_id))
));

create policy learning_material_pages_insert
on public.learning_material_pages for insert to authenticated
with check (exists (
  select 1 from public.learning_materials lm
  join public.learning_modules m on m.id = lm.module_id
  where lm.id = material_id and private.can_manage_section(m.section_id)
));

create policy learning_material_pages_update
on public.learning_material_pages for update to authenticated
using (exists (
  select 1 from public.learning_materials lm
  join public.learning_modules m on m.id = lm.module_id
  where lm.id = material_id and private.can_manage_section(m.section_id)
))
with check (exists (
  select 1 from public.learning_materials lm
  join public.learning_modules m on m.id = lm.module_id
  where lm.id = material_id and private.can_manage_section(m.section_id)
));

create policy learning_material_pages_delete
on public.learning_material_pages for delete to authenticated
using (exists (
  select 1 from public.learning_materials lm
  join public.learning_modules m on m.id = lm.module_id
  where lm.id = material_id and private.can_manage_section(m.section_id)
));

revoke all on public.learning_material_pages from public, anon;
grant select, insert, update, delete on public.learning_material_pages to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-media', 'learning-media', true, 8388608,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy learning_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'learning-media'
  and private.can_manage_section(((storage.foldername(name))[1])::uuid)
);

create policy learning_media_update
on storage.objects for update to authenticated
using (
  bucket_id = 'learning-media'
  and private.can_manage_section(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'learning-media'
  and private.can_manage_section(((storage.foldername(name))[1])::uuid)
);

create policy learning_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'learning-media'
  and private.can_manage_section(((storage.foldername(name))[1])::uuid)
);
