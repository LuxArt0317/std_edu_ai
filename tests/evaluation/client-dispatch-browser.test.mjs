import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {bindNativeBrowserCases,createNativeBrowserObserver,gradeNativeBrowserCase,nativeBrowserDiagnostic,
  nativeEvidenceDigest,projectNativeBrowserRead,runNativeBrowserAcceptance,validateNativeBrowserTarget,validateNativeFixtureAdapter} from '../integration/assistant-client-dispatch-browser.mjs';
import {readElearningOutline} from '../../server/elearning.js';

const revision='a'.repeat(40),runId='10000000-0000-4000-8000-000000000001';
const userA='10000000-0000-4000-8000-000000000002',userB='10000000-0000-4000-8000-000000000003';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now='2026-11-15T02:00:00.000Z',token='only-in-memory-synthetic-token';
function fixture(){return {runId,projectRef:'xiftudmvxphxcjtmfmib',sourceRevision:revision,owners:{
  A:{userId:userA,aid:{salary:[{id:id(1),payment_period:'Synthetic period A',net:50.2,tax:0},{id:id(2),payment_period:'Synthetic period B',net:null,tax:null}],claims:[{id:id(3),reason:'Synthetic claim A'}]},
    workspace:{userId:userA,categories:[],notices:[],courses:[{id:9718,title:'Synthetic enrollment A'},{id:9999,title:'Unenrolled catalog course'}],enrollments:[{courseId:9718,joinedAt:now}]},
    outline:{userId:userA,courseId:9408,sections:[{position:1,title:'Synthetic topic',activities:[{id:293395,title:'Synthetic video',kind:'url',purpose:'video'},{id:293399,title:'Synthetic attendance link',kind:'attendanceregister',purpose:'attendance'}]}]}},
  B:{userId:userB,aid:{salary:[{id:id(4),payment_period:'Foreign synthetic period',net:999,tax:3}],claims:[]},
    workspace:{userId:userB,categories:[],notices:[],courses:[{id:9718,title:'Synthetic enrollment A'}],enrollments:[]},outline:{userId:userB,courseId:9408,sections:[]}},
}};}
function bound(){return bindNativeBrowserCases(fixture());}
const byId=(suffix,bank=bound())=>bank.cases.find(row=>row.id==='client-live:'+suffix);
function readEvent(testCase){return {caseId:testCase.id,ownerKey:testCase.ownerKey,sourceRevision:revision,bindingDigest:testCase.bindingDigest,
  method:'GET',path:'/api/affairs-data',scope:testCase.scope,query:testCase.query,authMatches:true,status:200,readState:'ok',
  projectionDigest:nativeEvidenceDigest(testCase.expected)};}
function result(testCase,answer,links=[testCase.route]){return {caseId:testCase.id,sourceRevision:revision,bindingDigest:testCase.bindingDigest,
  answer,links,observations:[readEvent(testCase)],saved:true,reloaded:true,activityExpanded:true};}
function request(path,method='GET',auth=token){return {url:()=> 'https://stu.best'+path,method:()=>method,headers:()=>({authorization:'Bearer '+auth})};}
function response(req,body,status=200){return {request:()=>req,status:()=>status,headers:()=>({'content-type':'application/json'}),body:async()=>Buffer.from(JSON.stringify(body))};}

test('binding preserves independently owned facts, exact ten cases and immutable revision-bound oracles',()=>{
  const input=fixture(),before=structuredClone(input),bank=bindNativeBrowserCases(input);
  assert.deepEqual(input,before);assert.equal(bank.cases.length,10);assert.equal(new Set(bank.cases.map(row=>row.id)).size,10);
  assert.ok(bank.cases.every(row=>row.modelAcceptance===false&&row.layer==='browser-client-dispatch'));
  assert.deepEqual(byId('elearning-own',bank).expected.enrollments,[{courseId:9718,title:'Synthetic enrollment A',joinedAt:now}]);
  assert.equal(byId('aid-own-count',bank).expected.total,2);assert.equal(byId('aid-other-own-count',bank).expected.total,1);
  assert.ok(Object.isFrozen(bank.binding.owners.A));input.owners.A.aid.salary.pop();assert.equal(byId('aid-own-count',bank).expected.total,2);
  const changed=fixture();changed.owners.A.aid.salary[0].net=51;assert.notEqual(bindNativeBrowserCases(changed).bindingDigest,bank.bindingDigest);
  for(const mutate of [value=>{value.owners.B.userId=userA;},value=>{value.owners.A.workspace.userId=userB;},
    value=>{value.owners.B.aid.salary.push({id:id(5)});},value=>{value.owners.B.aid.claims.push({id:id(6)});},
    value=>{value.owners.A.workspace.courses=[];},value=>{value.sourceRevision='unknown';},value=>{value.projectRef='foreign';}]){
    const value=fixture();mutate(value);assert.throws(()=>bindNativeBrowserCases(value));
  }
});

