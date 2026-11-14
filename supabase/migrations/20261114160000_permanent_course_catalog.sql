create table public.affairs_permanent_courses (
  code text primary key check (code ~ '^[A-Z0-9]{5,24}$'),
  title text not null check (length(btrim(title)) between 1 and 300),
  english_title text not null check (length(english_title) <= 300),
  requirement text not null check (length(requirement) <= 24),
  credits numeric not null check (credits between 0 and 40),
  kind text not null check (kind ~ '^[A-Z0-9]{2}$'),
  division text not null check (division in ('U','G','J')),
  department text not null check (length(department) <= 160),
  duration text not null check (length(duration) <= 40),
  category_code text not null check (length(category_code) <= 40),
  sequence integer not null check (sequence > 0),
  default_sequence integer check (default_sequence between 1 and 100),
  unique (kind,division,sequence)
);
create unique index affairs_permanent_courses_default_order
  on public.affairs_permanent_courses (default_sequence) where default_sequence is not null;

create table public.affairs_permanent_course_catalog (
  id boolean primary key default true check (id),
  captured_at timestamptz not null,
  kinds jsonb not null check (jsonb_typeof(kinds)='array' and jsonb_array_length(kinds) between 1 and 100),
  divisions jsonb not null check (jsonb_typeof(divisions)='array' and jsonb_array_length(divisions)=3)
);

create table public.affairs_permanent_course_descriptions (
  code text primary key references public.affairs_permanent_courses(code) on delete cascade,
  title text not null check (length(title) <= 300),
  english_title text not null check (length(english_title) <= 300),
  requirement text not null check (length(requirement) <= 24),
  credits text not null check (length(credits) <= 24),
  college text not null check (length(college) <= 160),
  department text not null check (length(department) <= 160),
  description text not null check (length(description) <= 18000),
  english_description text not null check (length(english_description) <= 18000),
  captured_at timestamptz not null default now()
);

alter table public.affairs_permanent_courses enable row level security;
alter table public.affairs_permanent_course_catalog enable row level security;
alter table public.affairs_permanent_course_descriptions enable row level security;
revoke all on public.affairs_permanent_courses,public.affairs_permanent_course_catalog,
  public.affairs_permanent_course_descriptions from public,anon,authenticated;
grant select on public.affairs_permanent_courses,public.affairs_permanent_course_catalog,
  public.affairs_permanent_course_descriptions to anon,authenticated;
grant select,insert,update on public.affairs_permanent_course_descriptions to service_role;
create policy permanent_courses_public_read on public.affairs_permanent_courses for select to anon,authenticated using (true);
create policy permanent_catalog_public_read on public.affairs_permanent_course_catalog for select to anon,authenticated using (true);
create policy permanent_descriptions_public_read on public.affairs_permanent_course_descriptions for select to anon,authenticated using (true);

create function public.affairs_permanent_course_search(
  p_kind text default '',p_division text default '',p_keyword text default '',
  p_page integer default 0,p_code text default ''
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare catalog public.affairs_permanent_course_catalog%rowtype;
declare rows jsonb;
declare total integer;
begin
  if p_kind is null or p_division is null or p_keyword is null or p_page is null or p_code is null
    or p_page not between 0 and 400 or length(p_keyword)>120
    or (p_code<>'' and (p_code !~ '^[A-Z0-9]{5,24}$' or p_kind<>'' or p_division<>'' or p_keyword<>'' or p_page<>0))
    or (p_kind<>'' and (p_kind !~ '^[A-Z0-9]{2}$' or p_division not in ('U','G','J')))
    or (p_kind='' and (p_division<>'' or p_keyword<>'' or p_page<>0))
  then raise exception 'Invalid permanent course search' using errcode='22023'; end if;

  select * into catalog from public.affairs_permanent_course_catalog where id;
  if not found then return null; end if;
  if p_kind<>'' and not exists(select 1 from jsonb_array_elements(catalog.kinds) item where item->>'value'=p_kind)
  then raise exception 'Unknown permanent course kind' using errcode='22023'; end if;

  with matched as (
    select c.*,row_number() over(order by case when p_kind='' then c.default_sequence else c.sequence end,c.code)::integer as display_sequence
    from public.affairs_permanent_courses c
    where case when p_code<>'' then c.code=p_code
      when p_kind='' then c.default_sequence is not null
      else c.kind=p_kind and c.division=p_division and (
        p_keyword='' or strpos(lower(c.title),lower(p_keyword))>0
        or strpos(lower(c.english_title),lower(p_keyword))>0
        or c.code=upper(p_keyword)
      ) end
  )
  select (select count(*) from matched),
    coalesce((select jsonb_agg(to_jsonb(page)-'default_sequence'-'sequence' order by display_sequence)
      from (select * from matched order by display_sequence offset p_page*50 limit 50) page),'[]'::jsonb)
  into total,rows;
  return jsonb_build_object('capturedAt',catalog.captured_at,'kinds',catalog.kinds,'divisions',catalog.divisions,
    'total',total,'page',p_page,'pageSize',50,'rows',rows);
end;
$$;

revoke all on function public.affairs_permanent_course_search(text,text,text,integer,text) from public;
grant execute on function public.affairs_permanent_course_search(text,text,text,integer,text) to anon,authenticated;
