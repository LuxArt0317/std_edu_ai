create table public.affairs_certificate_catalog (
  code text primary key check (code ~ '^[0-9]{1,12}$'),
  name text not null check (char_length(name) between 1 and 240),
  level text not null default '' check (char_length(level)<=280),
  issuer text not null check (char_length(issuer) between 1 and 240),
  sort_order integer not null,
  active boolean not null default true
);
create table public.affairs_certificate_payout_profiles (
  user_id uuid primary key references public.affairs_profiles(user_id) on delete cascade,
  bank text not null check (char_length(bank) between 1 and 100),
  branch text not null check (char_length(branch) between 1 and 100),
  account_last_four text not null check (account_last_four ~ '^[0-9]{4}$'),
  note text not null default '' check (char_length(note)<=160),
  verified_at timestamptz not null default now()
);
create table public.affairs_certificate_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  certificate_code text not null references public.affairs_certificate_catalog(code),
  obtained_on date not null,
  phone text not null check (phone ~ '^[+0-9 ()-]{3,40}$' and phone ~ '[0-9]'),
  teacher_code text not null default '' check (teacher_code ~ '^[A-Za-z0-9-]{0,8}$'),
  wants_award boolean not null,
  status text not null default 'draft' check (status in ('draft','submitted','reviewing','needs_documents','approved')),
  application_fee integer check (application_fee between 0 and 1000000),
  award_amount integer check (award_amount between 0 and 1000000),
  review_note text not null default '' check (char_length(review_note)<=1200),
  version integer not null default 1 check (version between 1 and 1000000000),
  updated_at timestamptz not null default now(),
  unique(user_id,certificate_code,obtained_on)
);
create index on public.affairs_certificate_applications(user_id,updated_at desc,id);
create table private.affairs_certificate_files (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.affairs_certificate_applications(id) on delete cascade,
  user_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  object_path text not null unique,
  filename text not null check (octet_length(filename) between 1 and 255),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  content_type text not null check (content_type in ('application/pdf','image/jpeg')),
  attached_at timestamptz,
  expires_at timestamptz not null default now()+interval '2 hours'
);
create index on private.affairs_certificate_files(application_id);
create table private.affairs_certificate_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  digest bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor,request_id)
);
alter table public.affairs_certificate_catalog enable row level security;
alter table public.affairs_certificate_payout_profiles enable row level security;
alter table public.affairs_certificate_applications enable row level security;
alter table private.affairs_certificate_files enable row level security;
alter table private.affairs_certificate_receipts enable row level security;
revoke all on public.affairs_certificate_catalog,public.affairs_certificate_payout_profiles,public.affairs_certificate_applications,
  private.affairs_certificate_files,private.affairs_certificate_receipts from public,anon,authenticated;

-- Initial 30 rows in the observed catalog order, without student records.
insert into public.affairs_certificate_catalog(code,name,level,issuer,sort_order) values
('3345','(MOS)Excel Associate Microsoft 365 Apps','','Microsoft(微軟)',1),
('472','財產保險業務員專業科目資格測驗','','中華民國產物保險商業同業公會',2),
('3282','永續發展基礎能力測驗','','財團法人保險事業發展中心',3),
('3249','創新與創業甲級管理能力檢定','','台灣雙福三創發展協會',28),
('3344','生成式AI能力認證','','財團法人資訊工業策進會',29),
('3343','時間管理乙級能力檢定','','台灣雙福三創發展協會',30);

with scores(level,listening,reading) as (values
  ('A1','滿60分，但未達110分','滿60分，但未達115分'),('A2','滿110分，但未達275分','滿115分，但未達275分'),
  ('B1','滿275分，但未達400分','滿275分，但未達385分'),('B2','滿400分，但未達490分','滿385分，但未達455分'),
  ('C1','滿490分以上','滿455分以上')),
records(code,l,r,ordinal) as (values
  ('1765','B2','B2',4),('3133','B1','B2',5),('1763','B2','A2',6),('1764','B2','B1',7),('1766','B2','C1',8),
  ('1762','B2','A1',9),('1759','B1','B1',10),('1761','B1','C1',11),('1758','B1','A2',12),('1757','B1','A1',13),
  ('1755','A2','B2',14),('1756','A2','C1',15),('1753','A2','A2',16),('1754','A2','B1',17),('1751','A1','C1',18),
  ('1752','A2','A1',19),('1749','A1','B1',20),('1750','A1','B2',21),('1748','A1','A2',22),('1925','C1','B2',23),
  ('1918','C1','C1',24),('2096','C1','B1',25),('2094','C1','A1',26),('2095','C1','A2',27))
