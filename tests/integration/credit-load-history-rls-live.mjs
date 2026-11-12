import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib','Use the client checkout only.');
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback credit-load history fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const save=async(tx,payload,kind='save_credit_load_history')=>(await tx`select public.affairs_manage_credit_load_history(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
const migration='supabase/migrations/20261112090000_credit_load_history.sql';
try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight'))await tx.unsafe(await readFile(migration,'utf8'));
    // Require the already authenticated administrator. Never create, update or
    // initialize the real owner's auth identity, profile, or student record.
    const [owner]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing verified Google admin identity and profile are required; this test will not create or alter them.');
    const one=randomUUID(),two=randomUUID(),recordId=randomUUID();
    for(const id of [one,two]){
      const email='credit-load-qa-'+id+'@example.invalid';
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Credit Load QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    await role(tx,one,true);await role(tx,two,true);await role(tx,owner.id);
    const payload=operation({id:recordId,user_id:one,expected_version:'0',academic_year:'115',semester:'1',category:'over',requested_credits:'3.5',process_text:'Synthetic progress',result_text:''});
    await denied(tx,point=>save(point,payload,null),'22023');
    await denied(tx,point=>save(point,{...payload,private_identity:'DO-NOT-STORE'}),'22023');
    await denied(tx,point=>save(point,{...payload,process_text:{private_identity:'DO-NOT-STORE'}}),'22023');
    for(const value of ['-1','NaN','Infinity','10000','3.456'])await denied(tx,point=>save(point,operation({...payload,requested_credits:value})),'22023');
    for(const patch of [{category:'automatic_approval'},{academic_year:'0'},{semester:'0'},{process_text:'x'.repeat(301)},{result_text:'x'.repeat(301)}])
      await denied(tx,point=>save(point,operation({...payload,...patch})),'23514');
    await denied(tx,point=>save(point,operation({...payload,user_id:randomUUID()})));
    const first=await save(tx,payload);assert.equal(first.version,1);assert.deepEqual(await save(tx,payload),first);
    await denied(tx,point=>save(point,operation(payload)),'PT409');
    const [initial]=await tx`select * from public.affairs_credit_load_history where id=${recordId}`;
    assert.equal(initial.user_id,one);assert.equal(initial.category,'over');assert.equal(Number(initial.requested_credits),3.5);
    assert.equal(initial.result_text,null);assert.equal(initial.source_mode,'local_demo');
    const edited=operation({...payload,expected_version:'1',category:'under',requested_credits:'0',process_text:'',result_text:'Synthetic manual result'});
    assert.equal((await save(tx,edited)).version,2);
    assert.deepEqual(await save(tx,payload),first,'Late retry must not overwrite later edits.');
    const [after]=await tx`select * from public.affairs_credit_load_history where id=${recordId}`;
    assert.equal(after.version,2);assert.equal(Number(after.requested_credits),0);assert.equal(after.process_text,null);assert.equal(after.result_text,'Synthetic manual result');
    await denied(tx,point=>save(point,{...edited,result_text:'Changed on reused request'}),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:'1'})),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2',user_id:two})));
    await role(tx,one);
    assert.equal((await tx`select id from public.affairs_credit_load_history where id=${recordId}`).length,1);
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2'})));
    await denied(tx,point=>point`insert into public.affairs_credit_load_history(user_id,academic_year,semester,category,requested_credits) values(${one},115,1,'over',3)`);
    await denied(tx,point=>point`update public.affairs_credit_load_history set result_text='Student edit' where id=${recordId}`);
    await denied(tx,point=>point`delete from public.affairs_credit_load_history where id=${recordId}`);
    await denied(tx,point=>point`select request_id from private.affairs_credit_load_history_operations`);
    await role(tx,two);
    assert.equal((await tx`select id from public.affairs_credit_load_history where id=${recordId}`).length,0);
    await denied(tx,point=>save(point,operation({...edited,expected_version:'2',user_id:two})));
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>point`select id from public.affairs_credit_load_history`);await denied(tx,point=>save(point,payload));
    await tx.unsafe('reset role');
    const [audit]=await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${recordId} and action_kind='save_credit_load_history'`;
    const [receipts]=await tx`select count(*)::int as n from private.affairs_credit_load_history_operations where payload->>'id'=${recordId}`;
    assert.equal(audit.n,2);assert.equal(receipts.n,2,'Rejected fields and duplicate attempts must not leave receipts.');
    const [ownerAfter]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${owner.id}`;
    assert.deepEqual(ownerAfter,owner,'Existing owner auth, identities and profile must be unchanged.');
    throw rollback;
  });
}catch(error){
  if(error!==rollback)throw error;
  console.log('Credit-load history passed: six fields, nullable labels, zero credits, immutable ownership, own/cross/anonymous reads, direct/student write denial, unknown and nested payload rejection, stable receipts, stale/reused conflicts, one audit per edit, and unchanged owner identity/profile. Migration and synthetic fixtures rolled back.');
}finally{await sql.end({timeout:5});}
