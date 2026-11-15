import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildTranscriptReplayPlan,transcriptReplayFixture,transcriptReplayManifest,replayTranscriptOffline,gradeTranscriptReplay} from './transcript-replay.mjs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';

const plan=()=>buildTranscriptReplayPlan({runId:'17000000-0000-4000-8000-000000000001',sessionId:'17000000-0000-4000-8000-000000000002',sourceRevision:'a'.repeat(40)});
const clone=structuredClone;
function memoryStore(){let saved=null;const writes=[];return {writes,read:async()=>clone(saved),write:async({session,expectedRevision})=>{
  assert.equal(saved?.revision??0,expectedRevision);saved=clone(session);writes.push(clone(saved));},replace:value=>{saved=clone(value);}};}
const current='Current School Affairs subjects (sample): SAMP101 Campus Orientation; SAMP102 Digital Learning Basics; SAMP103 Student Services Practice.\n\nYear level: 3 (sample).';
const overview='Program: Sample General Studies. Year level: 3 (sample).\n\nCurrent School Affairs subjects (sample): SAMP101 Campus Orientation; SAMP102 Digital Learning Basics; SAMP103 Student Services Practice.\n\nSaved Moodle course: DTM301 Learning Research.\n\nYou can ask about your saved assignments or current subjects next.';
const coaching='Start with one example you can truthfully explain, and describe your contribution.\n\nFill-in template; replace brackets only with true details: “In [project], I used [tool] to build [result].”\n\nWhich project, if any, would you like to describe?';
const answers=[overview,current,'Saved local stu.best sample tuition charge.\nRemaining balance: NT$23,000.\nCharged: NT$28,000.\nPaid: NT$5,000.',coaching];
function envelope(testCase,answer,index){return {statusCode:200,execution:'recorded',sourceRevision:'a'.repeat(40),fixtureKey:testCase.fixtureKey,body:{status:'answered',answer,
  citations:testCase.expected.requiredLinks.map(url=>({chunkId:index===2?'account:charges':'account:courses',title:'Saved local records',url})),views:[],verification:{status:'verified',attempts:1}},
  events:testCase.expected.requiredTools.map(tool=>({kind:'account-read:'+tool+':1',status:'complete'}))};}
const dispatcher=override=>async({testCase})=>{const index=Number(testCase.turnId.slice(5))-1;return envelope(testCase,override?.(index)??answers[index],index);};

test('packet preserves the four exact original prompts, independent common fixture and explicit offline readiness',()=>{
  const p=plan();assert.equal(p.cases.length,4);assert.deepEqual(p.cases.map(row=>row.id),transcriptReplayManifest.caseIds);
  assert.deepEqual(p.cases.map(row=>row.turnId),['turn-1','turn-2','turn-3','turn-4']);
  assert.equal(p.cases[1].question,'what courses i have for this semester and what year i am currently at');
  const fixture=transcriptReplayFixture(p);assert.equal(fixture.student.yearLevel,3);assert.equal(fixture.profile.userId,p.ownerId);
  assert.deepEqual(fixture.courses.map(row=>row.code),['SAMP101','SAMP102','SAMP103','SAMP090','SAMP201']);
  fixture.student.yearLevel=8;assert.equal(transcriptReplayFixture(p).student.yearLevel,3);
  assert.equal(p.liveReady,false);assert.equal(transcriptReplayManifest.mounted,false);
  assert.throws(()=>buildTranscriptReplayPlan({...p,now:'2027-01-16T00:00:00Z'}),{code:'fixture_window'});
  const changed=clone(p);changed.cases.reverse();assert.throws(()=>transcriptReplayFixture(changed),{code:'plan_drift'});
});

