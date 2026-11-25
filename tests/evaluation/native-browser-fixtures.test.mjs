import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNativeBrowserFixturePlan,validateNativeBrowserPublished,nativeBrowserPublishedSelection,
  verifyNativeBrowserFixtureReadback,readNativeBrowserFixture,assertNativeBrowserOwnedTargets,
  verifyNativeBrowserCleanupProof,nativeBrowserLifecycleRequirements} from './native-browser-fixtures.mjs';
import {bindNativeBrowserCases} from '../integration/assistant-client-dispatch-browser.mjs';

const id=n=>'11111111-1111-4111-a111-'+String(n).padStart(12,'0');
const runId=id(1),revision='a'.repeat(40),now='2026-11-15T02:00:00.000Z';
const owners={A:{id:id(2),email:'browser-a@example.invalid',runMarker:runId},B:{id:id(3),email:'browser-b@example.invalid',runMarker:runId}};
const copy=value=>structuredClone(value);
function published(){return {selection:copy(nativeBrowserPublishedSelection),
  categories:[{id:17,parent_id:null,title:'Training',source_count:null,position:1},
    {id:18,parent_id:17,title:'Personnel',source_count:9,position:2},{id:41,parent_id:17,title:'Academic Affairs',source_count:20,position:3}],
  courses:[{id:9408,category_id:18,title:'Safety workshop',self_enroll:false,position:8},
    {id:9718,category_id:41,title:'Remote learning workshop',self_enroll:true,position:9},
    {id:9719,category_id:41,title:'Unenrolled public workshop',self_enroll:false,position:10}],
  notices:[{id:10,kind:'page',title:'Public teaching notice',local_body:null,position:1}],
  sections:[{course_id:9408,position:1,title:'Course topic'}],
  activities:[{id:293399,course_id:9408,section_position:1,position:1,kind:'attendanceregister',title:'Attendance link',purpose:'attendance'},
    {id:293395,course_id:9408,section_position:1,position:2,kind:'url',title:'First video',purpose:'video'},
    {id:293396,course_id:9408,section_position:1,position:3,kind:'url',title:'Second video',purpose:'video'}],
};}
function inputs(){return {runId,sourceRevision:revision,owners:copy(owners),now,published:published()};}
const plan=()=>buildNativeBrowserFixturePlan(inputs());
function readback(value){return {published:copy(value.published),owners:Object.fromEntries(['A','B'].map(key=>{
  const own=value.aid.expectedByOwner[value.owners[key].id];return [key,{salary:copy(own.salary),claims:copy(own.claims),
    salarySummary:{userId:value.owners[key].id,view:'salary',total:own.salary.total,rows:[]},
    claimsSummary:{userId:value.owners[key].id,view:'claims',total:own.claims.total,rows:[]},
    workspace:copy(value.binding.owners[key].workspace),outline:copy(value.binding.owners[key].outline)}];
}))};}
function targets(value){return {identities:Object.values(copy(value.owners)),rows:Object.fromEntries(Object.entries(value.rows).map(([table,rows])=>
  [table,table.startsWith('affairs_aid_')?rows.map(({id,user_id})=>({id,user_id})):copy(rows)]))};}
function proof(value){return {runId,projectRef:'xiftudmvxphxcjtmfmib',planDigest:value.planDigest,fenced:true,drained:true,sessionsCleared:true,
  unresolved:0,ledgerOwned:true,leaseHeld:true,protectedOwnerUnchanged:true,sharedPublished:copy(value.published),
  aidCleanup:{identities:Object.values(copy(value.owners)),remainingByTable:Object.fromEntries(Object.values(value.aid.tables).map(table=>
    [table,Object.values(value.owners).map(owner=>({userId:owner.id,count:0}))]))},
  remaining:Object.fromEntries(['A','B'].map(key=>[key,{userId:value.owners[key].id,auth:0,enrollments:0,courseAccess:0,conversations:0,storageObjects:0}]))};}
