import test from 'node:test';
import assert from 'node:assert/strict';
import {readTeachingFeedbackEvidence as load,teachingFeedbackEvidenceLimits as limits,unavailableTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';
import type {TeachingFeedbackEvidenceOptions as Options} from '../../server/accountTeachingFeedbackEvidence.js';

const owner='75100000-0000-4000-8000-000000000001',foreign='75100000-0000-4000-8000-000000000002';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_CALLER'};
const id=(n:number)=>'75100000-0000-4000-8100-'+String(n).padStart(12,'0');
const course=(n=1)=>({id:id(n),course:n===1?'Database Design':'World History',code:n===1?'DB101':'HIS102',term:'Local Fall 2026',section:'A'+n});
const survey=(n=1)=>({id:id(100+n),termId:id(200+n),term:'Local Fall 2026',phase:'midterm',questions:['How clear were the lessons?'],
  opensAt:'2026-11-01T00:00:00+00:00',closesAt:'2026-12-01T00:00:00+00:00',version:2,released:false,state:'open',
  courses:[{...course(),completed:true},{...course(2),completed:false}]});
const feedback=(n=1)=>({id:id(300+n),sectionId:id(n),course:course(n).course,code:course(n).code,term:'Local Fall 2026',
  comment:n===1?'Please explain the index choice.':'PRIVATE_HISTORY_COMMENT',status:n===1?'submitted':'reviewed',submittedAt:'2026-11-13T09:00:00+08:00',reviewedAt:n===1?null:'2026-11-14T10:30:00+08:00'});
const dto=(view:'survey'|'immediate')=>({userId:owner,courses:view==='immediate'?[course(),course(2)]:[],surveys:view==='survey'?[survey()]:[],feedback:view==='immediate'?[feedback(),feedback(2)]:[],terms:[],results:[]});
type Dto=ReturnType<typeof dto>;
type Read=NonNullable<NonNullable<Parameters<typeof load>[2]>['read']>;
const content=(result:Awaited<ReturnType<typeof load>>)=>JSON.parse(result.evidence.content);
function source(make:(view:'survey'|'immediate')=>unknown=dto){
  const calls:{account:Parameters<Read>[0];query:Parameters<Read>[1]}[]=[];
  const read:Read=async(caller,query)=>{calls.push({account:caller,query});return make(query.view);};return {calls,read};
}
async function run(options:Options,make:(view:'survey'|'immediate')=>unknown=dto){const io=source(make);const out=await load(account,options,{read:io.read});return {io,out,payload:content(out)};}

test('exact requested native scopes and caller are used once; survey completion stays grouped and private answers absent',async()=>{
  const {io,out,payload}=await run({views:['survey']});assert.equal(out.readState,'ok');assert.equal(io.calls.length,1);
  assert.deepEqual(io.calls[0].query,{scope:'teaching-feedback',view:'survey'});assert.equal(io.calls[0].account.user.id,owner);
  assert.equal(io.calls[0].account.token,'OFFLINE_CALLER');assert.equal(out.evidence.url,'/school-affairs/services/7-5');assert.deepEqual(out.evidence.urls,['/school-affairs/services/7-5']);
  assert.deepEqual(payload.views[0].surveys,[{term:'Local Fall 2026',phase:'midterm',opensAt:survey().opensAt,closesAt:survey().closesAt,state:'open',
    courses:[{course:'Database Design',code:'DB101',term:'Local Fall 2026',section:'A1',completed:true},{course:'World History',code:'HIS102',term:'Local Fall 2026',section:'A2',completed:false}]}]);
  assert.deepEqual(payload.views[0].counts.surveys,{returned:1,matching:1,included:1,omitted:0,total:1,totalLowerBound:1,nativeLimit:50,capReached:false});
  assert.equal(payload.views[0].counts.courseCompletions.returned,2);assert.equal(payload.complete,true);
  assert.doesNotMatch(out.evidence.content,/OFFLINE_|75100000|How clear|"ratings"|"questions"|"version"|"released"|"results"|"userId"/u);
});

test('status-only immediate response omits every comment and preserves literal nullable review time',async()=>{
  const {out,payload}=await run({views:['immediate']});assert.equal(out.readState,'ok');assert.equal(out.evidence.url,'/school-affairs/services/7-6');
  assert.deepEqual(payload.views[0].feedback,[{course:'Database Design',code:'DB101',term:'Local Fall 2026',status:'submitted',submittedAt:feedback().submittedAt,reviewedAt:null},
    {course:'World History',code:'HIS102',term:'Local Fall 2026',status:'reviewed',submittedAt:feedback(2).submittedAt,reviewedAt:feedback(2).reviewedAt}]);
  assert.doesNotMatch(out.evidence.content,/PRIVATE_HISTORY|index choice|"comment"|"sectionId"|"id"/u);
  assert.equal(payload.capability.immediateComment,false);assert.equal(payload.provenance.synchronized,false);
});

test('saved blank labels and inconsistent valid review chronology remain literal; unavailable fallback redacts unknown reasons',async()=>{
  const {out,payload}=await run({views:['immediate']},view=>{const data=dto(view);data.courses=[];data.feedback=[{...feedback(2),course:'',code:'',term:'',reviewedAt:'2026-01-01T00:00:00Z'}];return data;});
  assert.equal(out.readState,'ok');assert.equal(payload.views[0].feedback[0].course,'');assert.equal(payload.views[0].feedback[0].reviewedAt,'2026-01-01T00:00:00Z');
  const fallback=unavailableTeachingFeedbackEvidence('PRIVATE_PROVIDER_ERROR');assert.equal(fallback.reason,'read_failed');assert.equal(fallback.readState,'unavailable');
  assert.equal(fallback.evidence.url,'/school-affairs/services/7-5');assert.deepEqual(fallback.evidence.urls,[]);assert.equal(content(fallback).selection,null);
  assert.doesNotMatch(JSON.stringify(fallback),/PRIVATE_PROVIDER/u);
});

test('explicit comments are confined to an exact named course; both provided title and code must match',async()=>{
  const {payload}=await run({views:['survey','immediate'],commentRequested:true,course:{code:'DB101',title:'Database Design'}});
  assert.equal(payload.views[0].surveys[0].courses.length,1);assert.equal(payload.views[0].counts.courseCompletions.returned,2);
  assert.deepEqual(payload.views[1].feedback.map((row:{comment:string})=>row.comment),['Please explain the index choice.']);
  assert.equal(payload.views[1].counts.feedback.matching,1);assert.equal(payload.views[1].counts.feedback.returned,2);
  assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_HISTORY_COMMENT/u);
  const none=await run({views:['immediate'],commentRequested:true,course:{code:'DB101',title:'World History'}});
  assert.equal(none.out.readState,'empty');assert.equal(none.payload.views[0].counts.feedback.returned,2);assert.equal(none.payload.views[0].counts.feedback.matching,0);
});

