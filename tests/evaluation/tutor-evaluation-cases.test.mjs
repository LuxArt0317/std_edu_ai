import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildTutorEvaluationCases,buildPlannedTutorEvaluationCases,tutorEvaluationCaseManifest,tutorEvaluationFixtureForCase,gradeTutorEvaluationCase} from './tutor-evaluation-cases.mjs';
import {loadTutorEvaluation} from '../../server/tutorEvaluation.js';
import {readTutorEvaluationEvidence} from '../../server/accountTutorEvaluationEvidence.js';
import {selectTutorEvaluationEvidence} from '../../server/tutorEvaluationEvidenceIntent.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

const cases=buildTutorEvaluationCases(),manifest=tutorEvaluationCaseManifest,path=manifest.route;
const find=suffix=>cases.find(row=>row.id==='account:tutor-evaluation-'+suffix),clone=value=>structuredClone(value);
const account=fixture=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:fixture.owner}});
const local='This is your saved local stu.best questionnaire. It does not establish official university approval or delivery.';
const link=`[Open tutor evaluation](${path})`;
const status=`Submission: saved.\n${local}\n${link}`;
function envelope(testCase,answer,{verification=true}={}){
  return {statusCode:testCase.expected.expectedStatusCode??200,fixtureKey:testCase.fixtureKey,execution:'deterministic',events:testCase.toolPolicy.required.map(name=>({kind:'account-read:'+name+':1',status:testCase.toolPolicy.failed.includes(name)?'unavailable':'complete'})),
    body:{status:testCase.expected.behavior==='clarify'?'clarification':testCase.expected.behavior==='denial'?'handoff':'answered',answer,
      citations:testCase.expected.requiredSourceBindings.map(({sourceId,url})=>({chunkId:sourceId,url})),...(verification?{verification:{status:'verified',attempts:1}}:{})}};
}
async function observe(testCase){
  const fixture=tutorEvaluationFixtureForCase(testCase),observation={readCalls:0,arguments:[],storageRequests:[],writeRequests:[],result:null};
  if(!selectTutorEvaluationEvidence(testCase.question,testCase.route,testCase.history||[]))return observation;
  observation.result=await readTutorEvaluationEvidence(testCase.fixtureKey==='anonymous'?{}:account(fixture),{question:testCase.question,route:testCase.route,history:testCase.history||[]},{read:async(caller,...args)=>{
    observation.readCalls++;observation.arguments.push({userId:caller.user.id,extraArguments:args.length});
    assert.equal(caller.token,'OFFLINE_TOKEN');assert.equal(caller.url,'https://xiftudmvxphxcjtmfmib.supabase.co');
    if(fixture.error)throw Object.assign(new Error('PRIVATE PROVIDER DIAGNOSTIC'),fixture.error);
    return clone(fixture.native);
  }});
  return observation;
}
const nativeChecks=result=>result.checks.filter(check=>check.id.startsWith('tutor.')&&!['tutor.telemetry','tutor.citedTools','tutor.noPublicResearch','tutor.noUnsupportedClaims','tutor.noUnrequestedComment','tutor.noFileURLs','tutor.ratingClaims','tutor.requiredRatingClaims'].includes(check.id)&&!check.id.startsWith('tutor.tool.'));

test('33 independent questions remain unmounted, with27 planned IDs and three explicit independent charges dependencies',()=>{
  assert.equal(cases.length,33);assert.equal(new Set(cases.map(row=>row.id)).size,33);
  const planned=buildPlannedTutorEvaluationCases();assert.equal(planned.length,27);
  assert.deepEqual(planned.map(row=>row.id),manifest.eligibleCaseIds);
  assert.ok(planned.every(row=>row.plannedFixture.mounted===false&&row.plannedFixture.setupEligible===false&&row.capability.gap));
  assert.equal(planned.filter(row=>row.plannedFixture.requiresAdditionalFixtures.includes('charges')).length,3);
  assert.equal(manifest.liveAcceptance,false);assert.equal(manifest.questionnaireVersion,1);
  assert.equal(planned.find(row=>row.id.endsWith('-anonymous')).fixtureKey,'anonymous');
  assert.deepEqual(manifest.defaultProjection,['submittedAt']);
});

test('manual golden scores and nullable/blank fixtures remain independent from response and source formatter code',()=>{
  const fixture=tutorEvaluationFixtureForCase(find('all-ratings'));
  assert.deepEqual(fixture.native.evaluation.ratings,[5,2,4,1,3,2,5,3,1,4]);
  assert.notDeepEqual(fixture.foreign.evaluation.ratings,fixture.native.evaluation.ratings);
  assert.equal(tutorEvaluationFixtureForCase(find('no-student-profile')).native.student,null);
  assert.equal(tutorEvaluationFixtureForCase(find('no-student-profile')).native.evaluation.submittedAt,'2026-11-14T03:04:05Z');
  assert.equal(tutorEvaluationFixtureForCase(find('blank-comment')).native.evaluation.comment,'');
  assert.equal(tutorEvaluationFixtureForCase(find('unsaved')).native.evaluation,null);
  assert.throws(()=>{fixture.native.evaluation.ratings[0]=4;},TypeError);
  assert.throws(()=>tutorEvaluationFixtureForCase({...find('status'),fixtureKey:'made-up'}));
});

