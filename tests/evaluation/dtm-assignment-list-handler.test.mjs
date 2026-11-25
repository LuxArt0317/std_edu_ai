import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {bindDtmAssignmentListReadback,dtmAssignmentListDispatch,dtmAssignmentListFamilies,dtmAssignmentListLiveCases,dtmAssignmentListLiveFixture,dtmAssignmentListExpectedReadCounts,gradeDtmAssignmentListLiveCase} from './dtm-assignment-list-live.mjs';
import {readReply} from './run.mjs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import research from '../../api/research-assistant.ts';
import {dtmAssignmentListSelection} from '../../server/dtmAssignmentListIntent.js';
import {dtmAssignmentListCases,dtmAssignmentListFixture} from './dtm-assignment-list-cases.mjs';
import {gradeCase} from './grading.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='OFFLINE_DTM_ASSIGNMENT_TOKEN';
const status={all:undefined,open:'eq.open',done:'in.(submitted,graded)',submitted:'eq.submitted',graded:'eq.graded'};
const mockResult=async(handler,body,{authenticated=true}={})=>{
  const saved={statusCode:200,body:null};
  const headers=new Headers(),chunks=[];
  const response={setHeader(name,value){headers.set(name,value);},status(value){saved.statusCode=value;return response;},json(body){saved.body=body;}};
  if(body.stream)Object.assign(response,{write(chunk){chunks.push(chunk);},end(){}});
  await handler({method:'POST',headers:authenticated?{authorization:'Bearer '+token}:{},body},response);
  if(body.stream)return {statusCode:saved.statusCode,...await readReply(new Response(chunks.join(''),{headers})),
    correlationId:headers.get('X-Assistant-Request-Id')};
  return saved;
};

async function exercise(item,{tamper=null,stream=false}={}){
  const oracle=item.observation;
  const {courses,records,identity:{caller,asOf}}=item.assignmentListClock?dtmAssignmentListLiveFixture(item):dtmAssignmentListFixture(item);
  const calls=[],failures=[];
  let failed=false;
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    try {
      const url=new URL(String(input)),query=Object.fromEntries(url.searchParams),own='eq.'+caller;
      assert.equal(url.origin,project);
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
      assert.equal(init.body,undefined);
      calls.push([url.pathname,query]);
      const courseId=oracle.courseId;
      if(url.pathname==='/rest/v1/dtm_courses') {
        assert.deepEqual(query,{select:'id,user_id,code,source_mode',user_id:own,order:'id.asc',limit:courseId?'2':'1',
          ...(courseId?{id:'eq.'+courseId}:{source_mode:'eq.personal'})});
        return Response.json(courses.filter(course=>course.user_id===caller&&(courseId?course.id===courseId:course.source_mode==='personal')).slice(0,1));
      }
      assert.equal(url.pathname,'/rest/v1/affairs_assignments');
      assert.equal(new Headers(init.headers).get('prefer'),'count=exact');
      const hasDue=oracle.fields.includes('due')&&!oracle.countOnly||oracle.period!==null;
      const hasStatus=oracle.fields.includes('status')&&!oracle.countOnly||oracle.readMode!=='all';
      const keys=['id','dtm_course_id','source_mode',...(!oracle.countOnly?['title']:[]),
        ...(hasDue?['due_at']:[]),...(hasStatus?['status']:[])];
      assert.equal(query.select,[...keys,'dtm_courses!inner(id,user_id,code,source_mode)','affairs_students!inner(user_id)'].join(','));
      assert.equal(query['dtm_courses.user_id'],own);
      assert.equal(query['affairs_students.user_id'],own);
      assert.equal(query.enrollment_id,'is.null');
      assert.equal(query.dtm_course_id,courseId?'eq.'+courseId:'not.is.null');
      const visible=courses.some(course=>course.user_id===caller&&course.source_mode==='personal')?'personal':'sample';
      assert.equal(query['dtm_courses.source_mode'],courseId?undefined:'eq.'+visible);
      assert.equal(query.status,status[oracle.readMode]);
      assert.equal(query.order,'due_at.asc.nullslast,id.asc');
      assert.equal(query.limit,oracle.countOnly?'1':'20');
      const dayEdges={today:['2026-11-16T16:00:00.000Z','2026-11-17T16:00:00.000Z'],
        tomorrow:['2026-11-17T16:00:00.000Z','2026-11-18T16:00:00.000Z'],
        '2026-11-16':['2026-11-15T16:00:00.000Z','2026-11-16T16:00:00.000Z']};
      const edges=item.assignmentListClock?.period==='calendar'&&['today','tomorrow'].includes(oracle.period)
        ?[0,1].map(delta=>new Date(Date.parse(item.assignmentListClock.opensAt)+(delta+Number(oracle.period==='tomorrow'))*86_400_000).toISOString())
        :dayEdges[oracle.period];
      assert.equal(query.and,edges?'(due_at.gte.'+edges[0]+',due_at.lt.'+edges[1]+')':undefined);
      if(oracle.period==='overdue')assert.equal(query.due_at,'lt.'+asOf);
      else assert.equal(query.due_at,undefined);
      if(oracle.fixtures==='failed'||tamper==='once'&&!failed){
        failed=true;return Response.json({},{status:503});
      }
      const matches=records.filter(row=>row.affairs_students.user_id===caller
        &&(courseId?row.dtm_course_id===courseId:row.dtm_courses.source_mode===visible)
        &&(oracle.readMode==='all'||(oracle.readMode==='done'?row.status!=='open':row.status===oracle.readMode))
        &&(!oracle.period||row.due_at&&(edges?Date.parse(row.due_at)>=Date.parse(edges[0])&&Date.parse(row.due_at)<Date.parse(edges[1])
          :Date.parse(row.due_at)<Date.parse(asOf))));
      matches.sort((a,b)=>(a.due_at??'9999').localeCompare(b.due_at??'9999')||a.id.localeCompare(b.id));
      assert.equal(matches.length,oracle.amount,item.id);
      const projected=matches.slice(0,Number(query.limit)).map(row=>({...Object.fromEntries(keys.map(key=>[key,row[key]])),
        dtm_courses:row.dtm_courses,affairs_students:row.affairs_students}));
      if(tamper==='owner')projected[0].affairs_students={user_id:dtmAssignmentListFixture(item).identity.other};
      if(tamper==='course')projected[0].dtm_courses=courses[1];
      if(tamper==='course-mode')projected[0].source_mode='sample';
      if(tamper==='extra-column')projected[0].details='SENSITIVE FULL INSTRUCTIONS';
      if(tamper==='duplicate')projected[1]=projected[0];
      const number=tamper==='count'?0:matches.length;
      const range=projected.length?'0-'+(projected.length-1)+'/'+number:'*/'+number;
      return Response.json(projected,{headers:{'Content-Range':range}});
    } catch(error){failures.push(error);throw error;}
  };
  try{
    const auth=item.auth!=='anonymous';
    const handler=createAffairsAssistantHandler({verifyToken:async()=>({user:{id:caller},url:project,key:'OFFLINE_PUBLIC_KEY',token}),
      loadSnapshot:async()=>assert.fail('The private list must never load a broad workspace snapshot.'),
      publicResearch:async()=>assert.fail('The private list must not use public search.'),
      answerAccount:async()=>assert.fail('The deterministic list was sent to the general model planner.')});
    const response=await mockResult(auth?handler:research,{question:item.question,route:item.route,...(stream?{stream:true}:{})},{authenticated:auth});
    assert.deepEqual(failures,[],item.id);
    return {envelope:{...response,events:response.events||[],execution:'recorded',fixtureKey:item.fixtureKey},calls};
  }finally{globalThis.fetch=original;}
}
const bank=dtmAssignmentListCases(),rowFor=suffix=>bank.find(row=>row.id.endsWith('-'+suffix));