test('historical own feedback need not appear in the current eligible-course list; mismatched same-section lineage fails',async()=>{
  const historic=await run({views:['immediate']},view=>({...dto(view),courses:[]}));
  assert.equal(historic.out.readState,'ok');assert.equal(historic.payload.views[0].feedback.length,2);assert.equal(historic.payload.views[0].counts.eligibleCourses.total,0);
  const bad=await run({views:['immediate']},view=>{const data=dto(view);data.feedback[0].course='WRONG COURSE';return data;});assert.equal(bad.out.reason,'invalid_records');
});

test('empty, denied, malformed and mixed failed scopes stay distinct without retry or cross-view substitution',async()=>{
  const empty=await run({views:['survey','immediate']},()=>({userId:owner,courses:[],surveys:[],feedback:[],terms:[],results:[]}));assert.equal(empty.out.readState,'empty');assert.equal(empty.payload.complete,true);
  const io=source(view=>{if(view==='survey')throw Object.assign(new Error('PRIVATE_FAILURE'),{status:403});return dto(view);});
  const out=await load(account,{views:['survey','immediate']},{read:io.read}),payload=content(out);
  assert.equal(io.calls.length,2);assert.equal(out.readState,'partial');assert.equal(out.reason,'partial_read');assert.equal(payload.complete,false);
  assert.equal(payload.views[0].reason,'access_denied');assert.equal(payload.views[0].counts.surveys.returned,null);assert.equal(payload.views[0].counts.surveys.total,null);
  assert.equal(payload.views[1].feedback.length,2);assert.doesNotMatch(out.evidence.content,/PRIVATE_FAILURE/u);
});

