import {venueRunnerCases,assertNativeVenueCaseReady,nativeVenueSetupRequired} from './venue-native-runner.mjs';
import {assertNativeDtmCaseReady,nativeDtmRunnerCases,nativeDtmSetupRequired} from './dtm-native-runner.mjs';
import {accountStatusCases,accountStatusSetupRequired,assertAccountStatusCaseReady} from './account-status-cases.mjs';
import {learningEntryCases,learningEntrySetupRequired,assertLearningEntryCaseReady} from './learning-entry-cases.mjs';
import {campusEntryCases,campusEntrySetupRequired,assertCampusEntryCaseReady} from './campus-entry-cases.mjs';
import {assertClubEquipmentCaseReady,clubEquipmentSetupRequired} from './club-equipment-runner.mjs';
import {assertElearningCatalogCaseReady,elearningCatalogRunnerCases,elearningCatalogSetupRequired,gradeElearningCatalogCase,isElearningCatalogReadbackCase,isElearningMetadataCase,isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import {isNativeElearningEnrollmentCase} from './elearning-fixtures.mjs';
import {assertNativeInternshipCaseReady,internshipRunnerCases,nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {assertNativeStudentLeaveCaseReady,nativeStudentLeaveSetupRequired,studentLeaveRunnerCases} from './student-leave-runner.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {options,readReply,sourceIdentity,validateFixtureAdapter,deploymentIdentity,evaluationSuite,createLiveRequestPacer,validateCatalogCaseBinding,assertCatalogCaseBound,applyGuidanceReviews,assessRun,main,verifiedNativeBrowserObservation} from './run.mjs';
import {certificateAwardPreviewHash} from './certificate-award-preview.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {buildGuidanceReviewBinding} from './guidance-rubric.mjs';
import {buildPublicCases} from './public-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';
import {collectPublishedCatalogBinding} from './live-fixtures.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';
import {assertTeachingFeedbackCaseReady,gradeEvaluationCase} from './teaching-feedback-runner.mjs';
import {discoverSurfaces,readRouteLiteral} from './surface-inventory.mjs';

const event=(name,data,newline='\n')=>`event: ${name}${newline}data: ${JSON.stringify(data)}${newline}${newline}`;
const stream=text=>new Response(text,{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
const result={status:'answered',answer:'Synthetic reply',citations:[]};

async function mockedFetch(implementation,operation){
  const original=globalThis.fetch;
  globalThis.fetch=implementation;
  try{return await operation();}finally{globalThis.fetch=original;}
}

test('CLI rejects unknown modes, malformed limits, missing values and invalid dates',()=>{
  assert.equal(options([]).mode,'inventory');
  assert.equal(options(['--mode','live','--max-cases','3']).maxCases,3);
  for(const args of [['--unsafe','yes'],['--mode'],['--mode','--only','x'],['--mode','pretend'],['--max-cases','0'],['--max-cases','2.5'],['--max-cases','Infinity'],['--now','not-a-date']])assert.throws(()=>options(args),Error);
});
test('signed browser profiles require the protected non-injected live runner',async()=>{
  const origin='https://stdedu-aaabbb111-v1-d286.vercel.app';
  const args=['--mode','live','--origin',origin,'--approved-preview-origin',origin,'--preview-auth','oidc'];
  for(const profile of ['certificate-awards','announcement-email','student-profile','club-attendance','protected-native']){
    const flag=['--client-dispatch',profile];
    assert.equal(options([...args,...flag]).clientDispatch,profile);
    for(const invalid of [['--mode','inventory'],['--mode','live'],args.slice(0,-2)])assert.throws(()=>options([...invalid,...flag]));
    await assert.rejects(main([...args,...flag],{sourceIdentity:async()=>({dirty:false})}),/injected dependencies/u);
  }
  assert.throws(()=>options([...args,'--client-dispatch','arbitrary.json']));
});

test('announcement browser proof requires one forwarded native answer, paired readbacks and exact cleanup',async()=>{
  const {questions}=await discoverClientDispatchSurfaces();
  const question=questions.find(row=>row.id==='client:announcement-email:empty');
  const sourceRevision='a'.repeat(40),origin='https://stdedu-aaabbb111-v1-d286.vercel.app';
  const requestDigest='b'.repeat(64),responseDigest='c'.repeat(64);
  const evidence={stateDigest:'d'.repeat(64),callers:{A:{enabled:true},B:{enabled:false}}};
  const result={
    sourceRevision,origin,execution:'live-browser',dispatchProfile:'announcement-email',terminal:true,
    liveAcceptance:true,browserDispatchAcceptance:true,caseIds:[question.id],suiteDigest:certificateAwardPreviewHash([question]),boundSuiteDigest:'e'.repeat(64),
    deployment:{sourceRevision,origin,status:'finished',issued:6,completed:6},
    browserDiagnostics:[{observations:[{request:'announcement-email-answer',method:'GET',forwarded:true}]}],
    cleanup:{verified:true,createdUsers:2,protectedOwnerUnchanged:true,nativeBrowserCleanup:'announcement-email',conversationCleanup:{verified:true,conversationRows:0}},
    results:[{caseId:question.id,passed:true,requestDigest,responseDigest,native:{passed:true,requestDigest,responseDigest},
      browserTurn:{answerRequests:1,saveRequests:1},browserRestore:{restoreRequests:1},
      readback:{own:true,crossed:true,version:1,messageDigest:'f'.repeat(64)},before:structuredClone(evidence),after:structuredClone(evidence)}],
  };
  const verify=proof=>verifiedNativeBrowserObservation({result:proof,question,sourceRevision,origin,profile:'announcement-email'});
  assert.deepEqual({...verify(result),reportDigest:undefined},{id:question.id,dispatched:true,passed:true,cleanupVerified:true,
    reportDigest:undefined,requestDigest,responseDigest});
  for(const change of [
    proof=>{proof.browserDiagnostics[0].observations.push(proof.browserDiagnostics[0].observations[0]);},
    proof=>{proof.browserDiagnostics[0].observations[0].request='graph-assistant';},
    proof=>{proof.deployment.completed=5;},proof=>{proof.suiteDigest='0'.repeat(64);},
    proof=>{proof.results[0].after.callers.B.enabled=true;},proof=>{proof.results[0].readback.crossed=false;},
    proof=>{proof.cleanup.nativeBrowserCleanup='other';},proof=>{proof.cleanup.createdUsers=1;},
    proof=>{proof.cleanup.conversationCleanup.conversationRows=1;},
  ]){
    const altered=structuredClone(result);change(altered);assert.equal(verify(altered).passed,false);
  }
});

test('the aggregate runner requires exactly one Club Attendance graph POST and its scoped proof',async()=>{
  const {questions}=await discoverClientDispatchSurfaces();
  const question=questions.find(row=>row.id==='client:club-activity-attendance:multipart');
  const sourceRevision='a'.repeat(40),origin='https://stdedu-aaabbb111-v1-d286.vercel.app';
  const receipt='b'.repeat(64),requestDigest='c'.repeat(64),responseDigest='d'.repeat(64);
  const result={sourceRevision,origin,execution:'live-browser',terminal:true,modelAcceptance:false,
    liveAcceptance:true,browserDispatchAcceptance:true,caseIds:[question.id],suiteDigest:certificateAwardPreviewHash([question]),
    deployment:{sourceRevision,origin,status:'finished',issued:6,completed:6},
    browserDiagnostics:[{observations:[{request:'club-attendance-answer',method:'POST',forwarded:true}]}],
    cleanup:{verified:true,createdUsers:2,protectedOwnerUnchanged:true,clubAttendanceBrowserCleanup:true,
      conversationCleanup:{verified:true,conversationRows:0}},
    results:[{caseId:question.id,passed:true,proofDigest:receipt,scopeDigest:receipt,requestDigest,responseDigest,
      native:{passed:true,requestDigest,responseDigest},before:receipt,after:receipt,
      browserTurn:{answerRequests:1,saveRequests:1},browserRestore:{restoreRequests:1},
      readback:{own:true,crossed:true,version:1,messageDigest:receipt}}]};
  const verify=proof=>verifiedNativeBrowserObservation({result:proof,question,sourceRevision,origin,profile:'club-attendance'});
  assert.equal(verify(result).passed,true);
  for(const alter of [
    proof=>{proof.browserDiagnostics[0].observations.push(proof.browserDiagnostics[0].observations[0]);},
    proof=>{proof.browserDiagnostics[0].observations[0].method='GET';},
    proof=>{proof.deployment.issued=7;},proof=>{proof.results[0].proofDigest=null;},
    proof=>{proof.results[0].readback.crossed=false;},proof=>{proof.cleanup.createdUsers=1;},
  ]){
    const changed=structuredClone(result);alter(changed);assert.equal(verify(changed).passed,false);
  }
});

test('independent review mode requires an explicit reviewer and separate report without executing a new selection',()=>{
  const args=['--mode','review','--review-report','artifacts/assistant-evaluation/original.json','--guidance-reviews','artifacts/assistant-evaluation/reviews.json','--reviewer','independent-qa','--out','artifacts/assistant-evaluation/reviewed.json'];
  assert.equal(options(args).mode,'review');
  for(const missing of ['--review-report','--guidance-reviews','--reviewer','--out']){const value=[...args],at=value.indexOf(missing);value.splice(at,2);assert.throws(()=>options(value));}
  for(const extra of [['--only','account:'],['--max-cases','1'],['--fixture-module','anything'],['--domain','profile']])assert.throws(()=>options([...args,...extra]));
  assert.throws(()=>options(['--mode','live','--reviewer','independent-qa']));
});

const jsonHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function guidanceReportFixture(){
  const sourceRevision='a'.repeat(40),runId='20000000-0000-4000-8000-000000000001';
  const testCase={id:'account:review-contract',question:'What year am I in? Help me draft an introduction.',route:'/school-affairs',domain:'profile',mode:'record',fixtureKey:'profile',expected:{
    behavior:'answer',facts:[{kind:'number',label:'year',values:[3]}],noAction:true,
    guidanceRubric:{version:'stu-guidance-v1',criteria:[{id:'usable_help',proof:'spans'},{id:'honest_separation',proof:'whole_answer'}]},
  }};
  const body={status:'answered',answer:'Your recorded year is 3. Try: I contributed to [project] by [specific work].',citations:[],verification:{status:'verified',attempts:1}};
  const envelope={statusCode:200,body,events:[],execution:'live-model',sourceRevision,fixtureKey:'profile',executed:true};
  const suite={cases:[testCase],suiteHash:jsonHash([testCase]),inventory:{hash:'b'.repeat(64)}};
  const report={version:1,mode:'live',runId,sourceRevision,suiteHash:suite.suiteHash,inventoryHash:suite.inventory.hash,finishedAt:'2026-11-13T00:00:00Z',selectedCases:[testCase.id],results:[{...gradeCase(testCase,envelope),response:envelope,executed:true,failureKind:'behavior'}]};
  const binding=buildGuidanceReviewBinding({runId,finalSuiteHash:suite.suiteHash,sourceRevision,testCase,envelope});
  report.results[0].guidanceReviewBinding=binding;
  const text='I contributed to [project] by [specific work]',start=body.answer.indexOf(text);
  const artifact={binding,reviewer:{id:'independent-qa',method:'manual'},criteria:[
    {id:'usable_help',passed:true,answerSpans:[{start,end:start+text.length,text}]},
    {id:'honest_separation',passed:true,answerSpans:[],examinedRange:{start:0,end:body.answer.length}},
  ]};
  return {testCase,envelope,suite,report,artifact,settings:{reviewer:'independent-qa',sourceRevision}};
}
test('independent review preserves raw responses and adds only a separate bound assessment',()=>{
  const f=guidanceReportFixture(),before=structuredClone(f.report);
  const result=applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[f.artifact]},f.settings).report;
  assert.deepEqual(f.report,before);assert.deepEqual(result.results[0].response,before.results[0].response);
  assert.equal(result.results[0].independentReview.status,'passed');assert.equal(result.results[0].passed,true);
  assert.equal(result.guidanceReviewOf.sha256,jsonHash(before));assert.equal(result.guidanceReviewOf.runId,f.report.runId);
  const artifactBefore=structuredClone(f.artifact);
  result.results[0].response.body.answer='Changed reviewed copy';result.results[0].independentReviewArtifact.reviewer.id='changed-copy';
  assert.deepEqual(f.report,before);assert.deepEqual(f.artifact,artifactBefore);
});
test('helpfulness review cannot replace a failed factual answer or a missing independent review',()=>{
  const f=guidanceReportFixture();
  const pending=applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[]},f.settings).report.results[0];
  assert.equal(pending.passed,false);assert.equal(pending.independentReview.status,'pending');
  f.envelope.body.answer=f.envelope.body.answer.replace('year is 3','year is 4');
  f.artifact.binding=buildGuidanceReviewBinding({runId:f.report.runId,finalSuiteHash:f.suite.suiteHash,sourceRevision:f.settings.sourceRevision,testCase:f.testCase,envelope:f.envelope});
  // Construct a genuinely failed original answer, rather than changing a
  // response after its saved immutable binding has already been reviewed.
  f.report.results[0].guidanceReviewBinding=f.artifact.binding;
  const wrong=applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[f.artifact]},f.settings).report.results[0];
  assert.equal(wrong.independentReview.status,'passed');assert.equal(wrong.passed,false);assert.ok(wrong.failures.some(item=>item.id==='fact.0'));
});
test('review rejects wrong identities, changed suites and duplicate artifacts instead of blessing them',()=>{
  for(const mutate of [f=>{f.artifact.reviewer.id='production-verifier';},f=>{f.report.sourceRevision='c'.repeat(40);},f=>{f.suite.cases[0].question='Changed question';},f=>{f.report.selectedCases.push(f.testCase.id);},f=>{f.report.results.push(f.report.results[0]);},f=>{f.report.guidanceReviewOf={};}]){
    const f=guidanceReportFixture();mutate(f);assert.throws(()=>applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[f.artifact]},f.settings));
  }
  const f=guidanceReportFixture();assert.throws(()=>applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[f.artifact,f.artifact]},f.settings));
  f.artifact.binding={...f.artifact.binding,responseHash:'d'.repeat(64)};
  const stale=applyGuidanceReviews(f.report,f.suite,{version:1,reviews:[f.artifact]},f.settings).report.results[0];
  assert.equal(stale.independentReview.status,'invalid');assert.equal(stale.passed,false);
  for(const change of [g=>{g.envelope.body.answer+=' Extra text.';},g=>{g.envelope.elapsedMs=99;},g=>{g.envelope.events.push({kind:'changed',status:'complete'});}]){
    const g=guidanceReportFixture();change(g);
    g.artifact.binding=buildGuidanceReviewBinding({runId:g.report.runId,finalSuiteHash:g.suite.suiteHash,sourceRevision:g.settings.sourceRevision,testCase:g.testCase,envelope:g.envelope});
    assert.throws(()=>applyGuidanceReviews(g.report,g.suite,{version:1,reviews:[g.artifact]},g.settings),/original review binding/);
  }
  const missing=guidanceReportFixture();delete missing.report.results[0].guidanceReviewBinding;
  assert.throws(()=>applyGuidanceReviews(missing.report,missing.suite,{version:1,reviews:[missing.artifact]},missing.settings),/original review binding/);
});
test('deliberately failed reader fixtures remain unexecuted live setup gaps',()=>{
  assert.throws(()=>assertCatalogCaseBound({fixtureRequirement:'offline_reader_failure'},{}),/no live failure-injection fixture/);
  for(const fixtureRequirement of ['native_health_metadata_planned','native_counseling_appointments_planned','native_clearance_applications_planned','native_tutor_evaluation_planned'])
    assert.throws(()=>assertCatalogCaseBound({fixtureRequirement},{}),/native fixture adapter is not mounted/);
});
test('live pacing is explicit,bounded and cannot be disabled through CLI',()=>{
  assert.equal(options([]).intervalMs,5500);assert.equal(options(['--interval-ms','9000']).intervalMs,9000);
  for(const value of ['0','5499','60001','5500.5','NaN','Infinity'])assert.throws(()=>options(['--interval-ms',value]));
});
test('fast live requests are spaced while slow model requests do not incur redundant waits',async()=>{
  let clock=1000;const waits=[];
  const pace=createLiveRequestPacer(5500,{now:()=>clock,sleep:async(ms)=>{waits.push(ms);clock+=ms;}});
  assert.equal(await pace(waited=>waited),0);clock+=100;
  assert.equal(await pace(waited=>waited),5400);clock+=30000;
  assert.equal(await pace(waited=>waited),0);assert.deepEqual(waits,[5400]);
});
test('live pacing aborts without claiming an executed request and rejects a broken clock',async()=>{
  const controller=new AbortController();controller.abort();let sleeps=0;
  const pace=createLiveRequestPacer(5500,{now:()=>0,sleep:async()=>{sleeps++;}});
  await assert.rejects(pace(()=>assert.fail('Aborted request must not start'),controller.signal),{name:'AbortError'});assert.equal(sleeps,0);
  assert.equal(await pace(waited=>waited),0);await assert.rejects(pace(()=>{}),/scheduled start/);
  let now=100;const backwards=createLiveRequestPacer(5500,{now:()=>now});await backwards(()=>{});now=99;
  await assert.rejects(backwards(()=>{}),/monotonic/);
});
test('pacer timestamps actual callback invocation,handles early wakeups and cancels a mid-wait request',async()=>{
  let clock=0;const starts=[],waits=[];
  const pace=createLiveRequestPacer(5500,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=waits.length===1?ms-0.5:ms;}});
  await pace(()=>{clock+=100;starts.push(clock);});clock+=10;
  await pace(()=>starts.push(clock));assert.ok(starts[1]-starts[0]>=5500);assert.deepEqual(waits,[5490,1]);
  const controller=new AbortController();let called=false;
  const aborted=createLiveRequestPacer(5500,{now:()=>0,sleep:async()=>{controller.abort();}});
  await aborted(()=>{});await assert.rejects(aborted(()=>{called=true;},controller.signal),{name:'AbortError'});assert.equal(called,false);
});