insert into public.affairs_certificate_catalog(code,name,level,issuer,sort_order)
select r.code,'(TOEIC)多益測驗','Listening:CEF '||r.l||', Reading:CEF '||r.r||'／新版測驗{[LISTENING '||l.listening||'且READING '||s.reading||']}',
  '(ETS)Educational Testing Service[美國教育測驗服務社]',r.ordinal
from records r join scores l on l.level=r.l join scores s on s.level=r.r;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('affairs-certificate-proofs','affairs-certificate-proofs',false,5242880,array['image/jpeg','application/pdf']);

create function private.affairs_certificate_object_access(p_path text,p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare f private.affairs_certificate_files; a public.affairs_certificate_applications;
begin
  if not(select private.affairs_google_identity()) then return false; end if;
  select * into f from private.affairs_certificate_files where object_path=p_path;
  if not found then return false; end if;
  if p_operation in ('insert','delete') then
    select * into a from public.affairs_certificate_applications where id=f.application_id for update;
    select * into f from private.affairs_certificate_files where object_path=p_path for update;
    return found and a.id is not null and f.user_id=(select auth.uid()) and f.attached_at is null
      and (p_operation='delete' or (f.expires_at>clock_timestamp() and a.status in ('draft','needs_documents')));
  end if;
  return p_operation='select' and (f.user_id=(select auth.uid()) or
    (f.attached_at is not null and (select private.affairs_is_admin())));
end;
$$;
revoke all on function private.affairs_certificate_object_access(text,text) from public,anon;
grant execute on function private.affairs_certificate_object_access(text,text) to authenticated;
create policy affairs_certificate_proof_read on storage.objects for select to authenticated
  using(bucket_id='affairs-certificate-proofs' and private.affairs_certificate_object_access(name,'select'));
create policy affairs_certificate_proof_insert on storage.objects for insert to authenticated
  with check(bucket_id='affairs-certificate-proofs' and private.affairs_certificate_object_access(name,'insert'));
create policy affairs_certificate_proof_delete on storage.objects for delete to authenticated
  using(bucket_id='affairs-certificate-proofs' and private.affairs_certificate_object_access(name,'delete'));

create function public.affairs_certificate_catalog_search(p_code text,p_name text,p_level text,p_issuer text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not(select private.affairs_google_identity()) then raise exception 'Google session required' using errcode='42501';end if;
  if p_code is null or p_code !~ '^[0-9]{0,12}$' or p_name is null or char_length(p_name)>160 or
    p_level is null or char_length(p_level)>160 or p_issuer is null or char_length(p_issuer)>160 or
    p_page is null or p_page not between 0 and 200 then raise exception 'Invalid catalog filter' using errcode='22023';end if;
  with matched as materialized (
    select code,name,level,issuer,sort_order from public.affairs_certificate_catalog
    where active and (p_code='' or code=p_code)
      and strpos(lower(name),lower(p_name))>0 and strpos(lower(level),lower(p_level))>0 and strpos(lower(issuer),lower(p_issuer))>0
  ), slice as (select * from matched order by sort_order,code limit 30 offset p_page*30)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(s)-'sort_order' order by s.sort_order,s.code) from slice s),'[]'::jsonb),
    'total',(select count(*) from matched),'page',p_page) into result;
  return result;
end;
$$;

