import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {clubAttendanceRunnerCases,clubAttendanceOracle,gradeClubAttendanceCase} from './club-attendance-cases.mjs';
import {buildClubAttendancePlan,expectedClubAttendancePage} from './club-attendance-fixtures.mjs';
import {assessCoverage} from './coverage.mjs';
import {evaluationSuite,main} from './run.mjs';

const uuid=n=>'bac1feed-0000-4000-8000-'+String(n).padStart(12,'0');
const owners=[uuid(2),uuid(3)],runId=uuid(1),plan=buildClubAttendancePlan({runId,owners,ids:Array.from({length:30},(_,i)=>uuid(i+100))});
const cases=clubAttendanceRunnerCases(),digest='d'.repeat(64);
function fixtureProof(row){
  const {page,role,tuitionUnlinked}=clubAttendanceOracle(row);
  return {stateBefore:{ownedRecordsDigest:digest},stateAfterProposal:{ownedRecordsDigest:digest},
    fixtureReadback:{verified:true,independentGolden:true,clubAttendance:{page,role,twoOwnersVerified:true,...(tuitionUnlinked?{tuitionUnlinked:true}:{})}}};
}

async function execute(t,selected=cases){
  const host='https://xiftudmvxphxcjtmfmib.supabase.co',key='SYNTHETIC_CLUB_PUBLISHABLE_KEY',ownToken='SYNTHETIC_CLUB_PARTICIPANT_',calls=[],studentReads=[];
  const current={owner:undefined};
  t.mock.method(globalThis,'fetch',async (value,init)=>{
    assert.equal(init.redirect,'error');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+ownToken+current.owner);
    const url=new URL(value);
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.origin,host);assert.equal(init.method,'GET');
      assert.deepEqual(Object.fromEntries(url.searchParams),{select:'id,user_id',user_id:'eq.'+current.owner,limit:'1'});
      studentReads.push(current.owner);
      return Response.json([]);
    }
    assert.equal(String(value),host+'/rest/v1/rpc/affairs_read_club_student');assert.equal(init.method,'POST');
    const requested=JSON.parse(init.body);
    assert.deepEqual(requested,{p_view:'my-attendance',p_search:'',p_page:requested.p_page});
    calls.push(requested.p_page);
    return Response.json(expectedClubAttendancePage(plan,current.owner,requested.p_page));
  });
  const account=createAffairsAssistantHandler({verifyToken:async token=>{
    const owner=token.slice(ownToken.length);assert.ok(owners.includes(owner));
    current.owner=owner;return {user:{id:owner},token,key,url:host};
  },loadSnapshot:()=>assert.fail('broad account read'),answerAccount:()=>assert.fail('unrelated model'),publicResearch:()=>assert.fail('public research')});
  const guest=createResearchAssistantHandler();
  const results=[];
  for(const row of selected){
    const oracle=clubAttendanceOracle(row),start=calls.length,studentStart=studentReads.length;
    const headers=oracle.guest?{'x-forwarded-for':'192.0.2.67'}:{authorization:'Bearer '+ownToken+owners[oracle.role==='A'?0:1]};
    let statusCode,body;
    const sink={setHeader(){},status(status){statusCode=status;return sink;},json(value){body=value;}};
    await (oracle.guest?guest:account)({method:'POST',headers,body:{question:row.question,route:row.route,history:row.history}},sink);
    assert.equal(statusCode,200,row.id);
    assert.deepEqual(calls.slice(start),oracle.read?[oracle.page]:[],row.id);
    assert.deepEqual(studentReads.slice(studentStart),oracle.tuitionUnlinked?[owners[0]]:[],row.id);
    const envelope={statusCode,body,events:body.activity??[],execution:'deterministic',fixtureKey:row.fixtureKey,
      ...(oracle.guest?{}:fixtureProof(row))};
    const result=gradeClubAttendanceCase(row,envelope);
    assert.ok(result.passed,row.id+' '+JSON.stringify(result.failures));
    results.push({row,envelope});
  }
  return results;
}

test('all registered bilingual cases independently grade the actual handlers and exact read requests',async t=>{
  const results=await execute(t);
  assert.equal(results.length,18);
  const record=results.find(({row})=>row.id.endsWith('exact-page'));
  const wrong=structuredClone(record.envelope);wrong.body.views[0].rows.reverse();
  assert.ok(gradeClubAttendanceCase(record.row,wrong).failures.some(row=>row.id==='club.attendance.scopedRows'));
  const missing=structuredClone(record.envelope);delete missing.fixtureReadback;
  assert.ok(gradeClubAttendanceCase(record.row,missing).failures.some(row=>row.id==='club.attendance.readback'));
  const extraLink=structuredClone(record.envelope);extraLink.body.answer+=' [Other](/school-affairs/services/40-1/my-memberships)';
  assert.ok(gradeClubAttendanceCase(record.row,extraLink).failures.some(row=>row.id==='club.attendance.exactLinks'));
  const wrongPage=structuredClone(record.envelope);wrongPage.fixtureReadback.clubAttendance.page=1;
  assert.ok(gradeClubAttendanceCase(record.row,wrongPage).failures.some(row=>row.id==='club.attendance.readback'));
  assert.throws(()=>clubAttendanceOracle({...record.row,route:'/elsewhere'}),/independent fixture/u);
  const paired=results.find(({row})=>row.id.endsWith('partial-with-fees'));
  const guessed=structuredClone(paired.envelope);guessed.body.answer+=' Your balance is NT$0.';
  assert.ok(gradeClubAttendanceCase(paired.row,guessed).failures.some(row=>row.id==='club.attendance.unlinkedTuition'));
  const unattested=structuredClone(paired.envelope);delete unattested.fixtureReadback.clubAttendance.tuitionUnlinked;
  assert.ok(gradeClubAttendanceCase(paired.row,unattested).failures.some(row=>row.id==='club.attendance.unlinkedTuition'));
});

