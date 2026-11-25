import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {selectExactElearningReply} from '../../server/accountElearningExactAnswer.js';
import {buildAccountCases} from './account-cases.mjs';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID} from './fixtures.mjs';
import {elearningFixtureManifest,elearningFixturePlan} from './elearning-fixtures.mjs';
import {gradeCase} from './grading.mjs';

const db='https://xiftudmvxphxcjtmfmib.supabase.co';
const route='/elearning/my-courses';
const [owner,foreign]=[EVAL_USER_ID,EVAL_OTHER_USER_ID];
const tokens=new Map([[owner,'synthetic-remote-student-a'],[foreign,'synthetic-remote-student-b']]);
const fixture=buildAccountFixture(),courseId=fixture.dtm.courses.find(row=>row.sourceMode==='personal').id;
const courses=[elearningFixtureManifest.courseA,elearningFixtureManifest.courseB].map(row=>({...row,self_enroll:true}));
const bank=buildAccountCases().filter(row=>/^account:elearning-(?:enrollment(?:-empty|-mixed)?|grades-unlinked)$/u.test(row.id));

test('the exact remote and DTM plan recognizes only a bounded owned question',()=>{
  for(const row of bank)assert.ok(selectExactElearningReply(row.question,row.route,row.history),row.id);
  assert.equal(selectExactElearningReply('List my unfinished DTM assignments. Show my remote-learning Moodle enrollments.',route)?.assignmentFirst,true);
  for(const question of ['What are my remote-learning Moodle enrollments? Also show my tuition.',
    'List Alice’s remote-learning Moodle enrollments.', 'Enroll me in remote-learning Moodle.',
    'Show my remote-learning Moodle enrollments. Also list unfinished DTM assignments for Alice.',
    'Show my remote-learning Moodle enrollments and tell me which credits transfer.'])
    assert.equal(selectExactElearningReply(question,route),null,question);
  assert.equal(selectExactElearningReply('What are my courses?','/school-affairs'),null);
  assert.equal(selectExactElearningReply(bank[0].question,route,[{role:'user',content:'a prior question'}]),null);
});