test('one saved session keeps exact user/assistant turn order without turning prior wording into fixture evidence',async()=>{
  const p=plan(),store=memoryStore(),seen=[];
  const {session,report}=await replayTranscriptOffline(p,{store,dispatch:async request=>{
    const index=seen.length;seen.push(clone({...request,signal:undefined}));
    assert.equal(request.sessionId,p.sessionId);assert.equal(request.turnId,'turn-'+(index+1));
    assert.equal(request.testCase.history.length,index*2);assert.equal(request.fixture.student.yearLevel,3);
    if(index)assert.equal(request.testCase.history.at(-1).content,answers[index-1]);
    request.fixture.student.yearLevel=8;
    return envelope(request.testCase,answers[index],index);
  }});
  assert.equal(session.revision,8);assert.equal(store.writes.length,8);assert.equal(session.turns.length,8);assert.equal(report.complete,true);
  assert.deepEqual(session.turns.map(row=>row.id),['turn-1:user','turn-1:assistant','turn-2:user','turn-2:assistant','turn-3:user','turn-3:assistant','turn-4:user','turn-4:assistant']);
  assert.equal(report.releaseReady,false);assert.equal(report.liveReady,false);assert.equal(report.behaviorPassed,false);
  assert.equal(report.results[0].independentReview.status,'pending');assert.equal(report.results[3].independentReview.status,'pending');
  assert.equal(report.results[1].passed,true,JSON.stringify(report.results[1].failures));assert.equal(report.results[2].passed,true,JSON.stringify(report.results[2].failures));
  assert.equal(seen[3].testCase.history[0].content,p.cases[0].question);
});

test('known current-year omission cannot be rescued by a verified badge or correct year in an earlier reply',async()=>{
  const {report}=await replayTranscriptOffline(plan(),{store:memoryStore(),dispatch:dispatcher(index=>index===1?'Current subjects: SAMP101 Campus Orientation; SAMP102 Digital Learning Basics; SAMP103 Student Services Practice. Sample records.':undefined)});
  assert.equal(report.results[1].passed,false);assert.ok(report.results[1].failures.some(row=>row.id.startsWith('fact.')));
  assert.equal(report.results[0].independentReview.status,'pending');
});

test('earlier assistant assertions remain untrusted context and never rebase independent year or qualification facts',async()=>{
  const {session,report}=await replayTranscriptOffline(plan(),{store:memoryStore(),dispatch:dispatcher(index=>index===0?overview+'\nYour year level is 8. You are a certified software engineer.':index===1?current.replace('Year level: 3','Year level: 8'):index===3?'You are a certified software engineer.':undefined)});
  assert.match(session.turns[1].content,/year level is 8/);assert.equal(report.results[1].passed,false);assert.equal(report.results[3].passed,false);
  assert.equal(transcriptReplayFixture(plan()).student.yearLevel,3);
});

test('original generic refusals are retained as failed outcomes rather than replaced by later successful turns',async()=>{
  const {report,session}=await replayTranscriptOffline(plan(),{store:memoryStore(),dispatch:async({testCase})=>{
    const index=Number(testCase.turnId.slice(5))-1,value=envelope(testCase,index===2?answers[index]:'I checked the available records but could not verify this answer. Please try again.',index);
    if(index!==2){value.body.status='abstained';value.body.verification={status:'unverified',attempts:2};}return value;
  }});
  assert.equal(session.results.length,4);assert.deepEqual(report.results.map(row=>row.passed),[false,false,true,false]);
});

test('completed saved replay resumes without a duplicate request; changed identity or stored response fails closed',async()=>{
  const p=plan(),store=memoryStore();const first=await replayTranscriptOffline(p,{store,dispatch:dispatcher()});
  const second=await replayTranscriptOffline(p,{store,dispatch:async()=>assert.fail('No duplicate request')});assert.deepEqual(second,first);
  for(const mutate of [value=>{value.sessionId='17000000-0000-4000-8000-000000000009';},value=>{value.results[0].envelope.body.answer+=' changed';},value=>{value.turns[0].content='different';},value=>{value.turns.reverse();}]){
    const value=clone(first.session);mutate(value);store.replace(value);
    await assert.rejects(replayTranscriptOffline(p,{store,dispatch:async()=>assert.fail('Saved-state corruption precedes dispatch')}));
  }
});

test('uncertain dispatch saves request intent but is never replayed automatically, and errors do not leak dependency text',async()=>{
  const p=plan(),store=memoryStore();
  await assert.rejects(replayTranscriptOffline(p,{store,dispatch:async()=>{throw Error('SECRET_TOKEN_SHOULD_NOT_ESCAPE');}}),error=>error.code==='dispatch_failed'&&!error.message.includes('SECRET'));
  const saved=await store.read(p.sessionId);assert.equal(saved.pending.turnId,'turn-1');assert.equal(saved.results.length,0);
  await assert.rejects(replayTranscriptOffline(p,{store,dispatch:async()=>assert.fail('No blind replay')}),{code:'uncertain_pending_turn'});
});