test('JSON success and HTTP-denial bodies are preserved for independent grading',async()=>{
  assert.deepEqual(await readReply(new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}})),{body:result,events:[]});
  const denied={error:'Authentication is required.'};
  assert.deepEqual(await readReply(new Response(JSON.stringify(denied),{status:401,headers:{'Content-Type':'application/json'}})),{body:denied,events:[]});
});

test('SSE preserves ordered observable progress and the terminal response for CRLF/LF',async()=>{
  for(const newline of ['\n','\r\n']){
    const first={kind:'account',status:'running',label:'Loading owned records'},second={kind:'account',status:'complete',label:'Loaded owned records'};
    const reply=await readReply(stream(': heartbeat'+newline+newline+event('progress',first,newline)+event('progress',second,newline)+event('result',result,newline)));
    assert.deepEqual(reply,{body:result,events:[first,second]});
  }
});

test('an SSE error cannot be overwritten by a later success or result replay',async()=>{
  const error=event('error',{error:'Evidence lookup failed'});
  const badStreams=[error+event('result',result),event('result',result)+event('result',result),event('result',result)+event('progress',{kind:'late',status:'complete'})];
  for(const value of badStreams)await assert.rejects(readReply(stream(value)),/terminal/i);
  const reply=await readReply(stream(error));assert.equal(reply.body.error,'Evidence lookup failed');assert.equal(reply.body.answer,undefined);
});

