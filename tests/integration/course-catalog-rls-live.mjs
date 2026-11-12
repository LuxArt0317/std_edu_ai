import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseOffering} from '../../server/courseCatalog.js';

const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const project=deployment.supabase.projectRef,target=connection&&new URL(connection);
assert.equal(project,'xiftudmvxphxcjtmfmib');
assert.ok(target&&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),'Use only the client deployment database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback catalog migration and fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,user)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${user},true)`;};
const manage=async(tx,kind,payload)=>(await tx`select public.affairs_catalog_manage(${kind},${tx.json(payload)}) as result`)[0].result;
const search=async(tx,filters={},page=0,size=100,sort='course_code',direction='asc')=>(await tx`select public.affairs_catalog_search(${tx.json(filters)},${page},${size},${sort},${direction}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight')) await tx.unsafe(await readFile('supabase/migrations/20261112050000_course_catalog.sql','utf8'));
    const user=randomUUID(),other=randomUUID(),term='QA'+randomUUID().slice(0,8);
    for(const id of [user,other]) {
      const email=`catalog-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),'{}','{"full_name":"Catalog QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    const [owner]=await tx`select u.id from auth.users u where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'An existing verified owner Google identity is required; this test never adds or changes owner identities.');
    await role(tx,owner.id);
    assert.equal((await tx`select private.affairs_is_admin() as allowed`)[0].allowed,true,'Existing owner admin profile required; it will not be changed.');
    const base=normalizeCourseOffering({...newCourseOffering(),term_code:term,term_label:'Local QA term',department_code:'01',department_name:'示範學系',classification_code:'IMU',classification_name:'示範類別',admission_code:'1',admission_name:'示範學制',course_code:'CAT-A',course_name:'QA SQL_% Alpha',english_name:'Sample Alpha',instructor:'示範教師甲',instructor2:'示範教師乙',grade:'一',credits:2,capacity:50,enrolled_count:10,selected_count:12,program_codes:['QA_PROGRAM'],required:true,e_course:true,english_taught:true,foreign_language:false,immersion:false,meetings:[{weekday:1,periods:['1','2']},{weekday:2,periods:['5']}],published:true});
    const first=operation({id:randomUUID(),expected_version:0,record:base});
    const saved=await manage(tx,'save_course_offering',first);assert.equal(saved.version,1);
    assert.deepEqual(await manage(tx,'save_course_offering',first),saved);
    await denied(tx,point=>manage(point,'save_course_offering',operation({...first,record:{...base,course_name:'Stale'}})),'PT409');
    await denied(tx,point=>manage(point,'save_course_offering',{...first,record:{...base,course_name:'Reused receipt'}}),'PT409');
    const second=operation({id:randomUUID(),expected_version:0,record:{...base,course_code:'CAT-B',course_name:'Beta',instructor:'示範教師丙',instructor2:'',credits:9,department_code:'02',classification_code:'BU',admission_code:'3',grade:'二',required:false,e_course:false,english_taught:false,foreign_language:true,immersion:true,program_codes:[],meetings:[{weekday:3,periods:['A']} ]}});
    await manage(tx,'save_course_offering',second);
    const draft=operation({id:randomUUID(),expected_version:0,record:{...base,course_code:'CAT-DRAFT',published:false}});
    await manage(tx,'save_course_offering',draft);
    await denied(tx,point=>manage(point,'save_course_offering',operation({id:randomUUID(),expected_version:0,record:{...base,secret:'must not persist'}})),'22023');
    await denied(tx,point=>manage(point,'save_course_offering',operation({id:randomUUID(),expected_version:0,record:{...base,course_code:'BAD',credits:-1}})),'23514');
    await denied(tx,point=>manage(point,'save_course_offering',operation({id:randomUUID(),expected_version:0,record:{...base,course_code:'BAD',meetings:[{weekday:8,periods:['1']}]}})),'23514');
    for(const who of [user,other]) {
      await role(tx,who);
      assert.equal((await search(tx,{yr:term})).total,2);assert.equal((await search(tx,{yr:term})).can_manage,false);
      assert.equal((await tx`select id from public.affairs_course_offerings where id=${draft.id}`).length,0);
      assert.equal((await search(tx,{id:draft.id})).total,0);
      await denied(tx,point=>manage(point,'save_course_offering',first));
      await denied(tx,point=>manage(point,'delete_course_offering',operation({id:first.id,expected_version:1})));
      await denied(tx,point=>point`update public.affairs_course_offerings set course_name='Forbidden' where id=${first.id}`);
      await denied(tx,point=>point`delete from public.affairs_course_offerings where id=${first.id}`);
      await denied(tx,point=>point`select * from private.affairs_catalog_operations`);
    }
    const checks=[{dep:'01'},{ref1:'IMU'},{admissionType:'1'},{credit:'2'},{grd:'一'},{prog:'QA_PROGRAM'},{required:'true'},{e_course:'true'},{english_taught:'true'},{foreign_language:'false'},{immersion:'false'},{keyword:'SQL_%'},{instructor:'教師乙'},{weekdays:['1']},{periods:['2']},{weekdays:['2'],periods:['5']}];
    for(const filter of checks) {const found=await search(tx,{yr:term,...filter});assert.deepEqual(found.rows.map(row=>row.id),[first.id],JSON.stringify(filter));}
    assert.equal((await search(tx,{yr:term,instructor:'示範學系'})).total,2,'Instructor query also accepts the displayed department keyword.');
    assert.equal((await search(tx,{yr:term,weekdays:['1'],periods:['5']})).total,0,'Weekday and period must match the same meeting group.');
    assert.equal((await search(tx,{yr:term,keyword:'%'})).total,1,'Search treats wildcard characters literally.');
    assert.equal((await search(tx,{yr:term,keyword:'No matching offering'})).total,0);
    assert.equal((await search(tx,{yr:term},0,1,'credits','desc')).rows[0].id,second.id);
    const page=await search(tx,{yr:term},1,1,'credits','desc');assert.equal(page.rows[0].id,first.id);assert.equal(page.total,2);
    assert.equal((await search(tx,{yr:term},5,1)).total,2);
    await denied(tx,point=>search(point,{},0,101),'22023');await denied(tx,point=>search(point,{},0,1,'course_code; select 1'),'22023');
    await role(tx,owner.id);
    assert.equal((await search(tx,{yr:term})).total,3);
    const edit=operation({...first,expected_version:1,record:{...base,course_name:'Updated sample'}});
    assert.equal((await manage(tx,'save_course_offering',edit)).version,2);
    const remove=operation({id:first.id,expected_version:2});
    assert.equal((await manage(tx,'delete_course_offering',remove)).version,3);
    assert.deepEqual(await manage(tx,'delete_course_offering',remove),{id:first.id,kind:'delete_course_offering',version:3,summary:'Deleted a local sample course offering.'});
    assert.equal((await search(tx,{id:first.id})).total,0);
    assert.deepEqual(await manage(tx,'save_course_offering',first),saved,'Late original save retry must not restore a deleted course.');
    assert.equal((await search(tx,{id:first.id})).total,0);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>search(point));await denied(tx,point=>manage(point,'save_course_offering',first));
    await denied(tx,point=>point`select id from public.affairs_course_offerings`);
    throw rollback;
  });
} catch(error) {
  if(error!==rollback) throw error;
  console.log('Course catalog checks passed: every filter, same-meeting matching, literal text, numeric sorting, pagination, published visibility, admin versions and retries, deleted-record retry, direct-write and anonymous denials. Migration and synthetic fixtures rolled back.');
} finally {await sql.end({timeout:5});}
