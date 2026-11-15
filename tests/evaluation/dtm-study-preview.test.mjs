import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {dtmStudySelection} from '../../server/accountDtmStudyAnswer.js';
import {buildAccountCases} from './account-cases.mjs';
import {DEFAULT_EVAL_NOW,EVAL_IDS} from './fixtures.mjs';
import {buildDtmStudyPreviewPlan,dtmStudyPreviewCases,dtmStudyPreviewRequest,gradeDtmStudyPreview,readDtmStudyPreviewCallers,assertDtmStudyClock} from './dtm-study-preview.mjs';

const users=['38000000-0000-4000-8000-000000000001','38000000-0000-4000-8000-000000000002'].map((id,index)=>({id,token:'DTM-OFFLINE-TOKEN-'+index}));
const projectOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';
const plan=buildDtmStudyPreviewPlan(users,DEFAULT_EVAL_NOW);
const cases=dtmStudyPreviewCases(plan);
const withRange=rows=>Response.json(rows,{headers:{'Content-Range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});

async function send(handler,item,user=users[0]){
  const captured={statusCode:0,body:null,events:[]};
  const response={status(status){captured.statusCode=status;return this;},json(body){captured.body=body;},setHeader(){},
    write(chunk){const frame=/^event: (.+)\ndata: (.+)\n\n$/u.exec(chunk);assert.ok(frame);
      const event=JSON.parse(frame[2]);if(['result','error'].includes(frame[1]))captured.body=event;else captured.events.push(event);},end(){}};
  await handler({method:'POST',headers:{authorization:'Bearer '+user.token},body:{question:item.question,route:item.route,stream:true}},response);
  return captured;
}

test('mounts five unchanged frozen cases with only the disposable route substitution and exact Taipei fixture day',()=>{
  assert.equal(cases.length,5);
  for(const testCase of cases){
    const frozen=buildAccountCases({now:plan.now}).find(row=>row.id===testCase.id);
    assert.deepEqual({...testCase,route:testCase.route.replace(plan.courseId,EVAL_IDS.dtmCourse)},frozen);
  }
  assert.throws(()=>dtmStudyPreviewRequest(plan,{...cases[0],question:'easier question'}));
  assert.doesNotThrow(()=>assertDtmStudyClock(plan.now,plan.now));
  assert.throws(()=>assertDtmStudyClock(plan.now,new Date(Date.parse(plan.now)+86400000).toISOString()));
  assert.equal(dtmStudySelection('What is my next class and tuition balance?',cases[2].route),null);
  assert.equal(dtmStudySelection('What did I record about Database indexes on 2026-11-10? Also show my grades.',cases[2].route),null);
});

test('real streaming handler passes unchanged Moodle course and meeting oracles without initializing the workspace or using a model',async t=>{
  t.mock.method(Date,'now',()=>Date.parse(plan.now));
  const old=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='OFFLINE_DTM_STUDY_TEST';
  t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
  let faulty=null,calls=[],errors=[];
  t.mock.method(globalThis,'fetch',async(target,options)=>{
    try{
      const url=new URL(target);
      assert.equal(url.origin,projectOrigin);
      assert.equal(options.method,'GET');
      const caller=users.find(row=>'Bearer '+row.token===new Headers(options.headers).get('authorization'));
      assert.ok(caller);
      if(url.pathname==='/rest/v1/dtm_courses'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+caller.id);
        calls.push('courses');
        if(faulty==='outage')return new Response(null,{status:503});
        const exact=url.searchParams.get('id')?.slice(3);
        return withRange(plan.courses.filter(row=>row.user_id===caller.id&&(!exact||row.id===exact)));
      }
      assert.equal(url.pathname,'/rest/v1/dtm_meetings');
      assert.equal(url.searchParams.get('dtm_courses.user_id'),'eq.'+caller.id);
      calls.push('meetings');
      const id=url.searchParams.get('course_id').slice(3);
      const rows=plan.meetings.filter(row=>row.course_id===id).map(row=>({...row,dtm_courses:{id,user_id:caller.id}}));
      if(faulty==='malformed')rows[0].dtm_courses.user_id=users[1].id;
      if(faulty==='missing-time')rows.find(row=>row.title==='Transaction lab').starts_at='00:00:00';
      return withRange(rows);
    }catch(error){errors.push(error);throw error;}
  });
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>({user:{id:users.find(row=>row.token===token).id},url:projectOrigin,token,key:'offline-dtm-publishable'}),
    loadSnapshot:async()=>assert.fail('No workspace or sample-data setup for the exact Moodle records.'),
    publicResearch:async()=>assert.fail('No public research for the owned Moodle records.'),
  });
  const stable={rows:'a'.repeat(64),callers:{sha256:'b'.repeat(64),ownReads:4,crossedReads:4}};
  for(const testCase of cases){
    calls=[];
    const observed=await send(handler,testCase);
    if(errors.length)throw errors[0];
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:1},testCase.id);
    const request=dtmStudyPreviewRequest(plan,testCase);
    const grade=gradeDtmStudyPreview(plan,testCase,{...observed,execution:'live-native',fixtureKey:testCase.fixtureKey,
      correlationId:'38000000-0000-4000-8000-000000000020',requestIndex:1,requestSha256:request.sha256},{before:stable,after:stable});
    assert.deepEqual(grade.failedChecks,[],testCase.id);
    assert.deepEqual(calls,testCase.route.includes('/meetings')?['courses','meetings']:['courses'],testCase.id);
  }
  const crossed=await send(handler,cases[2],users[1]);
  assert.match(crossed.body.answer,/could not be matched/u);
  assert.doesNotMatch(JSON.stringify(crossed.body),/B-tree|hash indexes/u);
  for(const fault of ['outage','malformed','missing-time']){
    faulty=fault;
    const outcome=await send(handler,cases.find(row=>row.id==='account:dtm-next-meeting'));
    if(fault==='missing-time')assert.match(outcome.body.answer,/no usable start time/u);
    else {
      assert.equal(outcome.body.verification.status,'unverified',fault);
      assert.equal(outcome.events.some(event=>event.kind==='dtm-study-evidence-check'),false);
    }
    assert.doesNotMatch(outcome.body.answer,/Transaction lab/u);
  }
  assert.deepEqual(errors,[]);
});

test('two synthetic callers cross both course and meeting scopes and a crossed-row leak fails',async()=>{
  let leak=false;
  const dependencies={projectOrigin,publishable:'offline',readResponse:response=>response.json(),fetchImpl:async(address,options)=>{
    const caller=users.find(row=>'Bearer '+row.token===options.headers.Authorization);
    assert.equal(options.method,'GET');
    if(address.pathname.endsWith('/dtm_courses')){
      const owner=address.searchParams.get('user_id').slice(3);
      return Response.json(caller.id===owner||leak?plan.courses.filter(row=>row.user_id===owner):[]);
    }
    const ids=address.searchParams.get('course_id').slice(4,-1).split(',');
    return Response.json(plan.meetings.filter(row=>ids.includes(row.course_id)
      &&plan.courses.some(course=>course.id===row.course_id&&course.user_id===caller.id)));
  }};
  const matrix=await readDtmStudyPreviewCallers(plan,users,dependencies);
  assert.equal(matrix.ownReads,4);
  assert.equal(matrix.crossedReads,4);
  leak=true;
  await assert.rejects(readDtmStudyPreviewCallers(plan,users,dependencies));
});