test('truncated, malformed and excessive streams fail closed',async()=>{
  await assert.rejects(readReply(stream(event('progress',{kind:'account',status:'running'}))),/without a result/);
  await assert.rejects(readReply(stream('event: result\ndata: {broken}\n\n')),SyntaxError);
  await assert.rejects(readReply(stream(event('result',null))),/without a result/);
  await assert.rejects(readReply(stream(Array.from({length:101},()=>event('progress',{kind:'spam',status:'running'})).join('')+event('result',result))),/too many progress/);
  await assert.rejects(readReply(new Response('x'.repeat(2_000_001))),/exceeds/);
});

test('response limits count UTF-8 bytes and cancel excessive streams before consuming their tail',async()=>{
  await assert.rejects(readReply(new Response('課'.repeat(700_000))),/exceeds/);
  let pulls=0,cancelled=false;
  const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(700_000));},cancel(){cancelled=true;}},{highWaterMark:0});
  await assert.rejects(readReply(new Response(body)),/exceeds/);
  assert.equal(pulls,3);assert.equal(cancelled,true);
  await assert.rejects(readReply(new Response(new Uint8Array([0xff,0xfe]))),TypeError);
});

test('valid Unicode split across stream chunks retains exact factual text',async()=>{
  const expected={...result,answer:'紀錄🙂'},bytes=new TextEncoder().encode(JSON.stringify(expected));
  let index=0;
  const body=new ReadableStream({pull(controller){if(index===bytes.length)controller.close();else controller.enqueue(bytes.slice(index,++index));}});
  assert.deepEqual(await readReply(new Response(body)),{body:expected,events:[]});
});