test('student snapshot denies foreign identities, management arrays, wrong scope and duplicate parent/child IDs',async()=>{
  const mutations:((data:Dto)=>unknown)[]=[data=>({...data,userId:foreign}),data=>({...data,userId:{toString:()=>owner}}),data=>({...data,profile:{email:'PRIVATE_EMAIL'}}),
    data=>({...data,terms:[{id:id(9),label:'PRIVATE_TERM'}]}),data=>({...data,results:[{}]}),data=>({...data,courses:[course()]}),
    data=>({...data,surveys:[...data.surveys,...data.surveys]}),data=>{data.surveys[0].courses.push({...data.surveys[0].courses[0]});return data;},
    data=>{data.surveys[0].courses[0].term='OTHER_TERM';return data;},data=>{data.surveys[0].termId='bad';return data;},
    data=>{const second=survey(2);second.termId=data.surveys[0].termId;data.surveys.push(second);return data;}];
  for(const mutate of mutations){const {out}=await run({views:['survey']},view=>mutate(dto(view)));assert.equal(out.reason,'invalid_records');assert.equal(content(out).views[0].counts.surveys.total,null);}
  for(const mutate of [(data:Dto)=>({...data,feedback:[feedback(),feedback()]}),(data:Dto)=>({...data,courses:[course(),course()]}),(data:Dto)=>({...data,surveys:[survey()]})]){
    assert.equal((await run({views:['immediate']},view=>mutate(dto(view)))).out.reason,'invalid_records');
  }
});

test('strict scalar, timestamp and state rules reject invalid native values rather than repairing them',async()=>{
  const mutations:((data:Dto)=>void)[]=[data=>{data.surveys[0].opensAt='2026-02-30T00:00:00Z';},data=>{data.surveys[0].closesAt='0000-01-01T00:00:00Z';},
    data=>{data.surveys[0].opensAt='2026-11-01T00:00:00+15:00';},data=>{data.surveys[0].closesAt=data.surveys[0].opensAt;},data=>{data.surveys[0].closesAt='2027-12-01T00:00:00Z';},
    data=>{data.surveys[0].state='approved';},data=>{data.surveys[0].questions=['one','one'];},data=>{data.surveys[0].version=0;},data=>{data.surveys[0].courses[0].code='BAD\u0000CODE';}];
  for(const mutate of mutations){const {out}=await run({views:['survey']},view=>{const data=dto(view);mutate(data);return data;});assert.equal(out.reason,'invalid_records');}
  for(const bad of [{...feedback(),reviewedAt:'2026-11-14T00:00:00Z'},{...feedback(2),reviewedAt:null},{...feedback(),comment:''},{...feedback(),submittedAt:'2026-11-13T24:00:00Z'},{...feedback(),comment:'bad\ud800text'}]){
    assert.equal((await run({views:['immediate']},view=>({...dto(view),feedback:[bad]}))).out.reason,'invalid_records');
  }
});

