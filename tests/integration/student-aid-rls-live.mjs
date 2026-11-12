import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment();
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try {target=new URL(connection);} catch {throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),
  'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback student aid fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,id)=>{
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  await tx`select public.affairs_initialize_account()`;
};
const save=async(tx,payload,kind='save_student_aid_record')=>(await tx`select public.affairs_manage_student_aid_record(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});

try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight'))await tx.unsafe(await readFile('supabase/migrations/20261112040000_student_aid_records.sql','utf8'));
    const one=randomUUID(),two=randomUUID();
    for(const id of [one,two]) {
      const email='student-aid-qa-'+id+'@example.invalid';
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Student Aid QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    const [owner]=await tx`select id,email from auth.users where lower(email)=lower(${deployment.supabase.ownerEmail}) and email_confirmed_at is not null`;
    assert.ok(owner,'The configured verified owner is required for the rolled-back admin checks.');
    if(!(await tx`select 1 from auth.identities where user_id=${owner.id} and provider='google'`).length)
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${randomUUID()},${owner.id},${tx.json({sub:owner.id,email:owner.email,email_verified:true})},'google')`;
    await role(tx,one);await role(tx,two);await role(tx,owner.id);
    const payload=operation({id:randomUUID(),user_id:one,expected_version:'0',academic_year:'115',semester:'1',
      application_kind:'Synthetic local housing aid',masked_identity_number:'******1234',school_review_status:'人工審核中'});
    await denied(tx,point=>save(point,payload,null),'22023');
    await denied(tx,point=>save(point,operation({...payload,raw_identity_number:'A123456789'})),'22023');
    await denied(tx,point=>save(point,operation({...payload,masked_identity_number:'A123456789'})),'23514');
    await denied(tx,point=>save(point,operation({...payload,masked_identity_number:'A123456***'})),'23514');
    await denied(tx,point=>save(point,operation({...payload,subsidy_amount:'-1'})),'23514');
    await denied(tx,point=>save(point,operation({...payload,relative_count:'-1'})),'23514');
    await denied(tx,point=>save(point,operation({...payload,student_name:'x'.repeat(161)})),'23514');
    const first=await save(tx,payload);
    assert.equal(first.version,1);assert.deepEqual(await save(tx,payload),first);
    await denied(tx,point=>save(point,operation(payload)),'PT409');
    const [saved]=await tx`select * from public.affairs_student_aid_records where id=${payload.id}`;
    assert.equal(saved.user_id,one);assert.match(saved.applicant_label,/^SAMPLE-/);
    assert.equal(saved.student_name,'Student Aid QA');assert.equal(saved.masked_identity_number,'******1234');
    assert.equal(saved.school_review_status,'人工審核中');assert.equal(saved.ministry_review_status,null);
    assert.equal(saved.subsidy_amount,null);assert.equal(saved.relative_count,null);assert.equal(saved.student_record_locked,null);
    const edited=operation({...payload,expected_version:'1',subsidy_amount:'0',relative_count:'0',student_record_locked:'false',
      school_review_status:'示範核對完成',ministry_review_status:'示範：未送教育部'});
    assert.equal((await save(tx,edited)).version,2);
    assert.deepEqual(await save(tx,payload),first,'Late original retry must preserve a later edit.');
    const [afterRetry]=await tx`select version,subsidy_amount,school_review_status from public.affairs_student_aid_records where id=${payload.id}`;
    assert.equal(afterRetry.version,2);assert.equal(Number(afterRetry.subsidy_amount),0);assert.equal(afterRetry.school_review_status,'示範核對完成');
    await denied(tx,point=>save(point,{...edited,school_review_status:'Changed with reused request ID'}),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:'1'})),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2',user_id:two})));

    await role(tx,one);
    assert.equal((await tx`select id from public.affairs_student_aid_records where id=${payload.id}`).length,1);
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2'})));
    await denied(tx,point=>point`update public.affairs_student_aid_records set subsidy_amount=5000 where id=${payload.id}`);
    await denied(tx,point=>point`delete from public.affairs_student_aid_records where id=${payload.id}`);
    await denied(tx,point=>point`select request_id from private.affairs_student_aid_operations`);
    await role(tx,two);
    assert.equal((await tx`select id from public.affairs_student_aid_records where id=${payload.id}`).length,0);
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2',user_id:two})));
    await tx.unsafe('set local role anon');
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>point`select id from public.affairs_student_aid_records`);
    await denied(tx,point=>save(point,payload));
    await tx.unsafe('reset role');
    const [audit]=await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${payload.id} and action_kind='save_student_aid_record'`;
    const [receipts]=await tx`select count(*)::int as n from private.affairs_student_aid_operations where payload->>'id'=${payload.id}`;
    assert.equal(audit.n,2);assert.equal(receipts.n,2,'Rejected unknown/raw identity payloads must not be retained.');
    throw rollback;
  });
} catch(error) {
  if(error!==rollback)throw error;
  console.log('Student aid passed: admin save/edit, own/cross/anonymous reads, direct-write and student-RPC denial, masked-only identity, unknown-key rejection, nullable amounts/statuses, stable retries, stale/reused requests, immutable ownership and exactly one audit per successful request. All fixtures rolled back.');
} finally {await sql.end({timeout:5});}