function transport(value,options={}){
  const data=readback(value),calls=[];
  return {calls,readPublished:async selection=>{calls.push({public:selection});return options.published?.(calls)??copy(data.published);},
    readOwned:async request=>{
      calls.push(copy(request));options.onRead?.(request);
      const q=request.query,name=q.scope==='aid-payments'?q.view+(q.summary==='1'?'Summary':''):q.scope==='elearning-workspace'?'workspace':'outline';
      assert.equal(request.userId,value.owners[request.ownerKey].id);assert.equal(request.path,'/api/affairs-data');
      return options.response?.(request)??{status:200,body:copy(data.owners[request.ownerKey][name])};
    }};
}

test('composes the independent aid fixture with distinct enrollment and outline-access rows',()=>{
  const input=inputs(),before=copy(input),value=buildNativeBrowserFixturePlan(input);
  assert.deepEqual(input,before);assert.equal(value.liveAdapterReady,false);assert.equal(value.targetLayer,'browser-client-dispatch-baseline');
  assert.deepEqual(value.rows.elearning_enrollments,[{user_id:owners.A.id,course_id:9718,joined_at:now}]);
  assert.deepEqual(value.rows.elearning_course_access,[{course_id:9408,user_id:owners.A.id,created_at:now}]);
  assert.equal(value.binding.owners.A.aid.salary.length,2);assert.equal(value.binding.owners.B.aid.salary.length,1);
  assert.equal(value.binding.owners.B.aid.claims.length,0);assert.equal(value.binding.owners.A.aid.salary[0].net,5400);
  assert.deepEqual(value.binding.owners.A.workspace.enrollments,[{courseId:9718,joinedAt:now}]);
  assert.deepEqual(value.binding.owners.B.workspace.enrollments,[]);assert.deepEqual(value.binding.owners.B.outline.sections,[]);
  assert.equal(value.binding.owners.A.outline.sections[0].activities[0].purpose,'attendance');
  const bank=bindNativeBrowserCases(value.binding);assert.equal(bank.cases.length,10);assert.equal(bank.bindingDigest,value.bindingDigest);
  assert.deepEqual(bank.cases.find(row=>row.id==='client-live:elearning-own').expected.enrollments,
    [{courseId:9718,title:'Remote learning workshop',joinedAt:now}]);
  assert.ok(Object.isFrozen(value.rows.elearning_enrollments[0]));input.owners.A.id=id(9);input.published.courses[1].title='Changed';
  assert.equal(value.owners.A.id,owners.A.id);assert.equal(value.published.courses[1].title,'Remote learning workshop');
});

test('rejects foreign/ambiguous owners, credentials and invalid revision before generating any plan',()=>{
  for(const mutate of [x=>{x.owners.B.id=x.owners.A.id;},x=>{x.owners.A.runMarker=id(99);},x=>{x.owners.A.email='real@example.com';},
    x=>{x.owners.A.token='do-not-copy';},x=>{x.sourceRevision='unknown';},x=>{x.now='not-time';}]){
    const input=inputs();mutate(input);assert.throws(()=>buildNativeBrowserFixturePlan(input));
  }
});

test('published selection is fixed and bounded; missing/duplicate/malformed records are setup failures',()=>{
  for(const mutate of [x=>{x.selection.courses.where.or_ids.push(123);},x=>{x.courses=x.courses.filter(row=>row.id!==9718);},
    x=>{x.courses.find(row=>row.id===9718).self_enroll=false;},x=>{x.courses.push(copy(x.courses[0]));},
    x=>{x.activities[0].kind='url';},x=>{x.activities[1].purpose='attendance';},x=>{x.activities[0].section_position=2;},
    x=>{x.sections.push(copy(x.sections[0]));},x=>{x.activities=[];},x=>{x.categories[0].parent_id=999;},
    x=>{x.notices[0].local_body='界'.repeat(128000);},x=>{x.extra='unexpected';}]){
    const value=published();mutate(value);assert.throws(()=>validateNativeBrowserPublished(value));
  }
});

