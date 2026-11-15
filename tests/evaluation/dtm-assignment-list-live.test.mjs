import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {buildDtmAssignmentListFixture,readDtmAssignmentListFixture,dtmAssignmentListDispatch,
  bindDtmAssignmentListReadback,dtmAssignmentListLiveCases,assertDtmAssignmentListLiveCases,
  verifiedDtmAssignmentListReadback} from './dtm-assignment-list-live.mjs';
import {dtmAssignmentListCases} from './dtm-assignment-list-cases.mjs';
import {nativeDtmSetupRequired} from './dtm-native-runner.mjs';
import {options} from './run.mjs';

const users=['A','B'].map(role=>({id:randomUUID(),studentId:randomUUID(),token:'synthetic-'+role}));
const plan=buildDtmAssignmentListFixture(users);
const readResponse=async response=>response.json();
function transport({leak=false,alter=false}={}){
  return async (url,{method,redirect,headers})=>{
    assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(method,'GET');
    assert.equal(redirect,'error');
    assert.equal(headers.apikey,'test-publishable');
    assert.equal(url.searchParams.get('limit'),'12');
    const user=users.find(owner=>headers.Authorization==='Bearer '+owner.token);
    assert.ok(user);
    const courseRead=url.pathname.endsWith('/dtm_courses');
    const key=courseRead?'id':'dtm_course_id';
    assert.equal(url.searchParams.get(key),'in.('+plan.courses.map(row=>row.id).join(',')+')');
    assert.equal(url.searchParams.has('user_id'),false);
    assert.equal(url.searchParams.has('student_id'),false);
    const all=courseRead?plan.courses:plan.assignments;
    const rows=structuredClone(all.filter(row=>leak||(courseRead?row.user_id===user.id:row.student_id===user.studentId)));
    if(alter&&!courseRead)rows[0].due_at='2026-11-15T10:00:00+00:00';
    return Response.json(rows.reverse());
  };
}
const readOptions={publishable:'test-publishable',readResponse};

test('only the exact fixed-clock Moodle packet can request protected Preview fixtures',()=>{
  const cases=dtmAssignmentListLiveCases();
  assert.equal(cases.length,9);
  assert.doesNotThrow(()=>assertDtmAssignmentListLiveCases(cases));
  const edited=structuredClone(cases);
  edited[0].route='/dtm';
  assert.throws(()=>assertDtmAssignmentListLiveCases(edited),/unchanged/);
  assert.ok(cases.every(row=>!nativeDtmSetupRequired(row)));
  assert.ok(dtmAssignmentListCases().every(nativeDtmSetupRequired));
  const command=['--mode','live','--case-family','dtm-assignment-list','--fixture-module','tests/evaluation/live-fixtures.mjs'];
  const origin='https://stdedu-123456789-v1-d286.vercel.app';
  const target=['--origin',origin,'--approved-preview-origin',origin];
  assert.throws(()=>options(command),/Preview origin/);
  assert.throws(()=>options([...command,...target]),/OIDC/);
  assert.throws(()=>options([...command,...target,'--preview-auth','oidc','--max-cases','1']),/complete isolated family/);
  assert.equal(options([...command,...target,'--preview-auth','oidc']).caseFamily,'dtm-assignment-list');
});

test('paired independent readback requires owner isolation and literal persisted data',async()=>{
  const observed=await readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport()});
  assert.deepEqual(observed.map(row=>row.count),[8,2]);
  assert.notEqual(observed[0].sha256,observed[1].sha256);
  await assert.rejects(readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport({leak:true})}),/owner boundary/);
  await assert.rejects(readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport({alter:true})}),/different rows/);
  const duplicated=structuredClone(users);
  duplicated[1].token=duplicated[0].token;
  await assert.rejects(readDtmAssignmentListFixture(plan,duplicated,{...readOptions,fetchImpl:transport()}),/matching caller/);
});

test('pinned response needs exact request fingerprint, first-pass read and unchanged two-owner observation',async()=>{
  const item=dtmAssignmentListLiveCases()[0];
  const observed=await readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport()});
  const observations={before:observed,after:structuredClone(observed)};
  const revision='a'.repeat(40);
  const envelope={
    execution:'live-native',statusCode:200,sourceRevision:revision,correlationId:randomUUID(),
    deploymentCheck:{verified:true,sourceRevision:revision,requestIndex:1},
    body:{verification:{status:'verified',attempts:1}},
    assignmentListDispatch:dtmAssignmentListDispatch('/api/affairs-assistant',JSON.stringify({
      question:item.question,history:[],route:item.route,stream:true,consentedResearchUse:false,
    })),
    events:[{kind:'account-read:dtmAssignmentList:1',status:'complete'},{kind:'verification-1',status:'running'},{kind:'verification-1',status:'complete'}],
  };
  assert.equal(verifiedDtmAssignmentListReadback(item,envelope),false);
  const readback=bindDtmAssignmentListReadback(item,envelope,observations);
  envelope.fixtureReadback={verified:true,independentGolden:true,projectRef:'xiftudmvxphxcjtmfmib',dtmAssignmentList:readback};
  assert.equal(verifiedDtmAssignmentListReadback(item,envelope),true);
  assert.equal(verifiedDtmAssignmentListReadback(dtmAssignmentListLiveCases()[1],envelope),false);
  assert.equal(verifiedDtmAssignmentListReadback(item,{...envelope,events:[]}),false);
  assert.equal(verifiedDtmAssignmentListReadback(item,{...envelope,correlationId:randomUUID()}),false);
  observations.after[1].sha256='b'.repeat(64);
  assert.throws(()=>bindDtmAssignmentListReadback(item,envelope,observations),/two caller readbacks/);
});
