import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';
import {fixtureForCase,evalId,EVAL_USER_ID,EVAL_OTHER_USER_ID} from './fixtures.mjs';
import {collectPublishedCatalogBinding,verifyPublishedCatalogBinding,readPublishedCatalogFixture,validatePublishedCatalogFixture,LiveFixtureError} from './live-fixtures.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {gradeCase} from './grading.mjs';
import {readCatalogEvidence} from '../../server/accountCatalogEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
const users=[EVAL_USER_ID,EVAL_OTHER_USER_ID],absentId=evalId(98765);
const query={scope:'syllabus-search',search_scope:'historical',page:'0',page_size:'20',sort:'course_code',direction:'asc'};
const offering=(id=evalId(876))=>({...newCourseOffering(),id,version:7,published:true,source_mode:'sample',department_code:'EVAL',department_name:'Evaluation Studies',classification_code:'EVAL',admission_code:'1',course_code:'PUBLISHED-QA-7',course_name:'Published Research',instructor:'Published Teacher',admission_name:'Day program',credits:2,syllabus:{...newCourseSyllabus(),objectives:'Published independent objectives.'}});
const page=rows=>({scope:'historical',total:rows.length,rows:rows.map((row,index)=>({id:row.id,sequence:index+1,course_code:row.course_code,course_name:row.course_name,instructor:row.instructor,admission_name:row.admission_name,academicYearText:null,semesterText:null})),page:0,pageSize:20,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'a'.repeat(32)});
const templates=()=>[...buildAccountCases(),...buildServiceCases()].filter(row=>row.fixtureRequirement==='published_catalog_binding');
function reader(rows=[offering()],options={}){
  const calls=[];
  const read=async(userId,selected)=>{calls.push({userId,query:structuredClone(selected)});let value=selected.scope==='syllabus-search'?page(rows):{row:rows.find(row=>row.id===selected.id)||null};return structuredClone(options.mutate?.(value,userId,selected)||value);};
  return {read,calls};
}
const collect=(cases=templates(),r=reader())=>collectPublishedCatalogBinding(cases,{userIds:users,absentId,read:r.read});
const grade=(testCase,answer,body={})=>gradeCase(testCase,{statusCode:200,execution:'recorded',fixtureKey:testCase.fixtureKey,
  toolCalls:[{name:'courseCatalog',status:'complete'}],body:{status:'answered',answer,verification:{status:'verified',attempts:1},citations:[{chunkId:'account:courseCatalog',url:testCase.route}],...body}});

test('enrollment oracle rejects an omitted boundary or affirmative inference even beside a correct caveat',async()=>{
  const result=await collect(),item=result.cases.find(row=>row.id==='account:catalog-enrollment-distinction');
  const code='Local sample course code: PUBLISHED-QA-7.';
  for(const boundary of ['The published listing does not prove your personal enrollment.','Published offerings do not establish enrollment.','Personal enrollment cannot be inferred from this sample catalog.','This listing is not proof of your enrollment.']){
    const verdict=grade(item,code+' '+boundary);assert.equal(verdict.passed,true,JSON.stringify(verdict.failures));
  }
  for(const answer of [code,code+' Yes, this confirms that you are enrolled.',code+' Your enrollment is verified.',code+' The listing does not prove enrollment. However, this confirms that you are enrolled.',code+' The listing does not prove enrollment. Therefore, you are enrolled.']){
    const verdict=grade(item,answer);assert.equal(verdict.passed,false,answer);
    assert.ok(verdict.failures.some(row=>row.id.startsWith('fact.')||row.id.startsWith('text.forbidden.')));
  }
});

