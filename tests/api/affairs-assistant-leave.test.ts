import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import researchHandler from '../../api/research-assistant.ts';
import {studentLeaveAssistantPlan,studentLeaveSelectedTools} from '../../server/studentLeaveAssistantPlan.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {readStudentLeaveEvidence} from '../../server/accountStudentLeaveEvidence.js';
import {createStudentLeaveProbe,leaveObservationHeader,verifyStudentLeaveObservation} from '../../server/studentLeaveObservation.js';

const owner='11900000-0000-4000-8000-000000000001';
const leaveId='11900000-0000-4000-8000-000000000101';
const student='11900000-0000-4000-8000-000000000201';
const reviewId='11900000-0000-4000-8000-000000000202';
const service='/school-affairs/services/leave';
const base='https://xiftudmvxphxcjtmfmib.supabase.co';
const account={user:{id:owner},url:base,key:'OFFLINE_PUBLIC_KEY',token:'OFFLINE_CALLER_TOKEN'};
type RequestBody={question:string;route?:string;history?:ReadonlyArray<{role:string;content:string}>};
async function invoke(handler:any,body:RequestBody,host=process.env.VERCEL_URL){
  const headers=new Headers();
  const result={status:200,body:null as any,headers};
  const response={setHeader(name:string,value:string){headers.set(name,value);},status(status:number){result.status=status;return response;},json(value:unknown){result.body=value;}};
  await handler({method:'POST',headers:{authorization:'Bearer OFFLINE_CALLER_TOKEN',host},body},response);
  return result;
}