test('native projections reject foreign owners, missing joins, wrong selectors and ambiguous duplicate rows',()=>{
  assert.deepEqual(projectNativeBrowserRead('aid-payments',{view:'salary',page:'1',summary:'1'},{userId:userA,view:'salary',total:0,rows:[]},userA),{scope:'aid-payments',view:'salary',total:0});
  assert.throws(()=>projectNativeBrowserRead('aid-payments',{view:'salary',page:'1',summary:'1'},{userId:userB,view:'salary',total:0,rows:[]},userA));
  assert.throws(()=>projectNativeBrowserRead('aid-payments',{view:'salary',page:'2',summary:'1'},{userId:userA,view:'salary',total:0,rows:[]},userA));
  assert.throws(()=>projectNativeBrowserRead('aid-payments',{view:'salary',page:'1',summary:'1'},{userId:userA,view:'salary',total:1,rows:[{id:id(1)}]},userA));
  const value=fixture().owners.A.workspace;value.courses=[];assert.throws(()=>projectNativeBrowserRead('elearning-workspace',{},value,userA));
  const duplicate=fixture().owners.A.outline;duplicate.sections[0].activities.push(duplicate.sections[0].activities[0]);
  assert.throws(()=>projectNativeBrowserRead('elearning-course-outline',{course:'9408'},duplicate,userA));
});

test('real request/response event correlation excludes bootstrap and unfinished responses, without exposing secrets',async()=>{
  const page=new EventEmitter(),testCase=byId('aid-own-count'),observer=createNativeBrowserObserver({page,ownerKey:'A',userId:userA,authorizationToken:token,sourceRevision:revision,bindingDigest:testCase.bindingDigest});
  const path='/api/affairs-data?scope=aid-payments&view=salary&page=1&summary=1';
  const bootstrap=request(path);page.emit('request',bootstrap);observer.begin(testCase);
  page.emit('response',response(bootstrap,{userId:userA,view:'salary',total:99,rows:[]}));
  const req=request(path);page.emit('request',req);page.emit('response',response(req,{userId:userA,view:'salary',total:2,rows:[]}));
  const rows=await observer.end();assert.equal(rows.length,1);assert.equal(rows[0].readState,'ok');assert.equal(rows[0].projection.total,2);
  assert.equal(JSON.stringify(rows).includes(token),false);assert.equal(JSON.stringify(rows).includes('Bearer'),false);
  assert.deepEqual(rows[0].diagnostic,{method:'GET',path:'/api/affairs-data',status:200,scope:'aid-payments'});observer.close();
});

test('an actual failed or foreign response cannot become own empty evidence',async()=>{
  for(const variant of ['foreign','failed','incomplete']){
    const page=new EventEmitter(),testCase=byId('aid-empty'),observer=createNativeBrowserObserver({page,ownerKey:'B',userId:userB,authorizationToken:token,sourceRevision:revision,bindingDigest:testCase.bindingDigest});
    observer.begin(testCase);const req=request('/api/affairs-data?scope=aid-payments&view=claims&page=1&summary=1');page.emit('request',req);
    if(variant!=='incomplete')page.emit('response',response(req,{userId:variant==='foreign'?userA:userB,view:'claims',total:0,rows:[]},variant==='failed'?503:200));
    const rows=await observer.end();const envelope=result(testCase,'Your stu.best account has 0 saved student aid claim records.');envelope.observations=rows;
    assert.ok(gradeNativeBrowserCase(testCase,envelope).failures.includes('network.bound-read'));observer.close();
  }
});