test('exact native caps leave totals unknown, even when only a few course-filtered rows match',async()=>{
  const surveys=Array.from({length:50},(_,i)=>survey(i+1));
  const capped=await run({views:['survey'],course:{code:'MISSING'}},view=>({...dto(view),surveys}));
  assert.equal(capped.out.readState,'partial');assert.equal(capped.payload.views[0].counts.surveys.returned,50);assert.equal(capped.payload.views[0].counts.surveys.total,null);
  assert.equal(capped.payload.views[0].counts.courseCompletions.total,null);assert.equal(capped.payload.views[0].counts.courseCompletions.capReached,true);
  assert.equal(capped.payload.views[0].counts.surveys.matching,0);
  const feedbackRows=Array.from({length:100},(_,i)=>({...feedback(),id:id(1000+i)}));
  const courses=Array.from({length:200},(_,i)=>({...course(),id:id(2000+i)}));
  const immediate=await run({views:['immediate'],course:{code:'MISSING'}},view=>({...dto(view),courses,feedback:feedbackRows}));
  assert.equal(immediate.out.readState,'partial');assert.equal(immediate.payload.views[0].counts.feedback.total,null);assert.equal(immediate.payload.views[0].counts.eligibleCourses.total,null);
  assert.equal((await run({views:['survey']},view=>({...dto(view),surveys:[...surveys,survey(51)]}))).out.reason,'invalid_records');
});

test('whole rows and survey-child groups are omitted honestly under the complete serialized envelope budget',async()=>{
  const feedbackRows=Array.from({length:15},(_,i)=>({...feedback(),id:id(1000+i),comment:('Saved '+i+' '+'界'.repeat(400))}));
  const {out,payload}=await run({views:['immediate'],commentRequested:true},view=>({...dto(view),feedback:feedbackRows}));
  assert.equal(out.readState,'partial');assert.equal(out.reason,'excerpted');assert.ok(Buffer.byteLength(JSON.stringify(out))<=limits.responseBytes);
  const count=payload.views[0].counts.feedback;assert.equal(count.returned,15);assert.equal(count.total,15);assert.equal(count.omitted,15-count.included);assert.ok(count.included>0&&count.omitted>0);
  for(let i=0;i<count.included;i++)assert.equal(payload.views[0].feedback[i].comment,feedbackRows[i].comment);
  const largeSurvey=survey();largeSurvey.courses=Array.from({length:45},(_,i)=>({...course(),id:id(1000+i),course:'界'.repeat(150),completed:false}));
  const grouped=await run({views:['survey']},view=>({...dto(view),surveys:[largeSurvey]}));
  assert.equal(grouped.out.readState,'partial');assert.equal(grouped.payload.views[0].surveys.length,0);assert.equal(grouped.payload.views[0].counts.courseCompletions.omitted,45);
});

test('JSON admission rejects oversized, accessor, cycle, sparse and prototype-bearing data without evaluating getters',async()=>{
  let getterCalls=0;
  const withGetter=Object.defineProperty(dto('survey'),'userId',{get(){getterCalls++;return owner;}});
  const cycle:Record<string,unknown>={};cycle.self=cycle;
  const sparse=dto('survey');sparse.surveys.length=2;
  for(const bad of [withGetter,cycle,sparse,new Date(),{...dto('survey'),large:'x'.repeat(limits.admissionBytes)}])assert.equal((await run({views:['survey']},()=>bad)).out.reason,'invalid_records');
  assert.equal(getterCalls,0);
});

test('invalid selectors/accounts stop before transport; comments cannot opt into anonymous survey answers',async()=>{
  const io=source();
  for(const options of [null,{},[],{views:['manage']},{views:['survey','survey']},{views:['survey'],commentRequested:true},{views:['immediate'],commentRequested:'yes'},
    {views:['survey'],course:{userId:foreign}},{views:['immediate'],course:{title:''}},{views:['immediate'],scope:'manage'}]){
    assert.equal((await load(account,options as Options,{read:io.read})).reason,'invalid_options');
  }
  let coerced=0;
  for(const bad of [null,{...account,url:'https://foreign.example'},{...account,user:{id:{toString(){coerced++;return owner;}}}},{...account,token:''}]){
    assert.equal((await load(bad as typeof account,{views:['survey']},{read:io.read})).reason,'unauthorized');
  }
  assert.equal(coerced,0);assert.equal(io.calls.length,0);
});