test('all Moodle assignment-list cases pass through the real endpoint and independent grader',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-16T16:15:00.000Z')});
  for(const row of bank)await t.test(row.id,async()=>{
    const {envelope,calls}=await exercise(row);
    const expected=row.observation;
    const attempts=expected.verification==='unverified'?2:expected.read?1:0;
    assert.equal(calls.filter(([path])=>path.endsWith('/dtm_courses')).length,attempts);
    assert.equal(calls.filter(([path])=>path.endsWith('/affairs_assignments')).length,expected.fixtures==='foreign'?0:attempts);
    const result=gradeCase(row,envelope);
    assert.equal(result.passed,true,JSON.stringify({answer:envelope.body.answer,failures:result.failures}));
    const invented=row.id.endsWith('-submitted')?'A file submission was confirmed.'
      :row.id.endsWith('-transport-failed')?'There are no saved Moodle assignments.':null;
    if(invented){
      const wrong={...envelope,body:{...envelope.body,answer:envelope.body.answer+'\n\n'+invented}};
      assert.ok(gradeCase(row,wrong).failures.some(failure=>failure.id.startsWith('evidence.boundary.')));
    }
  });
});

test('a temporary failure retries only the selected scope and malformed owner/course/field/count relations abstain',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-16T16:15:00.000Z')});
  t.mock.timers.setTime(Date.now()+61_000);
  const base=rowFor('course-all');
  const repaired=await exercise(base,{tamper:'once'});
  assert.equal(repaired.envelope.body.verification.status,'verified');
  assert.equal(repaired.envelope.body.verification.attempts,2);
  assert.deepEqual(repaired.calls.slice(0,2),repaired.calls.slice(2));
  for(const tamper of ['owner','course','course-mode','extra-column','duplicate','count']){
    t.mock.timers.setTime(Date.now()+61_000);
    const {envelope,calls}=await exercise(base,{tamper});
    assert.equal(envelope.body.verification.status,'unverified',tamper);
    assert.equal(envelope.body.verification.attempts,2,tamper);
    assert.deepEqual(envelope.body.citations,[],tamper);
    assert.doesNotMatch(envelope.body.answer,/Index benchmark|Architecture sketch|SENSITIVE FULL INSTRUCTIONS/,tamper);
    assert.deepEqual(calls.slice(0,2),calls.slice(2),tamper);
  }
});