test('all four original cases use the actual signed-in handler and validated own sources with no provider',async()=>{
  const original=globalThis.fetch,requests=[],errors=[];
  let plan,failRemote=0,failAssignments=0,fakeForeign=false;
  const reject=async()=>{const error=new Error('The narrow path attempted a general snapshot or public research.');errors.push(error);throw error;};
  const handler=createAffairsAssistantHandler({loadSnapshot:reject,publicResearch:reject,
    verifyToken:async token=>{
      const id=[...tokens].find(([,value])=>value===token)?.[0];
      assert.ok(id);
      return {url:db,key:'synthetic-publishable',token,user:{id}};
    }});
  async function invoke(testCase,user=owner,stream=false){
    requests.length=0;
    let statusCode=200,body;
    const events=[];
    const response={setHeader(){},status(code){statusCode=code;return response;},json(value){body=value;},end(){},
      write(packet){
        const [,event,payload]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(packet)??[];
        if(event==='progress')events.push(JSON.parse(payload));
        if(event==='result')body=JSON.parse(payload);
      }};
    await handler({method:'POST',headers:{authorization:'Bearer '+tokens.get(user)},
      body:{question:testCase.question,route:testCase.route,history:testCase.history,stream}},response);
    return {statusCode,body,execution:'deterministic',fixtureKey:testCase.fixtureKey,events:stream?events:body?.activity??[]};
  }
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input)),auth=new Headers(init.headers).get('authorization');
      const id=[...tokens].find(([,token])=>auth==='Bearer '+token)?.[0];
      assert.equal(url.origin,db);assert.ok(id);assert.equal(init.redirect,'error');
      requests.push(url.pathname);
      if(url.pathname==='/rest/v1/rpc/elearning_workspace'){
        if(failRemote>0){failRemote--;return Response.json({error:'unavailable'},{status:503});}
        const userId=fakeForeign?foreign:id;
        return Response.json({userId,categories:[],courses,notices:[{text:'UNRELATED NOTICE'}],
          enrollments:plan.rows.filter(row=>row.user_id===userId).map(row=>({courseId:row.course_id,joinedAt:row.joined_at}))});
      }
      assert.equal(id,owner);
      if(url.pathname==='/rest/v1/dtm_courses'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
        assert.equal(url.searchParams.get('source_mode'),'eq.personal');
        return Response.json([{id:courseId,user_id:owner,code:'DTM-EVAL',source_mode:'personal'}]);
      }
      assert.equal(url.pathname,'/rest/v1/affairs_assignments');
      assert.equal(url.searchParams.get('dtm_courses.user_id'),'eq.'+owner);
      assert.equal(url.searchParams.get('affairs_students.user_id'),'eq.'+owner);
      assert.equal(url.searchParams.get('status'),'eq.open');
      if(failAssignments>0){failAssignments--;return Response.json({error:'unavailable'},{status:503});}
      const open=fixture.assignments.filter(row=>row.dtmCourseId===courseId&&row.status==='open');
      return Response.json(open.map(row=>({id:row.id,dtm_course_id:courseId,title:row.title,source_mode:'personal',status:'open',
        dtm_courses:{id:courseId,user_id:owner,code:'DTM-EVAL',source_mode:'personal'},affairs_students:{user_id:owner}})),
      {headers:{'Content-Range':`0-${open.length-1}/${open.length}`}});
    }catch(error){errors.push(error);throw error;}
  };
  try{
    for(const row of bank){
      plan=elearningFixturePlan(row.fixtureKey,[owner,foreign]);
      const reply=await invoke(row);
      const result=gradeCase(row,reply);
      assert.equal(result.passed,true,row.id+' '+JSON.stringify({failures:result.failures,body:reply.body}));
      assert.equal(reply.body.verification.attempts,1);
      assert.ok(reply.body.activity.some(step=>step.kind==='elearning-evidence-check'&&step.status==='complete'));
      assert.equal(requests.includes('/rest/v1/rpc/elearning_workspace'),!row.id.endsWith('grades-unlinked'));
      assert.equal(requests.includes('/rest/v1/affairs_assignments'),row.id.endsWith('-mixed'));
    }

    const list=bank.find(row=>row.id.endsWith('-enrollment'));
    const mix=bank.find(row=>row.id.endsWith('-mixed'));
    plan=elearningFixturePlan(list.fixtureKey,[owner,foreign]);
    const streamed=await invoke(mix,owner,true);
    assert.equal(gradeCase(mix,streamed).passed,true);
    assert.equal(streamed.events.filter(step=>step.kind==='elearning-evidence-check').length,1);
    assert.equal(streamed.body.activity.filter(step=>step.kind==='elearning-evidence-check').length,1);
    const theirReply=await invoke(list,foreign);
    assert.match(theirReply.body.answer,/一般安全衛生教育訓練/u);
    assert.doesNotMatch(theirReply.body.answer,/111-1遠距教學研習|Index plan/u);
    assert.equal(theirReply.body.verification.status,'verified');

    failRemote=1;
    const retried=await invoke(mix);
    assert.equal(retried.body.verification.attempts,2);
    assert.equal(requests.filter(path=>path.endsWith('/elearning_workspace')).length,2);
    assert.equal(requests.filter(path=>path.endsWith('/affairs_assignments')).length,1);
    assert.equal(gradeCase(mix,retried).passed,true);

    failAssignments=3;
    const incomplete=await invoke(mix);
    assert.match(incomplete.body.answer,/遠距教學研習/u);
    assert.match(incomplete.body.answer,/assignment list could not be checked/u);
    assert.doesNotMatch(incomplete.body.answer,/Index plan|No unfinished/u);
    assert.equal(incomplete.body.complete,false);
    assert.equal(incomplete.body.grounding.degraded,true);
    assert.equal(requests.filter(path=>path.endsWith('/elearning_workspace')).length,1);

    fakeForeign=true;
    const crossed=await invoke(list);
    assert.match(crossed.body.answer,/could not be checked/u);
    assert.doesNotMatch(crossed.body.answer,/一般安全衛生|no saved remote-learning Moodle enrollments/u);
    assert.equal(crossed.body.grounding.degraded,true);
  }finally{globalThis.fetch=original;}
  assert.deepEqual(errors,[]);
});