test('fixture lifecycle validation happens without invoking adapter mutations',()=>{
  let touched=false;
  const prepare=async()=>{touched=true;},forCase=async()=>({token:'synthetic-not-a-secret'}),cleanup=async()=>({verified:true});
  assert.throws(()=>validateFixtureAdapter({prepare,forCase}),/cleanup/);
  assert.throws(()=>validateFixtureAdapter({prepare,cleanup}),/forCase/);
  assert.throws(()=>validateFixtureAdapter(null),/adapter/);
  validateFixtureAdapter({prepare,forCase,cleanup});assert.equal(touched,false);
});

function catalogBindingFixture(){
  const templates=[
    buildAccountCases().find(row=>row.id==='account:catalog-known-fields'),
    {id:'account:profile',domain:'profile',mode:'record',fixtureKey:'profile',question:'What is my name?',route:'/school-affairs/records',expected:{behavior:'answer'}},
  ];
  const cases=structuredClone(templates),id='11111111-1111-4111-8111-111111111111';
  cases[0].question=`What code, teacher and credits are recorded for published offering ${id}?`;cases[0].route='/school-affairs/services/12-4?course='+id;
  cases[0].expected={behavior:'answer',requiredText:['Database'],forbiddenText:['Your enrollment is confirmed','You are officially enrolled'],requiredLinks:[cases[0].route],requiredTools:['courseCatalog'],provenance:'sample',
    facts:[{label:'code',kind:'text',values:['Database']},{label:'teacher',kind:'text',values:['Synthetic Teacher']},{label:'credits',kind:'number',values:[2]}]};
  cases[0].capability={level:'native',gap:false,limitation:'Published sample offering, not an enrollment record.'};
  const binding={version:1,digest:'a'.repeat(64),selected:[{caseId:templates[0].id,offeringId:'11111111-1111-4111-8111-111111111111',offeringVersion:2,syllabusVersion:null,syllabusDigest:'b'.repeat(64),publishedSearchRevision:'c'.repeat(32)}],unavailable:[]};
  return {templates,result:{cases,binding}};
}

test('catalog binding accepts only concrete fixed-case replacements and returns a detached snapshot',()=>{
  const {templates,result}=catalogBindingFixture(),bound=validateCatalogCaseBinding(templates,result);
  assert.deepEqual(bound,result);assert.equal(templates[0].question,buildAccountCases().find(row=>row.id===templates[0].id).question);
  result.cases[0].expected.requiredText[0]='Changed later';result.binding.selected[0].offeringVersion=99;
  assert.equal(bound.cases[0].expected.requiredText[0],'Database');assert.equal(bound.binding.selected[0].offeringVersion,2);
});

