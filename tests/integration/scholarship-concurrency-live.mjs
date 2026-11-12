import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

// This suite commits only disposable fixtures so separate database sessions can
// contend on the real RPC locks. It never creates or changes an owner identity.
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const project='xiftudmvxphxcjtmfmib';
assert.equal(deployment.supabase.projectRef,project,'This suite is restricted to the configured client project.');
const env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try {target=connection && new URL(connection);}
catch {throw new Error('A valid client database connection is required.');}
assert.ok(target && (target.hostname===`db.${project}.supabase.co` ||
  target.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(target.username).endsWith('.'+project)),
'Use only the exact client database connection.');
const sql=postgres(connection,{max:6,connect_timeout:15,idle_timeout:5,
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},onnotice:()=>{}});
const run=randomUUID();
const users=[randomUUID(),randomUUID()];
const periods=Array.from({length:4},()=>randomUUID());
const requests=new Set();
const applicationIds=new Set();
const checks=[];
let ownerId;
let cleanupVerified=false;
let failure;
let stage='migration check';

function operation(payload) {
  const request_id=randomUUID();requests.add(request_id);
  return {...payload,request_id};
}
const rpc=async(tx,kind,payload)=>(await tx`select public.affairs_scholarship_action(${kind},${tx.json(payload)}) as result`)[0].result;
async function authenticated(tx,user) {
  await tx.unsafe("set local statement_timeout='15s'");
  await tx.unsafe("set local lock_timeout='12s'");
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
}
const call=(user,kind,payload)=>sql.begin(async tx=>{
  await authenticated(tx,user);
  return rpc(tx,kind,payload);
});

// Hold the contended row until BOTH separate backend sessions are observed
// waiting inside the RPC. Promise.all alone does not prove overlapping writes.
async function race(operations,lock) {
  let unlock;
  let ready;
  let notReady;
  const released=new Promise(resolve=>{unlock=resolve;});
  const locked=new Promise((resolve,reject)=>{ready=resolve;notReady=reject;});
  const blocker=sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='10s'");
    await lock(tx);
    ready();
    await released;
  }).then(()=>null,error=>{notReady(error);return error;});
  const pids=[];
  const completed=[];
  let workers=[];
  let overlapError;
  try {
    await locked;
    workers=operations.map(({user,kind,payload})=>sql.begin(async tx=>{
      await authenticated(tx,user);
      const [{pid}]=await tx`select pg_backend_pid() as pid`;
      pids.push(pid);
      return rpc(tx,kind,payload);
    }).then(value=>({status:'fulfilled',value}),error=>({status:'rejected',code:error.code || 'UNKNOWN'}))
      .then(result=>{completed.push(result);return result;}));
    const deadline=Date.now()+10000;
    let overlap=false;
    while(Date.now()<deadline) {
      if(completed.length) throw new Error('An RPC finished before the concurrency barrier was released.');
      if(pids.length===operations.length) {
        assert.equal(new Set(pids).size,operations.length,'Concurrent requests must use distinct backend sessions.');
        const [{waiting}]=await sql`select count(*)::integer as waiting from pg_stat_activity
          where pid in ${sql(pids)} and wait_event_type='Lock' and query like '%affairs_scholarship_action%'`;
        if(waiting===operations.length) {overlap=true;break;}
      }
      await delay(100);
    }
    assert.ok(overlap,'Both RPC sessions must be observed waiting on the held lock.');
  } catch(error) {overlapError=error;}
  finally {unlock();}
  const results=await Promise.all(workers);
  const blockerError=await blocker;
  if(overlapError) throw overlapError;
  if(blockerError) throw blockerError;
  return results;
}

function oneWinner(results) {
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1,'Exactly one concurrent writer should succeed.');
  assert.deepEqual(results.filter(result=>result.status==='rejected').map(result=>result.code),['PT409'],
    'The stale concurrent writer must receive the RPC conflict mapped to HTTP 409.');
  return results.find(result=>result.status==='fulfilled').value;
}
async function application(user,period) {
  const rows=await sql`select id,status,version,award_amount,required_hours,actual_hours,reviewed_at,cancelled_at
    from public.affairs_scholarship_applications where user_id=${user} and period_id=${period}`;
  assert.equal(rows.length,1,'Only one application may exist per student and period.');
  applicationIds.add(rows[0].id);
  return rows[0];
}
async function receiptCount(ids) {
  const [{count}]=await sql`select count(*)::integer as count from private.affairs_scholarship_operations where request_id in ${sql(ids)}`;
  return count;
}
async function auditCount(id) {
  const [{count}]=await sql`select count(*)::integer as count from public.affairs_agent_audit where target_id=${id}`;
  return count;
}
const profileLock=user=>tx=>tx`select user_id from public.affairs_profiles where user_id=${user} for update`;