test('native schema is a single-version own form with exact ten ratings and replay semantics, not a semester history',()=>{
  const sql=readFileSync(new URL('../../supabase/migrations/20261114050000_tutor_evaluations.sql',import.meta.url),'utf8');
  assert.match(sql,/primary key \(user_id, questionnaire_version\)/u);
  assert.match(sql,/cardinality\(ratings\) = 10/u);assert.match(sql,/r\.questionnaire_version = 1/u);
  assert.match(sql,/s\.source_mode = 'verified'/u);
  assert.match(sql,/result\.request_id <> key or result\.ratings <> scores or result\.comment <>/u);
  assert.match(sql,/user_id = \(select auth\.uid\(\)\)/u);
  assert.doesNotMatch(sql,/create table public\.affairs_tutor_evaluations \([^;]*term_id/u);
});

test('actual native loader uses exact own read RPC and no payload or user override, with real DTO parsing',async()=>{
  const original=globalThis.fetch,fixture=tutorEvaluationFixtureForCase(find('status')),calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,method:options.method,body:JSON.parse(options.body)});
    assert.equal(options.headers.Authorization,'Bearer OFFLINE_TOKEN');
    return new Response(JSON.stringify(fixture.native),{status:200,headers:{'content-type':'application/json'}});
  };
  try{assert.deepEqual(await loadTutorEvaluation(account(fixture)),fixture.native);
    assert.deepEqual(calls,[{url:'https://xiftudmvxphxcjtmfmib.supabase.co/rest/v1/rpc/affairs_read_tutor_evaluation',method:'POST',body:{}}]);
  }finally{globalThis.fetch=original;}
});

test('all33 independently authored native selection controls expose only requested fields and make no network/write call',async()=>{
  const original=globalThis.fetch;let attempted=0;globalThis.fetch=async()=>{attempted++;throw new Error('Network is disabled for the offline packet.');};
  try{
    const failures=[];
    for(const row of cases){const observation=await observe(row),result=gradeTutorEvaluationCase(row,envelope(row,''),{observation});
      failures.push(...nativeChecks(result).filter(check=>!check.passed).map(check=>({case:row.id,...check,actual:observation.result&&{readState:observation.result.readState,reason:observation.result.reason}})));}
    assert.deepEqual(failures,[]);assert.equal(attempted,0);
  }finally{globalThis.fetch=original;}
});

test('status-only oracle requires correct local source and an independent observation; profile/comment contamination fails',async()=>{
  const row=find('status'),observation=await observe(row),base=envelope(row,status);
  assert.equal(gradeTutorEvaluationCase(row,base,{observation}).passed,true);
  assert.equal(gradeTutorEvaluationCase(row,base).passed,false);
  for(const mutate of [value=>{value.events=[];},value=>{value.body.citations=[];},value=>{value.body.citations[0].url=path+'/notes';},
    value=>{value.body.answer+='\nPRIVATE TUTOR STUDENT NAME';},value=>{value.body.answer+='\nFOREIGN TUTOR COMMENT';},
    value=>{value.body.views=[{title:'Comment',note:tutorEvaluationFixtureForCase(row).native.evaluation.comment}];},
    value=>{value.body.views=[{title:'Action result',rows:[['Result','I submitted your evaluation.']]}];}]){
    const changed=clone(base);mutate(changed);assert.equal(gradeTutorEvaluationCase(row,changed,{observation}).passed,false);
  }
  const badObservation=clone(observation);badObservation.writeRequests.push({kind:'submit_tutor_evaluation'});
  assert.equal(gradeTutorEvaluationCase(row,base,{observation:badObservation}).passed,false);
});