test('catalog absence retains the same case in the denominator with an explicit setup limitation',()=>{
  const {templates,result}=catalogBindingFixture();result.cases=structuredClone(templates);
  result.binding.selected=[];result.binding.unavailable=[{caseId:templates[0].id,reason:'no_suitable_published_offering'}];
  const bound=validateCatalogCaseBinding(templates,result);assert.equal(bound.cases.length,2);assert.equal(bound.cases[0].id,templates[0].id);
  assert.equal(bound.cases[0].expected.behavior,'unavailable');assert.equal(bound.binding.unavailable.length,1);
});

test('catalog binding rejects dropped,reordered,duplicated and unrelated cases or metadata',()=>{
  const mutations=[
    r=>r.cases.pop(),r=>r.cases.reverse(),r=>{r.cases[0].id='different';},
    r=>{r.cases[0].domain='profile';},r=>{delete r.cases[0].fixtureRequirement;},
    r=>{r.cases[1].question='Alter unrelated oracle';},r=>{r.cases[1].expected={behavior:'unavailable'};},
    r=>{r.binding.selected=[];},r=>{r.binding.selected.push(structuredClone(r.binding.selected[0]));},
    r=>{r.binding.unavailable=[{caseId:r.cases[0].id,reason:'missing'}];},
    r=>{r.binding.selected[0].caseId='unselected';},r=>{r.binding.selected[0].accessToken='must-not-enter-report';},
    r=>{r.binding.rawRows=[];},r=>{r.extra='unexpected';},
  ];
  for(const mutate of mutations){const {templates,result}=catalogBindingFixture();mutate(result);assert.throws(()=>validateCatalogCaseBinding(templates,result),/catalog|Catalog|published/);}
});

test('catalog manifests validate exact versions,source digests,identifiers and bounded case text',()=>{
  const mutations=[
    r=>{r.binding.digest='short';},r=>{r.binding.version=2;},r=>{r.binding.selected[0].offeringId='not-a-uuid';},
    r=>{r.binding.selected[0].offeringVersion=0;},r=>{r.binding.selected[0].offeringVersion=1.5;},
    r=>{r.binding.selected[0].syllabusVersion=1;},r=>{r.binding.selected[0].syllabusDigest='invalid';},
    r=>{r.binding.selected[0].publishedSearchRevision='d'.repeat(64);},r=>{r.cases[0].question='x'.repeat(2001);},
    r=>{r.cases[0].route='x'.repeat(3101);},
    r=>{r.binding.selected=[];r.binding.unavailable=[{caseId:r.cases[0].id,reason:'Contains private free text'}];},
  ];
  for(const mutate of mutations){const {templates,result}=catalogBindingFixture();mutate(result);assert.throws(()=>validateCatalogCaseBinding(templates,result));}
  const {templates,result}=catalogBindingFixture();result.binding.selected[0].offeringVersion=null;result.binding.selected[0].syllabusDigest=null;
  assert.throws(()=>validateCatalogCaseBinding(templates,result),/versioned independent facts/);
});

test('catalog selected cases cannot become anonymous, ungrounded or unverifiable limitation passes',()=>{
  const mutations=[
    r=>{r.cases[0].fixtureKey='anonymous';},r=>{r.cases[0].expected={behavior:'unavailable',limitation:true};},
    r=>{r.cases[0].question='';},r=>{r.cases[0].question='What is the weather?';},r=>{r.cases[0].route='/';},
    r=>{r.cases[0].expected.requiredTools=[];},r=>{r.cases[0].expected.provenance=null;},r=>{r.cases[0].expected.requiredLinks=[];},
    r=>{r.cases[0].expected.requiredLinks=['https://foreign.invalid/'];},r=>{r.cases[0].expected.facts=[];},
    r=>{r.cases[0].expected.facts=[{label:'',kind:'text',values:['Database']}];},r=>{r.cases[0].expected.facts.pop();},
    r=>{r.cases[0].expected.forbiddenText=[];},r=>{r.cases[0].expected.statusCode=401;},r=>{r.cases[0].capability.gap=true;},
  ];
  for(const mutate of mutations){const {templates,result}=catalogBindingFixture();mutate(result);assert.throws(()=>validateCatalogCaseBinding(templates,result));}
  const {templates,result}=catalogBindingFixture();Object.assign(result.cases[0],{fixtureKey:'anonymous',route:'/',question:'Can you answer?',expected:{behavior:'unavailable',limitation:true}});
  assert.equal(gradeCase(result.cases[0],{statusCode:200,body:{status:'answered',answer:'I cannot access this information.'},execution:'live-model',fixtureKey:'anonymous'}).passed,true,'This weak oracle really could pass if binding validation allowed it.');
  assert.throws(()=>validateCatalogCaseBinding(templates,result));
});

test('catalog unavailable manifest entries cannot rewrite their original case or capability',()=>{
  for(const mutate of [row=>{row.question='Different question';},row=>{row.expected.behavior='answer';},row=>{row.capability.level='native';},row=>{row.fixtureKey='anonymous';}]){
    const {templates,result}=catalogBindingFixture();result.cases=structuredClone(templates);result.binding.selected=[];
    result.binding.unavailable=[{caseId:templates[0].id,reason:'no_suitable_published_offering'}];mutate(result.cases[0]);
    assert.throws(()=>validateCatalogCaseBinding(templates,result));
  }
});

async function realCatalogBinding(){
  const templates=[...buildAccountCases(),...buildServiceCases()].filter(row=>row.fixtureRequirement==='published_catalog_binding');
  const offering={...newCourseOffering(),id:evalId(876),version:7,published:true,source_mode:'sample',course_code:'PUBLISHED-QA-7',course_name:'Published Research',instructor:'Published Teacher',admission_name:'Day program',credits:2,syllabus:newCourseSyllabus()};
  const page={scope:'historical',total:1,rows:[{id:offering.id,sequence:1,course_code:offering.course_code,course_name:offering.course_name,instructor:offering.instructor,admission_name:offering.admission_name,academicYearText:null,semesterText:null}],page:0,pageSize:20,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'a'.repeat(32)};
  const result=await collectPublishedCatalogBinding(templates,{userIds:[EVAL_USER_ID,EVAL_OTHER_USER_ID],absentId:evalId(98765),read:async(_user,query)=>structuredClone(query.scope==='syllabus-search'?page:{row:query.id===offering.id?offering:null})});
  return {templates,result:{cases:result.cases,binding:result.binding}};
}

