create function public.elearning_page_metadata(p_view text, p_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  owner_id uuid := (select auth.uid());
  category_limit constant integer := 128;
  category_rows jsonb := '[]'::jsonb;
  notice_row jsonb;
begin
  if owner_id is null or not coalesce((select private.affairs_google_identity()),false) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_view is null or p_view not in ('categories','category','category_title','notice')
    or (p_view='categories' and p_id is not null)
    or (p_view<>'categories' and (p_id is null or p_id<1)) then
    raise exception 'Invalid Digital Academy page selector' using errcode='22023';
  end if;

  if p_view='notice' then
    select jsonb_build_object('id',n.id,'title',n.title,'body',n.local_body)
      into notice_row
      from public.elearning_notices n where n.id=p_id;
  else
    with recursive branch(id,parent_id,title,source_count,position) as (
      select c.id,c.parent_id,c.title,c.source_count,c.position from public.elearning_categories c
        where p_view='categories' or c.id=p_id
      union
      select c.id,c.parent_id,c.title,c.source_count,c.position from public.elearning_categories c
        join branch parent on parent.id=c.parent_id where p_view='category'
    ), bounded as (
      select id,parent_id,title,source_count,position from branch
        order by position,id limit (category_limit+1)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'parentId',r.parent_id,'title',r.title,'sourceCount',r.source_count
    ) order by r.position,r.id),'[]'::jsonb) into category_rows from bounded r;

    if jsonb_array_length(category_rows)>category_limit then
      raise exception 'Digital Academy category scope exceeds its limit' using errcode='54000';
    end if;
  end if;

  return jsonb_build_object('userId',owner_id,'view',p_view,'id',p_id,'categories',category_rows,'notice',notice_row);
end;
$$;

revoke all on function public.elearning_page_metadata(text,integer) from public,anon,service_role;
grant execute on function public.elearning_page_metadata(text,integer) to authenticated;