test('valid native counts require exact own evidence, local links and persisted expandable activity',()=>{
  const testCase=byId('aid-own-count'),good=result(testCase,'Your stu.best account has 2 saved student salary records.');
  assert.equal(gradeNativeBrowserCase(testCase,good).passed,true);
  for(const mutate of [value=>{value.observations=[];},value=>{value.observations[0].projectionDigest='b'.repeat(64);},value=>{value.observations[0].authMatches=false;},
    value=>{value.links=[];},value=>{value.answer='Your stu.best account has 1 saved student salary record.';},value=>{value.sourceRevision='b'.repeat(40);},
    value=>{value.saved=false;},value=>{value.reloaded=false;},value=>{value.activityExpanded=false;}]){
    const candidate=structuredClone(good);mutate(candidate);assert.equal(gradeNativeBrowserCase(testCase,candidate).passed,false);
  }
  const leaked=result(testCase,'Your stu.best account has 2 saved student salary records.');
  leaked.observations.push({...readEvent(testCase),path:'/api/research-assistant',method:'POST'});
  assert.ok(gradeNativeBrowserCase(testCase,leaked).failures.includes('network.native-only'));
  assert.ok(gradeNativeBrowserCase(testCase,result(testCase,'Your stu.best account has 2 saved student salary records. There are 1 saved student salary records.')).failures.includes('facts.owned-count'));
  assert.ok(gradeNativeBrowserCase(testCase,result(testCase,'Your stu.best account has 2 saved student salary records. Foreign synthetic period.')).failures.includes('privacy.foreign-fields'));
});

test('current first-match outputs fail multipart completeness instead of receiving a fake verified pass',()=>{
  const aid=byId('aid-multipart');
  const firstOnly=result(aid,'Your stu.best account has 2 saved student salary records.');
  assert.deepEqual(gradeNativeBrowserCase(aid,firstOnly).failures,['parts.net-pay-and-tax']);
  firstOnly.answer+=' This read is limited to the count; net pay and tax are not included.';
  const partial=gradeNativeBrowserCase(aid,firstOnly);assert.equal(partial.passed,true);assert.equal(partial.capabilityGap,true);assert.equal(partial.modelAcceptance,false);
  const course=byId('elearning-multipart'),links=[course.route,'/elearning/course/9408/activity/293395'];
  const videos=result(course,'Activities listed in this course outline: Synthetic video',links);
  assert.deepEqual(gradeNativeBrowserCase(course,videos).failures,['parts.attendance-limit']);
  videos.answer+=' Your provider attendance records are not linked.';assert.equal(gradeNativeBrowserCase(course,videos).passed,true);
});

test('catalog entries cannot become enrollment and outline permission denial cannot become an empty catalog',()=>{
  const own=byId('elearning-own');
  assert.equal(gradeNativeBrowserCase(own,result(own,'Your stu.best remote-learning Moodle courses: Synthetic enrollment A',[own.route,'/elearning/course/9718'])).passed,true);
  assert.equal(gradeNativeBrowserCase(own,result(own,'Your stu.best remote-learning Moodle courses: Synthetic enrollment A Unenrolled catalog course',[own.route,'/elearning/course/9718','/elearning/course/9999'])).passed,false);
  const empty=byId('elearning-empty');assert.equal(gradeNativeBrowserCase(empty,result(empty,'Your stu.best account has no remote-learning Moodle enrollments.')).passed,true);
  const denied=byId('elearning-denied');assert.equal(gradeNativeBrowserCase(denied,result(denied,'This course outline is unavailable to your account.')).passed,true);
  assert.equal(gradeNativeBrowserCase(denied,result(denied,'There are no course activities.')).passed,false);
});

