import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {buildDtmAssignmentListFixture,readDtmAssignmentListFixture,dtmAssignmentListDispatch,
  bindDtmAssignmentListReadback,dtmAssignmentListFamilies,dtmAssignmentListLiveCases,assertDtmAssignmentListLiveCases,
  dtmAssignmentListExpectedReadCounts,dtmAssignmentListLiveFixture,initializeDtmAssignmentListStudent,
  assertDtmAssignmentListClock,isDtmAssignmentListClockFamily,
  verifiedDtmAssignmentListReadback} from './dtm-assignment-list-live.mjs';
import {dtmAssignmentListCases} from './dtm-assignment-list-cases.mjs';
import {nativeDtmSetupRequired} from './dtm-native-runner.mjs';
import {main,options} from './run.mjs';

const users=['A','B'].map(role=>({id:randomUUID(),studentId:randomUUID(),token:'synthetic-'+role}));
const plan=buildDtmAssignmentListFixture(users);
const anchor='2026-12-01T11:30:00.000Z';
const allFamilyCases=family=>dtmAssignmentListLiveCases(family,{now:anchor});
const readResponse=async response=>response.json();
function transport({leak=false,alter=false,extra=false,fixture=plan}={}){
  return async (url,{method,redirect,headers})=>{
    assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(method,'GET');
    assert.equal(redirect,'error');
    assert.equal(headers.apikey,'test-publishable');
    assert.equal(url.searchParams.get('limit'),String(Math.max(fixture.courses.length,fixture.assignments.length)+1));
    const user=users.find(owner=>headers.Authorization==='Bearer '+owner.token);
    assert.ok(user);
    const courseRead=url.pathname.endsWith('/dtm_courses');
    const key=courseRead?'user_id':'student_id';
    const ownerKey=courseRead?'id':'studentId';
    assert.equal(url.searchParams.get(key),'in.('+users.map(row=>row[ownerKey]).join(',')+')');
    assert.equal(url.searchParams.get('dtm_course_id'),courseRead?null:'not.is.null');
    const all=courseRead?fixture.courses:fixture.assignments;
    const rows=structuredClone(all.filter(row=>leak||(courseRead?row.user_id===user.id:row.student_id===user.studentId)));
    if(alter&&!courseRead)rows[0].due_at='2026-11-15T10:00:00+00:00';
    if(extra&&!courseRead)rows.push({...rows[0],id:randomUUID(),dtm_course_id:randomUUID(),title:'Unplanned sample assignment'});
    return Response.json(rows.reverse());
  };
}
const readOptions={publishable:'test-publishable',readResponse};

test('assignment fixtures initialize only School Affairs and bind a single owned student',async()=>{
  const user=users[0];
  const request=({foreign=false,wrongProfile=false}={})=>{
    const paths=[];
    const read=initializeDtmAssignmentListStudent(user,{...readOptions,fetchImpl:async (url,init)=>{
      assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
      assert.equal(init.redirect,'error');
      assert.equal(init.headers.Authorization,'Bearer '+user.token);
      paths.push(url.pathname);
      if(paths.length===1){
        assert.equal(init.method,'POST');assert.equal(init.body,'{}');
        assert.equal(url.pathname,'/rest/v1/rpc/affairs_initialize_account');
        return Response.json({user_id:wrongProfile?users[1].id:user.id,role:'student'});
      }
      assert.equal(init.method,'GET');
      assert.equal(url.pathname,'/rest/v1/affairs_students');
      assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);
      return Response.json([{user_id:foreign?users[1].id:user.id,id:user.studentId}]);
    }});
    return {read,paths};
  };
  const accepted=request();
  assert.equal(await accepted.read,user.studentId);
  assert.deepEqual(accepted.paths,['/rest/v1/rpc/affairs_initialize_account','/rest/v1/affairs_students']);
  const wrongProfile=request({wrongProfile:true});
  await assert.rejects(wrongProfile.read,/student profile/);
  const foreign=request({foreign:true});
  await assert.rejects(foreign.read,/exactly one disposable student/);
});