create function public.affairs_read_certificate_awards(p_target uuid default null,p_id uuid default null,p_status_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());target uuid:=coalesce(p_target,caller); rows jsonb;identity jsonb;payout jsonb;files jsonb;
begin
  if caller is null or not(select private.affairs_google_identity()) or
    (p_target is not null and not(select private.affairs_is_admin())) then raise exception 'Access denied' using errcode='42501';end if;
  if p_status_only is null or (p_status_only and (p_target is not null or p_id is not null)) then raise exception 'Invalid selector' using errcode='22023';end if;
  if p_id is not null and not exists(select 1 from public.affairs_certificate_applications a where a.id=p_id and a.user_id=target)
    then raise exception 'Application unavailable' using errcode='PT404';end if;
  if p_status_only then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]'::jsonb) into rows from (
      select x.id,c.name,x.status,x.wants_award,x.award_amount,x.updated_at
      from public.affairs_certificate_applications x join public.affairs_certificate_catalog c on c.code=x.certificate_code
      where x.user_id=target order by x.updated_at desc,x.id limit 12
    ) a;
    return jsonb_build_object('userId',target,'rows',rows);
  end if;
  select jsonb_build_object('studentNumber',p.student_number,'name',p.name_zh) into identity
    from public.affairs_student_profiles p where p.user_id=target;
  select to_jsonb(p)-'user_id' into payout from public.affairs_certificate_payout_profiles p where p.user_id=target;
  select coalesce(jsonb_agg(to_jsonb(a)-'user_id' order by a.updated_at desc,a.id),'[]'::jsonb) into rows from (
    select x.*,c.name,c.level,c.issuer
    from public.affairs_certificate_applications x join public.affairs_certificate_catalog c on c.code=x.certificate_code
    where x.user_id=target and (p_id is null or x.id=p_id) order by x.updated_at desc,x.id limit 100
  ) a;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'filename',f.filename,'sizeBytes',f.size_bytes,'contentType',f.content_type,
    'attached',f.attached_at is not null,'path',f.object_path) order by f.id),'[]'::jsonb) into files
    from private.affairs_certificate_files f where f.application_id=p_id and f.user_id=target
    and (f.attached_at is not null or caller=target);
  return jsonb_build_object('userId',target,'identity',identity,'payout',payout,'rows',rows,'files',files);
end;
$$;

create function public.affairs_change_certificate_award(p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid()); target uuid:=caller;
  request_id_value uuid; app_id uuid; file_id uuid;
  expected integer; allowed text[]; digest_value bytea; previous private.affairs_certificate_receipts;
  a public.affairs_certificate_applications; f private.affairs_certificate_files;
  object_metadata jsonb; result jsonb; award boolean; date_value date; status_value text; fee integer; amount integer;