test('a foreign-owner question cannot be answered by silently substituting the caller count',()=>{
  const foreign=byId('aid-foreign'),actual=result(foreign,'Your stu.best account has 2 saved student salary records.');
  const failed=gradeNativeBrowserCase(foreign,actual);assert.ok(failed.failures.includes('privacy.unnecessary-own-read'));assert.ok(failed.failures.includes('privacy.own-answer-substitution'));
  const denied=result(foreign,'I cannot access another student account’s salary records.');denied.observations=[];
  assert.equal(gradeNativeBrowserCase(foreign,denied).passed,true);
  denied.answer+=' Their net salary is 999 for Foreign synthetic period.';
  assert.ok(gradeNativeBrowserCase(foreign,denied).failures.includes('privacy.foreign-fields'));
  denied.answer='I cannot access another student account’s salary records. Their net salary is 999.';
  assert.ok(gradeNativeBrowserCase(foreign,denied).failures.includes('privacy.foreign-numbers'));
  denied.answer='I cannot access another student account’s salary records. Their net pay is 999.00.';
  assert.ok(gradeNativeBrowserCase(foreign,denied).failures.includes('privacy.foreign-numbers'));
});

test('outline projection matches actual native missing/link purposes and successful denied-account RPC shape',async()=>{
  const saved=globalThis.fetch;
  try{
    const base=fixture().owners.A.outline;
    base.sections[0].activities.push({id:293396,title:'Native missing purpose',kind:'url'},
      {id:293397,title:'Native general link',kind:'url',purpose:'link'});
    let body=base;
    globalThis.fetch=async(url,options)=>{assert.equal(url,'https://example.invalid/rest/v1/rpc/elearning_course_outline');
      assert.equal(options.method,'POST');return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});};
    const account={url:'https://example.invalid',key:'synthetic',token:'synthetic',user:{id:userA}};
    const native=await readElearningOutline(account,{scope:'elearning-course-outline',course:'9408'});
    const projection=projectNativeBrowserRead('elearning-course-outline',{course:'9408'},native,userA);
    assert.deepEqual(projection.sections[0].activities.map(row=>row.purpose),['video','attendance','link','link']);
    assert.equal(projection.sections[0].activities.filter(row=>row.purpose==='video').length,1);
    body={userId:userB,courseId:9408,sections:[]};
    const denied=await readElearningOutline({...account,user:{id:userB}},{scope:'elearning-course-outline',course:'9408'});
    assert.deepEqual(projectNativeBrowserRead('elearning-course-outline',{course:'9408'},denied,userB).sections,[]);
    base.sections[0].activities[0].purpose='other';body=base;
    await assert.rejects(readElearningOutline(account,{scope:'elearning-course-outline',course:'9408'}));
  }finally{globalThis.fetch=saved;}
});

test('diagnostics allowlist removes query/header/body data and the harness fails before provider setup on invalid guards',async()=>{
  const req=request('/api/affairs-data?scope=aid-payments&token=SECRET&email=PRIVATE');
  assert.deepEqual(nativeBrowserDiagnostic(req,503),{method:'GET',path:'/api/affairs-data',status:503,scope:'aid-payments'});
  assert.equal(nativeBrowserDiagnostic(request('/unknown?secret=value'),200),null);
  assert.throws(()=>validateNativeBrowserTarget({origin:'http://localhost',sourceRevision:revision}));
  assert.throws(()=>validateNativeFixtureAdapter({kind:'independent-native-browser-fixture-v1'}));
  let prepare=0;
  const adapter={kind:'independent-native-browser-fixture-v1',prepare(){prepare++;},session(){},beforeCase(){},afterCase(){},recordConversationIntent(){},settleConversation(){},verifyConversation(){},fence(){},clearSessions(){},quiesce(){},cleanup(){}};
  await assert.rejects(runNativeBrowserAcceptance({origin:'https://stu.best',sourceRevision:revision,fixtureAdapter:adapter,readRelease:async()=> 'b'.repeat(40)}));
  assert.equal(prepare,0);
});

