import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {elearningFixtureManifest,elearningFixturePlan,verifyElearningFixtureWorkspace} from './elearning-fixtures.mjs';
import {gradeCase} from './grading.mjs';
import {readElearningEvidence} from '../../server/accountElearningEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

// Actual native RPC reader -> evidence projection -> formatter -> independent
// grader, with intercepted transport only. No Auth, DB, provider or lifecycle.
// The synthetic verification envelope exercises grading; it is not model proof.
const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLIC',token:'OFFLINE_CALLER_A',user:{id:a}};
const {courseA,courseB,joinedAt}=elearningFixtureManifest;
const bank=buildAccountCases();
const events=tool=>[{kind:'account-read:'+tool+':1',status:'running'},{kind:'account-read:'+tool+':1',status:'complete'}];
function workspaceFor(plan){
  return {userId:a,categories:[],notices:[],courses:[courseA,courseB].map(course=>({...course,self_enroll:false})),
    enrollments:plan.rows.filter(row=>row.user_id===a).map(row=>({courseId:row.course_id,joinedAt:row.joined_at}))};
}
async function rendered(suffix,{failed=false,wrongOwner=false}={}){
  const testCase=structuredClone(bank.find(row=>row.id==='account:elearning-'+suffix));assert.ok(testCase);
  const plan=elearningFixturePlan(testCase.fixtureKey,[a,b]),workspace=workspaceFor(plan);
  verifyElearningFixtureWorkspace(plan,a,workspace);
  const original=globalThis.fetch;let reads=0;
  let result;
  try{
    globalThis.fetch=async(input,init)=>{
      reads++;assert.equal(String(input),account.url+'/rest/v1/rpc/elearning_workspace');
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
      assert.equal(init.headers.Authorization,'Bearer '+account.token);assert.equal(init.headers.apikey,account.key);
      assert.deepEqual(JSON.parse(init.body),{});
      return failed?Response.json({error:'OFFLINE_TRANSPORT_ERROR'},{status:503})
        :Response.json(wrongOwner?{...workspace,userId:b}:workspace);
    };
    result=await readElearningEvidence(account,{question:testCase.question,route:testCase.route});
  }finally{globalThis.fetch=original;}
  const body=formatSupplementalAccountAnswers([result],{question:testCase.question});
  return {testCase,result,reads,envelope:{statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,
    events:events('elearningEnrollments'),body:{...body,verification:{status:'verified',attempts:1}}}};
}
const grade=value=>gradeCase(value.testCase,value.envelope);
const pass=value=>{const result=grade(value);assert.equal(result.passed,true,JSON.stringify(result.failures));return result;};
const fail=value=>{const result=grade(value);assert.equal(result.passed,false);return result;};
function paired(value){
  value.testCase.expected.facts=[{label:courseA.title,kind:'text',values:[courseA.title],fields:[
    {label:'Joined',kind:'date',values:[joinedAt],match:'literal'},
  ]}];
  value.testCase.expected.requiredLinks.push('/elearning/course/'+courseA.id);
  return value;
}

test('native fixture, reader and formatter preserve the exact owned course/date pair',async()=>{
  const value=paired(await rendered('enrollment'));assert.equal(value.reads,1);assert.equal(value.result.readState,'ok');
  assert.deepEqual(JSON.parse(value.result.evidence.content).rows,[{courseId:courseA.id,title:courseA.title,joinedAt,url:'/elearning/course/'+courseA.id}]);
  const result=pass(value);assert.equal(result.execution,'deterministic');
  assert.match(value.envelope.body.answer,/- Course: [^\n]+\n  - Joined:/u);
  assert.deepEqual(value.envelope.body.views[0].rows,[[courseA.title,joinedAt]]);
  assert.doesNotMatch(JSON.stringify(value.envelope.body),/OFFLINE_CALLER|OFFLINE_PUBLIC|userId|user_id/u);
});

test('a correct date under another course, a wrong field, or an unbound sibling cannot satisfy the pair',async()=>{
  const original=paired(await rendered('enrollment'));
  for(const transform of [
    answer=>answer.replace(joinedAt,'2026-11-13T00:00:00.000Z'),
    answer=>answer.replace('  - Joined:','  - Last viewed:'),
    answer=>answer.replace('  - Joined:','- Course: ` Unrelated course `\n  - Joined:'),
    answer=>answer.replaceAll('\n  - ','\n- '),
  ]){
    const changed=structuredClone(original);changed.envelope.body.answer=transform(changed.envelope.body.answer);
    assert.ok(fail(changed).failures.some(row=>row.id.startsWith('fact.')));
  }
});