async function check(
  body:RequestBody,{fields=['startsOn','endsOn','status'],fail=false,review='normal',charges=false,timetable=false,grades=false,model=true,identity=account.user}
    :{fields?:string[];fail?:boolean;review?:'normal'|'retry'|'deeper'|'reject';charges?:boolean;timetable?:boolean;grades?:boolean;model?:boolean;identity?:typeof account.user&{email?:string;user_metadata?:Record<string,unknown>}}={},
){
  const calls:URL[]=[],stages:string[]=[],errors:unknown[]=[];
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
  let reviewed=0,lastAnswer='',refreshedEvidence:string|undefined;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER_KEY';
  globalThis.fetch=async (input,init)=>{
    try{
      const url=new URL(String(input));
      if(url.origin===base){
        calls.push(url);
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
        if(url.pathname==='/rest/v1/rpc/dtm_grade_report_overview'){
          assert.equal(grades,true);
          assert.equal(init?.method,'POST');
          assert.deepEqual(JSON.parse(String(init?.body)),{});
          return Response.json({courses:[{id:'11900000-0000-4000-8000-000000000302',userId:owner,
            title:'Saved Moodle course',code:'DTM1',term:'Saved term',gradeText:'74.00'}],limit:100,nextCursor:null});
        }
        assert.equal(init?.method,'GET');
        if(url.pathname==='/rest/v1/affairs_service_records'){
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          assert.equal(url.searchParams.get('service_key'),'eq.leave');
          assert.equal(url.searchParams.get('record_type'),'eq.leave');
          const select=url.searchParams.get('select')!.split(',');
          assert.ok(!select.some(key=>['notes','contact_phone','attachments'].includes(key)));
          if(fields.includes('title'))assert.equal(url.searchParams.get('title'),'eq.Clinic leave');
          else assert.ok(!select.includes('title'));
          if(fail)return Response.json({}, {status:503});
          const row:Record<string,string>={id:leaveId,user_id:owner,service_key:'leave',record_type:'leave',
            starts_on:'2026-11-09',ends_on:'2026-11-10',status:reviewed?'withdrawn':'filed',periods:'3-4',
            title:'Clinic leave',review_request_id:reviewId};
          return Response.json([Object.fromEntries(select.map(key=>[key,row[key]]))],{headers:{'content-range':'0-0/1'}});
        }
        if(url.pathname==='/rest/v1/affairs_service_requests'){
          assert.ok(fields.includes('reviewStatus'));
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          assert.equal(url.searchParams.get('id'),'in.('+reviewId+')');
          return Response.json([{id:reviewId,user_id:owner,request_type:'general',status:'in_review'}],{headers:{'content-range':'0-0/1'}});
        }
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.ok(charges||timetable);
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          return Response.json([{id:student,user_id:owner}]);
        }
        if(url.pathname==='/rest/v1/affairs_enrollments'){
          assert.equal(timetable,true);
          assert.equal(url.searchParams.get('student_id'),'eq.'+student);
          const recordId=(n:number)=>'11900000-0000-4000-8000-'+String(n).padStart(12,'0');
          return Response.json([{id:recordId(401),student_id:student,section_id:recordId(402),status:'enrolled',source_mode:'sample',
            student:{id:student,user_id:owner},section:{id:recordId(402),course_id:recordId(403),term_id:recordId(404),weekday:1,
              starts_at:'10:00:00',ends_at:'11:00:00',room:'QA Room',
              course:{id:recordId(403),code:'QA1',title:'Saved next class'},term:{id:recordId(404),label:'Sample term',starts_on:'2021-01-01',ends_on:'2098-12-31'}}}],
          {headers:{'content-range':'0-0/1'}});
        }
        assert.equal(charges,true);
        assert.equal(url.pathname,'/rest/v1/affairs_charges');
        assert.equal(url.searchParams.get('student_id'),'eq.'+student);
        return Response.json([{id:'11900000-0000-4000-8000-000000000301',student_id:student,label:'Sample tuition',
          amount_due:15000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample',occurrence_on:null,
          category:null,contact_unit:null,contact_extension:null,payment_unit:null}]);
      }
      assert.equal(model,true);
      assert.equal(url.origin,'https://api.openai.com');
      const wire=JSON.parse(String(init?.body)),stage=wire.text.format.name,packet=JSON.parse(wire.input[0].content[0].text);
      stages.push(stage);
      const deeper=reviewed>=2;
      assert.equal(wire.reasoning.effort,deeper?'medium':'low');
      if(deeper)assert.equal(JSON.stringify(packet.evidence),refreshedEvidence);
      if(stage==='answer_evidence_review'&&reviewed===1)refreshedEvidence=JSON.stringify(packet.evidence);
      const tools=['leaveRecords',...(charges?['charges']:[]),...(timetable?['courses']:[]),...(grades?['dtmGradeReport']:[])];
      assert.deepEqual(packet.evidence.map((item:any)=>item.id).sort(),['account-scope',...tools.map(key=>'account:'+key)].sort());
      assert.doesNotMatch(JSON.stringify(packet),/OFFLINE_CALLER_TOKEN|contact_phone|PRIVATE_REASON|evaluationLeaveProbe|assistant_evaluation_run/);
      const scope=JSON.parse(packet.evidence.find((item:any)=>item.id==='account-scope').content);
      assert.deepEqual(scope.selectedTools.sort(),tools.sort());
      assert.deepEqual(scope.actions,[]);
      const leave=JSON.parse(packet.evidence.find((item:any)=>item.id==='account:leaveRecords').content);
      if(!fail)assert.deepEqual(Object.keys(leave.records[0]),fields);
      let output;
      if(stage==='answer_evidence_review'){
        reviewed++;
        lastAnswer=packet.answer;
        const supported=review==='retry'?reviewed>1:review==='deeper'?reviewed>2:true;
        const leavePaths=fail?['/readState']:review==='reject'?['/provenance/sourceMode']:fields.map(key=>'/records/0/'+key);
        const claims=[{claim:'Saved leave values',supported,evidenceId:'account:leaveRecords',jsonPaths:leavePaths,quotes:[]}];
        if(charges)claims.push({claim:'Saved remaining fees',supported,evidenceId:'account:charges',jsonPaths:['/records/0/amountDue','/records/0/amountPaid'],quotes:[]});
        if(timetable)claims.push({claim:'Next class title and time',supported,evidenceId:'account:courses',jsonPaths:['/calendar/records/next/course/title','/calendar/records/next/course/startsAt'],quotes:[]});
        if(grades)claims.push({claim:'Saved Moodle grade text',supported,evidenceId:'account:dtmGradeReport',jsonPaths:['/courses/0/gradeText'],quotes:[]});
        output={supported,answersQuestion:supported,claims};
      }else{
        assert.equal(stage,'correct_grounded_answer');
        const answer=review==='retry'||review==='deeper'?'Your signed-in stu.best leave record ran from 2026-11-09 to 2026-11-10. Its saved tracking status is withdrawn.':lastAnswer;
        output={status:'answered',answer,sourceIds:tools.map(key=>'account:'+key)};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
    }catch(error){errors.push(error);throw error;}
  };
  try{
    const handler=createAffairsAssistantHandler({verifyToken:async()=>({...account,user:identity}),
      loadSnapshot:async()=>assert.fail('A leave query must not load the broad snapshot'),
      publicResearch:async()=>assert.fail('Private leave must not go to public research')});
    const response=await invoke(handler,body);
    assert.deepEqual(errors,[]);
    assert.equal(response.status,200,JSON.stringify(response.body));
    return {...response,calls,stages};
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
  }
}