test('store readback, actual revision, source identity and offline execution are mandatory before response credit',async()=>{
  const p=plan();let calls=0;
  await assert.rejects(replayTranscriptOffline(p,{store:{read:async()=>null,write:async()=>{}},dispatch:async()=>{calls++;}}),{code:'store_readback_mismatch'});assert.equal(calls,0);
  for(const mutate of [value=>{value.sourceRevision='b'.repeat(40);},value=>{value.execution='live-model';},value=>{value.fixtureKey='other';},value=>{value.body.answer='';}]){
    await assert.rejects(replayTranscriptOffline(p,{store:memoryStore(),dispatch:async({testCase})=>{const result=envelope(testCase,overview,0);mutate(result);return result;}}),{code:'invalid_response'});
  }
});

test('saved response admission rejects oversized, sparse and accessor-bearing JSON before dispatch',async()=>{
  const p=plan();let accessed=0;
  const indexed=Object.defineProperty([],'0',{enumerable:true,get(){accessed++;return 'not read';}});
  class OtherArray extends Array{}
  const ownMap=['x'];Object.defineProperty(ownMap,'map',{value:()=>{accessed++;return [];}});
  for(const value of [{turns:new Array(2000)},{turns:new Array(10)},{answer:'x'.repeat(128001)},Object.defineProperty({},'secret',{enumerable:true,get(){accessed++;return 'not read';}}),
    {turns:indexed},{turns:new OtherArray('x')},{turns:ownMap}]){
    await assert.rejects(replayTranscriptOffline(p,{store:{read:async()=>value,write:async()=>assert.fail('No write')},dispatch:async()=>assert.fail('No dispatch')}));
  }
  let stored;
  await assert.rejects(replayTranscriptOffline(p,{store:{read:async()=>stored??null,write:async({session})=>{
    stored=Object.defineProperty(session,'turns',{enumerable:true,get(){accessed++;return [];}});
  }},dispatch:async()=>assert.fail('Readback admission precedes dispatch')}),{code:'invalid_json'});
  assert.equal(accessed,0);
});

test('cancellation and bounded dependency failure retain an unresolved request rather than claiming completion',async()=>{
  const p=plan(),store=memoryStore();
  await assert.rejects(replayTranscriptOffline(p,{store,timeoutMs:5,dispatch:async()=>new Promise(()=>{})}),{code:'dispatch_timeout_or_cancelled'});
  assert.equal((await store.read(p.sessionId)).pending.turnId,'turn-1');
  const controller=new AbortController();controller.abort();
  await assert.rejects(replayTranscriptOffline(p,{store:memoryStore(),signal:controller.signal,dispatch:dispatcher()}),{code:'cancelled'});
});

test('independent helpfulness artifacts bind the actual evolving history and cannot be replaced by a response self-verdict',async()=>{
  const p=plan(),run=await replayTranscriptOffline(p,{store:memoryStore(),dispatch:async({testCase})=>{
    const index=Number(testCase.turnId.slice(5))-1,result=envelope(testCase,answers[index],index);result.body.independentReview={passed:true};return result;
  }});
  assert.equal(run.report.results[3].independentReview.status,'pending');
  const row=run.report.results[3];assert.equal(row.guidanceReviewBinding.fixtureStateHash,p.fixtureStateHash);
  const changed=clone(run.session);changed.results[3].envelope.body.answer='different';assert.throws(()=>gradeTranscriptReplay(p,changed));
  assert.throws(()=>gradeTranscriptReplay(p,run.session,{reviews:[{binding:{caseId:'unknown'}}]}),{code:'invalid_reviews'});
});