test('a successful empty native enrollment read grades as local absence, not a fabricated course',async()=>{
  const value=await rendered('enrollment-empty');assert.equal(value.reads,1);assert.equal(value.result.readState,'empty');pass(value);
  const payload=JSON.parse(value.result.evidence.content);assert.deepEqual(payload.counts,{available:0,included:0,omitted:0});
  assert.match(value.envelope.body.answer,/no saved remote-learning Moodle enrollments/u);
  for(const target of ['answer','view']){
    const leaked=structuredClone(value);
    if(target==='answer')leaked.envelope.body.answer+='\nCourse: '+courseA.title;
    else leaked.envelope.body.views.push({title:'Courses',rows:[[courseA.title,joinedAt]]});
    assert.ok(fail(leaked).failures.some(row=>row.id.startsWith('text.forbidden.')));
  }
});

test('remote local absence is recognized independently of an unrelated provenance disclaimer',async()=>{
  const value=await rendered('enrollment-empty');
  value.envelope.body.answer=value.envelope.body.answer.replace('These records cannot establish official university enrollment.','');
  pass(value);
  for(const replacement of [
    'It is not true that there are no saved remote-learning Moodle enrollments for this account.',
    'Do not say there are no saved remote-learning Moodle enrollments for this account.',
    'Are there no saved remote-learning Moodle enrollments for this account?',
  ]){
    const changed=structuredClone(value);
    changed.envelope.body.answer=changed.envelope.body.answer.replace('There are no saved remote-learning Moodle enrollments for this account.',replacement);
    assert.ok(fail(changed).failures.some(row=>row.id==='answer.limitation'));
  }
});

test('unsupported remote grades remain a capability limitation without querying or substituting local DTM data',async()=>{
  const value=await rendered('grades-unlinked');assert.equal(value.reads,0);pass(value);
  const payload=JSON.parse(value.result.evidence.content);assert.equal(payload.selection.unsupported,true);
  assert.equal(payload.capability.grades,false);assert.deepEqual(payload.rows,[]);assert.equal(payload.counts.available,null);
  assert.match(value.envelope.body.answer,/does not have personal grades/u);
  assert.doesNotMatch(value.envelope.body.answer,/no saved remote-learning Moodle enrollments/u);
  for(const tool of ['dtm','academicGrades','courses']){
    const changed=structuredClone(value);changed.envelope.events.push(...events(tool));
    assert.ok(fail(changed).failures.some(row=>row.id.startsWith('tools.')));
  }
  const tracker=structuredClone(value);tracker.envelope.body.answer+='\nYour grade is 12/20 for Quiz 1.';
  assert.ok(fail(tracker).failures.some(row=>row.id.startsWith('text.forbidden.')));
});

test('foreign course or academic evidence cannot hide inside a valid remote response card or citation',async()=>{
  const original=await rendered('enrollment');
  const foreign=structuredClone(original);foreign.envelope.body.views[0].rows.push([courseB.title,joinedAt]);
  assert.ok(fail(foreign).failures.some(row=>row.id.startsWith('text.forbidden.')));
  for(const tool of ['dtm','academicGrades','courses']){
    const substituted=structuredClone(original);substituted.envelope.body.citations.push({chunkId:'account:'+tool,url:'/school-affairs/records'});
    assert.ok(fail(substituted).failures.some(row=>row.id==='tools.allowed.cited'));
  }
});

test('Nexus sample qualifications never satisfy a remote enrollment or grade oracle',async()=>{
  for(const suffix of ['enrollment','grades-unlinked']){
    const original=await rendered(suffix);
    // Explicit lexical negative controls, not a claim of universal semantic
    // detection. They never alter the shared live bank or credit another tool.
    original.testCase.expected.forbiddenText.push('IM101','IM203','Digital Systems Foundations','Data and AI Literacy');
    pass(original);
    const contaminated=structuredClone(original);
    contaminated.envelope.body.answer+='\nIM101 Digital Systems Foundations and IM203 Data and AI Literacy are your enrolled subjects.';
    assert.ok(fail(contaminated).failures.some(row=>row.id.startsWith('text.forbidden.')));
  }
});

test('failed or wrong-owner reads cannot pass the successful-empty or populated native cases',async()=>{
  for(const failure of [{failed:true},{wrongOwner:true}]){
    const value=await rendered('enrollment',failure);assert.equal(value.reads,1);assert.equal(value.result.readState,'unavailable');
    const payload=JSON.parse(value.result.evidence.content);assert.deepEqual(payload.counts,{available:null,included:0,omitted:null});
    assert.match(value.envelope.body.answer,/could not be checked/u);assert.doesNotMatch(value.envelope.body.answer,/no saved remote-learning Moodle enrollments/u);
    fail(value);
    const empty=structuredClone(value);empty.testCase=structuredClone(bank.find(row=>row.id==='account:elearning-enrollment-empty'));
    empty.envelope.fixtureKey=empty.testCase.fixtureKey;fail(empty);
  }
});