test('exact assignment resources, personal tracked status actions and public context keep their own dispatch',()=>{
  const exact=rowFor('course-all').route.replace(/assignments$/u,'assignment/91800000-0000-4000-8000-000000000011');
  assert.equal(dtmAssignmentListSelection('When is this assignment due?',exact),null);
  assert.equal(dtmAssignmentListSelection('Mark my personal assignment Index benchmark as submitted.','/dtm/assignments'),null);
  assert.equal(dtmAssignmentListSelection('Which assignments came from the Moodle calendar import?','/dtm/assignments'),null);
  assert.equal(dtmAssignmentListSelection('What are my saved Moodle grades?','/dtm/assignments'),null);
  assert.equal(dtmAssignmentListSelection('Which assignments are due on 2026-02-30?','/dtm/assignments').reason,'choose');
  assert.equal(dtmAssignmentListSelection('Which assignments are due today and tomorrow?','/dtm/assignments').reason,'combined');
  assert.equal(dtmAssignmentListSelection('Show assignments in my other course.',rowFor('course-all').route).reason,'choose');
  assert.equal(dtmAssignmentListSelection('Who can help me configure campus Wi-Fi?','/dtm/assignments'),null);
});

test('native list cases and unchanged legacy oracles reject live setup before provider access',async()=>{
  const {assertNativeDtmCaseReady,nativeDtmSetupRequired}=await import('./dtm-native-runner.mjs');
  const {markLegacyDtmAssignmentListFixture}=await import('./dtm-assignment-list-cases.mjs');
  const {prepare}=await import('./live-fixtures.mjs');
  const row=rowFor('course-all');
  const prior={id:'account:unfinished-assignments',question:'Original question',expected:{requiredTools:['assignments']}};
  const marked=markLegacyDtmAssignmentListFixture(prior);
  assert.equal(marked.question,prior.question);
  assert.deepEqual(marked.expected,prior.expected);
  for(const example of [row,{...row,fixtureRequirement:undefined},marked]){
    assert.equal(nativeDtmSetupRequired(example),true);
    assert.throws(()=>assertNativeDtmCaseReady(example),/request observations are not mounted/);
    await assert.rejects(prepare({runId:'91800000-0000-4000-8000-000000000099',cases:[example],now:'2026-11-16T16:15:00Z',
      origin:'https://stu.best',applicationFetch:async()=>assert.fail('No application request during blocked setup.')}),
    {code:'fixture-unsupported'});
  }
});


test('real assistant stream matches the protected Preview request observation for the mounted packet',async t=>{
  const revision=randomUUID().replaceAll('-','')+'b'.repeat(8);
  const now='2026-12-01T11:30:00.000Z';
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-16T16:15:00.000Z')});
  for(const item of dtmAssignmentListFamilies.flatMap(family=>dtmAssignmentListLiveCases(family,{now})))await t.test(item.id,async()=>{
    const observed=dtmAssignmentListExpectedReadCounts(item).map((count,index)=>({count,sha256:(index?'b':'a').repeat(64)}));
    const clock=item.assignmentListClock;
    const source=clock?item:bank.find(row=>row.id===item.id);
    if(clock)t.mock.timers.setTime(Date.parse(clock.referenceAt));
    const {envelope}=await exercise(source,{stream:true});
    const authenticated=item.auth==='signed-in';
    Object.assign(envelope,{execution:'live-native',fixtureKey:item.fixtureKey,sourceRevision:revision,
      deploymentCheck:{verified:true,requestIndex:1,sourceRevision:revision},
      assignmentListDispatch:dtmAssignmentListDispatch(authenticated?'/api/affairs-assistant':'/api/research-assistant',JSON.stringify({
        question:item.question,history:[],route:item.route,stream:true,consentedResearchUse:false,
      }),authenticated,clock?new Date(Date.now()-100).toISOString():undefined),
    });
    if(clock)assert.equal(envelope.body.grounding.checkedAt,clock.referenceAt);
    const readback=bindDtmAssignmentListReadback(item,envelope,{before:observed,after:observed,
      checkedAfter:clock?new Date(Date.now()+100).toISOString():undefined});
    envelope.fixtureReadback={verified:true,independentGolden:true,projectRef:'xiftudmvxphxcjtmfmib',dtmAssignmentList:readback};
    if(!item.observation.read){
      const wrong={...envelope,events:[{kind:'account-read:dtmAssignmentList:1',status:'complete'}]};
      assert.throws(()=>bindDtmAssignmentListReadback(item,wrong,{before:observed,after:observed}),/two caller readbacks/);
    }
    const result=gradeDtmAssignmentListLiveCase(item,envelope);
    assert.equal(result.passed,true,JSON.stringify(result.failures));
    const extra='\n[Invalid record](/dtm/course/'+source.observation.courseId+'/assignment/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa)';
    if(source.observation.courseId){
      const wrong={...envelope,body:{...envelope.body,answer:envelope.body.answer+extra}};
      assert.ok(gradeDtmAssignmentListLiveCase(item,wrong).failures.some(row=>row.id==='dtm-assignment-list.exact-links'));
    }
  });
});