test('leave lookup uses the exact owner and fields, and displays a verified scoped table',async()=>{
  const response=await check({question:'Show my leave dates and status.',route:service+'/history'});
  assert.deepEqual(response.calls.map(url=>url.pathname),['/rest/v1/affairs_service_records']);
  assert.deepEqual(response.stages,['answer_evidence_review']);
  assert.equal(response.body.verification.status,'verified');
  assert.match(response.body.answer,/2026-11-09.*2026-11-10/s);
  assert.equal(response.body.views[0].url,service+'/history');
  assert.deepEqual(response.body.views[0].rows,[['2026-11-09','2026-11-10','filed']]);
});

test('the existing named leave question scopes the row title and exact local review',async()=>{
  const response=await check({question:'Show the dates and tracking status of my Clinic leave request. Use YYYY-MM-DD for dates.',route:service+'/history'},
    {fields:['title','startsOn','endsOn','status','reviewStatus','reviewState']});
  assert.equal(response.body.verification.status,'verified');
  assert.match(response.body.answer,/Clinic leave/);
  assert.match(response.body.answer,/Saved tracking status: .*filed/);
  assert.match(response.body.answer,/Local review status: .*in_review/);
  assert.deepEqual(response.calls.map(url=>url.pathname),['/rest/v1/affairs_service_records','/rest/v1/affairs_service_requests']);
});

test('leave record link and leave periods use their exact scopes',async()=>{
  const exact=await check({question:'What is the status of this leave form?',route:service+'/edit/'+leaveId},{fields:['status']});
  assert.equal(exact.calls[0].searchParams.get('id'),'eq.'+leaveId);
  assert.equal(exact.body.views[0].url,service+'/edit/'+leaveId);
  const periods=await check({question:'Show my leave periods.',route:service+'/periods'},{fields:['periods']});
  assert.deepEqual(periods.body.views[0].rows,[['3-4']]);
});

