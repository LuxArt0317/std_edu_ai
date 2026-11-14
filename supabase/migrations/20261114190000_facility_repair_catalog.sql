-- Reference catalogs observed in the signed-in repair form. Contains labels and codes only.
create table public.affairs_repair_areas (
  code text primary key check (code ~ '^AR[0-9]{4}$'),
  label text not null,
  outdoor boolean not null,
  sort_order integer not null unique
);
create table public.affairs_repair_items (
  code text primary key check (code ~ '^RI[0-9]{4}$'),
  category integer not null,
  category_label text not null,
  label text not null
);
alter table public.affairs_repair_areas enable row level security;
alter table public.affairs_repair_items enable row level security;
revoke all on public.affairs_repair_areas,public.affairs_repair_items from public,anon,authenticated;

insert into public.affairs_repair_areas(code,label,outdoor,sort_order) values
  ('AR0100','第一宿舍',false,1),
  ('AR0200','第二宿舍',false,2),
  ('AR0300','第三宿舍',false,3),
  ('AR0400','第四宿舍',false,4),
  ('AR0401','文薈館',false,5),
  ('AR0500','管理大樓',false,6),
  ('AR0600','圖資大樓',false,7),
  ('AR0700','設計大樓',false,8),
  ('AR0900','行政大樓',false,9),
  ('AR1500','橫山創意基地',false,10),
  ('AR1400','南校區運動場域',true,11),
  ('AR2100','北校區運動場域',true,12),
  ('AR2200','東側機車停車場',true,13),
  ('AR2300','西側機車停車場',true,14),
  ('AR2600','南校區道路、路燈、寄情湖(含其他設施)',true,15),
  ('AR2800','北校區汽車停車場',true,16),
  ('AR2900','北校區機車停車場',true,17),
  ('AR3000','北校區道路、路燈(含其他設施)',true,18);

