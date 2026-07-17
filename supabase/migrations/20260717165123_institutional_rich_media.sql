insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institutional-media', 'institutional-media', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "institutional media staff upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'institutional-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.has_role(array['admin','advisor','admissions','support','faculty','dean','department_head']))
);

create policy "institutional media owner update"
on storage.objects for update to authenticated
using (bucket_id = 'institutional-media' and owner_id = (select auth.uid()::text))
with check (bucket_id = 'institutional-media' and owner_id = (select auth.uid()::text));

create policy "institutional media owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'institutional-media' and owner_id = (select auth.uid()::text));
