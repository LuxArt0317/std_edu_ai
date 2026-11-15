\set ON_ERROR_STOP on
-- psql -h <private-local-socket> -d elearning_metadata_disposable -f tests/evaluation/elearning-page-metadata.sql
do $$
begin
  if current_database()<>'elearning_metadata_disposable' or inet_server_addr() is not null
    or to_regnamespace('auth') is not null or to_regclass('public.elearning_courses') is not null then
    raise exception 'Use an empty, local socket-only disposable test database.';
  end if;
end;
$$;

begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create table auth.identities(user_id uuid not null references auth.users,provider text not null);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create function private.affairs_google_identity() returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists
    (select 1 from auth.identities i where i.user_id=(select auth.uid()) and i.provider='google');
$$;
insert into auth.users values ('00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000102');
insert into auth.identities values ('00000000-0000-4000-8000-000000000101','google'),('00000000-0000-4000-8000-000000000102','email');

\ir ../../supabase/migrations/20261115010000_remote_learning.sql
\ir ../../supabase/migrations/20261115020000_elearning_catalog.sql
\ir ../../supabase/migrations/20261115110100_elearning_page_metadata.sql

do $$
begin
  if has_function_privilege('anon','public.elearning_page_metadata(text,integer)','execute')
    or has_function_privilege('service_role','public.elearning_page_metadata(text,integer)','execute')
    or not has_function_privilege('authenticated','public.elearning_page_metadata(text,integer)','execute')
    or has_table_privilege('authenticated','public.elearning_categories','select')
    or has_table_privilege('authenticated','public.elearning_notices','select')
    or has_table_privilege('authenticated','public.elearning_enrollments','select') then
    raise exception 'Unexpected Digital Academy privilege.';
  end if;
end;
$$;

set role authenticated;
do $$
begin
  begin
    perform public.elearning_page_metadata('categories',null);
    raise exception 'Caller without an ID was admitted.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
  begin
    perform public.elearning_page_metadata('notice',325504);
    raise exception 'Non-Google caller was admitted.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
do $$
declare
  root jsonb;
  site jsonb;
  notice jsonb;
  category_ids int[];
begin
  site:=public.elearning_page_metadata('categories',null);
  if jsonb_array_length(site->'categories') is distinct from 43 or site->>'userId' is distinct from '00000000-0000-4000-8000-000000000101'
    or site->'notice' is distinct from 'null'::jsonb or site?'courses' or site?'enrollments'
    or (site->'categories'@>'[{"id":43,"parentId":19,"title":"資訊安全","sourceCount":6}]'::jsonb) is not true then
    raise exception 'Category index does not match the rendered metadata.';
  end if;
  root:=public.elearning_page_metadata('category',17);
  select array_agg((value->>'id')::int order by ordinal) into category_ids
    from jsonb_array_elements(root->'categories') with ordinality items(value,ordinal);
  if category_ids is distinct from array[17,18,19,43,53,20,23,25,35,41,42,48,51]
    or root->'notice' is distinct from 'null'::jsonb then
    raise exception 'Category query expanded beyond the exact subtree or lost hierarchy order.';
  end if;
  if public.elearning_page_metadata('category',49)->'categories' is distinct from '[{"id":49,"parentId":null,"title":"109學年度第3學期","sourceCount":0}]'::jsonb
    or public.elearning_page_metadata('category_title',49)->'categories' is distinct from '[{"id":49,"parentId":null,"title":"109學年度第3學期","sourceCount":0}]'::jsonb
    or public.elearning_page_metadata('category',2147483647)->'categories' is distinct from '[]'::jsonb then
    raise exception 'Existing zero-count and absent categories must remain distinct.';
  end if;
  notice:=public.elearning_page_metadata('notice',325504);
  if notice->'notice'->>'body' is distinct from '自112學年度第2學期起，遠距教學轉入 TronClass 創課平台。'
    or notice->'categories' is distinct from '[]'::jsonb
    or public.elearning_page_metadata('notice',305241)->'notice'->'body' is distinct from 'null'::jsonb
    or public.elearning_page_metadata('notice',2147483647)->'notice' is distinct from 'null'::jsonb then
    raise exception 'Notice body, title-only and absent rows must remain distinct.';
  end if;
  begin
    perform public.elearning_page_metadata('all',null);
    raise exception 'Unsupported view was admitted.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.elearning_page_metadata('notice',null);
    raise exception 'Unbound notice was admitted.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;
insert into public.elearning_categories(id,parent_id,title,source_count,position)
  select 25000+n,17,'Disposable limit fixture '||n,null,25000+n from generate_series(1,130) n;
set role authenticated;
do $$
begin
  if jsonb_array_length(public.elearning_page_metadata('category_title',17)->'categories') is distinct from 1 then
    raise exception 'The exact title read expanded into the subtree.';
  end if;
  begin
    perform public.elearning_page_metadata('category',17);
    raise exception 'Overflowed subtree was silently truncated.';
  exception when program_limit_exceeded then null;
  end;
  begin
    perform public.elearning_page_metadata('categories',null);
    raise exception 'Overflowed index was silently truncated.';
  exception when program_limit_exceeded then null;
  end;
end;
$$;
reset role;
rollback;