test('plans contain no shared writes and match native migration columns/composite ownership keys',async()=>{
  const value=plan();assert.deepEqual(Object.keys(value.rows).sort(),['affairs_aid_payment_claims','affairs_aid_salary_records','elearning_course_access','elearning_enrollments']);
  const base=await readFile(new URL('../../supabase/migrations/20261115010000_remote_learning.sql',import.meta.url),'utf8');
  const outline=await readFile(new URL('../../supabase/migrations/20261115030000_elearning_course_outlines.sql',import.meta.url),'utf8');
  assert.match(base,/create table public\.elearning_enrollments[\s\S]*?primary key\(user_id,course_id\)/u);
  assert.match(outline,/create table public\.elearning_course_access[\s\S]*?primary key \(course_id,user_id\)/u);
  assert.match(outline,/jsonb_build_object\('userId',caller,'courseId',p_course_id,'sections',sections\)/u);
  for(const table of ['elearning_enrollments','elearning_course_access'])assert.ok(value.rows[table].every(row=>row.user_id===owners.A.id));
  assert.equal(nativeBrowserLifecycleRequirements.ready,false);
  assert.ok(nativeBrowserLifecycleRequirements.requiredSeam.includes('clear-all-session-secrets-before-cleanup-io'));
});

test('full independent A/B readbacks include null, zero, foreign sentinels and canonical timestamp equivalence',()=>{
  const value=plan(),input=readback(value);input.owners.A.workspace.enrollments[0].joinedAt='2026-11-15T10:00:00+08:00';
  const result=verifyNativeBrowserFixtureReadback(value,input);
  assert.equal(result.verified,true);assert.equal(result.bindingDigest,value.bindingDigest);
  assert.equal(input.owners.A.salary.rows[0].tax,0);assert.equal(input.owners.A.salary.rows[1].tax,null);
  assert.equal(input.owners.B.salary.rows[0].payment_period,'FOREIGN AID PERIOD');
});

test('counts alone never certify rows, no access remains distinct from catalog existence, and caller swapping fails',()=>{
  const value=plan();
  for(const mutate of [x=>{x.owners.A.salary.rows=[];},x=>{x.owners.A.salary.rows[0].net=0;},
    x=>{x.owners.A.salary.rows[1].tax=0;},x=>{x.owners.A.salarySummary.total=99;},x=>{x.owners.A.salary.userId=owners.B.id;},
    x=>{x.owners.A.workspace.enrollments=[];},x=>{x.owners.A.workspace.courses=x.owners.A.workspace.courses.filter(row=>row.id!==9718);},
    x=>{x.owners.B.workspace.enrollments=[{courseId:9718,joinedAt:now}];},x=>{x.owners.B.outline=copy(x.owners.A.outline);x.owners.B.outline.userId=owners.B.id;},
    x=>{x.owners.A.outline.sections[0].activities.pop();},x=>{x.owners.A.outline.sections[0].activities[0].purpose='link';},
    x=>{x.owners.A.workspace.courses[1].title='Drift';},x=>{x.owners.A.workspace.extra='ignored';},x=>{x.published.notices[0].title='Drift';}]){
    const input=readback(value);mutate(input);assert.throws(()=>verifyNativeBrowserFixtureReadback(value,input));
  }
});

test('tampered saved plans cannot expand read/delete scope or replace expected facts',()=>{
  const original=plan();for(const mutate of [x=>{x.rows.elearning_course_access[0].user_id=owners.B.id;},
    x=>{x.rows.auth_users=[{id:owners.A.id}];},x=>{x.binding.owners.A.aid.salary[0].net=999;},
    x=>{x.planDigest='0'.repeat(64);},x=>{x.liveAdapterReady=true;}]){
    const value=copy(original);mutate(value);assert.throws(()=>verifyNativeBrowserFixtureReadback(value,readback(original)));
  }
});

test('mocked reader executes only exact two-owner GET selectors and checks public baseline before and after',async()=>{
  const value=plan(),io=transport(value),result=await readNativeBrowserFixture(value,io);
  assert.equal(result.verified,true);assert.equal(io.calls.length,14);assert.deepEqual(io.calls[0].public,nativeBrowserPublishedSelection);
  assert.deepEqual(io.calls.at(-1).public,nativeBrowserPublishedSelection);
  for(const role of ['A','B']){
    const reads=io.calls.filter(row=>row.ownerKey===role);assert.equal(reads.length,6);
    assert.deepEqual(reads.map(row=>row.query),[{scope:'aid-payments',view:'salary',page:'1'},{scope:'aid-payments',view:'claims',page:'1'},
      {scope:'aid-payments',view:'salary',page:'1',summary:'1'},{scope:'aid-payments',view:'claims',page:'1',summary:'1'},
      {scope:'elearning-workspace'},{scope:'elearning-course-outline',course:'9408'}]);
  }
});