test('only the exact fixed-clock Moodle packet can request protected Preview fixtures',()=>{
  const cases=dtmAssignmentListLiveCases();
  assert.equal(cases.length,16);
  assert.equal(cases.filter(row=>row.auth==='anonymous').length,1);
  assert.equal(cases.find(row=>row.auth==='anonymous').fixtureKey,'anonymous');
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
  for(const family of dtmAssignmentListFamilies.slice(1)){
    const variants=allFamilyCases(family);
    assert.doesNotThrow(()=>assertDtmAssignmentListLiveCases(variants,family,{now:anchor}));
    assert.throws(()=>assertDtmAssignmentListLiveCases(variants),/unchanged/);
    assert.throws(()=>assertDtmAssignmentListLiveCases(cases,family,{now:anchor}),/unchanged/);
    const variantCommand=command.map(arg=>arg==='dtm-assignment-list'?family:arg);
    assert.equal(options([...variantCommand,...target,'--preview-auth','oidc']).caseFamily,family);
    assert.throws(()=>options([...variantCommand,...target,'--preview-auth','oidc','--only','account:']),/complete isolated family/);
    if(isDtmAssignmentListClockFamily(family))
      assert.throws(()=>options([...variantCommand,...target,'--preview-auth','oidc','--now',anchor]),/real clock/);
  }
});

test('paired independent readback requires owner isolation and literal persisted data',async()=>{
  const observed=await readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport()});
  assert.deepEqual(observed.map(row=>row.count),[8,2]);
  assert.notEqual(observed[0].sha256,observed[1].sha256);
  await assert.rejects(readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport({leak:true})}),/owner boundary/);
  await assert.rejects(readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport({alter:true})}),/different rows/);
  await assert.rejects(readDtmAssignmentListFixture(plan,users,{...readOptions,fetchImpl:transport({extra:true})}),/different rows/);
  const duplicated=structuredClone(users);
  duplicated[1].token=duplicated[0].token;
  await assert.rejects(readDtmAssignmentListFixture(plan,duplicated,{...readOptions,fetchImpl:transport()}),/matching caller/);
});

test('sparse, sample-only and capped plans keep both callers and bind exact rows',async()=>{
  for(const [index,family] of dtmAssignmentListFamilies.slice(1).filter(family=>!isDtmAssignmentListClockFamily(family)).entries()){
    const expectedCounts=[[4,2],[2,2],[25,2]][index];
    const fixture=buildDtmAssignmentListFixture(users,family);
    const cases=dtmAssignmentListLiveCases(family);
    assert.ok(cases.every(row=>JSON.stringify(dtmAssignmentListExpectedReadCounts(row))===JSON.stringify(expectedCounts)));
    assert.ok(fixture.courses.some(row=>row.user_id===users[1].id&&row.source_mode==='personal'));
    assert.ok(fixture.assignments.some(row=>row.student_id===users[1].studentId&&row.title==='OTHER OWNER SENTINEL'));
    const read=await readDtmAssignmentListFixture(fixture,users,{family,...readOptions,fetchImpl:transport({fixture})});
    assert.deepEqual(read.map(row=>row.count),expectedCounts);
    await assert.rejects(readDtmAssignmentListFixture(fixture,users,{...readOptions,fetchImpl:transport({fixture})}),/matching caller/);
    await assert.rejects(readDtmAssignmentListFixture(fixture,users,{family,...readOptions,fetchImpl:transport({fixture,leak:true})}),/owner boundary/);
  }
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
    }),true),
    events:[{kind:'account-read:dtmAssignmentList:1',status:'complete'},{kind:'verification-1',status:'running'},{kind:'verification-1',status:'complete'}],
  };
  assert.equal(verifiedDtmAssignmentListReadback(item,envelope),false);
  const readback=bindDtmAssignmentListReadback(item,envelope,observations);
  envelope.fixtureReadback={verified:true,independentGolden:true,projectRef:'xiftudmvxphxcjtmfmib',dtmAssignmentList:readback};
  assert.equal(verifiedDtmAssignmentListReadback(item,envelope),true);
  assert.equal(verifiedDtmAssignmentListReadback(dtmAssignmentListLiveCases()[1],envelope),false);
  assert.equal(verifiedDtmAssignmentListReadback(item,{...envelope,events:[]}),false);
  assert.equal(verifiedDtmAssignmentListReadback(item,{...envelope,correlationId:randomUUID()}),false);
  assert.equal(verifiedDtmAssignmentListReadback(item,{...envelope,
    assignmentListDispatch:{...envelope.assignmentListDispatch,authenticated:false}}),false);
  observations.after[1].sha256='b'.repeat(64);
  assert.throws(()=>bindDtmAssignmentListReadback(item,envelope,observations),/two caller readbacks/);
});