insert into public.affairs_repair_items(category,category_label,code,label) values
  (1,'衛浴給水設備','RI1001','馬桶'),
  (1,'衛浴給水設備','RI1002','水龍頭'),
  (1,'衛浴給水設備','RI1003','小便斗'),
  (1,'衛浴給水設備','RI1004','肥皂架'),
  (1,'衛浴給水設備','RI1005','洗臉盆'),
  (1,'衛浴給水設備','RI1006','拖布盆'),
  (1,'衛浴給水設備','RI1007','排水孔'),
  (1,'衛浴給水設備','RI1008','電熱水器'),
  (1,'衛浴給水設備','RI1009','浴室毛巾架'),
  (1,'衛浴給水設備','RI1010','淋浴蓮蓬頭'),
  (1,'衛浴給水設備','RI1011','廁所隔板'),
  (2,'電燈設備','RI2002','展示櫃燈'),
  (2,'電燈設備','RI2003','浴室、廁所燈'),
  (2,'電燈設備','RI2004','日光燈'),
  (2,'電燈設備','RI2005','洗衣間燈'),
  (2,'電燈設備','RI2006','陽台燈'),
  (2,'電燈設備','RI2007','走廊燈'),
  (2,'電燈設備','RI2008','圓形筒燈'),
  (2,'電燈設備','RI2009','書桌燈'),
  (2,'電燈設備','RI2010','洗手台燈'),
  (2,'電燈設備','RI2011','戶外燈具'),
  (3,'電力冷氣','RI2101','電風扇'),
  (3,'電力冷氣','RI2102','抽、排風機'),
  (3,'電力冷氣','RI2103','電源插座'),
  (3,'電力冷氣','RI2104','循環扇'),
  (3,'電力冷氣','RI2105','冷氣插卡機'),
  (3,'電力冷氣','RI2206','冷氣自動加值機'),
  (3,'電力冷氣','RI8403','冷氣機'),
  (3,'電力冷氣','RI8404','冷卻水塔'),
  (4,'消防設施','RI4001','消防設施'),
  (4,'消防設施','RI4101','緊急照明燈'),
  (4,'消防設施','RI4102','避難指示燈'),
  (4,'消防設施','RI4103','緊急出口燈'),
  (4,'消防設施','RI4104','滅火器'),
  (4,'消防設施','RI4105','逃生緩降機'),
  (4,'消防設施','RI4106','受信總機'),
  (4,'消防設施','RI4107','煙霧探測器'),
  (5,'電腦設備','RI8001','電腦'),
  (5,'電腦設備','RI8002','電腦螢幕'),
  (5,'電腦設備','RI8003','電腦液晶螢幕'),
  (5,'電腦設備','RI8005','電腦硬碟'),
  (5,'電腦設備','RI8006','電腦光碟機'),
  (5,'電腦設備','RI8007','燒錄機'),
  (5,'電腦設備','RI8008','MO機'),
  (5,'電腦設備','RI8009','筆記型電腦'),
  (5,'電腦設備','RI8011','數位講桌'),
  (5,'電腦設備','RI8012','RFID點名工作站(小白機)'),
  (5,'電腦設備','RI8015','RFID點名機(教室門口)'),
  (5,'電腦設備','RI8101','噴墨印表機'),
  (5,'電腦設備','RI8102','雷射印表機'),
  (5,'電腦設備','RI8104','掃描器'),
  (6,'昇降設施','RI6001','電梯(客梯)'),
  (6,'昇降設施','RI6002','電梯(貨梯)'),
  (7,'辦公家具設備','RI7201','課桌椅'),
  (7,'辦公家具設備','RI7202','視聽座椅'),
  (7,'辦公家具設備','RI7203','製圖桌'),
  (7,'辦公家具設備','RI7204','沙發座椅'),
  (7,'辦公家具設備','RI7205','連結椅'),
  (7,'辦公家具設備','RI7206','辦公桌椅'),
  (8,'電信設備','RI2203','電話插孔'),
  (8,'電信設備','RI8601','電話'),
  (8,'電信設備','RI8602','傳真機'),
  (9,'視聽設備','RI8201','單槍投影機'),
  (9,'視聽設備','RI8202','實物投影機(提示機)'),
  (9,'視聽設備','RI8203','強光投影機'),
  (9,'視聽設備','RI8301','幻燈機'),
  (9,'視聽設備','RI8302','視訊設備(VCD.DVD)'),
  (9,'視聽設備','RI8303','攝錄影機'),
  (9,'視聽設備','RI8401','電視機(不含MOD)'),
  (9,'視聽設備','RI8402','收錄音機'),
  (9,'視聽設備','RI8405','相機'),
  (9,'視聽設備','RI8406','MOD機上盒'),
  (9,'視聽設備','RI8501','珠光螢幕'),
  (9,'視聽設備','RI8502','擴音設備'),
  (11,'門窗五金','RI3001','門扇'),
  (11,'門窗五金','RI3003','自動門'),
  (11,'門窗五金','RI3004','門弓器'),
  (11,'門窗五金','RI3101','鋁門窗'),
  (11,'門窗五金','RI3102','玻璃'),
  (11,'門窗五金','RI3104','紗窗'),
  (11,'門窗五金','RI3105','廁所掛勾'),
  (12,'宿舍傢俱設備','RI3201','床鋪'),
  (12,'宿舍傢俱設備','RI3202','床鋪樓梯'),
  (12,'宿舍傢俱設備','RI3301','衣櫃'),
  (12,'宿舍傢俱設備','RI3302','書櫃'),
  (12,'宿舍傢俱設備','RI3303','抽屜櫃'),
  (12,'宿舍傢俱設備','RI3401','寢室桌椅'),
  (12,'宿舍傢俱設備','RI3403','鍵盤架'),
  (12,'宿舍傢俱設備','RI7103','電冰箱'),
  (14,'飲水設備','RI7101','飲水機'),
  (14,'飲水設備','RI7102','辦公室開飲機'),
  (15,'外商及事務設備','RI3103','窗簾'),
  (15,'外商及事務設備','RI7001','洗衣機'),
  (15,'外商及事務設備','RI7002','脫水機'),
  (15,'外商及事務設備','RI7003','烘乾機'),
  (15,'外商及事務設備','RI7004','自動販賣機'),
  (15,'外商及事務設備','RI7005','影印機'),
  (15,'外商及事務設備','RI8103','繪圖機'),
  (15,'外商及事務設備','RI8105','碎紙機'),
  (15,'外商及事務設備','RI8106','護貝機'),
  (15,'外商及事務設備','RI8309','黑、白板'),
  (16,'其他設施設備','RI3501','天花板'),
  (16,'其他設施設備','RI3502','地板'),
  (16,'其他設施設備','RI3503','牆壁'),
  (16,'其他設施設備','RI3504','標示牌'),
  (16,'其他設施設備','RI8304','門禁刷卡系統(宿舍區)'),
  (16,'其他設施設備','RI8305','監視器'),
  (16,'其他設施設備','RI8306','車道柵欄機'),
  (16,'其他設施設備','RI8308','門禁刷卡系統(行政、設計、圖資、管理)'),
  (16,'其他設施設備','RI9999','其他設施設備');