test('numbered ratings are bound to their original questions; swapped values or question labels cannot pass',async()=>{
  const row=find('selected-ratings'),observation=await observe(row);
  const answer=`Question 3: rating 4.\nQuestion 8: rating 3.\n${local}\n${link}`;
  assert.equal(gradeTutorEvaluationCase(row,envelope(row,answer),{observation}).passed,true);
  for(const wrong of [answer.replace('rating 4','rating 3').replace('Question 8: rating 3','Question 8: rating 4'),answer.replace('Question 8','Question 9'),answer+'\nQuestion 3: rating 5.'])
    assert.equal(gradeTutorEvaluationCase(row,envelope(row,wrong),{observation}).passed,false);
  for(const view of [{title:'Saved scores',rows:[['Question 1','5']]},{title:'Saved scores',rows:[['Question 3','5']]},
    {title:'Saved scores',columns:['Question','Rating'],rows:[[3,5]]},{title:'Saved score',questionNumber:3,rating:5}]){
    const changed=envelope(row,answer);changed.body.views=[view];
    assert.equal(gradeTutorEvaluationCase(row,changed,{observation}).passed,false);
  }
  const validCard=envelope(row,answer);validCard.body.views=[{title:'Saved scores',rows:[['Question 3','4'],['Question 8','3']]}];
  assert.equal(gradeTutorEvaluationCase(row,validCard,{observation}).passed,true);
  const noProof=envelope(row,answer,{verification:false});assert.equal(gradeTutorEvaluationCase(row,noProof,{observation}).passed,false);
});

test('literal private comment can be requested; blank is distinct from omitted and a missing submission',async()=>{
  const row=find('comment'),fixture=tutorEvaluationFixtureForCase(row),observation=await observe(row);
  assert.equal(gradeTutorEvaluationCase(row,envelope(row,`Comment: ${fixture.native.evaluation.comment}\n${local}\n${link}`),{observation}).passed,true);
  const blank=find('blank-comment'),blankObservation=await observe(blank);
  assert.equal(JSON.parse(blankObservation.result.evidence.content).submission.comment,'');
  assert.equal(gradeTutorEvaluationCase(blank,envelope(blank,`Comment: blank.\n${local}\n${link}`),{observation:blankObservation}).passed,true);
  const statusPayload=JSON.parse((await observe(find('status'))).result.evidence.content);
  assert.equal(Object.hasOwn(statusPayload.submission,'comment'),false);
  for(const wrong of [`Comment: no submission is saved. ${link}`,`Comment: blank. No saved evaluation. ${link}`])
    assert.equal(gradeTutorEvaluationCase(blank,envelope(blank,wrong),{observation:blankObservation}).passed,false);
});

test('failed lookup never becomes a saved or unsaved answer; no file or official receipt claim may hide in a card',async()=>{
  const row=find('read-unavailable'),observation=await observe(row);
  const answer=`The tutor evaluation lookup is unavailable; I cannot determine whether a submission is saved. ${link}`;
  assert.equal(gradeTutorEvaluationCase(row,envelope(row,answer),{observation}).passed,true);
  const emptyLie=envelope(row,`No saved tutor evaluation records. ${link}`);
  assert.equal(gradeTutorEvaluationCase(row,emptyLie,{observation}).passed,false);
  const statusRow=find('status'),statusObservation=await observe(statusRow),base=envelope(statusRow,status);
  for(const claim of ['I downloaded your official receipt.','Your tutor received your evaluation.','Official approval: approved']){
    const changed=clone(base);changed.body.views=[{title:'Saved result',rows:[['Claim',claim]]}];
    assert.equal(gradeTutorEvaluationCase(statusRow,changed,{observation:statusObservation}).passed,false);
  }
});

test('mixed tuition is independently bound, not interpreted as an evaluation score or approval',async()=>{
  for(const suffix of ['mixed-tuition','mixed-reversed']){
    const row=find(suffix),observation=await observe(row),answer=`${status}\nQA Tutor Tuition instalment: remaining 23,000 TWD.\n[Saved fee records](/school-affairs/services/39-1)`;
    assert.equal(gradeTutorEvaluationCase(row,envelope(row,answer),{observation}).passed,true);
    assert.equal(gradeTutorEvaluationCase(row,envelope(row,answer.replace('23,000','28,000')),{observation}).passed,false);
  }
});

test('concise actual native-to-formatter candidates satisfy independent selected facts without earning model verification',async()=>{
  for(const suffix of ['status','submitted-time','all-ratings','selected-ratings','comment','blank-comment','without-comment','no-student-profile','unsaved',
    'history-boundary','term-boundary','approval-boundary','delivery-boundary','tutor-identity-boundary','profile-boundary','document-boundary','read-unavailable','access-denied']){
    const row=find(suffix),observation=await observe(row);
    const formatted=formatSupplementalAccountAnswers([observation.result],{question:row.question,language:'en'});
    const actual={...envelope(row,''),body:formatted};
    const result=gradeTutorEvaluationCase(row,actual,{observation});
    assert.deepEqual(result.failures.filter(check=>!check.id.startsWith('answer.verification')),[],suffix);
    assert.equal(formatted.verification,undefined,'A formatter cannot manufacture model verification credit.');
    if(row.expected.behavior==='answer'){
      assert.equal(result.passed,false,'Formatter execution alone is not independently verified model behavior.');
      assert.ok(result.failures.some(check=>check.id==='answer.verification'));
    }
  }
});