begin
  if caller is null or not(select private.affairs_google_identity()) or
    (p_operation in ('review','payout','catalog') and not(select private.affairs_is_admin())) then
    raise exception 'Access denied' using errcode='42501';end if;
  allowed:=case p_operation
    when 'draft' then array['id','expected_version','certificate_code','obtained_on','phone','teacher_code','wants_award']
    when 'reserve' then array['id','expected_version','filename','size_bytes','content_type']
    when 'attach' then array['id','expected_version','file_id']
    when 'detach' then array['id','expected_version','file_id']
    when 'discard' then array['id','expected_version','file_id']
    when 'submit' then array['id','expected_version']
    when 'add_award' then array['id','expected_version']
    when 'review' then array['id','expected_version','user_id','status','application_fee','award_amount','review_note']
    when 'payout' then array['user_id','bank','branch','account_last_four','note']
    when 'catalog' then array['code','name','level','issuer','active'] end;
  if allowed is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>9000 or
    not(p_payload ?& (allowed||'request_id'::text)) or p_payload-(allowed||'request_id'::text)<>'{}'::jsonb then
    raise exception 'Invalid operation fields' using errcode='22023';end if;
  if coalesce(p_payload->>'request_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    raise exception 'Invalid request identifier' using errcode='22023';end if;
  request_id_value:=(p_payload->>'request_id')::uuid;
  digest_value:=extensions.digest(p_payload::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('certificate-actor:'||caller,0));
  select * into previous from private.affairs_certificate_receipts r where r.actor=caller and r.request_id=request_id_value;
  if found then
    if previous.operation<>p_operation or previous.digest<>digest_value then raise exception 'Request identifier reused' using errcode='PT409';end if;
    return previous.result;
  end if;
  if p_operation in ('review','payout') then
    target:=(p_payload->>'user_id')::uuid;
    if target is null or not exists(select 1 from public.affairs_profiles where user_id=target and role='student') then
      raise exception 'Student unavailable' using errcode='PT404';end if;
  end if;
  if p_operation='payout' then
    if exists(select 1 from jsonb_each(p_payload-'request_id'-'user_id') j where jsonb_typeof(j.value)<>'string')
      then raise exception 'Invalid payout fields' using errcode='22023';end if;
    insert into public.affairs_certificate_payout_profiles(user_id,bank,branch,account_last_four,note)
      values(target,btrim(p_payload->>'bank'),btrim(p_payload->>'branch'),p_payload->>'account_last_four',p_payload->>'note')
      on conflict(user_id) do update set bank=excluded.bank,branch=excluded.branch,
        account_last_four=excluded.account_last_four,note=excluded.note,verified_at=now();
    result:=jsonb_build_object('userId',target,'saved',true);
  elsif p_operation='catalog' then
    if jsonb_typeof(p_payload->'active') is distinct from 'boolean' or exists(
      select 1 from jsonb_each(p_payload-'request_id'-'active') j where jsonb_typeof(j.value)<>'string')
      then raise exception 'Invalid catalog record' using errcode='22023';end if;
    insert into public.affairs_certificate_catalog(code,name,level,issuer,sort_order,active)
      values(p_payload->>'code',btrim(p_payload->>'name'),p_payload->>'level',btrim(p_payload->>'issuer'),10000,(p_payload->>'active')::boolean)
      on conflict(code) do update set name=excluded.name,level=excluded.level,issuer=excluded.issuer,active=excluded.active;
    result:=jsonb_build_object('code',p_payload->>'code','saved',true);
  else
    if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or
      p_payload->>'expected_version' !~ '^(0|[1-9][0-9]{0,8})$' then raise exception 'Invalid revision' using errcode='22023';end if;
    expected:=(p_payload->>'expected_version')::integer;
    app_id:=(p_payload->>'id')::uuid;
    if app_id is not null then
      select * into a from public.affairs_certificate_applications where id=app_id and user_id=target for update;
      if not found then raise exception 'Application unavailable' using errcode='PT404';end if;
    end if;
    if coalesce(a.version,0)<>expected or (a.id is null and p_operation<>'draft') then
      raise exception 'Application changed' using errcode='PT409';end if;
    if p_operation='draft' then
      if a.id is not null and a.status not in ('draft','needs_documents') then raise exception 'Application is locked' using errcode='PT409';end if;
      if exists(select 1 from jsonb_each(p_payload) j where j.key in ('certificate_code','obtained_on','phone','teacher_code') and jsonb_typeof(j.value)<>'string')
        or jsonb_typeof(p_payload->'wants_award') is distinct from 'boolean' or p_payload->>'obtained_on' !~ '^\d{4}-\d{2}-\d{2}$'
        then raise exception 'Invalid certificate details' using errcode='22023';end if;
      date_value:=(p_payload->>'obtained_on')::date;
      if date_value < date '1950-01-01' or date_value>(now() at time zone 'Asia/Taipei')::date or
        not exists(select 1 from public.affairs_certificate_catalog where code=p_payload->>'certificate_code' and active) or
        not exists(select 1 from public.affairs_student_profiles where user_id=caller) then
        raise exception 'Certificate or student profile unavailable' using errcode='22023';end if;
      award:=(p_payload->>'wants_award')::boolean;
      if a.id is null then
        if (select count(*) from public.affairs_certificate_applications where user_id=caller)>=100 then
          raise exception 'Application limit reached' using errcode='PT409';end if;
        insert into public.affairs_certificate_applications(user_id,certificate_code,obtained_on,phone,teacher_code,wants_award)
        values(caller,p_payload->>'certificate_code',date_value,p_payload->>'phone',p_payload->>'teacher_code',award) returning * into a;
      else
        if exists(select 1 from private.affairs_certificate_files where application_id=a.id) and
          (a.certificate_code<>p_payload->>'certificate_code' or a.obtained_on<>date_value) then
          raise exception 'Certificate proof is already attached' using errcode='PT409';end if;
        update public.affairs_certificate_applications set certificate_code=p_payload->>'certificate_code',obtained_on=date_value,
          phone=p_payload->>'phone',teacher_code=p_payload->>'teacher_code',wants_award=award,version=version+1,updated_at=now()
          where id=a.id returning * into a;
      end if;
    elsif p_operation='reserve' then
      if a.status not in ('draft','needs_documents') or
        (select count(*) from private.affairs_certificate_files where application_id=a.id and (attached_at is not null or expires_at>now()))>=5 or
        (select count(*) from private.affairs_certificate_files where user_id=caller and attached_at is null)>=50 then
        raise exception 'Proof upload limit reached' using errcode='PT409';end if;
      if jsonb_typeof(p_payload->'filename') is distinct from 'string' or p_payload->>'filename' ~ '[[:cntrl:]/]' or
        strpos(p_payload->>'filename',chr(92))>0 or btrim(p_payload->>'filename') in ('','.','..') or
        jsonb_typeof(p_payload->'size_bytes') is distinct from 'number' or p_payload->>'size_bytes' !~ '^[0-9]{1,7}$' or
        jsonb_typeof(p_payload->'content_type') is distinct from 'string' then raise exception 'Invalid proof details' using errcode='22023';end if;
      file_id:=gen_random_uuid();
      insert into private.affairs_certificate_files(id,application_id,user_id,object_path,filename,size_bytes,content_type)
        values(file_id,a.id,caller,caller||'/'||a.id||'/'||file_id,p_payload->>'filename',(p_payload->>'size_bytes')::integer,
          p_payload->>'content_type') returning * into f;
      result:=jsonb_build_object('id',a.id,'version',a.version,'fileId',f.id,'path',f.object_path);
    elsif p_operation in ('attach','detach','discard') then
      select * into f from private.affairs_certificate_files where id=(p_payload->>'file_id')::uuid
        and application_id=a.id and user_id=caller for update;
      if not found or (f.attached_at is not null)<>(p_operation='detach') then raise exception 'Proof unavailable' using errcode='PT404';end if;
      if p_operation='detach' and a.status not in ('draft','needs_documents') then raise exception 'Application is locked' using errcode='PT409';end if;
      select metadata into object_metadata from storage.objects where bucket_id='affairs-certificate-proofs' and name=f.object_path;
      if p_operation='attach' then
        if a.status not in ('draft','needs_documents') or f.expires_at<=clock_timestamp() or object_metadata is null or
          object_metadata->>'size' is distinct from f.size_bytes::text or object_metadata->>'mimetype' is distinct from f.content_type
          then raise exception 'Upload missing or changed' using errcode='PT409';end if;
        update private.affairs_certificate_files set attached_at=now() where id=f.id;
      elsif p_operation='detach' then
        update private.affairs_certificate_files set attached_at=null,expires_at=now() where id=f.id;
      else
        if object_metadata is not null then raise exception 'Delete stored object before discarding reservation' using errcode='PT409';end if;
        delete from private.affairs_certificate_files where id=f.id;
      end if;
      result:=jsonb_build_object('id',a.id,'version',a.version,'fileId',f.id);
    elsif p_operation in ('submit','add_award') then
      if p_operation='submit' and a.status not in ('draft','needs_documents') or
        p_operation='add_award' and (a.status not in ('approved','submitted') or a.wants_award) then
        raise exception 'Application cannot be submitted' using errcode='PT409';end if;
      if not exists(select 1 from private.affairs_certificate_files where application_id=a.id and attached_at is not null) or
        (a.wants_award or p_operation='add_award') and
        not exists(select 1 from public.affairs_certificate_payout_profiles where user_id=caller) then
        raise exception 'Proof or payout profile required' using errcode='PT409';end if;
      update public.affairs_certificate_applications set status='submitted',wants_award=a.wants_award or p_operation='add_award',
        version=version+1,updated_at=now(),award_amount=null where id=a.id returning * into a;
    elsif p_operation='review' then
      status_value:=p_payload->>'status';
      fee:=(p_payload->>'application_fee')::integer;
      amount:=(p_payload->>'award_amount')::integer;
      if jsonb_typeof(p_payload->'review_note') is distinct from 'string' or
        jsonb_typeof(p_payload->'application_fee') not in ('number','null') or jsonb_typeof(p_payload->'award_amount') not in ('number','null') or
        status_value is null or status_value not in ('reviewing','needs_documents','approved') or a.status not in ('submitted','reviewing','needs_documents') or
        (status_value='needs_documents' and btrim(p_payload->>'review_note')='') or
        (amount is not null and (not a.wants_award or status_value<>'approved')) or
        (status_value='approved' and a.wants_award and (amount is null or not exists(select 1 from public.affairs_certificate_payout_profiles where user_id=a.user_id)))
        then raise exception 'Invalid review transition' using errcode='22023';end if;
      update public.affairs_certificate_applications set status=status_value,application_fee=fee,award_amount=amount,
        review_note=p_payload->>'review_note',version=version+1,updated_at=now() where id=a.id returning * into a;
    end if;
    if result is null then result:=jsonb_build_object('id',a.id,'version',a.version,'status',a.status);end if;
  end if;
  insert into private.affairs_certificate_receipts(actor,request_id,operation,digest,result)
    values(caller,request_id_value,p_operation,digest_value,result);
  return result;
exception when unique_violation then
  raise exception 'Matching certificate application exists' using errcode='PT409';
end;
$$;

revoke all on function public.affairs_certificate_catalog_search(text,text,text,text,integer),
  public.affairs_read_certificate_awards(uuid,uuid,boolean),public.affairs_change_certificate_award(text,jsonb) from public,anon;
grant execute on function public.affairs_certificate_catalog_search(text,text,text,text,integer),
  public.affairs_read_certificate_awards(uuid,uuid,boolean),public.affairs_change_certificate_award(text,jsonb) to authenticated;