test('catalog validation accepts the real seven-case binder and retains absent, null-weight and mixed-data semantics',async()=>{
  const {templates,result}=await realCatalogBinding(),bound=validateCatalogCaseBinding(templates,result);
  assert.equal(bound.binding.selected.length,7);assert.equal(bound.cases.length,templates.length);
  const empty=bound.cases.filter(row=>row.mode==='empty');assert.equal(empty.length,2);assert.ok(empty.every(row=>row.expected.behavior==='unavailable'&&row.expected.limitation));
  for(const mutate of [row=>{row.expected.requiredTools=['courseCatalog'];},row=>{row.expected.exactLists=[];},row=>{row.expected.exactLists[0].forbidden=[];},row=>{row.expected.requiredText=row.expected.requiredText.filter(text=>text!=='Index plan');}]){
    const changed=structuredClone(result);mutate(changed.cases.find(row=>row.id==='account:catalog-mixed-dtm'));
    assert.throws(()=>validateCatalogCaseBinding(templates,changed));
  }
  const changed=structuredClone(result),nullWeight=changed.cases.find(row=>row.id==='account:catalog-null-weight');
  nullWeight.route=nullWeight.route.replace('?syllabus=','?course=');nullWeight.expected.requiredLinks=[nullWeight.route];
  assert.throws(()=>validateCatalogCaseBinding(templates,changed));
  for(const mutate of [row=>{row.expected.facts=row.expected.facts.filter(fact=>fact.label!=='enrollment');},row=>{row.expected.forbiddenText=row.expected.forbiddenText.filter(value=>typeof value==='string');}]){
    const changed=structuredClone(result);mutate(changed.cases.find(row=>row.id==='account:catalog-enrollment-distinction'));
    assert.throws(()=>validateCatalogCaseBinding(templates,changed));
  }
});

test('catalog runner blocks pending/unavailable fixtures before adapter or model calls and retains failed cases',async()=>{
  const source=await readFile(new URL('./run.mjs',import.meta.url),'utf8');
  const from=source.indexOf('    for(const testCase of selected){'),to=source.indexOf('\n  }catch(error){\n    report.runFailure',from);
  assert.ok(from>0&&to>from);
  const persisted=source.indexOf('report.boundCatalogCases=structuredClone('),saved=source.indexOf('await persist(out,report);',persisted);
  assert.ok(persisted>0&&saved>persisted&&saved<from,'The concrete bound oracle is persisted before the request loop.');
  for(const kind of ['pending','unavailable','changed','bound']){
    const {templates,result}=catalogBindingFixture(),bound=validateCatalogCaseBinding(templates,result);
    const testCase=kind==='unavailable'?templates[0]:structuredClone(bound.cases[0]);
    const report={results:[],bindingPending:kind==='pending',catalogBinding:structuredClone(bound.binding),boundCatalogCases:structuredClone(bound.cases),deployment:{sourceRevision:'a'.repeat(40)}};
    if(kind==='unavailable'){report.catalogBinding.selected=[];report.catalogBinding.unavailable=[{caseId:testCase.id,reason:'no_suitable_published_offering'}];}
    if(kind==='changed')testCase.question+=' Changed after the fingerprint.';
    let setupCalls=0,modelCalls=0,pinChecks=0;
    const execute=vm.runInNewContext('(async()=>{'+source.slice(from,to)+'})',{
      selected:[testCase],report,opt:{mode:'live',origin:'https://synthetic.invalid'},fixtureMode:undefined,assignmentListOnly:false,healthMetadataOnly:false,controller:new AbortController(),assertCatalogCaseBound,
      adapter:{forCase:async()=>{setupCalls++;return {token:'synthetic-token'};},afterCase:async()=>{}},
      pace:async(start,_signal,beforeStart)=>{await beforeStart();return start(0);},fetchImpl:async()=>{modelCalls++;return new Response(JSON.stringify({status:'answered',answer:'Synthetic response'}),{headers:{'content-type':'application/json'}});},
      deploymentGate:{assertCurrent:async()=>{pinChecks++;},beforeRequest:async()=>{pinChecks++;return {requestIndex:1,sourceRevision:'a'.repeat(40)};},afterRequest:async()=>{pinChecks++;},status:()=>({status:'pinned'})},
      URL,AbortSignal,readReply,gradeEvaluationCase,assertTeachingFeedbackCaseReady,assertNativeDtmCaseReady,assertNativeStudentLeaveCaseReady,assertNativeInternshipCaseReady,
      nativeStudentLeaveSetupRequired,nativeInternshipSetupRequired,nativeDtmSetupRequired,assertElearningCatalogCaseReady,elearningCatalogSetupRequired,gradeElearningCatalogCase,isElearningCatalogReadbackCase,isElearningMetadataCase,
      assertNativeVenueCaseReady,nativeVenueSetupRequired,isClubAttendanceCase:()=>false,isServiceNoteCase:()=>false,
      assertAccountStatusCaseReady,accountStatusSetupRequired,
      assertLearningEntryCaseReady,learningEntrySetupRequired,
      assertCampusEntryCaseReady,campusEntrySetupRequired,
      assertClubEquipmentCaseReady,clubEquipmentSetupRequired,
      isNativeElearningEnrollmentCase,
      persist:async()=>{},out:'unused',log(){},identity:{sourceRevision:'a'.repeat(40)},
    });
    await execute();assert.equal(report.results.length,1);assert.equal(report.results[0].caseId,testCase.id);
    if(kind==='bound'){assert.equal(setupCalls,1);assert.equal(modelCalls,1);assert.equal(pinChecks,3);assert.equal(report.results[0].executed,true);}
    else{assert.equal(setupCalls,0);assert.equal(modelCalls,0);assert.equal(pinChecks,0);assert.equal(report.results[0].executed,false);assert.equal(report.results[0].failureKind,'setup');assert.equal(report.results[0].passed,false);}
  }
});