test('fixed date cases preserve literal rows, prompts and judgement through strict Taipei boundaries',()=>{
  const relative=dtmAssignmentListLiveCases('dtm-assignment-list-relative-fixed');
  const [overdue]=dtmAssignmentListLiveCases('dtm-assignment-list-overdue-fixed');
  const frozen=dtmAssignmentListCases();
  for(const item of [...relative,overdue]){
    const expected=frozen.find(row=>row.id===item.id);
    assert.equal(item.question,expected.question);
    assert.deepEqual(item.expected,expected.expected);
    assert.deepEqual(item.observation,expected.observation);
    assert.equal(item.assignmentListClock.mode,'fixed');
    assert.equal(item.assignmentListClock.offset,0);
  }
  const today=relative[0];
  assert.equal(assertDtmAssignmentListClock(today,'2026-11-16T16:00:00.000Z'),'2026-11-16T16:00:00.000Z');
  assert.throws(()=>assertDtmAssignmentListClock(today,'2026-11-16T15:59:59.999Z'),{code:'dtm-assignment-list-clock-invalid'});
  assert.throws(()=>assertDtmAssignmentListClock(today,'2026-11-17T16:00:00.000Z'),{code:'dtm-assignment-list-clock-invalid'});
  assert.throws(()=>assertDtmAssignmentListClock(overdue,'2026-11-16T10:00:00.000Z'),{code:'dtm-assignment-list-clock-invalid'});
  assert.equal(assertDtmAssignmentListClock(overdue,'2026-11-16T10:00:00.001Z'),'2026-11-16T10:00:00.001Z');
  assert.throws(()=>assertDtmAssignmentListClock(overdue,'2026-11-17T01:09:30.000Z',{reserveMs:65_000}),{code:'dtm-assignment-list-clock-invalid'});
  assert.throws(()=>assertDtmAssignmentListClock(overdue,'2026-11-17T01:10:00.000Z'),{code:'dtm-assignment-list-clock-invalid'});
});

test('portable families translate every dated row and exact due facts without replacing fixed cases',async()=>{
  const portable=allFamilyCases('dtm-assignment-list-relative-portable');
  const [today, tomorrow,account]=portable;
  assert.equal(today.id,'account:dtm-assignment-list-portable-today');
  assert.equal(today.assignmentListClock.mode,'portable');
  assert.equal(today.assignmentListClock.opensAt,'2026-11-30T16:00:00.000Z');
  assert.equal(today.assignmentListClock.validUntil,'2026-12-01T16:00:00.000Z');
  assert.deepEqual(today.expected.facts[0].fields[0].values,['2026-12-01 09:10']);
  assert.deepEqual(tomorrow.expected.facts,[]);
  assert.deepEqual(account.expected.facts.map(fact=>fact.fields[0].values[0]),['2026-12-01 09:10','2026-12-01 10:00']);
  for(const family of ['dtm-assignment-list-relative-portable','dtm-assignment-list-overdue-portable']){
    const [item]=allFamilyCases(family);
    const plan=buildDtmAssignmentListFixture(users,family,{now:anchor});
    const original=dtmAssignmentListLiveFixture(dtmAssignmentListLiveCases(family.replace('portable','fixed'))[0]);
    assert.deepEqual(plan.assignments.map(row=>row.due_at),original.records.map(row=>row.due_at===null
      ?null:new Date(Date.parse(row.due_at)+item.assignmentListClock.offset).toISOString()));
    assert.deepEqual(await readDtmAssignmentListFixture(plan,users,{family,...readOptions,fetchImpl:transport({fixture:plan})}),
      await readDtmAssignmentListFixture(plan,users,{family,...readOptions,fetchImpl:transport({fixture:plan})}));
  }
  const [overdue]=allFamilyCases('dtm-assignment-list-overdue-portable');
  assert.equal(assertDtmAssignmentListClock(overdue,anchor),anchor);
  assert.equal(overdue.expected.facts[0].fields[0].values[0],'2026-12-01 13:15');
  assert.throws(()=>dtmAssignmentListLiveCases('dtm-assignment-list-relative-portable'),{code:'dtm-assignment-list-clock-invalid'});
});