test('fixture has no public event, applies the attendance owner instead of applicant, and is mandatory in the coverage inventory',async()=>{
  assert.equal(plan.clubs[0].active,false);assert.ok(plan.applications.every(row=>row.calendar_activity_id===null));
  assert.equal(expectedClubAttendancePage(plan,owners[0],1).rows.length,25);
  assert.equal(expectedClubAttendancePage(plan,owners[0],2).rows.length,2);
  assert.equal(expectedClubAttendancePage(plan,owners[0],3).rows.length,0);
  const [foreign]=expectedClubAttendancePage(plan,owners[1],1).rows;
  assert.equal(plan.applications.find(row=>row.id===foreign.id).applicant_id,owners[0]);
  assert.equal(expectedClubAttendancePage(plan,owners[0],1).rows.some(row=>row.id===foreign.id),false);
  const suite=await evaluationSuite('2026-11-15T10:00:00Z');
  assert.deepEqual(suite.cases.filter(row=>row.domain==='clubAttendance'),cases);
  assert.ok(suite.inventory.tools.some(row=>row.id==='clubAttendance'));
  assert.deepEqual(suite.inventory.routeFamilies.find(row=>row.id==='student-club-attendance').routes,[
    '/school-affairs/services/40-1/my-attendance','/school-affairs/services/40-1/my-attendance?page=:page']);
});

test('runner requires the actual fixture contract before a case can contact its pinned endpoint and labels execution without LLM credit',async t=>{
  const [{row,envelope}]=await execute(t,cases.slice(0,1));
  const preview='https://club-qa-v1-d286.vercel.app',revision='e'.repeat(40),log=[];
  const manifest={version:1,revision,source:'vercel-git',environment:'preview',builtAt:'2026-11-15T12:00:00.000Z'};
  const adapter={clubAttendanceFixtureVersion:1,async prepare(){log.push('prepare');},async forCase(){log.push('bind');return {token:'SYNTHETIC_QA'};},
    async afterCase(testCase,target){log.push('observe');Object.assign(target,fixtureProof(testCase));},async cleanup(){log.push('cleanup');return {verified:true};}};
  const argv=['--mode','live','--origin',preview,'--approved-preview-origin',preview,'--fixture-module','tests/evaluation/live-fixtures.mjs'];
  const inventory={hash:digest,services:['40-1'],tools:['clubAttendance'],publicPages:[],routeFamilies:[{id:'student-club-attendance',routes:[row.route],auth:'signed-in'}]};
  const dependencies={
    evaluationSuite:async()=>({cases:[structuredClone(row)],inventory,suiteHash:digest}),
    sourceIdentity:async()=>({dirty:false,sourceRevision:revision,workingTreeHash:digest}),
    loadFixtureAdapter:async()=>adapter,saveReport:async()=>{},log:()=>{},
    pace:async(start,_signal,beforeStart)=>{await beforeStart();return start(0);},
    fetchImpl:async (input,init)=>{
      const url=new URL(input);
      assert.equal(url.origin,preview);
      if(url.pathname==='/release.json'){log.push('pin');return Response.json(manifest);}
      assert.equal(url.pathname,'/api/affairs-assistant');assert.equal(init.headers.Authorization,'Bearer SYNTHETIC_QA');
      assert.equal(JSON.parse(init.body).route,row.route);log.push('post');return Response.json(envelope.body);
    },
  };
  const previous=process.exitCode;
  try{
    const report=await main(argv,dependencies);
    assert.deepEqual(log,['pin','prepare','pin','bind','pin','post','pin','observe','cleanup','pin']);
    assert.equal(report.results[0].execution,'live-native');assert.equal(report.results[0].passed,true);
    assert.ok(report.assessment.integrity.failures.some(failure=>failure.id==='run.injectedDependencies'));
    const forcedModel=assessCoverage({cases:[row],results:[{...report.results[0],execution:'live-model'}],inventory,sourceRevision:revision});
    assert.ok(forcedModel.failures.some(failure=>failure.id==='result.notLive'));
    log.length=0;delete adapter.clubAttendanceFixtureVersion;
    await assert.rejects(main(argv,dependencies),/both-owner readback adapter/u);
    assert.deepEqual(log,['pin','cleanup','pin']);
  }finally{process.exitCode=previous;}
});
