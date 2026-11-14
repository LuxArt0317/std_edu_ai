create table public.elearning_categories (
  id integer primary key check (id > 0),
  parent_id integer references public.elearning_categories(id),
  title text not null check (length(title) between 1 and 200),
  source_count integer check (source_count >= 0),
  position integer not null unique check (position > 0)
);
create table public.elearning_courses (
  id integer primary key check (id > 0),
  category_id integer not null references public.elearning_categories(id),
  title text not null check (length(title) between 1 and 200),
  self_enroll boolean not null default false,
  position integer not null check (position > 0),
  unique(category_id,position)
);
create table public.elearning_notices (
  id integer primary key check (id > 0),
  kind text not null check (kind in ('page','resource','url','folder')),
  title text not null check (length(title) between 1 and 240),
  local_body text check (length(local_body) between 1 and 4000),
  position integer not null unique check (position > 0)
);
create table public.elearning_enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id integer not null references public.elearning_courses(id),
  joined_at timestamptz not null default now(),
  primary key(user_id,course_id)
);

alter table public.elearning_categories enable row level security;
alter table public.elearning_courses enable row level security;
alter table public.elearning_notices enable row level security;
alter table public.elearning_enrollments enable row level security;

revoke all on public.elearning_categories,public.elearning_courses,public.elearning_notices,public.elearning_enrollments
  from public,anon,authenticated;

-- Only explicitly copied remote-learning records are ever used by these functions.
create function public.elearning_workspace() returns jsonb
language sql stable security definer set search_path='' as $$
  select case when (select private.affairs_google_identity()) then jsonb_build_object(
    'userId',(select auth.uid()),
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]'::jsonb) from public.elearning_categories c),
    'courses',(select coalesce(jsonb_agg(to_jsonb(c) order by c.category_id,c.position),'[]'::jsonb) from public.elearning_courses c),
    'notices',(select coalesce(jsonb_agg(to_jsonb(n) order by n.position),'[]'::jsonb) from public.elearning_notices n),
    'enrollments',(select coalesce(jsonb_agg(jsonb_build_object('courseId',e.course_id,'joinedAt',e.joined_at) order by e.joined_at,e.course_id),'[]'::jsonb)
      from public.elearning_enrollments e where e.user_id=(select auth.uid()))
  ) end;
$$;