test('failed setup clears sessions before cleanup and never converts mocked execution into live eligibility',async()=>{
  const calls=[];
  const adapter={kind:'independent-native-browser-fixture-v1',prepare(){calls.push('prepare');throw new Error('private raw provider error');},
    session(){},beforeCase(){},afterCase(){},recordConversationIntent(){},settleConversation(){},verifyConversation(){},
    fence(){calls.push('fence');return {fenced:true};},clearSessions(){calls.push('clear');},quiesce(){calls.push('quiesce');return {fenced:true,drained:true,unresolved:0};},
    cleanup(){calls.push('cleanup');return {verified:true,remainingRows:0,protectedOwnerUnchanged:true};}};
  const report=await runNativeBrowserAcceptance({origin:'https://stu.best',sourceRevision:revision,fixtureAdapter:adapter,readRelease:async()=>revision});
  assert.deepEqual(calls,['prepare','fence','clear','quiesce','cleanup']);assert.equal(report.status,'failed');assert.equal(report.executedCases,0);
  assert.equal(report.liveEligible,false);assert.equal(report.modelAcceptance,false);assert.equal(report.cleanupVerified,true);
  assert.equal(JSON.stringify(report).includes('private raw'),false);
});

test('a timed-out prepare cannot claim cleanup success while its underlying mutation is still pending',async()=>{
  const calls=[];let release,closed=false,lateMutation=false,observedSignal;
  const gate=new Promise(resolve=>{release=resolve;});
  const adapter={kind:'independent-native-browser-fixture-v1',async prepare({signal}){calls.push('prepare');observedSignal=signal;await gate;
      if(!closed&&!signal.aborted)lateMutation=true;throw new Error('Late canceled fixture setup');},
    session(){},beforeCase(){},afterCase(){},recordConversationIntent(){},settleConversation(){},verifyConversation(){},
    fence(){closed=true;calls.push('fence');return {fenced:true};},clearSessions(){calls.push('clear');},
    quiesce(){calls.push('quiesce');return {fenced:true,drained:true,unresolved:0};},cleanup(){calls.push('cleanup');return {verified:true,remainingRows:0,protectedOwnerUnchanged:true};}};
  const report=await runNativeBrowserAcceptance({origin:'https://stu.best',sourceRevision:revision,fixtureAdapter:adapter,readRelease:async()=>revision,timeouts:{prepareMs:5,drainMs:5}});
  assert.equal(report.cleanupVerified,false);assert.equal(report.pendingAdapterOperations,1);assert.equal(observedSignal.aborted,true);
  assert.deepEqual(calls,['prepare','fence','clear']);assert.ok(report.diagnostics.includes('fixture-recovery-required'));
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(lateMutation,false);
});

test('unresolved remote outcomes and an asynchronous fence prohibit destructive cleanup',async()=>{
  for(const asynchronous of [false,true]){
    let deleted=false;
    const adapter={kind:'independent-native-browser-fixture-v1',prepare(){throw new Error('uncertain remote mutation');},session(){},beforeCase(){},afterCase(){},
      recordConversationIntent(){},settleConversation(){},verifyConversation(){},fence(){return asynchronous?Promise.resolve({fenced:true}):{fenced:true};},
      clearSessions(){},quiesce(){return {fenced:true,drained:true,unresolved:1};},cleanup(){deleted=true;return {verified:true,remainingRows:0,protectedOwnerUnchanged:true};}};
    const report=await runNativeBrowserAcceptance({origin:'https://stu.best',sourceRevision:revision,fixtureAdapter:adapter,readRelease:async()=>revision});
    assert.equal(deleted,false);assert.equal(report.cleanupVerified,false);
  }
});

test('runner observes actual Playwright events and never fulfills fake browser reads or executes on import',async()=>{
  const source=await readFile(new URL('../integration/assistant-client-dispatch-browser.mjs',import.meta.url),'utf8');
  assert.match(source,/page\.on\('request',onRequest\)/);assert.match(source,/page\.on\('response',onResponse\)/);
  assert.doesNotMatch(source,/route\.fulfill\s*\(/);assert.doesNotMatch(source,/mockAffairsAuth/);
  assert.match(source,/observer\.begin\(testCase\);await dialog\.getByRole/);
  assert.match(source,/await invoke\('recordConversationIntent'[\s\S]+?await route\.continue/);
  assert.match(source,/adapter\.clearSessions\(\)[\s\S]+?adapter\.cleanup/);
});
