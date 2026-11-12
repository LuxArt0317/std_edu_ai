import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const project=deployment.supabase.projectRef;
const target=connection&&new URL(connection);
assert.ok(target&&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),'Use only the database in deployment.json.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback housing fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,user)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${user},true)`;await tx`select public.affairs_initialize_account()`;};
const call=async(tx,kind,payload)=>(await tx`select public.affairs_housing_action(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
try{
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight'))await tx.unsafe(await readFile('supabase/migrations/20261112060000_housing_records.sql','utf8'));
    const user=randomUUID(),other=randomUUID();
    for(const id of [user,other]){
      const email=`housing-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),'{"provider":"google","providers":["google"]}','{"full_name":"Housing QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    const [owner]=await tx`select id,email from auth.users where lower(email)=lower(${deployment.supabase.ownerEmail}) and email_confirmed_at is not null`;
    assert.ok(owner,'Configured verified owner required.');
    if(!(await tx`select 1 from auth.identities where user_id=${owner.id} and provider='google'`).length)
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${randomUUID()},${owner.id},${tx.json({sub:owner.id,email:owner.email,email_verified:true})},'google')`;
    await role(tx,owner.id);
    const [{now}]=await tx`select now() as now`;
    const [{year}]=await tx`select value as year from generate_series(200,300) value where not exists(select 1 from public.affairs_housing_periods where academic_year=value) limit 1`;
    const period=operation({id:randomUUID(),term_label:'Housing local QA',academic_year:String(year),semester:'1',opens_at:new Date(now.getTime()-3600000).toISOString(),closes_at:new Date(now.getTime()+3600000).toISOString(),published:'true',instructions:'Local test only',agreement_text:'Original local agreement',expected_version:'0'});
    assert.equal((await call(tx,'save_housing_period',period)).version,1);
    assert.equal((await call(tx,'save_housing_period',period)).version,1,'same receipt is replayed');
    await denied(tx,p=>call(p,'save_housing_period',operation({...period,term_label:'Stale period'})),'PT409');
    const draft=operation({...period,id:randomUUID(),semester:'2',published:'false',term_label:'Housing draft QA'});
    await call(tx,'save_housing_period',draft);
    await role(tx,user);
    assert.equal((await tx`select id from public.affairs_housing_periods where id=${draft.id}`).length,0);
    await denied(tx,p=>call(p,'save_housing_period',period));
    const apply=operation({period_id:period.id,period_version:'1',expected_version:'0',accepted_agreement:'true',
      full_name:'Housing QA',student_number:'LOCAL-QA',gender:'female',department:'Local study',birth_date:'2000-01-01',
      home_phone:'',mobile_phone:'000000000',email:'housing@example.invalid',address:'Synthetic address',postal_code:'000',category:'general',health_notes:'Private synthetic health note'});
    await denied(tx,p=>call(p,null,apply),'22023');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,period_id:draft.id})));
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,period_version:'2'})),'PT409');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,accepted_agreement:'false'})),'22023');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,national_id:'MUST-NOT-BE-STORED'})),'22023');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,user_id:other})),'22023');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,birth_date:'2099-01-01'})),'22023');
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,health_notes:'x'.repeat(251)})),'23514');
    const first=await call(tx,'submit_housing_application',apply);
    assert.deepEqual(await call(tx,'submit_housing_application',apply),first);
    await denied(tx,p=>call(p,'submit_housing_application',operation(apply)),'PT409');
    await denied(tx,p=>p`update public.affairs_housing_applications set full_name='Changed' where id=${first.id}`);
    const [saved]=await tx`select * from public.affairs_housing_applications where id=${first.id}`;
    assert.match(saved.receipt_number,/^H-[A-F0-9]{32}$/);
    assert.equal(saved.agreement_text,'Original local agreement');assert.equal(saved.agreement_version,1);
    await denied(tx,p=>p`select * from private.affairs_housing_operations`);

    await role(tx,other);
    assert.equal((await tx`select id from public.affairs_housing_applications where id=${first.id}`).length,0);
    await denied(tx,p=>call(p,'save_housing_assignment',operation({id:randomUUID(),user_id:other,period_id:period.id,bed_number:'QA-A',dormitory:'Local dorm',bunk:'upper',accommodation_fee:'',deposit:'',expected_version:'0'})));

    await role(tx,owner.id);
    assert.equal((await tx`select id from public.affairs_housing_applications where id=${first.id}`).length,1);
    await denied(tx,p=>call(p,'save_housing_period',operation({...period,expected_version:'1',published:'false'})),'PT409');
    await denied(tx,p=>call(p,'save_housing_period',operation({...period,expected_version:'1',academic_year:String(year+1)})),'PT409');
    await call(tx,'save_housing_period',operation({...period,expected_version:'1',agreement_text:'Updated local agreement'}));
    assert.equal((await tx`select agreement_text from public.affairs_housing_applications where id=${first.id}`)[0].agreement_text,'Original local agreement','later edits must not rewrite accepted terms');
    const bed=operation({id:randomUUID(),user_id:user,period_id:period.id,bed_number:'QA-A',dormitory:'Local dorm',bunk:'upper',accommodation_fee:'1200.50',deposit:'',expected_version:'0'});
    assert.equal((await call(tx,'save_housing_assignment',bed)).version,1);
    assert.equal((await call(tx,'save_housing_assignment',bed)).version,1);
    await denied(tx,p=>call(p,'save_housing_assignment',operation({...bed,id:randomUUID(),user_id:other})),'23505');
    await denied(tx,p=>call(p,'save_housing_assignment',operation({...bed,expected_version:'1',user_id:other})),'PT409');
    await denied(tx,p=>call(p,'save_housing_assignment',operation({...bed,expected_version:'1',accommodation_fee:'-1'})),'23514');
    await denied(tx,p=>call(p,'save_housing_assignment',operation({...bed,expected_version:'1',subsidy_amount:'-1'})),'23514');
    await call(tx,'save_housing_assignment',operation({...bed,expected_version:'1',accommodation_fee:'1300.75',deposit:'350',subsidy_amount:'250.50'}));
    await call(tx,'save_housing_assignment',bed);
    assert.equal(Number((await tx`select accommodation_fee from public.affairs_housing_assignments where id=${bed.id}`)[0].accommodation_fee),1300.75,'late receipt replay must not overwrite a newer bed edit');
    await denied(tx,p=>call(p,'save_housing_assignment',operation({...bed,expected_version:'1',deposit:'500'})),'PT409');
    await call(tx,'save_housing_period',operation({...period,expected_version:'2',closes_at:new Date(now.getTime()-1000).toISOString()}));
    const audit=await tx`select summary from public.affairs_agent_audit where target_id in (${first.id},${bed.id},${period.id})`;
    assert.ok(audit.length>=5);assert.ok(audit.every(row=>!row.summary.includes('Private synthetic health note')));

    await role(tx,user);
    const [ownBed]=await tx`select * from public.affairs_housing_assignments where id=${bed.id}`;
    assert.equal(Number(ownBed.deposit),350);assert.equal(Number(ownBed.subsidy_amount),250.50);
    assert.deepEqual(await call(tx,'submit_housing_application',apply),first,'late identical retry survives a closed period');
    assert.equal((await tx`select id from public.affairs_housing_periods where id=${period.id}`).length,1,'history retains its published term');
    await role(tx,other);
    assert.equal((await tx`select id from public.affairs_housing_assignments where id=${bed.id}`).length,0);
    await denied(tx,p=>call(p,'submit_housing_application',operation({...apply,period_version:'3'})),'PT409');
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,p=>p`select * from public.affairs_housing_applications`);
    await denied(tx,p=>call(p,'submit_housing_application',apply));
    throw rollback;
  });
}catch(error){
  if(error!==rollback)throw error;
  console.log('Housing SQL checks passed: published periods, agreement snapshots, opaque receipts, duplicate prevention, stable retries, forbidden ID fields, immutable academic context, admin-only/versioned bed records, duplicate-bed denial, private audit summaries, account RLS, anonymous/direct-write denial and closed windows. All fixtures rolled back.');
}finally{await sql.end({timeout:5});}