test('captured caller, transport, selections and shared deadline cannot be replaced while first read waits',async()=>{
  const original=structuredClone(account),options:Options={views:['survey','immediate'],commentRequested:true,course:{code:'DB101'}};
  const io=source(),dependencies={read:io.read};const pending=load(original,options,dependencies);
  original.user.id=foreign;original.key='FOREIGN_KEY';original.token='FOREIGN_TOKEN';original.url='https://foreign.example';options.views.splice(0,2,'immediate');options.course!.code='HIS102';options.commentRequested=false;
  dependencies.read=async()=>{throw new Error('PRIVATE_REPLACEMENT');};
  const out=await pending;assert.equal(out.readState,'ok');assert.deepEqual(io.calls.map(call=>call.query.view),['survey','immediate']);
  for(const call of io.calls){assert.equal(call.account.user.id,owner);assert.equal(call.account.token,'OFFLINE_CALLER');assert.equal(call.account.url,account.url);}
  assert.equal(io.calls[0].account.requestDeadline,io.calls[1].account.requestDeadline);assert.ok(io.calls[0].account.requestDeadline!<=Date.now()+8000);
  assert.doesNotMatch(out.evidence.content,/PRIVATE_HISTORY_COMMENT|FOREIGN_|PRIVATE_REPLACEMENT/u);
});

test('shared deadline bounds a stalled read, prevents second native call, and denied/error text is private',async t=>{
  let calls=0;
  const read:Read=async()=>{calls++;return new Promise(()=>{});};
  const started=Date.now();
  const fakeClock=t.mock.method(Date,'now',()=>started);
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=load(account,{views:['survey','immediate'],deadline:started+30},{read});
  await Promise.resolve();
  // Model a timer that fires just before wall-clock time rolls forward.
  t.mock.timers.tick(30);
  const out=await pending;
  t.mock.timers.reset();
  fakeClock.mock.restore();
  assert.equal(out.readState,'unavailable');assert.equal(out.reason,'deadline_exceeded');assert.equal(calls,1);
  assert.deepEqual(content(out).views.map((view:{reason:string})=>view.reason),['deadline_exceeded','deadline_exceeded']);
  assert.equal((await load({...account,requestDeadline:Date.now()-1},{views:['survey'],deadline:Date.now()+10000},{read})).reason,'deadline_exceeded');assert.equal(calls,1);
  assert.equal((await load(account,{views:['survey'],deadline:NaN},{read})).reason,'invalid_deadline');assert.equal(calls,1);
  const failed=await run({views:['survey']},()=>{throw new Error('PRIVATE_TOKEN_ERROR');});assert.equal(failed.out.reason,'read_failed');assert.doesNotMatch(failed.out.evidence.content,/PRIVATE_TOKEN/u);
});

test('actual native loader uses only student read RPC under intercepted transport and never answer/manage/write',async()=>{
  const previous=globalThis.fetch,calls:{url:string;init:RequestInit|undefined}[]=[];
  globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init});const body=JSON.parse(String(init?.body));return Response.json(dto(body.p_scope));};
  try{
    const out=await load(account,{views:['survey','immediate']});assert.equal(out.readState,'ok');assert.equal(calls.length,2);
    for(let i=0;i<calls.length;i++){
      assert.equal(calls[i].url,account.url+'/rest/v1/rpc/affairs_read_teaching_feedback');assert.equal(calls[i].init?.method,'POST');assert.equal(calls[i].init?.redirect,'error');
      assert.deepEqual(JSON.parse(String(calls[i].init?.body)),{p_scope:i===0?'survey':'immediate',p_term:null,p_survey:null,p_section:null});
      assert.equal(new Headers(calls[i].init?.headers).get('authorization'),'Bearer OFFLINE_CALLER');
    }
  }finally{globalThis.fetch=previous;}
});