alter table public.affairs_facility_repairs
  add column area_code text references public.affairs_repair_areas(code),
  add column equipment_code text references public.affairs_repair_items(code),
  add column contact_phone text not null default '' check (length(contact_phone)<=32),
  add column room text not null default '' check (length(room)<=30),
  add column floor_label text not null default '' check (floor_label ~ '^(地下[123]樓|([1-9]|10|11)樓)?$'),
  add column bed text not null default '' check (bed ~ '^[A-G]?$'),
  add column location_remark text not null default '' check (length(location_remark)<=100),
  add column other_item text not null default '' check (length(other_item)<=250);

create function public.affairs_facility_repair_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Facility repair access denied' using errcode='42501';
  end if;
  return jsonb_build_object('userId',caller,
    'areas',(select jsonb_agg(to_jsonb(a) order by a.sort_order) from public.affairs_repair_areas a),
    'items',(select jsonb_agg(to_jsonb(i) order by i.category,i.code) from public.affairs_repair_items i));
end;
$$;
revoke all on function public.affairs_facility_repair_catalog() from public,anon;
grant execute on function public.affairs_facility_repair_catalog() to authenticated;

create or replace function public.affairs_change_facility_repair(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  request_key uuid;
  fields text[];
  entry public.affairs_facility_repairs;
  receipt private.affairs_facility_repair_events;
  next_status text;
  next_note text := '';
  structured boolean := false;
  area public.affairs_repair_areas;
  equipment public.affairs_repair_items;
  location_text text;
begin
  if caller is null or not(select private.affairs_google_identity())
    or (p_action='review_facility_repair' and not(select private.affairs_is_admin())) then
    raise exception 'Facility repair access denied' using errcode='42501';
  end if;
  case p_action
    when 'submit_facility_repair' then
      structured:=coalesce(p_payload ? 'area_code',false);
      if structured then
        fields:=array['request_id','area_code','equipment_code','contact_phone','room','floor_label','bed','location_remark','other_item','description','confirmed'];
      else
        fields:=array['request_id','building','location','item','description','confirmed'];
      end if;
    when 'cancel_facility_repair' then fields:=array['request_id','id','version'];
    when 'review_facility_repair' then fields:=array['request_id','id','version','status','note'];
    else raise exception 'Unknown repair action' using errcode='22023';
  end case;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>7000
    or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or jsonb_typeof(p_payload->'request_id') is distinct from 'string' then
    raise exception 'Invalid repair fields' using errcode='22023';
  end if;
  request_key:=(p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('facility-repair:'||caller,0));
  select * into receipt from private.affairs_facility_repair_events e where e.actor=caller and e.request_id=request_key;
  if found then
    if receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Repair request ID already used' using errcode='PT409';end if;
    return jsonb_build_object('id',receipt.repair_id,'status',receipt.status,'version',receipt.version);
  end if;
  if p_action='submit_facility_repair' and structured then
    if p_payload->'confirmed' is distinct from 'true'::jsonb
      or exists(select 1 from unnest(array_remove(fields,'confirmed')) as key(field)
        where jsonb_typeof(p_payload->key.field) is distinct from 'string')
      or p_payload->>'contact_phone' !~ '^[+0-9() -]{3,32}$'
      or length(p_payload->>'room')>30 or length(p_payload->>'location_remark')>100
      or length(p_payload->>'other_item')>250 or length(btrim(p_payload->>'description')) not between 1 and 1000
      or p_payload->>'floor_label' !~ '^(地下[123]樓|([1-9]|10|11)樓)?$' or p_payload->>'bed' !~ '^[A-G]?$' then
      raise exception 'Invalid repair details' using errcode='22023';
    end if;
    select * into area from public.affairs_repair_areas where code=p_payload->>'area_code';
    select * into equipment from public.affairs_repair_items where code=p_payload->>'equipment_code';
    if area.code is null or equipment.code is null
      or (equipment.code='RI9999' and btrim(p_payload->>'other_item')='')
      or (equipment.code<>'RI9999' and p_payload->>'other_item'<>'') then
      raise exception 'Select a repair area and equipment item' using errcode='22023';
    end if;
    location_text:=left(concat_ws(' · ',nullif(btrim(p_payload->>'room'),''),nullif(p_payload->>'floor_label',''),
      nullif(p_payload->>'bed',''),nullif(btrim(p_payload->>'location_remark'),'')),120);
    insert into public.affairs_facility_repairs(user_id,building,location,item,description,area_code,equipment_code,
      contact_phone,room,floor_label,bed,location_remark,other_item)
    values(caller,area.label,coalesce(nullif(location_text,''),area.label),equipment.label,btrim(p_payload->>'description'),
      area.code,equipment.code,btrim(p_payload->>'contact_phone'),btrim(p_payload->>'room'),p_payload->>'floor_label',
      p_payload->>'bed',btrim(p_payload->>'location_remark'),btrim(p_payload->>'other_item'))
    returning * into entry;
  elsif p_action='submit_facility_repair' then
    if p_payload->'confirmed' is distinct from 'true'::jsonb
      or exists(select 1 from unnest(array['building','location','item','description']) as key(field)
        where jsonb_typeof(p_payload->key.field) is distinct from 'string' or btrim(p_payload->>key.field)='') then
      raise exception 'A confirmed repair description is required' using errcode='22023';
    end if;
    if length(btrim(p_payload->>'building'))>100 or length(btrim(p_payload->>'location'))>120
      or length(btrim(p_payload->>'item'))>100 or length(btrim(p_payload->>'description'))>1000 then
      raise exception 'Repair description exceeds the field length' using errcode='22023';
    end if;
    insert into public.affairs_facility_repairs(user_id,building,location,item,description)
    values(caller,btrim(p_payload->>'building'),btrim(p_payload->>'location'),btrim(p_payload->>'item'),btrim(p_payload->>'description'))
    returning * into entry;
  else
    if jsonb_typeof(p_payload->'id') is distinct from 'string' or jsonb_typeof(p_payload->'version') is distinct from 'number' or p_payload->>'version' !~ '^[1-9][0-9]{0,4}$' then
      raise exception 'Invalid repair revision' using errcode='22023';
    end if;
    select * into entry from public.affairs_facility_repairs r where r.id=(p_payload->>'id')::uuid
      and (p_action='review_facility_repair' or r.user_id=caller) for update;
    if not found then raise exception 'Repair record not found' using errcode='PT404';end if;
    if entry.version<>(p_payload->>'version')::integer or entry.version>=10000 then
      raise exception 'Repair changed' using errcode='PT409';
    end if;
    if p_action='cancel_facility_repair' then
      if entry.status<>'submitted' then raise exception 'Repair cannot be cancelled' using errcode='PT409';end if;
      next_status:='cancelled';
    else
      next_status:=p_payload->>'status';
      next_note:=btrim(p_payload->>'note');
      if jsonb_typeof(p_payload->'note') is distinct from 'string' or jsonb_typeof(p_payload->'status') is distinct from 'string'
        or next_status not in ('in_progress','resolved') or length(next_note)>600 then
        raise exception 'Invalid repair decision' using errcode='22023';
      end if;
      if not((entry.status in ('submitted','resolved') and next_status='in_progress') or
        (entry.status='in_progress' and next_status='resolved')) then
        raise exception 'Invalid repair status change' using errcode='PT409';
      end if;
    end if;
    update public.affairs_facility_repairs r set status=next_status,version=r.version+1,updated_at=now()
      where r.id=entry.id returning * into entry;
  end if;
  insert into private.affairs_facility_repair_events(repair_id,actor,request_id,version,action,payload,status,note)
    values(entry.id,caller,request_key,entry.version,p_action,p_payload,entry.status,next_note);
  return jsonb_build_object('id',entry.id,'status',entry.status,'version',entry.version);
end;
$$;
