import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {normalizeCourseOffering} from '../../server/courseCatalog.js';
import {validateSyllabusMetadataPayload} from '../../server/syllabusSearch.js';

// PREPARED ONLY. Requires root's serialized DB lease. Never commits a migration or fixture.
// --preflight --expected-migrations=N --expected-rls=N applies 170000 inside rollback only.
// --rollback-regression uses an already applied migration, with the same exact baseline guards.
// No Auth/Storage/official-system HTTP; all synthetic rows and owner receipts live in one transaction.
const preflight=process.argv.includes('--preflight'),regression=process.argv.includes('--rollback-regression');
assert.notEqual(preflight,regression,'Choose exactly one explicitly authorized rollback mode.');
const argument=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const expectedMigrations=Number(argument('--expected-migrations')),expectedRls=Number(argument('--expected-rls'));
assert.ok(Number.isInteger(expectedMigrations)&&expectedMigrations>0&&Number.isInteger(expectedRls)&&expectedRls>0,'Reviewed migration and RLS counts are required.');
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();
assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,'xiftudmvxphxcjtmfmib');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('Client database connection unavailable.');}
assert.ok(target.protocol==='postgres:'||target.protocol==='postgresql:');
assert.ok(target.hostname==='db.xiftudmvxphxcjtmfmib.supabase.co'||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.xiftudmvxphxcjtmfmib'),'Use only the exact client database.');
const options={max:1,connect_timeout:10,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}};
const sql=postgres(connection,options),rollback=Symbol('rollback syllabus fixtures');
const users=[randomUUID(),randomUUID(),randomUUID()],ids=Array.from({length:104},()=>randomUUID());
const term='Q'+randomUUID().replaceAll('-','').slice(0,10),department='D'+randomUUID().replaceAll('-','').slice(0,10);
const role=async(tx,id)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const columnCount=async tx=>(await tx`select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='affairs_course_offerings' and column_name in ('syllabus_is_current','academic_year_text','semester_text')`)[0].count;
const save=async(tx,payload)=>(await tx`select public.affairs_syllabus_metadata_manage(${tx.json(payload)}) as result`)[0].result;
const offering=async(tx,payload)=>(await tx`select public.affairs_catalog_manage('save_course_offering',${tx.json(payload)}) as result`)[0].result;
const catalogRow=async(tx,id)=>{
  const result=(await tx`select public.affairs_catalog_search(${tx.json({id})},0,100,'course_code','asc') as result`)[0].result;
  assert.equal(result.can_manage,true);assert.equal(result.total,1);assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,id);
  return result.rows[0];
};
const filter={scope:'historical',keyword:'',term,department:'',themes:[]};
const search=async(tx,patch={},page=0,size=100,sort='course_code',direction='asc')=>(await tx`select public.affairs_syllabus_search(${tx.json({...filter,...patch})},${page},${size},${sort},${direction}) as result`)[0].result;
const detail=async(tx,id)=>(await tx`select public.affairs_syllabus_detail(${id}) as result`)[0].result;
const metadata={id:ids[0],request_id:randomUUID(),expected_version:1,syllabus_is_current:true,academic_year_text:'Explicit QA year',semester_text:'0'};
const next=value=>({...value,request_id:randomUUID()});
const base=normalizeCourseOffering({...newCourseOffering(),term_code:term,term_label:'Synthetic local term',department_code:department,department_name:'Synthetic local unit',
  classification_code:'QA',classification_name:'Synthetic class',admission_code:'QA',admission_name:'Synthetic program',course_code:'QA000',course_name:'Synthetic SQL_% Alpha',english_name:'Synthetic English title',instructor:'Synthetic instructor',published:true,
  syllabus:{...newCourseSyllabus(),meanings:[11]}});