create function public.elearning_join(p_course_id integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  own uuid:=(select auth.uid());
  joined timestamptz;
begin
  if own is null or not(select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  select e.joined_at into joined from public.elearning_enrollments e where e.user_id=own and e.course_id=p_course_id;
  if found then return jsonb_build_object('courseId',p_course_id,'joinedAt',joined);end if;
  perform 1 from public.elearning_courses where id=p_course_id and self_enroll for share;
  if not found then
    raise exception 'Course is unavailable for local self-enrollment' using errcode='PT404';
  end if;
  insert into public.elearning_enrollments(user_id,course_id) values(own,p_course_id) on conflict do nothing;
  select e.joined_at into strict joined from public.elearning_enrollments e where e.user_id=own and e.course_id=p_course_id;
  return jsonb_build_object('courseId',p_course_id,'joinedAt',joined);
end;
$$;

revoke all on function public.elearning_workspace(),public.elearning_join(integer) from public,anon;
grant execute on function public.elearning_workspace(),public.elearning_join(integer) to authenticated;

insert into public.elearning_categories (id,parent_id,title,source_count,position) values
  (17,null,'校內教育訓練/演講',null,1),
  (18,17,'人事室',9,2),
  (19,17,'電算中心',85,3),
  (43,19,'資訊安全',6,4),
  (53,19,'ODF 開放文件格式教育訓練',7,5),
  (20,17,'教資中心',67,6),
  (23,17,'諮商中心',35,7),
  (25,17,'環安組',4,8),
  (35,17,'證照訓練',4,9),
  (41,17,'教務處',20,10),
  (42,17,'性別平等教育委員會',1,11),
  (48,17,'資訊學院',3,12),
  (51,17,'研發處',1,13),
  (4,null,'教材課程',null,14),
  (28,4,'其它學期',907,15),
  (56,null,'112學年度第1學期',91,16),
  (55,null,'111學年度第2學期',54,17),
  (54,null,'111學年度第1學期',65,18),
  (52,null,'110學年度第2學期',61,19),
  (50,null,'110學年度第1學期',71,20),
  (47,null,'109學年度第2學期',65,21),
  (49,null,'109學年度第3學期',null,22),
  (45,null,'109-寒假教師研習使用',86,23),
  (40,null,'108年度第2學期',65,24),
  (44,null,'109學年度第1學期',71,25),
  (12,null,'學分班教材課程',3,26),
  (29,12,'其它學期',40,27),
  (39,null,'108年度第1學期',84,28),
  (38,null,'107年度第2學期',90,29),
  (37,null,'107年度第1學期',106,30),
  (36,null,'106年度第2學期',103,31),
  (33,null,'106年度第1學期',130,32),
  (30,null,'105年度第2學期',112,33),
  (27,null,'105年度第1學期',135,34);

insert into public.elearning_courses (id,category_id,title,self_enroll,position) values
  (10892,41,'115學年度第1學期遠距教學研習營',false,1),
  (10775,41,'115年度評分輔助系統II說明會',false,2),
  (10582,41,'114年度評分輔助系統II說明會',false,3),
  (10207,41,'113.03.07_暨大評分輔助系統說明會',false,4),
  (10026,41,'112.07.11_112年南一區108課綱宣導與技專技高交流座談會',false,5),
  (9886,41,'112.03.06_暨大評分輔助系統說明會',false,6),
  (9725,41,'111學年度第1學期第3次遠距教學課程研習會',false,7),
  (9724,41,'111學年度第1學期第2次遠距教學課程研習會_20221011',false,8),
  (9718,41,'111-1遠距教學研習_20220902',true,9),
  (9402,41,'109學年度第2學期遠距教學課程研習會',false,10),
  (9099,41,'109學年度第1學期遠距教學課程研習會',false,11),
  (8999,41,'108學年度第2學期遠距教學研習會',false,12),
  (8874,41,'108學年度第1學期遠距教學研習會',false,13),
  (8857,41,'107學年度第2學期遠距教學研習會',false,14),
  (8707,41,'107學年度第1學期遠距教學研習會',false,15),
  (8344,41,'106學年度第1學期網路教學教師研習會-106.09.20',false,16),
  (7941,41,'遠距教學教師研習會-105學年度第2學期-106.06.16',false,17),
  (7770,41,'網路教學教師研習會-105學年度第1學期',false,18),
  (7553,41,'網路教學教師研習會-104學年度第2學期',false,19),
  (7520,41,'網路教學教師研習會-104學年度第1學期',false,20);

insert into public.elearning_notices (id,kind,title,local_body,position) values
  (344414,'page','115學年度第1學期遠距教學研習',null,1),
  (327359,'resource','TronClass Quick Guidance for Students (English Version)',null,2),
  (337653,'url','【教育訓練】113學年度資訊安全教育訓練(全校教職員)',null,3),
  (325504,'page','【公告】自112學年度第2學期 遠距教學轉入TronClass創課','自112學年度第2學期起，遠距教學轉入 TronClass 創課平台。',4),
  (305241,'page','請同學務必進行二步驗證註冊，以免期限到被鎖定',null,5),
  (329224,'page','本校微軟Office365 OneDrive空間配額113年6月20日實施OneDrive及Microsoft Office365儲存空間限縮政策及配額',null,6),
  (327358,'folder','【老師注意】TronClass使用教學課程手冊 創課老師必看',null,7),
  (325505,'resource','【學生注意】新建TronClass使用教學課程 第一次使用創課同學必看',null,8),
  (299337,'page','[解決教材無法瀏覽] 在 iPhone / iPad上關閉跨網站追蹤',null,9),
  (299338,'url','數位教材不能正常觀看排解教學',null,10),
  (179355,'page','【重要】助教的權限...請老師與助教進來看',null,11),
  (134865,'page','【重要】統計報表大哉問',null,12),
  (173105,'page','【重要】使用 Win 10 作業系統的師生請注意',null,13),
  (168761,'url','【教師注意】跨出行動學習的第一步：讓EverCam/PowerCam跨平台&跨裝置',null,14),
  (168678,'page','【EverCam】申請與註冊教學',null,15),
  (244787,'page','【EverCam】壓縮教學',null,16),
  (218616,'page','【EverCam】在PPT中錄影片聲音教學',null,17),
  (215169,'page','【EverCam】教材分段與分割教學',null,18),
  (158222,'page','學習者電腦軟硬體規格需求',null,19),
  (140634,'page','客服聯絡方式',null,20);