test('retries reread the same scoped leave query and withhold unchecked table contents',async()=>{
  const recovered=await check({question:'Show my leave dates and status.',route:service+'/history'},{review:'retry'});
  assert.deepEqual(recovered.stages,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.deepEqual(recovered.calls.map(url=>url.href),[recovered.calls[0].href,recovered.calls[0].href]);
  assert.equal(recovered.body.verification.attempts,2);
  assert.equal(recovered.body.verification.status,'verified');
  assert.match(recovered.body.answer,/withdrawn/);
  assert.doesNotMatch(recovered.body.answer,/filed/);
  const rejected=await check({question:'Show my leave dates and status.',route:service+'/history'},{review:'reject'});
  assert.equal(rejected.body.verification.status,'unverified');
  assert.equal(rejected.body.verification.attempts,3);
  assert.doesNotMatch(rejected.body.answer,/2026-11-09/);
  assert.deepEqual(rejected.body.views,[]);
});

test('a second actionable rejection can recover a single fixed-scope leave answer from the same records',async()=>{
  const result=await check({question:'Show my leave dates and status.',route:service+'/history'},{review:'deeper'});
  assert.deepEqual(result.body.verification,{status:'verified',attempts:3});
  assert.deepEqual(result.stages,['answer_evidence_review','correct_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.equal(result.calls.length,2);
  assert.equal(result.calls[0].href,result.calls[1].href);
  assert.ok(result.body.activity.some((step:{kind:string})=>step.kind==='verification-deeper-review'));
  assert.ok(!result.body.activity.some((step:{kind:string})=>step.kind==='account-read:leaveRecords:3'));
  assert.match(result.body.answer,/withdrawn/u);
  assert.doesNotMatch(result.body.answer,/filed/u);
  assert.equal(result.body.proposedAction,undefined);
});

test('failed leave reads preserve a verified fee answer and do not claim leave absence',async()=>{
  const response=await check({question:'Show my leave history and tell me my tuition balance.',route:service+'/history'},{fail:true,charges:true});
  assert.equal(response.body.verification.status,'verified');
  assert.match(response.body.answer,/couldn.t read the saved leave records/iu);
  assert.match(response.body.answer,/10,?000/);
  assert.doesNotMatch(response.body.answer,/no matching saved leave/i);
  assert.deepEqual(response.calls.map(url=>url.pathname).sort(),['affairs_charges','affairs_service_records','affairs_students'].map(table=>'/rest/v1/'+table));
});

test('independent timetable and native Moodle grade companions use only their own sources',async()=>{
  const response=await check({question:'Show my leave dates. When is my next class? Show all my saved Moodle course grades.',
    route:service+'/history'},{fields:['startsOn','endsOn'],timetable:true,grades:true});
  assert.equal(response.body.verification.status,'verified');
  assert.match(response.body.answer,/Saved next class/);
  assert.match(response.body.answer,/74\.00/);
  assert.match(response.body.answer,/2026-11-09/);
  assert.deepEqual(response.stages,['answer_evidence_review']);
  assert.deepEqual(response.calls.map(url=>url.pathname).sort(),
    ['/rest/v1/affairs_enrollments','/rest/v1/affairs_service_records','/rest/v1/affairs_students','/rest/v1/rpc/dtm_grade_report_overview']);
});

test('public questions, exclusions and foreign companions never select private records',()=>{
  const plan=(question:string,route=service+'/history')=>studentLeaveAssistantPlan(question,route,[]);
  for(const question of ['What counts as sick leave at STU?','What is the university policy for student leave longer than three days?',
    'Where can I find the office that handles student leave?'])assert.equal(plan(question),null,question);
  for(const question of ['Please do not disclose my leave records.','Show my leave status. Do not include it.',
    'Show saved leave dates for alice.','Show saved leave dates for ALICE.','Show leave dates for all students.','替王小明查詢請假紀錄。']){
    const scope=plan(question);
    assert.ok(scope,question);
    assert.deepEqual(studentLeaveSelectedTools(scope),[],question);
  }
  for(const question of ['Show my leave history. What remains unpaid for Alice?','Show my leave dates and what grades are saved for Alice?'])
    assert.deepEqual(studentLeaveSelectedTools(plan(question)!),['leaveRecords'],question);
  assert.deepEqual(studentLeaveSelectedTools(plan('Show my leave dates plus my tuition balance.')!),['leaveRecords','charges']);
  const scope=plan('Status? Show my tuition balance.');
  assert.deepEqual(studentLeaveSelectedTools(scope!),['leaveRecords','charges']);
  assert.deepEqual(scope?.selection?.fields,['status']);
  assert.equal(plan('How many leave records do I have and show my leave dates.')?.selection?.countOnly,false);
});

test('formatter rejects contradictory counts, filters, archive dates and forged review states',async()=>{
  const {selection}=studentLeaveAssistantPlan('Show my archived leave dates and status.',service+'/archive',[])!;
  const source=await readStudentLeaveEvidence(account,{selection:selection!},{fetchImpl:async()=>Response.json([
    {id:leaveId,user_id:owner,service_key:'leave',record_type:'leave',starts_on:'2018-11-09',ends_on:'2018-11-10',status:'filed'},
  ],{headers:{'content-range':'0-0/1'}})});
  assert.equal(source.readState,'ok');
  assert.match(formatSupplementalAccountAnswers([source]).answer,/2018-11-09/);
  const corruptions=[(p:any)=>{p.records[0].startsOn='2026-11-09';p.records[0].endsOn='2026-11-10';},
    (p:any)=>{p.selection.filters.statuses.included=['draft'];},(p:any)=>{p.selection.filters.credentials='unexpected';},
    (p:any)=>{p.counts.returned=80;},(p:any)=>{p.counts.reviewUnavailable=1;}];
  for(const corrupt of corruptions){
    const forged=structuredClone(source);
    const value=JSON.parse(forged.evidence.content);
    corrupt(value);
    forged.evidence.content=JSON.stringify(value);
    assert.throws(()=>formatSupplementalAccountAnswers([forged]),TypeError);
  }
});

test('foreign and requested leave writes stop early, and guests get exact local return links',async()=>{
  for(const question of ['Show another student’s leave history.','Submit my leave request.']){
    const response=await check({question,route:service+'/history'},{model:false});
    assert.equal(response.calls.length,0);
    assert.equal(response.stages.length,0);
    assert.equal(response.body.proposedAction,undefined);
  }
  const guest=await invoke(researchHandler,{question:'Status?',route:service+'/archive'});
  assert.equal(guest.body.status,'handoff');
  assert.ok(guest.body.citations.some((row:any)=>new URL(row.url,'https://stu.best').searchParams.get('next')===service+'/archive'));
});

test('protected Preview leave receipt attests real read and provider completion, and rejects changed or ordinary requests',async t=>{
  const key='OFFLINE_OBSERVATION_TEST_KEY_'+randomUUID(),origin='https://stdedu-1234abcde-v1-d286.vercel.app';
  const sourceRevision='2'.repeat(40);
  const env={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).hostname,VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key};
  for(const [name,value] of Object.entries(env)){
    const original=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(original===undefined)delete process.env[name];else process.env[name]=original;});
  }
  const runId=randomUUID(),nonce=randomUUID();
  const identity={id:owner,email:'evaluation.student@example.invalid',user_metadata:{assistant_evaluation_run:runId}};
  const request={question:'Show my leave dates and status.',route:service+'/history',history:[],stream:false as const,consentedResearchUse:false as const};
  const {binding,body}=createStudentLeaveProbe({ownerId:owner,runId,origin,sourceRevision,nonce},request,key);
  const result=await check(body,{identity});
  const correlationId=result.headers.get('X-Assistant-Request-Id');
  const receipt=result.headers.get(leaveObservationHeader);
  assert.ok(receipt);
  const observed=verifyStudentLeaveObservation({receipt,binding,correlationId,body:result.body},key);
  assert.ok(observed);
  assert.equal(observed.attempts.length,1);
  assert.equal(observed.attempts[0].reads.length,1);
  assert.deepEqual(observed.completedModelOperations,['answer_evidence_review']);
  const publicPayload=Buffer.from(receipt.split('.')[0],'base64url').toString('utf8');
  assert.doesNotMatch(publicPayload,/OFFLINE|example\.invalid|2026-11-09|filed|answer"/u);
  const reject=(options:Record<string,unknown>)=>assert.equal(verifyStudentLeaveObservation({receipt,binding,correlationId,body:result.body,...options},key),null);
  reject({binding:{...binding,nonce:randomUUID()}});
  reject({correlationId:randomUUID()});
  reject({body:{...result.body,answer:'Different terminal response'}});
  reject({receipt:body.evaluationLeaveProbe});
  reject({receipt:receipt+'a'});

  let verifiedIdentity:typeof identity|undefined=identity, entered=0;
  const unexpected=async()=>{entered++;throw new Error('Unexpected account, reader, or provider call.');};
  const handler=createAffairsAssistantHandler({verifyToken:async()=>({...account,user:verifiedIdentity??account.user}),
    answerAccount:unexpected,loadSnapshot:unexpected,publicResearch:unexpected,readers:{leaveRecords:unexpected}});
  const invalid=[
    {...body,question:'Show my leave category.'},
    {...body,route:service+'/periods'},
    {...body,history:[{role:'user',content:'Different context'}]},
    {...body,stream:true},
    {...body,consentedResearchUse:true},
    {...body,evaluationLeaveProbe:receipt},
    createStudentLeaveProbe({ownerId:owner,runId,origin,sourceRevision,nonce},request,key,Date.now()-121000).body,
    createStudentLeaveProbe({ownerId:owner,runId,origin,sourceRevision:'3'.repeat(40),nonce},request,key).body,
    createStudentLeaveProbe({ownerId:owner,runId,origin:'https://stdedu-abc123def-v1-d286.vercel.app',sourceRevision,nonce},request,key).body,
  ];
  const unavailable={error:'Student Leave observation unavailable.'};
  for(const input of invalid){
    const response=await invoke(handler,input);
    assert.equal(response.status,404);
    assert.deepEqual(response.body,unavailable);
    assert.equal(response.headers.get(leaveObservationHeader),null);
  }
  verifiedIdentity={...identity,user_metadata:{assistant_evaluation_run:randomUUID()}};
  assert.deepEqual((await invoke(handler,body)).body,unavailable);
  verifiedIdentity={...identity,id:randomUUID()};
  assert.deepEqual((await invoke(handler,body)).body,unavailable);
  verifiedIdentity=undefined;
  assert.deepEqual((await invoke(handler,body)).body,unavailable);
  assert.deepEqual((await invoke(handler,body,'stu.best')).body,unavailable);
  process.env.VERCEL_ENV='production';
  assert.deepEqual((await invoke(handler,body)).body,unavailable);
  assert.equal(entered,0);

  const ordinary=await check(request,{identity});
  assert.equal(ordinary.headers.get(leaveObservationHeader),null);
  const withoutClock=(value:unknown)=>JSON.stringify(value,(name,field)=>name==='checkedAt'?undefined:field);
  assert.equal(withoutClock(ordinary.body),withoutClock(result.body));
});
