import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {normalizeCourseOffering} from '../../server/courseCatalog.js';

const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL,target=connection&&new URL(connection),project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib');
assert.ok(target&&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),'Use only the client deployment database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback syllabus fixtures');
const role=async(tx,id)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
const manage=async(tx,body)=>(await tx`select public.affairs_catalog_manage('save_course_offering',${tx.json(body)}) as result`)[0].result;
const find=async(tx,id)=>(await tx`select public.affairs_catalog_search(${tx.json({id})}) as result`)[0].result;
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight')) {
      if(!(await tx`select to_regclass('public.affairs_course_offerings') as name`)[0].name)
        await tx.unsafe(await readFile('supabase/migrations/20261112050000_course_catalog.sql','utf8'));
      await tx.unsafe(await readFile('supabase/migrations/20261112070000_course_syllabus.sql','utf8'));
    }
    const id=randomUUID(),user=randomUUID(),email=`syllabus-qa-${user}@example.invalid`;
    await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values('00000000-0000-0000-0000-000000000000',${user},'authenticated','authenticated',${email},now(),'{}','{"full_name":"Syllabus QA"}',now(),now())`;
    await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${user},${user},${tx.json({sub:user,email,email_verified:true})},'google')`;
    const [owner]=await tx`select p.user_id as id from public.affairs_profiles p join auth.users u on u.id=p.user_id where p.role='admin' and lower(u.email)=lower(${deployment.supabase.ownerEmail}) and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing owner Google identity/profile required; this test never changes it.');
    await role(tx,owner.id);
    const syllabus=newCourseSyllabus();syllabus.objectives='Synthetic QA syllabus';syllabus.grading=syllabus.grading.map(()=>({weight:25,methods:['1','4']}));syllabus.capabilities=[10,5,10,10,15,10,10,5,5,5,5,10];syllabus.meanings=[11,26];syllabus.sdgs=[4];syllabus.weeks[0]={date:'2028-02-29',content:'Synthetic lesson',notes:'QA'};
    const record=normalizeCourseOffering({...newCourseOffering(),term_code:'QA'+id.slice(0,8),term_label:'Synthetic syllabus QA',department_code:'QA',department_name:'QA Department',classification_code:'QA',admission_code:'1',course_code:'QA'+id.slice(0,8),course_name:'Synthetic syllabus course',instructor:'Synthetic instructor',published:true,syllabus});
    const first={id,record,expected_version:0,request_id:randomUUID()};
    const saved=await manage(tx,first);assert.equal(saved.version,1);assert.deepEqual(await manage(tx,first),saved);
    assert.deepEqual((await find(tx,id)).rows[0].syllabus,syllabus);
    await denied(tx,point=>manage(point,{...first,request_id:randomUUID()}),'PT409');
    const {syllabus:_omitted,...legacyRecord}=record;
    assert.equal((await manage(tx,{id,record:{...legacyRecord,course_name:'Old client update'},expected_version:1,request_id:randomUUID()})).version,2);
    assert.deepEqual((await find(tx,id)).rows[0].syllabus,syllabus,'Omitting the new field must preserve the saved syllabus.');
    const invalid=[{...syllabus,secret:'unknown'},{...syllabus,sdgs:[18]},{...syllabus,meanings:[27]},
      {...syllabus,weeks:syllabus.weeks.map((week,i)=>i===0?{...week,date:'2026-02-29'}:week)},
      {...syllabus,weeks:syllabus.weeks.map((week,i)=>i===0?{...week,private_note:'unknown'}:week)},
      {...syllabus,grading:syllabus.grading.map(()=>({weight:30,methods:[]}))}];
    for(const value of invalid) await denied(tx,point=>manage(point,{id,record:{...record,syllabus:value},expected_version:2,request_id:randomUUID()}),'23514');
    await role(tx,user);assert.deepEqual((await find(tx,id)).rows[0].syllabus,syllabus);
    await denied(tx,point=>manage(point,{id,record,expected_version:2,request_id:randomUUID()}));
    await denied(tx,point=>point`update public.affairs_course_offerings set syllabus='{}' where id=${id}`);
    await role(tx,owner.id);
    await manage(tx,{id,record:{...record,published:false},expected_version:2,request_id:randomUUID()});
    await role(tx,user);assert.equal((await find(tx,id)).total,0);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>find(point,id));
    throw rollback;
  });
} catch(error) {
  if(error!==rollback) throw error;
  console.log('Syllabus checks passed: saved fields, stable retries, stale versions, old-client preservation, invalid dates/weights/nested keys, student read/write boundaries, unpublished and anonymous denial. Migration and synthetic fixtures rolled back.');
} finally {await sql.end({timeout:5});}
