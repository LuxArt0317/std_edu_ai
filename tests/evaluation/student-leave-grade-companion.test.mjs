import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {answerAccountWithVerification} from '../../server/answerVerificationAccount.js';
import {studentLeaveAssistantPlan} from '../../server/studentLeaveAssistantPlan.js';
import {createStudentLeaveGradeProbe,createStudentLeaveProbe,leaveObservationHeader,studentLeaveRowsDigest} from '../../server/studentLeaveObservation.js';
import {buildStudentLeaveGradePairFixture} from './dtm-grade-report-preview.mjs';
import {requestObservedStudentLeave,studentLeaveHostedGradeCompanionCaseIds,studentLeaveHostedSelection} from './student-leave-hosted-observation.mjs';
import {bindStudentLeaveFixtureCase,buildStudentLeaveFixturePlan,leaveFixtureProject,leaveFixtureTables} from './student-leave-fixture-plan.mjs';
import {expectedAttempt} from './student-leave-offline-adapter.mjs';

const origin='https://stdedu-1234abcde-v1-d286.vercel.app',sourceRevision='e'.repeat(40);
const fixtureIds=studentLeaveHostedGradeCompanionCaseIds();

test('both frozen question orders require the separate companion fixture and cannot mix with other packets',()=>{
  assert.deepEqual(fixtureIds,[
    'account:student-leave-native-leave-and-moodle-grades',
    'account:student-leave-native-moodle-grades-and-leave',
  ]);
  assert.ok(studentLeaveHostedSelection(fixtureIds).every(row=>row.companion==='dtmGradeReport'&&row.family==='ordinary'));
  for(const ids of [[fixtureIds[0]],fixtureIds.slice().reverse(),[fixtureIds[0],'account:student-leave-native-dates']])
    assert.throws(()=>studentLeaveHostedSelection(ids),/Invalid Student Leave/);
  assert.equal(studentLeaveHostedSelection().length,18);
});