test('failed or malformed HTTP responses never become empty and stop further reads',async()=>{
  const value=plan();for(const response of [{status:503,body:{}},{status:403,body:{}},{status:200,body:null},{status:200,body:{},token:'secret'}]){
    const io=transport(value,{response:()=>response});await assert.rejects(readNativeBrowserFixture(value,io));assert.equal(io.calls.length,2);
  }
});

test('read-only deadline and cancellation bound hung transports without cleanup or mutation claims',async()=>{
  const value=plan();let calls=0;
  await assert.rejects(readNativeBrowserFixture(value,{readOwned:async()=>{calls++;},readPublished:()=>new Promise(()=>{})},{timeoutMs:10}),/read-aborted/u);
  assert.equal(calls,0);
  const controller=new AbortController();controller.abort();const io=transport(value);
  await assert.rejects(readNativeBrowserFixture(value,io,{signal:controller.signal}));assert.equal(io.calls.length,0);
});

test('mutable caller inputs cannot replace captured owners or facts after the first await',async()=>{
  const mutable=copy(plan()),expected=copy(mutable),io=transport(expected);let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const work=readNativeBrowserFixture(mutable,{...io,readPublished:async()=>{await pending;return copy(expected.published);}});
  mutable.owners.A.id=id(99);mutable.binding.owners.A.aid.salary[0].net=0;release();
  assert.equal((await work).verified,true);assert.ok(io.calls.filter(row=>row.ownerKey==='A').every(row=>row.userId===owners.A.id));
});

test('a published change during readback fails even if all personal rows still match',async()=>{
  const value=plan();let count=0;const io=transport(value,{published:()=>{const result=copy(value.published);if(++count===2)result.courses[1].title='Changed after read';return result;}});
  await assert.rejects(readNativeBrowserFixture(value,io),/published-drift/u);
});

test('cleanup targets require exact aid ownership plus exact composite e-learning rows',()=>{
  const value=plan();assert.equal(assertNativeBrowserOwnedTargets(value,targets(value)),true);
  for(const mutate of [x=>{x.identities[0].runMarker=id(99);},x=>{x.rows.elearning_enrollments[0].user_id=owners.B.id;},
    x=>{x.rows.elearning_enrollments.push({...x.rows.elearning_enrollments[0],course_id:9719});},
    x=>{x.rows.elearning_course_access[0].course_id=9098;},x=>{x.rows.elearning_course_access=[];},
    x=>{x.rows.affairs_aid_salary_records[0].id=id(99);},x=>{x.rows.auth_users=[];}]){
    const actual=targets(value);mutate(actual);assert.throws(()=>assertNativeBrowserOwnedTargets(value,actual));
  }
});

test('cleanup proof rejects unresolved writes, uncleared secrets, orphan rows, foreign owners and shared drift',()=>{
  const value=plan();const good=verifyNativeBrowserCleanupProof(value,proof(value));assert.equal(good.verified,true);
  assert.equal(good.scope,'provided-independent-proof-only');
  for(const mutate of [x=>{x.unresolved=1;},x=>{x.fenced=false;},x=>{x.drained=false;},x=>{x.sessionsCleared=false;},
    x=>{x.ledgerOwned=false;},x=>{x.leaseHeld=false;},x=>{x.protectedOwnerUnchanged=false;},x=>{x.runId=id(99);},
    x=>{x.projectRef='foreign';},x=>{x.remaining.A.auth=1;},x=>{x.remaining.B.storageObjects=1;},
    x=>{x.remaining.A.enrollments=1;},x=>{x.remaining.A.courseAccess=1;},x=>{x.remaining.A.conversations=1;},
    x=>{x.remaining.B.userId=owners.A.id;},x=>{x.sharedPublished.activities[1].title='Changed';},
    x=>{x.aidCleanup.identities[0].email='foreign@example.invalid';},x=>{x.aidCleanup.remainingByTable.affairs_aid_salary_records[0].count=1;}]){
    const actual=proof(value);mutate(actual);assert.throws(()=>verifyNativeBrowserCleanupProof(value,actual));
  }
});
