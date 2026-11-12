import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const project=deployment.supabase.projectRef;
const target=connection && new URL(connection);
assert.ok(target && (target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project)),
  'Use only the database project in deployment.json.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback scholarship fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,user)=>{
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  await tx`select public.affairs_initialize_account()`;
};
const call=async(tx,kind,payload)=>(await tx`select public.affairs_scholarship_action(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=(payload)=>({...payload,request_id:randomUUID()});

try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight'))await tx.unsafe(await readFile('supabase/migrations/20261112030000_scholarship_applications.sql','utf8'));
    const user=randomUUID(),other=randomUUID();
    for(const id of [user,other]) {
      const email=`scholarship-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Scholarship QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    // Use the configured owner only within this rolled-back transaction. No owner account field changes.
    const [owner]=await tx`select id,email from auth.users where lower(email)=lower(${deployment.supabase.ownerEmail}) and email_confirmed_at is not null`;
    assert.ok(owner,'The configured verified owner is required for admin authorization checks.');
    if(!(await tx`select 1 from auth.identities where user_id=${owner.id} and provider='google'`).length)
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${randomUUID()},${owner.id},${tx.json({sub:owner.id,email:owner.email,email_verified:true})},'google')`;
    await role(tx,owner.id);
    const [{now}]=await tx`select now() as now`;
    const period=operation({id:randomUUID(),term_label:`Local demonstration QA ${randomUUID()}`,expected_version:'0',
      opens_at:new Date(now.getTime()-3600000).toISOString(),closes_at:new Date(now.getTime()+3600000).toISOString(),published:'true',instructions:'Synthetic local test only'});
    assert.equal((await call(tx,'save_scholarship_period',period)).version,1);
    assert.equal((await call(tx,'save_scholarship_period',period)).version,1,'retries must not bump version');
    await denied(tx,point=>call(point,'save_scholarship_period',operation({...period,term_label:'Stale save'})),'PT409');
    const draft=operation({...period,id:randomUUID(),term_label:`Local demonstration draft ${randomUUID()}`,published:'false'});
    await call(tx,'save_scholarship_period',draft);

    await role(tx,user);
    await denied(tx,point=>call(point,null,operation({period_id:period.id,expected_version:'0',status:'approved'})),'22023');
    assert.equal((await tx`select id from public.affairs_scholarship_periods where id=${draft.id}`).length,0);
    await denied(tx,point=>call(point,'save_scholarship_period',period));
    await denied(tx,point=>call(point,'apply_scholarship',operation({period_id:draft.id,expected_version:'0'})));
    const apply=operation({period_id:period.id,expected_version:'0'});
    const first=await call(tx,'apply_scholarship',apply);
    assert.equal(first.version,1);
    assert.deepEqual(await call(tx,'apply_scholarship',apply),first);
    await denied(tx,point=>call(point,'apply_scholarship',operation({...apply})),'PT409');
    assert.equal((await tx`select id from public.affairs_scholarship_applications where period_id=${period.id}`).length,1);
    await denied(tx,point=>point`update public.affairs_scholarship_applications set status='approved' where id=${first.id}`);
    const cancel=operation({period_id:period.id,expected_version:'1'});
    assert.equal((await call(tx,'cancel_scholarship',cancel)).version,2);
    assert.deepEqual(await call(tx,'apply_scholarship',apply),first,'a late original retry must not recreate a cancelled application');
    assert.equal((await tx`select status from public.affairs_scholarship_applications where id=${first.id}`)[0].status,'cancelled');
    const reapplied=await call(tx,'apply_scholarship',operation({period_id:period.id,expected_version:'2'}));
    assert.equal(reapplied.id,first.id);assert.equal(reapplied.version,3);
    await call(tx,'cancel_scholarship',cancel);
    assert.equal((await tx`select status from public.affairs_scholarship_applications where id=${first.id}`)[0].status,'pending','late cancellation retry must preserve the newer reapplication');
    await denied(tx,point=>call(point,'cancel_scholarship',{...cancel,expected_version:'3'}),'PT409');

    await role(tx,other);
    assert.equal((await tx`select id from public.affairs_scholarship_applications where id=${first.id}`).length,0);
    await denied(tx,point=>call(point,'cancel_scholarship',operation({period_id:period.id,expected_version:'0'})));
    await denied(tx,point=>call(point,'review_scholarship_application',operation({id:first.id,expected_version:'3',status:'approved'})));

    await role(tx,owner.id);
    assert.equal((await tx`select id from public.affairs_scholarship_applications where id=${first.id}`).length,1);
    await denied(tx,point=>call(point,'save_scholarship_period',operation({...period,expected_version:'1',published:'false'})),'PT409');
    const review=operation({id:first.id,expected_version:'3',status:'approved',award_amount:'12500',required_hours:'20.5',actual_hours:'5.25',review_note:'Synthetic review'});
    await denied(tx,point=>call(point,'review_scholarship_application',operation({...review,award_amount:'-1'})),'23514');
    assert.equal((await call(tx,'review_scholarship_application',review)).version,4);
    assert.equal((await call(tx,'review_scholarship_application',review)).version,4);
    await role(tx,user);
    const [saved]=await tx`select status,award_amount,required_hours,actual_hours from public.affairs_scholarship_applications where id=${first.id}`;
    assert.equal(saved.status,'approved');assert.equal(Number(saved.award_amount),12500);
    assert.equal(Number(saved.required_hours),20.5);assert.equal(Number(saved.actual_hours),5.25);
    await denied(tx,point=>call(point,'cancel_scholarship',operation({period_id:period.id,expected_version:'4'})),'PT409');
    await denied(tx,point=>call(point,'apply_scholarship',operation({period_id:period.id,expected_version:'4'})),'PT409');

    // The second student's pending application becomes immutable when its window closes.
    await role(tx,other);
    const otherApply=await call(tx,'apply_scholarship',operation({period_id:period.id,expected_version:'0'}));
    await role(tx,owner.id);
    await call(tx,'save_scholarship_period',operation({...period,expected_version:'1',closes_at:new Date(now.getTime()-1000).toISOString()}));
    await role(tx,other);
    await denied(tx,point=>call(point,'cancel_scholarship',operation({period_id:period.id,expected_version:String(otherApply.version)})),'PT409');
    await denied(tx,point=>call(point,'apply_scholarship',operation({period_id:period.id,expected_version:String(otherApply.version)})),'PT409');
    await tx.unsafe('set local role anon');
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>point`select id from public.affairs_scholarship_applications`);
    await denied(tx,point=>call(point,'apply_scholarship',apply));
    throw rollback;
  });
} catch(error) {
  if(error!==rollback)throw error;
  console.log('Scholarship checks passed: period publishing, application/reapplication, stable retry receipts, stale-version rejection, review awards/hours, closed-window and reviewed-record guards, account isolation, direct-write denial and anonymous denial. All fixtures rolled back.');
} finally {await sql.end({timeout:5});}