let owner,before,rolledBack=false,checks=0,timedOut=false,failure=null,stage='baseline';
const timer=setTimeout(()=>{timedOut=true;void sql.end({timeout:5});},120000);timer.unref();
try{
  before=await baseline(sql);assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls});
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    stage='draft migration';if(preflight){assert.equal(await columnCount(tx),0);await tx.unsafe(await readFile('supabase/migrations/20261112170000_syllabus_search.sql','utf8'));}
    assert.equal(await columnCount(tx),3);assert.deepEqual(await baseline(tx),before);
    const [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified Google administrator required; it is never created or modified.');owner=await fingerprint(tx,administrator.id);
    stage='transaction fixtures';for(const [index,id] of users.entries()){
      const email=`syllabus-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),'{}','{"full_name":"Synthetic syllabus QA"}',now(),now())`;
      if(index<2){await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;await role(tx,id);await tx`select public.affairs_initialize_account()`;await tx.unsafe('reset role');}
    }
    await role(tx,administrator.id);
    assert.equal((await tx`select private.affairs_is_admin() as allowed`)[0].allowed,true);
    const records=ids.map((id,index)=>({id,request_id:randomUUID(),expected_version:0,record:{...base,course_code:'QA'+String(index).padStart(3,'0'),
      course_name:index===0?base.course_name:'Synthetic syllabus '+String(index).padStart(3,'0'),published:index!==103,
      syllabus:{...base.syllabus,meanings:index===0?[11]:index===1?[1]:[]}}}));
    for(const record of records)assert.equal((await offering(tx,record)).version,1);
    assert.equal((await search(tx,{scope:'current'})).total,0,'No implicit current membership from dates, term codes or seeded data.');
    const saved=await save(tx,metadata);assert.equal(saved.version,2);assert.deepEqual(await save(tx,metadata),saved);
    await save(tx,next({...metadata,id:ids[1],syllabus_is_current:false,academic_year_text:null,semester_text:null}));
    await save(tx,next({...metadata,id:ids[103]}));
    checks++;

    stage='metadata validation and replay';const valid=[metadata,{...metadata,syllabus_is_current:null,academic_year_text:null,semester_text:''},{...metadata,academic_year_text:'😀'.repeat(30)}];
    const invalid=[];
    for(const key of Object.keys(metadata)){const payload={...metadata};delete payload[key];invalid.push(payload);}
    for(const patch of [{id:'bad'},{request_id:null},{expected_version:0},{expected_version:1.1},{expected_version:'1'},{expected_version:999999999},
      {syllabus_is_current:'true'},{academic_year_text:115},{semester_text:'x'.repeat(31)},
      {academic_year_text:'😀'.repeat(31)},{semester_text:'𠀀'.repeat(31)},{published:true},{source_mode:'official'},{user_id:users[0]}])invalid.push({...metadata,...patch});
    for(const value of valid){assert.equal(validateSyllabusMetadataPayload(value),null);assert.equal((await tx`select private.affairs_syllabus_metadata_valid(${tx.json(value)}) as ok`)[0].ok,true);}
    for(const value of invalid){assert.ok(validateSyllabusMetadataPayload(value));assert.equal((await tx`select private.affairs_syllabus_metadata_valid(${tx.json(value)}) as ok`)[0].ok,false);await denied(tx,t=>save(t,value),'22023');}
    await denied(tx,t=>save(t,{...metadata,semester_text:'reuse changed'}),'PT409');await denied(tx,t=>save(t,next(metadata)),'PT409');
    await denied(tx,t=>save(t,next({...metadata,id:randomUUID()})),'PT409');checks++;

    stage='published filters pagination options detail';for(const id of [administrator.id,...users.slice(0,2)]){
      await role(tx,id);
      const current=await search(tx,{scope:'current'});assert.equal(current.total,1);assert.equal(current.rows[0].id,ids[0]);
      assert.equal(current.rows[0].academicYearText,'Explicit QA year');assert.equal(current.rows[0].semesterText,'0');
      const page=await search(tx);assert.equal(page.total,103);assert.equal(page.rows.length,100);assert.equal(page.hasMore,true);
      const tail=await search(tx,{},1);assert.equal(tail.rows.length,3);assert.equal(tail.hasMore,false);assert.equal(tail.revision,page.revision);
      assert.equal(new Set([...page.rows,...tail.rows].map(row=>row.id)).size,103);
      assert.deepEqual([...page.rows,...tail.rows].map(row=>row.sequence),Array.from({length:103},(_,i)=>i+1));
      assert.equal(page.rows.find(row=>row.id===ids[1]).academicYearText,null);
      assert.deepEqual(Object.keys(page.rows[0]).sort(),['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'].sort());
      assert.deepEqual(await detail(tx,ids[103]),{row:null},'Published restriction applies even to administrators.');
      const shown=(await detail(tx,ids[0])).row;assert.equal(shown.published,true);assert.equal(shown.syllabus.meanings[0],11);assert.equal('syllabus_is_current' in shown,false);assert.equal('created_at' in shown,false);
      assert.equal((await search(tx,{themes:[11]})).total,1);assert.equal((await search(tx,{themes:[1]})).total,1);assert.equal((await search(tx,{themes:[1,11]})).total,2,'Themes combine with OR.');
      assert.equal((await search(tx,{keyword:'SQL_%'})).total,1);assert.equal((await search(tx,{keyword:'%'})).total,1,'No wildcard interpretation.');
      assert.equal((await search(tx,{keyword:'synthetic ENGLISH'})).total,103);assert.equal((await search(tx,{department})).total,103);
      assert.equal((await search(tx,{department:'absent'})).total,0);assert.equal((await search(tx,{scope:'current',themes:[1]})).total,0);
      assert.deepEqual((await search(tx,{},0,2,'course_code','desc')).rows.map(row=>row.sequence),[103,102]);
      for(const sort of ['sequence','course_name','academicYearText','semesterText','admission_name','instructor'])assert.equal((await search(tx,{},0,2,sort,'asc')).rows.length,2);
      const options=(await tx`select public.affairs_syllabus_options() as result`)[0].result;assert.deepEqual(options.terms.find(item=>item.value===term),{value:term,label:'Synthetic local term'});
      assert.deepEqual(options.departments.find(item=>item.value===department),{value:department,label:'Synthetic local unit'});
    }checks++;

    stage='unauthorized writes and malformed reads';await role(tx,users[0]);
    for(const bad of [{scope:'past'},{themes:[0]},{themes:[27]},{themes:['11']},{themes:[] ,unknown:true},{keyword:null}])await denied(tx,t=>search(t,bad),'22023');
    for(const [page,size,sort,direction] of [[0,101,'course_code','asc'],[null,100,'course_code','asc'],[0,null,'course_code','asc'],[0,0,'course_code','asc'],[-1,100,'course_code','asc'],[0,1,'private','asc'],[0,1,'course_code','ASC']])await denied(tx,t=>search(t,{},page,size,sort,direction),'22023');
    await denied(tx,t=>save(t,next({...metadata,expected_version:2})));
    await denied(tx,t=>t`update public.affairs_course_offerings set syllabus_is_current=true where id=${ids[0]}`);
    await denied(tx,t=>t`select * from private.affairs_catalog_operations`);
    await role(tx,users[2]);await denied(tx,t=>search(t));await denied(tx,t=>detail(t,ids[0]));await denied(tx,t=>t`select public.affairs_syllabus_options()`);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;await denied(tx,t=>search(t));await denied(tx,t=>save(t,metadata));checks++;

    stage='shared editor versions and revision fingerprint';await role(tx,administrator.id);
    const oldPage=await search(tx);
    const returned=await catalogRow(tx,ids[0]);assert.equal(returned.version,2);
    const changed=next({...records[0],expected_version:returned.version,record:normalizeCourseOffering({...returned,
      course_name:'Synthetic edited syllabus',syllabus:{...returned.syllabus,meanings:[1]}})});
    assert.equal((await offering(tx,changed)).version,3);
    const [preserved]=await tx`select syllabus_is_current,academic_year_text,semester_text from public.affairs_course_offerings where id=${ids[0]}`;
    assert.deepEqual(preserved,{syllabus_is_current:true,academic_year_text:'Explicit QA year',semester_text:'0'});
    const newPage=await search(tx);assert.equal(newPage.total,oldPage.total);assert.notEqual(newPage.revision,oldPage.revision,'Same-count edits are detected across pages.');
    assert.equal((await search(tx,{themes:[11]})).total,0,'Existing syllabus editor controls the theme array.');
    assert.deepEqual(await save(tx,metadata),saved,'Late metadata replay cannot revert a newer full offering edit.');
    await denied(tx,t=>save(t,next({...metadata,expected_version:2})),'PT409');
    const cleared=next({...metadata,expected_version:3,syllabus_is_current:null,academic_year_text:null,semester_text:null});assert.equal((await save(tx,cleared)).version,4);
    assert.equal((await search(tx,{scope:'current'})).total,0);assert.equal((await search(tx)).total,103,'Historical includes all published rows including formerly current ones.');
    await denied(tx,t=>offering(t,next({...changed,expected_version:3})),'PT409');checks++;

    stage='supplementary Unicode returned-row legacy edit';
    const unicode=next({...metadata,id:ids[3],syllabus_is_current:null,academic_year_text:'😀'.repeat(30),semester_text:'𠀀'.repeat(30)});
    assert.equal(validateSyllabusMetadataPayload(unicode),null);assert.equal((await save(tx,unicode)).version,2);
    const unicodeRow=await catalogRow(tx,ids[3]);assert.equal(unicodeRow.version,2);
    assert.equal(unicodeRow.academic_year_text,unicode.academic_year_text);assert.equal(unicodeRow.semester_text,unicode.semester_text);
    for(const field of ['academic_year_text','semester_text']){
      assert.equal([...unicodeRow[field]].length,30);assert.equal(unicodeRow[field].length,60);
      assert.throws(()=>normalizeCourseOffering({...unicodeRow,[field]:unicodeRow[field]+'𠀀'}),{status:400});
      const oversized=next({...unicode,expected_version:2,[field]:unicodeRow[field]+'𠀀'});
      assert.ok(validateSyllabusMetadataPayload(oversized));await denied(tx,t=>save(t,oversized),'22023');
    }
    const edited=normalizeCourseOffering({...unicodeRow,course_name:'Synthetic Unicode syllabus edited'});
    for(const field of ['syllabus_is_current','academic_year_text','semester_text'])assert.equal(Object.hasOwn(edited,field),false,
      'The existing catalog transport strips read-only metadata before the old write RPC.');
    const edit=next({id:unicodeRow.id,expected_version:unicodeRow.version,record:edited});
    const editReceipt=await offering(tx,edit);assert.equal(editReceipt.version,3);assert.deepEqual(await offering(tx,edit),editReceipt);
    const afterEdit=await catalogRow(tx,ids[3]);assert.equal(afterEdit.version,3);assert.equal(afterEdit.course_name,edited.course_name);
    assert.equal(afterEdit.syllabus_is_current,null);assert.equal(afterEdit.academic_year_text,unicode.academic_year_text);
    assert.equal(afterEdit.semester_text,unicode.semester_text);assert.deepEqual(afterEdit.syllabus,unicodeRow.syllabus);
    checks++;

    stage='option conflicts and deletion replay';await offering(tx,next({...records[2],expected_version:1,record:{...records[2].record,term_label:'Conflicting local label'}}));
    await denied(tx,t=>t`select public.affairs_syllabus_options()`,'PT409');
    await offering(tx,next({...records[2],expected_version:2}));
    const remove={id:ids[0],request_id:randomUUID(),expected_version:4};
    await tx`select public.affairs_catalog_manage('delete_course_offering',${tx.json(remove)})`;
    assert.deepEqual(await save(tx,cleared),{id:ids[0],kind:'save_syllabus_search_metadata',version:4,summary:'Saved local syllabus search metadata.'});
    assert.deepEqual(await detail(tx,ids[0]),{row:null},'Late metadata receipt does not resurrect a deleted offering.');
    await denied(tx,t=>save(t,next({...cleared,expected_version:5})),'PT409');
    await tx.unsafe('reset role');assert.deepEqual(await fingerprint(tx,administrator.id),owner);checks++;
    throw rollback;
  });
}catch(error){if(error===rollback)rolledBack=true;else{failure={stage,code:typeof error?.code==='string'?error.code:'assertion',assertion:error instanceof assert.AssertionError?error.message.split('\n')[0].slice(0,160):undefined};process.exitCode=1;}}
finally{clearTimeout(timer);await sql.end({timeout:5});}
if(!before)console.error(JSON.stringify({status:'failed',checks,timedOut,failure,rollbackVerified:false}));
if(before){
  const check=postgres(connection,options);
  try{
    assert.deepEqual(await baseline(check),before);assert.equal(await columnCount(check),preflight?0:3);
    assert.equal((await check`select count(*)::int as count from auth.users where id=any(${users}::uuid[])`)[0].count,0);
    assert.equal((await check`select count(*)::int as count from public.affairs_course_offerings where id=any(${ids}::uuid[])`)[0].count,0);
    if(owner){
      assert.equal((await check`select count(*)::int as count from private.affairs_catalog_operations where user_id=${owner.id} and payload->>'id'=any(${ids}::text[])`)[0].count,0);
      assert.equal((await check`select count(*)::int as count from public.affairs_agent_audit where user_id=${owner.id} and target_id=any(${ids}::uuid[])`)[0].count,0);
      assert.deepEqual(await fingerprint(check,owner.id),owner);
    }checks++;
    console.log(JSON.stringify({status:rolledBack?'passed':'failed',mode:preflight?'rollback_preflight':'rollback_regression',checks,fixtures:ids.length,users:users.length,ownerUnchanged:owner?true:null,rollbackVerified:true,timedOut,failure}));
  }catch(error){process.exitCode=1;console.error(JSON.stringify({status:'failed',checks,stage:'rollback verification',code:typeof error?.code==='string'?error.code:'assertion',failure}));}
  finally{await check.end({timeout:5});}
}
