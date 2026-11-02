-- Sanitized role walkthroughs are visible to active signed-in users only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tutorial-guides','tutorial-guides',false,67108864,array['video/mp4','text/vtt','application/x-subrip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy tutorial_guides_active_users_read on storage.objects for select to authenticated
using (bucket_id='tutorial-guides' and (select private.has_role(array['owner','admin','president','vice_president','dean','registrar','department_head','faculty','advisor','admissions','finance','support','librarian','student'])));
-- No authenticated insert/update/delete policy: publication requires server credentials.