test('bound null-weight route and oracle agree with the actual published reader and formatter',async()=>{
  const result=await collect(),item=result.cases.find(row=>row.id==='account:catalog-null-weight');
  assert.equal(item.route,'/school-affairs/services/12-4?syllabus='+offering().id);
  assert.deepEqual(item.expected.requiredLinks,[item.route]);
  const evidence=await readCatalogEvidence({user:{id:EVAL_USER_ID},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-key',token:'synthetic-token'},
    {query:{id:offering().id},route:item.route,question:item.question,deadline:Date.now()+5000},
    {search:async()=>{throw new Error('Exact syllabus must not browse.');},detail:async()=>({row:offering()})});
  assert.equal(evidence.readState,'ok');assert.equal(evidence.evidence.url,item.route);
  const formatted=formatSupplementalAccountAnswers([evidence],{question:item.question});
  assert.ok(formatted.views.some(view=>view.url===item.route));
  const verdict=grade(item,formatted.answer,{views:formatted.views,citations:[]});
  assert.equal(verdict.passed,true,JSON.stringify(verdict.failures));
  const wrongLink=grade(item,formatted.answer.replaceAll(item.route,'/school-affairs/services/12-4?course='+offering().id),{views:[],citations:[]});
  assert.ok(wrongLink.failures.some(row=>row.id==='links.required.0'));
});

test('all five catalog questions and both service templates bind before hashing without changing case identities or other cases',async()=>{
  const before=templates(),unrelated=buildAccountCases().find(row=>row.id==='account:profile-login'),r=reader();
  const result=await collect([...before,unrelated],r);
  assert.equal(result.binding.selected.length,7);assert.deepEqual(result.binding.unavailable,[]);assert.match(result.binding.digest,/^[a-f0-9]{64}$/);
  assert.deepEqual(result.cases.map(row=>row.id),[...before,unrelated].map(row=>row.id));assert.deepEqual(result.cases.at(-1),unrelated);
  assert.deepEqual(before,templates());
  for(const item of result.cases.filter(row=>row.fixtureRequirement)){
    assert.equal(item.fixtureRequirement,'published_catalog_binding');assert.ok(result.bound.has(item.id));
    assert.equal(item.capability.level,'native');assert.equal(item.capability.gap,false);assert.ok(item.expected.requiredTools.includes('courseCatalog'));
    assert.doesNotThrow(()=>fixtureForCase(item));
    if(item.expected.behavior==='answer')assert.ok(item.expected.facts.length);
    const prior=before.find(row=>row.id===item.id);
    for(const key of ['id','domain','language','mode','serviceId','fixtureRequirement'])assert.equal(item[key],prior[key]);
  }
  const mixed=result.cases.find(row=>row.id==='account:catalog-mixed-dtm');
  assert.deepEqual(mixed.expected.requiredTools,['courseCatalog','dtm','assignments']);assert.ok(mixed.expected.requiredText.includes('Index plan'));
  const selected=result.binding.selected.find(row=>row.caseId==='account:catalog-known-fields');
  assert.equal(selected.offeringVersion,7);assert.equal(selected.syllabusVersion,null);assert.match(selected.syllabusDigest,/^[a-f0-9]{64}$/);assert.equal(selected.publishedSearchRevision,'a'.repeat(32));
  const missing=result.binding.selected.find(row=>row.caseId==='account:catalog-unfound');assert.equal(missing.offeringId,absentId);assert.equal(missing.offeringVersion,null);assert.equal(missing.syllabusDigest,null);
  assert.ok(r.calls.some(call=>call.query.scope==='syllabus-search'));assert.ok(r.calls.some(call=>call.query.id===offering().id));
  assert.equal(r.calls.filter(call=>call.query.id===absentId).length,2,'Absence needs both callers and a separate positive published discovery.');
  assert.ok(Object.isFrozen(result.bound.get(selected.caseId).reads[0].value));
});

test('null, not zero, is selected independently and missing null evidence remains an explicit setup gap',async()=>{
  const source=offering();source.syllabus.grading=[{weight:25,methods:[]},{weight:25,methods:[]},{weight:25,methods:[]},{weight:25,methods:[]}];
  const result=await collect(templates(),reader([source]));
  assert.equal(result.binding.selected.length,6);assert.deepEqual(result.binding.unavailable,[{caseId:'account:catalog-null-weight',reason:'no_null_weight_offering'}]);
  assert.equal(result.cases.length,7);assert.equal(result.cases.find(row=>row.id==='account:catalog-null-weight').expected.behavior,'unavailable');
  const empty=await collect(templates(),reader([]));assert.equal(empty.binding.selected.length,0);assert.equal(empty.binding.unavailable.length,7);assert.ok(empty.binding.unavailable.every(row=>row.reason==='no_suitable_published_offering'));
});

test('malformed, unpublished or caller-dependent public records cannot create golden expectations',async()=>{
  for(const mutate of [value=>{if(value.row)value.row.published=false;return value;},value=>{if(value.row)value.row.owner_secret='PRIVATE';return value;},(value,userId)=>{if(userId===EVAL_OTHER_USER_ID&&value.row)value.row.instructor='Different caller view';return value;}]){
    const result=await collect(templates(),reader([offering()],{mutate}));
    assert.equal(result.binding.selected.length,0);assert.equal(result.binding.unavailable.length,7);
    assert.ok(result.binding.unavailable.every(row=>['published_payload_invalid','public_scope_mismatch'].includes(row.reason)));
    assert.doesNotMatch(JSON.stringify(result.binding),/PRIVATE|Different caller view/);
  }
  const failed=await collectPublishedCatalogBinding(templates(),{userIds:users,absentId,read:async()=>{throw new Error('PROVIDER_SECRET_TOKEN');}});
  assert.ok(failed.binding.unavailable.every(row=>row.reason==='catalog_read_unavailable'));assert.doesNotMatch(JSON.stringify(failed.binding),/SECRET/);
});

test('the absent probe must actually be absent and never silently selects a replacement ID',async()=>{
  const probe=offering(absentId),result=await collect(templates(),reader([offering(),probe]));
  assert.deepEqual(result.binding.unavailable.map(row=>row.caseId).sort(),['account:catalog-unfound','service:12-4:empty']);
  assert.ok(result.binding.unavailable.every(row=>row.reason==='absent_probe_not_empty'));
  assert.equal(result.cases.length,7);
});

test('both exact published queries and full row contents are rechecked; changed facts, revisions or expectations fail before model',async()=>{
  const result=await collect(),target=result.cases.find(row=>row.id==='account:catalog-known-fields'),binding=result.bound.get(target.id),normal=reader();
  assert.match(await verifyPublishedCatalogBinding(target,binding,{userIds:users,read:normal.read}),/^[a-f0-9]{64}$/);
  assert.equal(normal.calls.length,4);
  for(const mutate of [value=>{if(value.row)value.row.instructor='Changed teacher';return value;},value=>{if(value.row)value.row.version++;return value;},value=>{if(value.revision)value.revision='b'.repeat(32);return value;},value=>{if(value.row)value.row.syllabus.objectives='Changed objective';return value;}]){
    await assert.rejects(verifyPublishedCatalogBinding(target,binding,{userIds:users,read:reader([offering()],{mutate}).read}),{code:'fixture-catalog'});
  }
  const changed=structuredClone(target);changed.expected.facts[0].values=['FORGED'];
  await assert.rejects(verifyPublishedCatalogBinding(changed,binding,{userIds:users,read:normal.read}),{code:'fixture-catalog'});
  assert.ok(!JSON.stringify(binding).includes('token'));
});

test('source case arrays and caller IDs are captured before deferred public reads',async()=>{
  const cases=templates(),ids=[...users],r=reader();let mutated=false;
  const result=await collectPublishedCatalogBinding(cases,{userIds:ids,absentId,read:async(...args)=>{
    if(!mutated){mutated=true;ids[1]=evalId(999);cases[0].question='FORGED QUESTION';cases[0].id='forged';}return r.read(...args);
  }});
  assert.ok(result.cases.some(row=>row.id==='account:catalog-known-fields'));assert.ok(r.calls.every(call=>users.includes(call.userId)));assert.doesNotMatch(JSON.stringify(result.cases),/FORGED/);
  await assert.rejects(collectPublishedCatalogBinding([{id:'unknown',fixtureRequirement:'published_catalog_binding'}],{userIds:users,absentId,read:r.read}),{code:'fixture-schema'});
});

test('published reader uses own JWT, exact public scope and bounded JSON; admin/private origins are never derived from input',async()=>{
  const calls=[],user={id:EVAL_USER_ID,token:'SYNTHETIC_PRIVATE_TOKEN'};
  const result=await readPublishedCatalogFixture(user,query,{origin:'https://synthetic.invalid',fetchImpl:async(url,init)=>{
    calls.push({url,init});return new Response(JSON.stringify(page([offering()])),{headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(result.rows.length,1);assert.equal(calls[0].url.pathname,'/api/affairs-data');assert.equal(calls[0].url.searchParams.get('scope'),'syllabus-search');assert.equal(calls[0].init.headers.Authorization,'Bearer SYNTHETIC_PRIVATE_TOKEN');assert.equal(calls[0].init.redirect,'error');
  for(const invalid of [{scope:'catalog'},{scope:'syllabus-detail',id:offering().id,user_id:EVAL_OTHER_USER_ID},{scope:'syllabus-detail',id:'https://foreign.invalid'}])await assert.rejects(readPublishedCatalogFixture(user,invalid,{origin:'https://synthetic.invalid',fetchImpl:async()=>{throw new Error('Must not fetch');}}),error=>error.catalogReason==='published_payload_invalid');
  for(const fetchImpl of [async()=>new Response('SECRET',{status:500}),async()=>new Response('PRIVATE',{headers:{'Content-Type':'application/json'}}),async()=>new Response(JSON.stringify({x:'x'.repeat(2_000_001)}),{headers:{'Content-Type':'application/json'}})])await assert.rejects(readPublishedCatalogFixture(user,query,{origin:'https://synthetic.invalid',fetchImpl}),error=>! /SECRET|PRIVATE/.test(error.message));
  assert.throws(()=>validatePublishedCatalogFixture(query,{...page([offering()]),revision:'invalid'}));
});

const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ');};

test('actual forCase bypasses all fixture mutations for catalog-only cases and refuses unbound catalog cases',async()=>{
  const result=await collect(),testCase=result.cases.find(row=>row.id==='account:catalog-known-fields'),binding=result.bound.get(testCase.id),usersWithTokens=users.map(id=>({id,token:'TOKEN',studentId:evalId(10)}));
  const state={prepared:true,now:'2026-11-13T02:00:00Z',origin:'https://synthetic.invalid',current:null,users:usersWithTokens,supplementalTables:new Set(),catalogBindings:result.bound};
  let reads=0,saves=0,writes=0;
  const context={nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,isElearningPublishedReadbackCase,state,ready:()=>state,fixtureForCase,assertSupported:()=>{},readNativeBindings:async()=>{writes++;throw new Error('Must not bind private native rows.');},recordsToInsert:()=>{writes++;},persistSnapshot:async()=>{writes++;},planSupplementalFixture:()=>({domains:[]}),readSnapshot:async()=>({profile:{userId:EVAL_USER_ID}}),verifyReadback:()=>{throw new Error('Catalog-only snapshots are not private golden fixtures.');},verifyNativeFixtureReadback:()=>{},SUPPLEMENTAL_SCOPES:{},SUPPLEMENTAL_TABLES:{},readSupplementalFixtureScopes:async()=>({}),verifySupplementalFixtureReadback:()=>true,ownState:x=>x,hash:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),saveLedger:async()=>{saves++;},verifyPublishedCatalogBinding:async(row,saved)=>{assert.equal(row.id,testCase.id);assert.equal(saved,binding);reads++;return 'digest';},readPublishedCatalogFixture:async()=>{throw new Error('Not used by injected verifier');},fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  const forCase=vm.runInNewContext(section('export async function forCase(','/** Deliberately')+'\nforCase;',context);
  assert.equal((await forCase(testCase)).token,'TOKEN');assert.equal(writes,0);assert.equal(reads,1);assert.equal(saves,1);
  state.current=null;state.catalogBindings=new Map();await assert.rejects(forCase(testCase),{code:'fixture-unsupported'});assert.equal(writes,0);assert.equal(reads,1);
});