test('live deployment identity comes from the exact client manifest, never local HEAD',async()=>{
  const sha='a'.repeat(40),signal=new AbortController().signal;
  await mockedFetch(async(url,init)=>{
    assert.equal(String(url),'https://stu.best/release.json');assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
    return new Response(JSON.stringify({version:1,revision:sha,environment:'production',source:'vercel-git',builtAt:'2026-11-13T02:00:00.000Z'}),{headers:{'content-type':'application/json'}});
  },async()=>assert.deepEqual(await deploymentIdentity('https://stu.best',signal),{verified:true,sourceRevision:sha}));
});

test('missing, legacy, unverified and malformed deployment identities remain unverified',async()=>{
  const signal=new AbortController().signal;
  for(const reply of [
    ()=>new Response('Not Found',{status:404}),
    ()=>new Response('<html>SPA fallback</html>',{headers:{'content-type':'text/html'}}),
    ()=>new Response(JSON.stringify({repository:'someone-else/project',commitSha:'a'.repeat(40)}),{headers:{'content-type':'application/json'}}),
    ()=>new Response(JSON.stringify({repository:'LuxArt0317/std_edu_ai',commitSha:'short'}),{headers:{'content-type':'application/json'}}),
    ...[
      {version:1,revision:'a'.repeat(40),environment:'preview',source:'vercel-git',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:'a'.repeat(40),environment:'production',source:'local-git',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:null,environment:'local',source:'unverified',builtAt:'2026-11-13T02:00:00.000Z'},
      {version:1,revision:'a'.repeat(40),environment:'production',source:'vercel-git',builtAt:'2026-02-31T02:00:00.000Z'},
    ].map(value=>()=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})),
    ()=>new Response('x'.repeat(4097),{headers:{'content-type':'application/json'}}),
    ()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
    ()=>{throw new Error('Offline');},
  ])await mockedFetch(reply,async()=>assert.deepEqual(await deploymentIdentity('https://stu.best',signal),{verified:false,sourceRevision:'unknown'}));
});

test('an unapproved origin is rejected before a provenance request',async()=>{
  await mockedFetch(()=>{assert.fail('No request to an unapproved project');},async()=>{
    for(const origin of ['https://other.example','https://stu.best.evil.example','https://name:password@stu.best','https://stu.best/path'])assert.deepEqual(await deploymentIdentity(origin,new AbortController().signal),{verified:false,sourceRevision:'unknown'});
  });
});

test('source identity declares commit, content fingerprint and dirty state independently',async()=>{
  const identity=await sourceIdentity();
  assert.match(identity.sourceRevision,/^[a-f0-9]{40}$/);assert.match(identity.workingTreeHash,/^[a-f0-9]{64}$/);
  assert.equal(typeof identity.dirty,'boolean');
});

test('public authentication cases assert HTTP denial rather than a fabricated answer',async()=>{
  const inventory=await discoverSurfaces(),cases=buildPublicCases(inventory),privacy=cases.filter(row=>row.id.startsWith('anonymous-records-'));
  assert.equal(privacy.length,inventory.tools.length);
  assert.ok(privacy.every(row=>row.fixtureKey==='anonymous'&&row.endpoint==='/api/affairs-assistant'&&row.expected.expectedStatusCode===401&&row.expected.behavior==='denial'));
});