test('the actual protected handler verifies both frozen paired answers natively and retains the independent model-review proof',async t=>{
  const runId=randomUUID(),key='OFFLINE_LEAVE_GRADE_KEY_'+randomUUID(),token='OFFLINE_OWNER_TOKEN';
  const owner={id:randomUUID(),email:'evaluation.student@example.invalid',runMarker:runId};
  const crossed={id:randomUUID(),email:'evaluation.other.'+runId+'@example.invalid',runMarker:runId};
  const config={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).host,VERCEL_GIT_COMMIT_SHA:sourceRevision,
    SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'OFFLINE_REVIEW_KEY'};
  for(const [name,value] of Object.entries(config)){
    const prior=process.env[name];process.env[name]=value;
    t.after(()=>{if(prior===undefined)delete process.env[name];else process.env[name]=prior;});
  }
  const binding={runId,projectRef:leaveFixtureProject,origin,sourceRevision,suiteHash:'c'.repeat(64),owners:{A:owner,B:crossed}};
  const plan=buildStudentLeaveFixturePlan({binding,family:'ordinary'});
  const gradeFixture=buildStudentLeaveGradePairFixture(runId,binding.owners);
  const base='https://'+leaveFixtureProject+'.supabase.co';
  let modelReview=false;
  const handler=createAffairsAssistantHandler({
    verifyToken:async supplied=>{
      assert.equal(supplied,token);
      return {url:base,key:'OFFLINE_PUBLIC',token,user:{id:owner.id,email:owner.email,user_metadata:{assistant_evaluation_run:runId}}};
    },
    loadSnapshot:async()=>assert.fail('The paired route must not load the general workspace'),
    publicResearch:async()=>assert.fail('The paired route must not query a public source'),
    answerAccount:options=>answerAccountWithVerification(modelReview
      ?{...options,leavePlan:{...options.leavePlan,deterministicGradePair:false}}:options),
  });
  const seenCorrelations=new Set(),unexpected=[];
  let expectedReads=[],seenReads=[],gradeState='saved',leaveUnavailable=false,lastResponse;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(input);
      if(url.hostname==='api.openai.com'){
        assert.equal(modelReview,true,'Exact paired verification must not dispatch a model');
        assert.equal(url.pathname,'/v1/responses');
        const request=JSON.parse(String(init.body)),draft=JSON.parse(request.input[0].content[0].text);
        assert.equal(request.text.format.name,'answer_evidence_review');
        assert.deepEqual(draft.evidence.map(row=>row.id),['account-scope','account:leaveRecords','account:dtmGradeReport']);
        assert.doesNotMatch(JSON.stringify(draft),/OFFLINE|Unrelated numeric tracker|Crossed leave grade fixture|STUDENT_PRIVATE_REASON/u);
        assert.equal(JSON.parse(draft.evidence[2].content).courses[0].gradeText,'87.00');
        seenReads.push('review');
        const review={supported:true,answersQuestion:true,claims:[
          {claim:'Saved leave dates',supported:true,evidenceId:'account:leaveRecords',jsonPaths:['/records/0/startsOn','/records/0/endsOn'],quotes:[]},
          {claim:'Saved Moodle grade text',supported:true,evidenceId:'account:dtmGradeReport',jsonPaths:['/courses/0/gradeText'],quotes:[]},
        ]};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
      }
      assert.equal(url.origin,base);
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
      if(url.pathname==='/rest/v1/rpc/dtm_grade_report_overview'){
        assert.equal(init.method,'POST');assert.equal(init.body,'{}');assert.equal(init.redirect,'error');
        seenReads.push('grade');
        if(gradeState==='unavailable')return new Response(null,{status:503});
        const raw=structuredClone(gradeFixture.overviews.A);
        if(gradeState==='drift')raw.courses[0].gradeText='91.00';
        if(gradeState==='excerpted'){
          const [baseCourse]=raw.courses;
          raw.courses=Array.from({length:80},(_,index)=>({...baseCourse,
            id:'28000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),
            title:'UNREAD_GRADE_EVIDENCE '+('long course name '.repeat(34))}));
        }
        // PostgREST exposes JSONB order. The raw commitment cannot depend on object order.
        return Response.json({limit:raw.limit,courses:raw.courses.map(row=>Object.fromEntries(Object.entries(row).reverse())),nextCursor:null});
      }
      assert.equal(init.method,'GET');
      const table=url.pathname.split('/').at(-1);
      assert.equal(table,leaveFixtureTables.forms);
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner.id);
      const read=expectedReads[0];
      assert.equal(url.href,read.url);
      seenReads.push('leave');
      if(leaveUnavailable)return new Response(null,{status:503});
      const requested=url.searchParams.get('select').split(',');
      const rows=plan.rows[table].filter(row=>row.user_id===owner.id)
        .map(row=>Object.fromEntries(requested.map(field=>[field,row[field]])));
      assert.equal(studentLeaveRowsDigest(rows),read.rowsDigest);
      return Response.json(rows,{headers:{'content-range':read.contentRange},status:read.statusCode});
    }catch(error){unexpected.push(error);throw error;}
  });
  const endpoint=async(url,init)=>{
    assert.equal(url,origin+'/api/affairs-assistant');
    const headers=new Headers(),result={};
    const response={setHeader(name,value){headers.set(name,value);},status(status){result.status=status;return response;},json(body){result.body=body;}};
    await handler({method:init.method,headers:{authorization:init.headers.Authorization,host:new URL(url).host},body:init.body},response);
    lastResponse={body:result.body,headers};
    return Response.json(result.body,{status:result.status,headers});
  };
  async function run(testCase){
    seenReads=[];
    expectedReads=expectedAttempt(plan,bindStudentLeaveFixtureCase(plan,testCase,{gradeCompanion:true}),studentLeaveRowsDigest).reads;
    const result=await requestObservedStudentLeave({plan,testCase,key,token,fetchImpl:endpoint,seenCorrelations,gradeOverview:gradeFixture.overviews.A});
    assert.deepEqual(unexpected,[]);
    assert.deepEqual(seenReads.slice().sort(),modelReview?['grade','leave','review']:['grade','leave']);
    return result;
  }
  const [first,second]=studentLeaveHostedSelection(fixtureIds).map(row=>row.testCase);
  for(const item of [first,second]){
    const result=await run(item);
    assert.deepEqual(result.failures,[],JSON.stringify(result));
    assert.equal(result.passed,true);assert.equal(result.completedReview,false);
    assert.equal(result.execution,'live-native');assert.equal(result.verificationMethod,'native-paired');
    assert.equal(result.completedModelCalls,0);assert.equal(result.completedNativeCheck,true);
    assert.equal(result.gradeOverviewReads,1);assert.equal(result.reads,1);
    assert.equal(lastResponse.body.activity.filter(step=>step.kind==='student-leave-moodle-evidence-check'&&step.status==='complete').length,1);
    assert.doesNotMatch(JSON.stringify(result),/OFFLINE|example\.invalid|87\.00|2026-11-09/u);
  }
  modelReview=true;
  const priorProof=await run(first);
  assert.deepEqual(priorProof.failures,[]);
  assert.equal(priorProof.verificationMethod,'model');
  assert.equal(priorProof.execution,'live-model');
  assert.equal(priorProof.completedReview,true);
  assert.equal(priorProof.completedNativeCheck,false);
  modelReview=false;
  gradeState='drift';
  const drift=await run(second);
  assert.equal(drift.passed,false);assert.deepEqual(drift.failures,['observation.grade_read_or_evidence_mismatch']);

  for(const [grade,leave,sourceId,expectedText,withheldText] of [
    ['unavailable',false,'account:leaveRecords',/2026-11-09/u,/87\.00|Saved total grade text/u],
    ['excerpted',false,'account:leaveRecords',/2026-11-09/u,/87\.00|UNREAD_GRADE_EVIDENCE/u],
    ['saved',true,'account:dtmGradeReport',/87\.00/u,/2026-11-09|Saved start date/u],
  ]){
    gradeState=grade;leaveUnavailable=leave;
    const limited=await run(first);
    assert.equal(limited.passed,false);
    assert.deepEqual(limited.failures,['observation.missing_or_invalid']);
    const {body,headers}=lastResponse;
    assert.equal(headers.get(leaveObservationHeader),null);
    assert.equal(body.grounding.degraded,true);
    assert.deepEqual(body.verification,{status:'verified',attempts:1});
    assert.match(body.answer,/couldn’t verify/u);
    assert.match(body.answer,expectedText);
    assert.doesNotMatch(JSON.stringify({answer:body.answer,views:body.views}),withheldText);
    assert.deepEqual(body.citations.map(row=>row.chunkId),[sourceId]);
    assert.equal(body.activity.filter(step=>step.kind==='student-leave-moodle-verified-fragment'&&step.status==='complete').length,1);
    assert.equal(body.activity.some(step=>step.kind==='student-leave-moodle-evidence-check'),false);
    const missingRead=body.activity.find(step=>step.kind==='account-read:'+(leave?'leaveRecords':'dtmGradeReport')+':1');
    assert.equal(missingRead.status,grade==='excerpted'?'complete':'unavailable');
    if(grade==='excerpted')assert.match(missingRead.detail,/limited evidence/u);
  }
  gradeState='saved';leaveUnavailable=false;

  // Even the correctly signed solo mode must reject this mixed request before either source.
  seenReads=[];
  const {body}=createStudentLeaveProbe({ownerId:owner.id,runId,origin,sourceRevision,nonce:randomUUID()},
    {question:first.question,route:first.route,history:first.history,stream:false,consentedResearchUse:false},key);
  const wrongMode=await endpoint(origin+'/api/affairs-assistant',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
  assert.equal(wrongMode.status,404);assert.equal(wrongMode.headers.get(leaveObservationHeader),null);
  assert.deepEqual(seenReads,[]);

  const {body:extra}=createStudentLeaveGradeProbe({ownerId:owner.id,runId,origin,sourceRevision,nonce:randomUUID()},
    {question:first.question+' When is my next class?',route:first.route,history:first.history,stream:false,consentedResearchUse:false},key);
  const forbidden=await endpoint(origin+'/api/affairs-assistant',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(extra)});
  assert.equal(forbidden.status,404);assert.equal(forbidden.headers.get(leaveObservationHeader),null);
  assert.deepEqual(seenReads,[]);
});

test('separate overview verification excludes extra requests, field exclusions, grade reports and foreign grades',()=>{
  const route='/school-affairs/services/leave/history';
  for(const question of [
    'Show my leave dates and show my Moodle grade overview. When is my next class?',
    'Show my leave dates and show my Moodle grade overview. Do not show my chemistry grade.',
    'Show my leave dates and show my Moodle grade overview without my chemistry grades.',
    'Show my leave dates and show my Moodle grade report for ARCH201.',
    'Show my leave dates and show Alice’s Moodle grade overview.',
    'Show my leave dates and show my Moodle grade overview for graded courses only.',
  ])assert.equal(studentLeaveAssistantPlan(question,route,[])?.deterministicGradePair,false,question);
});