async function cleanup() {
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='10s'");
    // Find rows even if an assertion failed before its returned ID was recorded.
    const rows=await tx`select id from public.affairs_scholarship_applications where user_id in ${tx(users)} and period_id in ${tx(periods)}`;
    rows.forEach(row=>applicationIds.add(row.id));
    const targets=[...periods,...applicationIds];
    const actors=ownerId?[...users,ownerId]:users;
    if(requests.size) await tx`delete from private.affairs_scholarship_operations
      where request_id in ${tx([...requests])} and user_id in ${tx(actors)}`;
    await tx`delete from public.affairs_agent_audit where target_id in ${tx(targets)} and user_id in ${tx(actors)}`;
    await tx`delete from public.affairs_scholarship_applications where user_id in ${tx(users)} and period_id in ${tx(periods)}`;
    // The FK prevents removal if an unrelated account somehow used a fixture period.
    await tx`delete from public.affairs_scholarship_periods where id in ${tx(periods)} and term_label like ${'Concurrency QA '+run+' %'}`;
    await tx`delete from public.affairs_profiles where user_id in ${tx(users)}`;
    await tx`delete from public.students where profile_id in ${tx(users)}`;
    await tx`delete from auth.identities where user_id in ${tx(users)}`;
    await tx`delete from auth.users where id in ${tx(users)} and email like ${'scholarship-concurrency-'+run+'-%@example.invalid'}`;
  });
  const targetIds=[...periods,...applicationIds];
  const [{remaining}]=await sql`select (
    (select count(*) from auth.users where id in ${sql(users)})+
    (select count(*) from auth.identities where user_id in ${sql(users)})+
    (select count(*) from public.profiles where id in ${sql(users)})+
    (select count(*) from public.affairs_profiles where user_id in ${sql(users)})+
    (select count(*) from public.affairs_scholarship_periods where id in ${sql(periods)})+
    (select count(*) from public.affairs_scholarship_applications where period_id in ${sql(periods)})+
    (select count(*) from public.affairs_agent_audit where target_id in ${sql(targetIds)})
  )::integer as remaining`;
  assert.equal(remaining,0,'All disposable scholarship fixtures and audit rows must be removed.');
  if(requests.size) assert.equal(await receiptCount([...requests]),0,'Every test receipt must be removed.');
  cleanupVerified=true;
}