test('full bank includes every source page and catalog entry without duplicate case IDs',async()=>{
  const suite=await evaluationSuite('2026-11-13T02:00:00Z');
  assert.equal(new Set(suite.cases.map(row=>row.id)).size,suite.cases.length);
  assert.equal(suite.inventory.clientDispatch.questions.length,30);
  assert.deepEqual(suite.cases.filter(row=>row.fixtureRequirement==='offline_dtm_native_fixture'),nativeDtmRunnerCases());
  assert.deepEqual(suite.cases.filter(row=>row.fixtureRequirement==='offline_native_student_leave'),studentLeaveRunnerCases());
  assert.equal(suite.cases.filter(nativeStudentLeaveSetupRequired).length,51);
  assert.deepEqual(suite.cases.filter(row=>row.fixtureRequirement==='offline_native_internship'),internshipRunnerCases());
  assert.equal(suite.cases.filter(nativeInternshipSetupRequired).length,34);
  assert.deepEqual(suite.cases.filter(row=>elearningCatalogSetupRequired(row)||isElearningPublishedReadbackCase(row)),elearningCatalogRunnerCases());
  assert.equal(suite.cases.filter(elearningCatalogSetupRequired).length,3);
  assert.deepEqual(suite.cases.filter(row=>row.fixtureRequirement==='offline_native_venue_requests'),venueRunnerCases());
  assert.equal(suite.cases.filter(nativeVenueSetupRequired).length,12);
  assert.deepEqual(suite.cases.filter(accountStatusSetupRequired),accountStatusCases());
  assert.deepEqual(suite.cases.filter(learningEntrySetupRequired),learningEntryCases());
  assert.deepEqual(suite.cases.filter(campusEntrySetupRequired),campusEntryCases());

  assert.deepEqual(suite.inventory.clientDispatch.verifiedDispatch.map(({graphTool})=>graphTool),['accountIdentity','clubAttendance','clubMemberships','clubEquipment','courseCatalog','elearningCatalog','elearningMetadata','dtmAssignmentList','dtmMaterials','dtmSubmissionTiming','leaveRecords','venueRequests','internshipRecords','dtmAssignment','aidPayments','dtmGradeReport','elearningEnrollments','facilityRepairs','dormitoryConduct','elearningOutline','feeRemission','healthExaminations','counselingAppointments','graduationClearance','tutorEvaluation','learningSupport','studentConduct','serviceRecords','teachingFeedback','housing','housingApplications']);
  assert.ok(suite.inventory.clientDispatch.questions.every(row=>row.executed===false));
  assert.ok(suite.inventory.clientDispatch.questions.every(row=>!suite.cases.some(apiCase=>apiCase.id===row.id)));
  const forged=suite.inventory.clientDispatch.questions.map(({id})=>({id,dispatched:true,passed:true,cleanupVerified:true}));
  const assessment=assessRun({results:[],cleanup:{complete:true},sourceUnchanged:true,dirty:false,clientDispatchRun:forged},
    {...suite,requestedSuite:'full',sourceRevision:'offline'});
  assert.equal(assessment.clientDispatch.executed,0);
  assert.equal(assessment.accountIdentitySetup.registered,7);
  assert.equal(assessment.accountIdentitySetup.liveEligible,0);
  assert.equal(assessment.learningEntrySetup.registered,24);
  assert.equal(assessment.learningEntrySetup.liveEligible,0);
  assert.equal(assessment.campusEntrySetup.registered,22);
  assert.equal(assessment.campusEntrySetup.liveEligible,0);
  assert.ok(assessment.releaseBlockers.includes('run.accountIdentityFixtureUnbound'));
  assert.equal(assessment.nativeDtmSetup.registered,nativeDtmRunnerCases().length+4);
  assert.equal(assessment.nativeDtmSetup.legacyAssignmentListCaseIds.length,4);
  assert.equal(assessment.nativeDtmSetup.liveEligible,0);
  assert.ok(assessment.releaseBlockers.includes('run.nativeDtmFixtureUnbound'));
  assert.equal(assessment.studentLeaveSetup.registered,51);
  assert.equal(assessment.studentLeaveSetup.legacyCaseIds.length,9);
  assert.equal(assessment.studentLeaveSetup.liveEligible,0);
  assert.ok(assessment.releaseBlockers.includes('run.studentLeaveFixtureUnbound'));
  assert.equal(assessment.internshipSetup.registered,34);
  assert.equal(assessment.internshipSetup.legacyCaseIds.length,4);
  assert.equal(assessment.internshipSetup.liveEligible,0);
  assert.ok(assessment.releaseBlockers.includes('run.nativeInternshipFixtureUnbound'));
  assert.equal(assessment.elearningCatalogSetup.registered,25);
  assert.equal(assessment.elearningCatalogSetup.metadataCaseIds.length,6);
  assert.equal(assessment.elearningCatalogSetup.courseCaseIds.length,16);
  assert.equal(assessment.elearningCatalogSetup.liveEligible,22);
  assert.equal(assessment.elearningCatalogSetup.unboundCaseIds.length,3);
  assert.equal(assessment.venueSetup.registered,12);
  assert.equal(assessment.venueSetup.liveEligible,0);
  assert.ok(assessment.releaseBlockers.includes('run.nativeVenueFixtureUnbound'));
  assert.ok(assessment.releaseBlockers.includes('run.elearningCatalogFixtureUnbound'));
  assert.ok(assessment.releaseBlockers.includes('client_dispatch_acceptance_missing'));

  for(const page of suite.inventory.publicPages)assert.ok(suite.cases.some(row=>row.domain==='public-page-context'&&row.route===page.route),page.route);
  for(const service of suite.inventory.services)assert.equal(suite.cases.filter(row=>row.serviceId===service.id&&row.id.startsWith('service:')).length,4,service.id);
  assert.equal(suite.cases.filter(row=>row.domain==='facilityRepairs'&&row.fixtureRequirement==='native_facility_repair').length,15);
  assert.equal(suite.cases.filter(row=>row.domain==='elearningOutline'&&row.fixtureRequirement==='native_elearning_outline').length,5);
  const dormitoryCases=suite.cases.filter(row=>row.domain==='dormitoryConduct'&&row.fixtureRequirement==='native_dormitory_conduct');
  assert.equal(dormitoryCases.filter(row=>row.id.startsWith('account:dormitory-conduct-')).length,10);
  assert.deepEqual(dormitoryCases.filter(row=>row.serviceId==='34-2').map(row=>row.mode),['record','empty','action-boundary']);
  assert.ok(suite.cases.filter(row=>row.domain==='public-page-context').every(row=>row.coveragePurpose?.includes('not proof')),'Metadata questions must not claim complete content QA.');
});


test('route discovery reads literal descriptors without executing arbitrary source',()=>{
  assert.deepEqual(readRouteLiteral("export const routes = [{id:'sao',views:[['all','All']]}] as const;",'routes'),[{id:'sao',views:[['all','All']]}]);
  assert.equal(readRouteLiteral("export const callback = '/school-affairs/auth/callback';",'callback'),'/school-affairs/auth/callback');
  for(const source of ["const routes = external();","const routes = [...other];","const different = [];","const routes = {get id(){return 'x';}};"])assert.throws(()=>readRouteLiteral(source,'routes'),Error);
});

test('surface inventory distinguishes protected subpages, query details and auth transitions',async()=>{
  const inventory=await discoverSurfaces(),routes=new Set(inventory.routeFamilies.flatMap(row=>row.routes));
  for(const route of ['/school-affairs/services/leave/edit/:id','/school-affairs/services/leave/archive','/school-affairs/services/leave/periods','/school-affairs/services/internship/self_assessment','/school-affairs/services/12-4?course=:id','/school-affairs/services/12-4?syllabus=:id','/dtm/course/:courseId/assignment/:assignmentId/edit','/school-affairs/auth/callback'])assert.ok(routes.has(route),route);
  assert.equal(routes.has('/school-affairs/auth'),false,'A nonexistent shortened callback cannot stand in for the real callback.');
  const menus=inventory.routeFamilies.find(row=>row.id==='school-menus');
  assert.ok(menus.routes.includes('/school-affairs/menu/menu/custom'));assert.ok(menus.routes.includes('/school-affairs/menu/infoSystem/library'));
  const protectedFamily=inventory.routeFamilies.find(row=>row.id==='student-leave');
  assert.equal(protectedFamily.auth,'signed-in');assert.ok(protectedFamily.browserChecks.includes('sessionVerified'));
  const transition=inventory.routeFamilies.find(row=>row.id==='authentication-transitions');
  assert.deepEqual(transition.browserChecks,['sessionVerified']);assert.ok(transition.browserScenario.includes('resulting'));
  assert.ok(inventory.coverageLimits.some(value=>value.includes('not browser acceptance')));
});