test('dated readback pins live server time to its exact dispatch, two callers and the same immutable window',async()=>{
  for(const family of dtmAssignmentListFamilies.filter(isDtmAssignmentListClockFamily)){
    const [item]=allFamilyCases(family),fixture=buildDtmAssignmentListFixture(users,family,{now:anchor});
    const read=()=>readDtmAssignmentListFixture(fixture,users,{family,...readOptions,fetchImpl:transport({fixture})});
    const before=await read(),after=await read();
    const server=item.assignmentListClock.referenceAt,instant=Date.parse(server);
    const startedAt=new Date(instant-500).toISOString(),checkedAfter=new Date(instant+800).toISOString();
    const revision='a'.repeat(40);
    const envelope={statusCode:200,sourceRevision:revision,execution:'live-native',correlationId:randomUUID(),
      deploymentCheck:{verified:true,sourceRevision:revision,requestIndex:1},
      body:{verification:{status:'verified',attempts:1},grounding:{checkedAt:server}},
      assignmentListDispatch:dtmAssignmentListDispatch('/api/affairs-assistant',JSON.stringify({
        question:item.question,history:[],route:item.route,stream:true,consentedResearchUse:false,
      }),true,startedAt),
      events:[{kind:'account-read:dtmAssignmentList:1',status:'complete'},{kind:'verification-1',status:'running'},{kind:'verification-1',status:'complete'}],
    };
    const pair={before,after,checkedAfter};
    const accepted=bindDtmAssignmentListReadback(item,envelope,pair);
    assert.deepEqual(accepted.clock,{binding:item.assignmentListClock,before:startedAt,checkedAt:server,after:checkedAfter});
    envelope.fixtureReadback={verified:true,independentGolden:true,projectRef:'xiftudmvxphxcjtmfmib',dtmAssignmentList:accepted};
    assert.ok(verifiedDtmAssignmentListReadback(item,envelope));
    for(const checkedAt of [undefined,new Date(instant-10_000).toISOString(),item.assignmentListClock.validUntil]){
      const invalid=structuredClone(envelope);
      invalid.body.grounding.checkedAt=checkedAt;
      assert.throws(()=>bindDtmAssignmentListReadback(item,invalid,pair),{code:'dtm-assignment-list-clock-invalid'});
      assert.equal(verifiedDtmAssignmentListReadback(item,invalid),false);
    }
    assert.throws(()=>bindDtmAssignmentListReadback(item,envelope,{...pair,checkedAfter:item.assignmentListClock.validUntil}),
      {code:'dtm-assignment-list-clock-invalid'});
    assert.throws(()=>bindDtmAssignmentListReadback(item,envelope,{...pair,after:after.toReversed()}),/two caller readbacks/u);
  }
});


test('closed fixed window stops the runner and fixture adapter before deployment access or seeding',async t=>{
  const now='2026-11-17T01:10:00.000Z',caseFamily='dtm-assignment-list-overdue-fixed';
  t.mock.timers.enable({apis:['Date'],now:Date.parse(now)});
  const cases=dtmAssignmentListLiveCases(caseFamily),origin='https://stdedu-123456789-v1-d286.vercel.app';
  const scope={origin,approvedPreviewOrigin:origin};
  const block=()=>assert.fail('A closed fixed window reached the network or fixture adapter.');
  const manifest={cases,inventory:{hash:'a'.repeat(64),services:[],tools:[],publicPages:[],routeFamilies:[]},
    suiteHash:createHash('sha256').update(JSON.stringify(cases)).digest('hex')};
  const args=['--mode','live','--case-family',caseFamily,'--origin',origin,'--approved-preview-origin',origin,
    '--preview-auth','oidc','--fixture-module','tests/evaluation/live-fixtures.mjs'];
  await assert.rejects(main(args,{sourceIdentity:async()=>({sourceRevision:'b'.repeat(40),workingTreeHash:'c'.repeat(64),dirty:false}),
    evaluationSuite:async()=>manifest,fetchImpl:block,loadFixtureAdapter:block,saveReport:()=>{},log:()=>{}}),
  {code:'dtm-assignment-list-clock-invalid'});
  const {prepare}=await import('./live-fixtures.mjs');
  await assert.rejects(prepare({...scope,runId:randomUUID(),cases,caseFamily,now,
    expectedReleaseRevision:'b'.repeat(40),fixtureMode:'dtm-assignment-list-only',previewReadbackFetch:block}),
  {code:'dtm-assignment-list-clock-invalid'});
});