for(const rejectedCoaching of [false,true])
test(rejectedCoaching?'exact four-turn conversation uses safe interview practice after the model draft is rejected'
  :'current authenticated endpoint processes the saved four-turn conversation with only intercepted model and data transports',async()=>{
  const p=plan(),store=memoryStore(),saved=transcriptReplayFixture(p),origin='https://xiftudmvxphxcjtmfmib.supabase.co';
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-transcript-model';
  const transport=[],reviewEvidence=[],providerHistory=[];let active=0,workspaceReads=0;
  const ownId=p.ownerId,studentId=saved.student.id,programId='17000000-0000-4000-8000-000000000099';
  const counted={affairs_assignments:saved.assignments.length,affairs_charges:saved.charges.length,affairs_tasks:saved.tasks.length,affairs_service_requests:saved.requests.length};
  const json=rows=>Response.json(rows,{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
  const handler=createAffairsAssistantHandler({verifyToken:async()=>({url:origin,key:'synthetic-publishable',token:'synthetic-token',user:{id:ownId}}),
    loadSnapshot:async()=>{workspaceReads++;assert.fail('All four prompts must avoid the broad workspace snapshot');},publicResearch:async()=>assert.fail('No private question sent to public research')});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.origin===origin){
      const table=url.pathname.split('/').at(-1),params=url.searchParams,headers=new Headers(init.headers);
      transport.push({turn:active,path:url.pathname,method:init.method,query:Object.fromEntries(params)});
      assert.equal(headers.get('authorization'),'Bearer synthetic-token');assert.equal(headers.get('apikey'),'synthetic-publishable');
      assert.ok(['GET','HEAD'].includes(init.method));
      if(init.method==='HEAD'){
        assert.equal(active,0);assert.ok(Object.hasOwn(counted,table));assert.equal(init.redirect,'error');assert.equal(headers.get('prefer'),'count=exact');
        const studentOwned=['affairs_assignments','affairs_charges'].includes(table);
        assert.deepEqual(Object.fromEntries(params),{select:'id',[studentOwned?'student_id':'user_id']:'eq.'+(studentOwned?studentId:ownId),limit:'0'});
        return new Response(null,{headers:{'content-range':'*/'+counted[table]}});
      }
      if(table==='affairs_profiles'){
        assert.equal(active,0);assert.deepEqual(Object.fromEntries(params),{select:'user_id,display_name,preferred_name',user_id:'eq.'+ownId,limit:'1'});
        return json([{user_id:ownId,display_name:saved.profile.displayName,preferred_name:null}]);
      }
      if(table==='dtm_courses'){
        assert.equal(active,0);assert.deepEqual(Object.fromEntries(params),{select:'id,user_id,code,title,term,source_mode',user_id:'eq.'+ownId,limit:'200',order:'id.asc'});
        return json(saved.dtm.courses.map(row=>({id:row.id,user_id:ownId,code:row.code,title:row.title,term:row.term,source_mode:row.sourceMode})));
      }
      if(url.pathname==='/rest/v1/affairs_students'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+ownId);
        const select=params.get('select');
        if(select==='id,user_id,year_level,source_mode,program_id,program:affairs_programs!affairs_students_program_id_fkey(id,name,source_mode)'){
          assert.equal(active,0);assert.equal(params.get('limit'),'1');
          return json([{id:studentId,user_id:ownId,year_level:saved.student.yearLevel,source_mode:saved.student.sourceMode,program_id:programId,
            program:{id:programId,name:saved.student.program,source_mode:'sample'}}]);
        }
        if(select==='user_id,year_level,source_mode'){assert.equal(active,1);return json([{user_id:ownId,year_level:saved.student.yearLevel,source_mode:saved.student.sourceMode}]);}
        assert.equal(select,'id,user_id');return json([{id:studentId,user_id:ownId}]);
      }
      if(url.pathname==='/rest/v1/affairs_enrollments'){
        assert.ok(active===0||active===1);assert.equal(params.get('student_id'),'eq.'+studentId);assert.equal(params.get('status'),'eq.enrolled');
        assert.equal(params.get('order'),'id.asc');assert.equal(params.get('offset'),'0');
        assert.doesNotMatch(params.get('select'),/grade|attendance|email|notes|\*/iu);
        const rows=saved.courses.filter(row=>row.status==='enrolled').map((row,index)=>({id:row.enrollmentId,student_id:studentId,section_id:'17000000-0000-4000-8000-'+String(index+100).padStart(12,'0'),status:row.status,source_mode:row.sourceMode,student:{id:studentId,user_id:ownId},
          section:{id:'17000000-0000-4000-8000-'+String(index+100).padStart(12,'0'),course_id:'17000000-0000-4000-8000-'+String(index+200).padStart(12,'0'),term_id:'17000000-0000-4000-8000-'+String(index+300).padStart(12,'0'),weekday:row.weekday,starts_at:row.startsAt,ends_at:row.endsAt,room:row.room,
            course:{id:'17000000-0000-4000-8000-'+String(index+200).padStart(12,'0'),code:row.code,title:row.title},term:{id:'17000000-0000-4000-8000-'+String(index+300).padStart(12,'0'),label:row.term,starts_on:row.termStartsOn,ends_on:row.termEndsOn}}}));
        return json(rows);
      }
      if(url.pathname==='/rest/v1/affairs_charges'){assert.equal(active,2);assert.equal(params.get('student_id'),'eq.'+studentId);return Response.json(saved.charges.map(row=>({id:row.id,student_id:studentId,label:row.label,amount_due:row.amountDue,amount_paid:row.amountPaid,currency:row.currency,source_mode:row.sourceMode,due_on:row.dueOn})));}
      assert.fail('Unexpected private transport '+url.pathname);
    }
    assert.equal(url.origin,'https://api.openai.com');assert.equal(url.pathname,'/v1/responses');
    const request=JSON.parse(init.body),payload=JSON.parse(request.input[0].content[0].text),operation=request.text.format.name;
    let response;
    if(operation==='account_lookup_plan')response={tools:[],publicTopics:[],catalogQuery:null,action:null};
    else if(operation==='compose_grounded_answer'){
      providerHistory.push({turn:active,history:payload.history});response={status:'answered',
        answer:rejectedCoaching&&active===3?'I led a production engineering team and earned a degree in software engineering.':answers[active],
        sourceIds:active===3?[]:['account:profile','account:courses','account:dtm']};
    }else{
      assert.equal(operation,'answer_evidence_review');reviewEvidence.push({turn:active,ids:payload.evidence.map(row=>row.id),sources:clone(payload.evidence),content:JSON.stringify(payload.evidence)});
      if(active===3)response=rejectedCoaching
        ?{supported:false,answersQuestion:true,parts:[{id:1,kind:'factual',accepted:false,claims:[]}]}
        :{supported:true,answersQuestion:true,parts:payload.answerParts.map((part,index)=>({id:part.id,kind:['suggestion','template','clarification'][index],accepted:true,claims:[]}))};
      else response={supported:true,answersQuestion:true,claims:active===0?[
        {claim:'The saved account name is Evaluation Student.',supported:true,evidenceId:'account:profile',jsonPaths:['/records/profile/displayName'],quotes:[]},
        {claim:'The saved program is Sample General Studies and year level is 3.',supported:true,evidenceId:'account:profile',jsonPaths:['/records/student/program','/records/student/yearLevel'],quotes:[]},
        ...['SAMP101','SAMP102','SAMP103'].map((code,index)=>({claim:'Current sample subject '+code+'.',supported:true,evidenceId:'account:courses',jsonPaths:[`/records/${index}/code`,`/records/${index}/title`],quotes:[]})),
        ...['DTM301','DTM102','DTM401'].map((code,index)=>({claim:'Separately saved DTM course '+code+'.',supported:true,evidenceId:'account:dtm',jsonPaths:[`/records/${index}/code`,`/records/${index}/title`],quotes:[]})),
        ...Object.entries({assignments:3,charges:2,tasks:2,requests:1}).map(([collection,total])=>({claim:`The selected ${collection} count is ${total}.`,supported:true,evidenceId:'account:'+collection,jsonPaths:['/overview/total'],quotes:[]})),
      ]:active===2?[{claim:'A saved sample charge has 23000 remaining.',supported:true,evidenceId:'account:charges',jsonPaths:['/records/0/amountDue','/records/0/amountPaid'],quotes:[]}]:[
        {claim:'Recorded year level: 3.',supported:true,evidenceId:'account:profile',jsonPaths:['/records/student/yearLevel'],quotes:[]},
        {claim:'Current sample course Campus Orientation.',supported:true,evidenceId:'account:courses',jsonPaths:['/records/0/code','/records/0/title'],quotes:[]},
      ]};
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]});
  };
  try{
    const run=await replayTranscriptOffline(p,{store,dispatch:async({testCase})=>{
      active=Number(testCase.turnId.slice(5))-1;
      if(active===3)assert.equal(testCase.history.length,6,'The assistant still receives the evolving conversation.');
      let statusCode=200,body;const response={setHeader(){},status(code){statusCode=code;return response;},json(value){body=value;}};
      await handler({method:'POST',headers:{authorization:'Bearer synthetic-token'},body:{question:testCase.question,route:testCase.route,history:testCase.history}},response);
      return {statusCode,body,events:body?.activity??[],sourceRevision:p.sourceRevision,fixtureKey:testCase.fixtureKey,execution:'deterministic'};
    }});
    assert.equal(run.report.complete,true);assert.equal(workspaceReads,0);assert.ok(run.session.results.every(row=>row.envelope.body.verification?.status==='verified'));
    for(const {envelope:{body}} of run.session.results)
      assert.doesNotMatch(JSON.stringify([body.answer,body.views,body.activity]),/not (?:an? )?(?:live|official|verified) university|no university sync|並非校方/iu);
    for(const {envelope:{body}} of run.session.results.slice(0,3))assert.match(body.answer,/sample/u);
    const first=reviewEvidence.find(row=>row.turn===0);assert.deepEqual(first.ids,['account-scope','account:profile','account:courses','account:dtm','account:assignments','account:charges','account:tasks','account:requests']);
    for(const [collection,total]of Object.entries({assignments:3,charges:2,tasks:2,requests:1})){
      const source=JSON.parse(first.sources.find(row=>row.id==='account:'+collection).content);
      assert.deepEqual(source.overview,{readState:'ok',total,included:0,complete:true,reason:null});assert.equal(Object.hasOwn(source,'records'),false);
    }
    assert.doesNotMatch(first.content,/amountDue|amountPaid|Collect reading list|Library access request|B-tree|evaluation\.student@|EVAL-115-001/u);
    const firstReads=transport.filter(row=>row.turn===0);assert.equal(firstReads.length,9);assert.equal(firstReads.filter(row=>row.method==='HEAD').length,4);
    assert.doesNotMatch(firstReads.map(row=>row.query.select).join('\n'),/\*|email|student_number|full_name|notes|details|grades|materials|attendance|amount_due|amount_paid|role/u);
    assert.equal(providerHistory.some(row=>row.turn===0),false);
    assert.match(run.session.results[0].envelope.body.answer,/3 assignment tracker records, 2 charge items, 2 saved tasks, 1 service requests/u);
    assert.deepEqual(run.report.results[0].failures.map(row=>row.id),['guidance.independentReview']);assert.equal(run.report.results[0].independentReview.status,'pending');
    assert.deepEqual(reviewEvidence.find(row=>row.turn===1).ids,['account-scope','account:profile','account:courses']);
    assert.deepEqual(reviewEvidence.find(row=>row.turn===2).ids,['account-scope','account:charges']);assert.deepEqual(reviewEvidence.find(row=>row.turn===3).ids,[]);
    assert.deepEqual(providerHistory.find(row=>row.turn===3).history,[],'Explicit interview coaching needs no previous account replies at the model provider.');assert.equal(transport.some(row=>row.turn===3),false);
    for(const index of [1,2])assert.equal(run.report.results[index].passed,true,JSON.stringify(run.report.results[index].failures));
    assert.equal(run.report.results[3].independentReview.status,'pending');
    const coaching=run.session.results[3].envelope.body;
    assert.equal(coaching.grounding.source,'general-guidance');
    assert.equal(coaching.grounding.webSearched,false);
    assert.deepEqual(coaching.citations,[]);
    assert.deepEqual(coaching.views,[]);
    assert.equal(coaching.proposedAction,undefined);
    assert.equal(reviewEvidence.filter(row=>row.turn===3).length,1);
    if(rejectedCoaching){
      assert.equal(coaching.verification.attempts,2);
      assert.match(coaching.answer,/real software example/);
      assert.match(coaching.answer,/\[your actual contribution\]/);
      assert.match(coaching.answer,/What is one project/);
      assert.doesNotMatch(coaching.answer,/led a production engineering team|Sample General Studies|SAMP101|23,000/);
      assert.ok(coaching.activity.some(step=>step.kind==='general-coaching-guide'&&step.status==='complete'));
    }else{
      assert.equal(coaching.answer,answers[3]);
      assert.equal(coaching.verification.attempts,1);
    }
    assert.equal(run.report.releaseReady,false);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