try {
  const [migration]=await sql`select version from supabase_migrations.schema_migrations where version='20261112030000'`;
  assert.ok(migration,'Apply the scholarship migration before running this test.');
  const [owner]=await sql`select u.id,p.role='admin' as has_admin_profile,
    exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as has_google_identity
    from auth.users u left join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null`;
  if(owner?.has_admin_profile && owner.has_google_identity) ownerId=owner.id;

  stage='fixture creation';
  await sql.begin(async tx=>{
    for(const [index,id] of users.entries()) {
      const email=`scholarship-concurrency-${run}-${index}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Scholarship concurrency fixture"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
      await tx`insert into public.affairs_profiles(user_id,email,display_name,role)
        values(${id},${email},'Scholarship concurrency fixture','student')`;
    }
    for(const [index,id] of periods.slice(0,3).entries()) await tx`insert into public.affairs_scholarship_periods
      (id,term_label,opens_at,closes_at,published,instructions)
      values(${id},${'Concurrency QA '+run+' '+index},now()-interval '1 hour',now()+interval '1 hour',true,'Temporary automated concurrency fixture. Do not apply.')`;
  });

  stage='concurrent duplicate receipt';
  const same=operation({period_id:periods[0],expected_version:'0'});
  const duplicate=await race(Array.from({length:2},()=>({user:users[0],kind:'apply_scholarship',payload:same})),profileLock(users[0]));
  assert.ok(duplicate.every(result=>result.status==='fulfilled'),'Both identical requests must return their stable successful receipt.');
  assert.deepEqual(duplicate[0].value,duplicate[1].value);
  const first=await application(users[0],periods[0]);
  assert.equal(first.version,1);assert.equal(first.status,'pending');
  assert.equal(await receiptCount([same.request_id]),1);
  assert.equal(await auditCount(first.id),1,'An identical retry must not create another audit mutation.');
  checks.push({name:'duplicate apply request',status:'passed',concurrentSessions:2,applicationVersion:1,receipts:1});

  stage='distinct stale apply requests';
  const distinct=[operation({period_id:periods[1],expected_version:'0'}),operation({period_id:periods[1],expected_version:'0'})];
  const conflict=await race(distinct.map(payload=>({user:users[0],kind:'apply_scholarship',payload})),profileLock(users[0]));
  const winner=oneWinner(conflict);
  const second=await application(users[0],periods[1]);
  assert.equal(second.id,winner.id);assert.equal(second.version,1);assert.equal(second.status,'pending');
  assert.equal(await receiptCount(distinct.map(payload=>payload.request_id)),1);
  assert.equal(await auditCount(second.id),1);
  checks.push({name:'distinct apply requests with version zero',status:'passed',concurrentSessions:2,successes:1,conflicts:1});

  if(ownerId) {
    stage='cancellation versus administrator review';
    const pending=await call(users[1],'apply_scholarship',operation({period_id:periods[2],expected_version:'0'}));
    applicationIds.add(pending.id);
    const cancel=operation({period_id:periods[2],expected_version:'1'});
    const review=operation({id:pending.id,expected_version:'1',status:'approved',award_amount:'1200',required_hours:'8',actual_hours:'0',review_note:'Concurrency test review'});
    const competing=await race([
      {user:users[1],kind:'cancel_scholarship',payload:cancel},
      {user:ownerId,kind:'review_scholarship_application',payload:review},
    ],tx=>tx`select id from public.affairs_scholarship_applications where id=${pending.id} for update`);
    const finalWriter=oneWinner(competing);
    const final=await application(users[1],periods[2]);
    assert.equal(final.version,2);assert.equal(finalWriter.version,2);
    assert.equal(final.status,finalWriter.kind==='cancel_scholarship'?'cancelled':'approved');
    assert.equal(Boolean(final.cancelled_at),final.status==='cancelled');
    assert.equal(Boolean(final.reviewed_at),final.status==='approved');
    if(final.status==='approved') {
      assert.equal(Number(final.award_amount),1200);assert.equal(Number(final.required_hours),8);assert.equal(Number(final.actual_hours),0);
    } else assert.equal(final.award_amount,null);
    assert.equal(await receiptCount([cancel.request_id,review.request_id]),1);
    assert.equal(await auditCount(final.id),2,'Only initial application plus the winning transition should be audited.');
    checks.push({name:'cancellation versus review',status:'passed',concurrentSessions:2,successes:1,conflicts:1,finalStatus:final.status,version:2});

    stage='parallel administrator period creation';
    const [{now}]=await sql`select now() as now`;
    const create=Array.from({length:2},()=>operation({id:periods[3],term_label:'Concurrency QA '+run+' 3',expected_version:'0',
      opens_at:new Date(now.getTime()-3600000).toISOString(),closes_at:new Date(now.getTime()+3600000).toISOString(),published:'false',instructions:'Temporary automated fixture.'}));
    const creations=await race(create.map(payload=>({user:ownerId,kind:'save_scholarship_period',payload})),profileLock(ownerId));
    assert.equal(oneWinner(creations).version,1);
    const saved=await sql`select version from public.affairs_scholarship_periods where id=${periods[3]}`;
    assert.equal(saved.length,1);assert.equal(saved[0].version,1);
    assert.equal(await receiptCount(create.map(payload=>payload.request_id)),1);assert.equal(await auditCount(periods[3]),1);
    checks.push({name:'parallel administrator period creation',status:'passed',concurrentSessions:2,successes:1,conflicts:1,periodVersion:1});
  } else {
    const reason='Configured owner lacks an existing Google identity or administrator profile; no owner state was changed.';
    checks.push({name:'cancellation versus review',status:'unverified',reason},
      {name:'parallel administrator period creation',status:'unverified',reason});
  }
} catch(error) {
  failure={stage,code:error.code || error.name || 'Error',message:error instanceof assert.AssertionError?error.message:'Database concurrency check failed; inspect this stage without logging connection credentials.'};
} finally {
  try {await cleanup();}
  catch(error) {failure={stage:'fixture cleanup',code:error.code || error.name || 'Error',message:'Fixture cleanup was not verified. Rerun targeted cleanup before further live tests.'};}
  await sql.end({timeout:5});
}
console.log(JSON.stringify({runId:run,status:failure?'failed':checks.some(check=>check.status==='unverified')?'partial':'passed',checks,cleanupVerified,...(failure?{failure}:{})},null,2));
if(failure) process.exitCode=1;
