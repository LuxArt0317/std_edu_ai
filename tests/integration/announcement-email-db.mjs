import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {dormitoryConductClientTarget,reserveDormitoryConductLease} from './dormitory-conduct-rls-live.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--rollback-preflight','--deployed'].includes(mode)&&!extra.length);
const env=deploymentEnvironment(),connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
dormitoryConductClientTarget(connection);
const config=JSON.parse(await readFile('deployment.json','utf8'));
const ddl=await readFile('supabase/migrations/20261114220000_announcement_email_preferences.sql','utf8');
const accounts=Array.from({length:3},()=>randomUUID()),[own,other,nonGoogle]=accounts;
const announcements=Array.from({length:4},()=>randomUUID());
let lease;
const pool=postgres(connection,{max:1,connect_timeout:12,max_lifetime:0,idle_timeout:0,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
  connection:{statement_timeout:15000},onclose:()=>lease?.lose(),onnotice:()=>{}});
const fingerprint=async q=>(await q`select
  (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select md5(to_jsonb(u)::text) from auth.users u where lower(u.email)=lower(${config.supabase.ownerEmail})) as owner,
  (select count(*)::int from auth.users where id=any(${accounts}::uuid[])) as fixtures,
  (select count(*)::int from public.affairs_announcements where id=any(${announcements}::uuid[])) as notices,
  to_regclass('public.affairs_announcement_email_preferences') is null as absent`)[0];
const read=async q=>(await q`select public.affairs_read_announcement_email() as result`)[0].result;
const save=async (q,enabled,version,id)=>(await q`select public.affairs_save_announcement_email(${enabled},${version},${id}) as result`)[0].result;
const claim=async (q,envelope='a'.repeat(64))=>(await q`select public.affairs_claim_announcement_email(${envelope}) as result`)[0].result;
const finish=async (q,item,outcome,provider=null)=>(await q`select public.affairs_finish_announcement_email(${item.id},${item.lease},${outcome},${provider}) as result`)[0].result;
const deny=(q,fn,code)=>assert.rejects(q.savepoint(fn),error=>error.code===code);
async function as(q,account,role='authenticated') {
  await q.unsafe('set local role '+role);
  await q`select set_config('request.jwt.claim.sub',${account},true)`;
}
try{
  lease=await reserveDormitoryConductLease(pool);
  const before=await fingerprint(lease.sql);
  assert.ok(before.owner&&before.fixtures===0&&before.notices===0);
  assert.equal(before.absent,mode==='--rollback-preflight');
  await lease.rollbackOnly(async q=>{
    if(before.absent)await q.unsafe(ddl);
    // Isolate the rollback worker from every pre-existing queue item.
    await q`lock table private.affairs_announcement_email_queue in access exclusive mode`;
    await q`update private.affairs_announcement_email_queue set next_attempt_at=now()+interval '4 days'`;
    for(const id of accounts){
      const email='mail-qa-'+id+'@example.invalid';
      await q`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),now(),now())`;
      if(id!==nonGoogle)await q`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values (${id},${id},${q.json({sub:id,email,email_verified:true})},'google',now(),now())`;
      await q`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'QA student')`;
    }
    const id=randomUUID();
    await as(q,'','anon');
    await deny(q,s=>read(s),'42501');
    await deny(q,s=>claim(s),'42501');
    await as(q,nonGoogle);
    await deny(q,s=>save(s,true,0,id),'42501');
    await as(q,own);
    assert.deepEqual(await read(q),{userId:own,enabled:false,active:false,version:0,effectiveAt:null});
    await deny(q,s=>s`select * from public.affairs_announcement_email_preferences`,'42501');
    await deny(q,s=>claim(s),'42501');
    const first=await save(q,true,0,id);
    assert.equal(first.version,1);
    assert.deepEqual(await save(q,true,0,id),first);
    await deny(q,s=>save(s,false,0,id),'PT409');
    assert.deepEqual(await read(q),{...first,active:false});
    await as(q,other);
    assert.deepEqual(await read(q),{userId:other,enabled:false,active:false,version:0,effectiveAt:null});
    await q.unsafe('reset role');
    const [next]=await q`select ((now() at time zone 'Asia/Taipei')::date+1)::timestamp at time zone 'Asia/Taipei' as start`;
    assert.equal(Date.parse(first.effectiveAt),next.start.getTime());
    await q`insert into public.affairs_announcements(id,title,body,source_mode)
      values(${announcements[0]},'Before activation','Private QA notice','site')`;
    assert.equal((await q`select count(*)::int as n from private.affairs_announcement_email_queue where announcement_id=${announcements[0]}`)[0].n,0);
    await q`update public.affairs_announcement_email_preferences set effective_at=now()-interval '1 second' where user_id=${own}`;
    await q`insert into public.affairs_announcements(id,title,body,source_mode) values
      (${announcements[1]},'Sample notice','Private QA notice','sample'),
      (${announcements[2]},'Ready notice','Private QA notice','site')`;
    const queue=await q`select id from private.affairs_announcement_email_queue where announcement_id=any(${announcements}::uuid[])`;
    assert.equal(queue.length,1);
    await as(q,'','service_role');
    const item=await claim(q);
    assert.deepEqual(item,{id:queue[0].id,lease:item.lease,to:'mail-qa-'+own+'@example.invalid',title:'Ready notice',body:'Private QA notice'});
    assert.equal(await claim(q),null);
    assert.equal(await finish(q,{...item,lease:randomUUID()},'accepted','provider-id'),false);
    assert.equal(await finish(q,item,'retry'),true);
    await q.unsafe('reset role');
    await q`update private.affairs_announcement_email_queue set next_attempt_at=now() where id=${item.id}`;
    await as(q,'','service_role');
    const retry=await claim(q);
    assert.equal(retry.id,item.id);assert.notEqual(retry.lease,item.lease);
    assert.equal(await finish(q,retry,'accepted','provider-id'),true);
    assert.equal(await claim(q),null);
    await q.unsafe('reset role');
    await q`insert into public.affairs_announcements(id,title,body,source_mode)
      values(${announcements[3]},'Opt-out notice','Private QA notice','verified')`;
    await as(q,own);
    const disabled=await save(q,false,1,randomUUID());
    assert.equal(disabled.version,2);
    assert.equal((await read(q)).active,false);
    await as(q,'','service_role');
    assert.equal(await claim(q),null);
    await q.unsafe('reset role');
    assert.equal((await q`select status from private.affairs_announcement_email_queue where announcement_id=${announcements[3]}`)[0].status,'skipped');
  });
  assert.deepEqual(await fingerprint(lease.sql),before);
  console.log('Announcement email rollback passed authorization, next-day activation, deduplication, opt-out and queue fencing.');
}finally{
  try{await lease?.release();}finally{await pool.end({timeout:5});}
}
