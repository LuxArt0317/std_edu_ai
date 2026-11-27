import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {
  createInternshipProbe,internshipObservationDigest,internshipObservationHeader,verifyInternshipObservation,
} from '../../server/internshipObservation.js';
import researchHandler from '../../api/research-assistant.ts';
import {schoolSubjectRecordsPath} from '../../src/features/public/affairs/studentServices.js';
import {buildInternshipNativeCases,internshipNativeFixtureForCase,internshipNativeManifest} from '../evaluation/internship-native-cases.mjs';

// @ts-expect-error The independent test runner is a standalone JavaScript module.
import {internshipRunnerCases} from '../evaluation/internship-native-runner.mjs';
import {gradeCase} from '../evaluation/grading.mjs';
// @ts-expect-error Hosted operator helpers are standalone JavaScript modules.
import {internshipHostedCases,internshipFixtureKindForCase,internshipPublishedTimetableCase,internshipPublishedTimetableCaseIds,requestInternshipHostedCase} from '../evaluation/internship-native-hosted.mjs';
// @ts-expect-error Fixture setup is a standalone JavaScript module.
import {buildInternshipFixturePlan} from '../evaluation/internship-native-fixture.mjs';
// @ts-expect-error Companion fixture code is a standalone JavaScript module.
import {buildInternshipChargeFixture} from '../evaluation/internship-charge-fixture.mjs';
// @ts-expect-error Companion fixture code is a standalone JavaScript module.
import {internshipTimetableSelection} from '../evaluation/internship-timetable-fixture.mjs';

const base='https://xiftudmvxphxcjtmfmib.supabase.co';
const owner=internshipNativeManifest.owners.A;
const account={user:{id:owner},url:base,key:'OFFLINE_PUBLIC_KEY',token:'OFFLINE_CALLER_TOKEN'};
const student='53010000-0000-4000-8000-000000000601';
const previewOrigin='https://stdedu-abcdef012-v1-d286.vercel.app';
const previewRevision='a'.repeat(40),operatorKey='SYNTHETIC_INTERN_OBSERVATION_TEST_KEY_'.repeat(2);
const runId='53010000-0000-4000-8000-000000000731',nonce='53010000-0000-4000-8000-000000000732';
const scope={ownerId:owner,origin:previewOrigin,sourceRevision:previewRevision,runId,nonce};
const previewEnv={VERCEL_ENV:'preview',VERCEL_URL:new URL(previewOrigin).host,VERCEL_GIT_COMMIT_SHA:previewRevision,SUPABASE_SERVICE_ROLE_KEY:operatorKey};
const columns:Record<string,string>={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
const bank=buildInternshipNativeCases();
const rowFor=(suffix:string)=>bank.find(row=>row.id==='account:internship-native-'+suffix)!;
const timetableId=(n:number)=>'53010000-0000-4000-8000-'+String(n).padStart(12,'0');
const timetableStudents=[{id:timetableId(631),user_id:owner},{id:timetableId(632),user_id:internshipNativeManifest.owners.B}];
const timetableSections=[
  {code:'SAMP103',title:'Student Services Practice',sectionId:timetableId(650),courseId:timetableId(651),termId:timetableId(652),
    weekday:5,startsAt:'10:00:00',endsAt:'11:30:00',status:'enrolled',sourceMode:'verified',room:'Sample Room 305',
    term:{label:'Sample Fall 2026',startsOn:'2026-09-07',endsOn:'2027-01-15'}},
  {code:'SAMP201',title:'Applied Digital Projects',sectionId:timetableId(660),courseId:timetableId(661),termId:timetableId(662),
    weekday:2,startsAt:'14:00:00',endsAt:'15:30:00',status:'enrolled',sourceMode:'verified',room:'Sample Lab 202',
    term:{label:'Sample Spring 2027',startsOn:'2027-02-15',endsOn:'2027-06-25'}},
];
const publishedTimetable={
  plan:{runId,owners:internshipNativeManifest.owners,students:timetableStudents,sections:timetableSections},
  state:{students:timetableStudents,enrollments:timetableStudents.flatMap((student,i)=>timetableSections.map((s,j)=>({
    id:timetableId(670+i*10+j),student_id:student.id,section_id:s.sectionId,status:s.status,source_mode:s.sourceMode,
  })))},
  next:{code:'SAMP103',title:'Student Services Practice',sectionCode:'A',room:'Sample Room 305',date:'2026-11-20',startTime:'10:00'},
};
type Body={question:string;route:string;evaluationLeaveProbe?:string;history?:Array<{role:string;content:string}>};

async function invoke(handler:any,body:Body,host?:string){
  const captured={status:200,body:null as any,headers:new Headers()};
  const response={setHeader(name:string,value:string){captured.headers.set(name,value);},status(status:number){captured.status=status;return response;},json(result:unknown){captured.body=result;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token,...(host?{host}:{})},body},response);
  return captured;
}

type TimetableIssue='unavailable'|'empty'|'tie'|'missing-room'|'truncated';
async function exercise(suffix:string,{retry=false,unverifiable=false,observed=false,hosted=false,providerAbsent=false,published=false,chargeUnavailable=false,
  timetableIssue=undefined as TimetableIssue|undefined}={}){
  const row=rowFor(suffix);assert.ok(row,suffix);
  const {sourceRead,rows,requests,forbidden}=internshipNativeFixtureForCase(row);
  const companion=row.observationExpectation.companion;
  const chargePlan=hosted&&companion==='charges'?buildInternshipChargeFixture({runId,owners:internshipNativeManifest.owners,
    programId:'53010000-0000-4000-8000-000000000653'}):undefined;
  const timetable=published?publishedTimetable:undefined;
  const timetableRequests=timetable?internshipTimetableSelection(timetable.plan,timetable.state,timetableStudents[0]):[];
  const studentId=chargePlan?.students[0].id??timetable?.plan.students[0].id??student;
  const charge=chargePlan?.charges[0]??{id:'53010000-0000-4000-8000-000000000611',student_id:student,label:'QA Internship Tuition',
    amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample',occurrence_on:null,
    category:null,contact_unit:null,contact_extension:null,payment_unit:null};
  const originalFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  const calls:string[]=[],model:string[]=[],errors:unknown[]=[],readDigests:string[]=[];
  let checked=0,lastDraft='',broadReads=0;
  if(providerAbsent)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY='OFFLINE_PROVIDER_KEY';
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input));
      if(url.origin===base){
        assert.equal(init?.method,'GET');
        const headers=new Headers(init?.headers);
        assert.equal(headers.get('authorization'),'Bearer '+account.token);
        calls.push(url.pathname);
        if(url.pathname==='/rest/v1/affairs_service_records'){
          assert.ok(sourceRead);
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          assert.equal(url.searchParams.get('service_key'),'eq.internship');
          assert.equal(url.searchParams.get('record_type'),'eq.'+sourceRead.recordType);
          const review=sourceRead.fields.includes('reviewStatus');
          const selected=['id','user_id','service_key','record_type',...sourceRead.fields.filter((field:string)=>field!=='reviewStatus').map((field:string)=>columns[field])];
          const fields=selected.join(',')+(review?',review_request_id,site_review:affairs_service_requests!affairs_service_records_review_request_id_fkey(id,user_id,status)':'');
          assert.equal(url.searchParams.get('select'),fields);
          assert.equal(headers.get('prefer'),'count=exact');
          if(sourceRead.state==='unavailable')return Response.json({}, {status:503});
          const projected:Record<string,unknown>[]=rows.filter((item:any)=>item.service_key==='internship'&&item.user_id===owner&&item.record_type===sourceRead.recordType)
            .map((item:any)=>({ ...Object.fromEntries(selected.map(key=>[key,key==='status'&&checked&&item.status==='filed'?'withdrawn':item[key]])),
              ...(review?{review_request_id:item.review_request_id,site_review:requests.find((request:any)=>request.id===item.review_request_id)??null}:{})}));
          // Exercise the existing model-verification path with a real capped
          // projection. The exact renderer cannot attest a partial read.
          const bounded=retry||unverifiable;
          if(bounded)for(let index=projected.length;index<25;index++)projected.push({...projected[0],
            id:'53010000-0000-4000-8000-'+String(800+index).padStart(12,'0'),title:'QA capped internship row '+index});
          const available=bounded?26:projected.length;
          readDigests.push(internshipObservationDigest({method:'GET',url:url.href,ownerId:owner,available,rows:projected}));
          return Response.json(projected,{headers:{'content-range':projected.length?'0-'+(projected.length-1)+'/'+available:'*/0'}});
        }
        assert.ok(companion,'Unexpected independent reader');
        if(timetable){
          const index=url.pathname.endsWith('/affairs_students')?0:1;
          const [expected,rows]=timetableRequests[index];
          assert.equal(url.href,expected.href);
          if(index)assert.equal(headers.get('prefer'),'count=exact');
          return Response.json(rows,index?{headers:{'content-range':'0-'+(rows.length-1)+'/'+rows.length}}:{});
        }
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          return Response.json([{id:studentId,user_id:owner}]);
        }
        assert.equal(url.searchParams.get('student_id'),'eq.'+studentId);
        if(companion==='charges'){
          assert.equal(url.pathname,'/rest/v1/affairs_charges');
          return chargeUnavailable?Response.json({}, {status:503}):Response.json([charge]);
        }
        assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
        const id=(n:number)=>'53010000-0000-4000-8000-'+String(n).padStart(12,'0');
        if(timetableIssue==='unavailable')return Response.json({}, {status:503});
        if(timetableIssue==='empty')return Response.json([], {headers:{'content-range':'*/0'}});
        const first={id:id(621),student_id:student,section_id:id(622),status:'enrolled',source_mode:'verified',
          student:{id:student,user_id:owner},section:{id:id(622),course_id:id(623),term_id:id(624),weekday:2,
            starts_at:'10:10:00',ends_at:'11:00:00',room:timetableIssue==='missing-room'?'':'QA-R201',
            course:{id:id(623),code:'QAP201',title:'QA Research Practice'},
            term:{id:id(624),label:'Fixture term',starts_on:'2021-01-01',ends_on:'2098-12-31'}}};
        if(timetableIssue==='tie'){
          const overlap={...first,id:id(625),section_id:id(626),section:{...first.section,id:id(626),course_id:id(627),
            room:'QA-R202',course:{id:id(627),code:'QAO202',title:'QA Overlapping Seminar'}}};
          return Response.json([first,overlap], {headers:{'content-range':'0-1/2'}});
        }
        return Response.json([first],{headers:{'content-range':timetableIssue==='truncated'?'0-0/2':'0-0/1'}});
      }
      assert.ok(sourceRead);
      assert.equal(url.origin,'https://api.openai.com');
      assert.equal(providerAbsent,false,'An exact answer must never contact a model');
      const wire=JSON.parse(String(init?.body)),stage=wire.text.format.name,packet=JSON.parse(wire.input[0].content[0].text);
      model.push(stage);
      const tools=['internshipRecords',...(companion?[companion]:[])];
      assert.deepEqual(packet.evidence.map((item:any)=>item.id).sort(),['account-scope',...tools.map(tool=>'account:'+tool)].sort());
      const scope=JSON.parse(packet.evidence.find((item:any)=>item.id==='account-scope').content);
      assert.deepEqual(scope.selectedTools.sort(),tools.sort());
      assert.deepEqual(scope.actions,[]);
      assert.doesNotMatch(JSON.stringify(packet),/OFFLINE_CALLER_TOKEN|OFFLINE_PUBLIC_KEY|contact_phone/);
      const evidence=packet.evidence.find((item:any)=>item.id==='account:internshipRecords');
      assert.equal(evidence.url,row.route);
      const values=JSON.parse(evidence.content);
      for(const marker of forbidden)assert.ok(!evidence.content.includes(marker),marker);
      if(stage==='answer_evidence_review'){
        checked++;
        lastDraft=packet.answer;
        const paths=values.readState==='unavailable'?['/reason']:values.readState==='empty'?['/counts/available']
          :unverifiable?['/records/0/title']:Object.keys(values.records[0]).map(key=>'/records/0/'+key);
        if(values.readState==='partial'&&!unverifiable)paths.push('/counts/omitted');
        const supported=!retry||checked>1;
        const claims=[{claim:'Saved internship facts',supported,evidenceId:'account:internshipRecords',jsonPaths:paths,quotes:[]}];
        if(companion==='charges')claims.push({claim:'Independent saved balance',supported,evidenceId:'account:charges',
          jsonPaths:chargeUnavailable?['/unavailableReason']:['/records/0/amountDue','/records/0/amountPaid'],quotes:[]});
        if(companion==='courses'){
          const path=timetableIssue==='unavailable'||timetableIssue==='truncated'?'/unavailableReason'
            :timetableIssue==='empty'?'/calendar/records/next':'/calendar/records/next/course/title';
          claims.push({claim:'Independent timetable result',supported,evidenceId:'account:courses',jsonPaths:[path],quotes:[]});
        }
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported,answersQuestion:supported,claims})}]}]});
      }
      assert.equal(stage,'correct_grounded_answer');
      const answer=lastDraft.replaceAll('marked filed by you','withdrawn from tracking');
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
        status:'answered',answer,sourceIds:tools.map(tool=>'account:'+tool),
      })}]}]});
    }catch(error){errors.push(error);throw error;}
  };
  const envBefore=Object.fromEntries(Object.keys(previewEnv).map(name=>[name,process.env[name]]));
  if(observed||hosted)Object.assign(process.env,previewEnv);
  const handler=createAffairsAssistantHandler({verifyToken:async()=>observed||hosted?{...account,user:{id:owner,email:'evaluation.student@example.invalid',
    user_metadata:{assistant_evaluation_run:runId}}}:account as any,
    loadSnapshot:async()=>{broadReads++;throw Error('Broad account snapshot is forbidden.');},
    publicResearch:async()=>{broadReads++;throw Error('Public research cannot support private records.');}});
  try{
    if(hosted){
      const testCase=timetable?internshipPublishedTimetableCase(internshipPublishedTimetableCaseIds[suffix.endsWith('reversed')?1:0],timetable.next)
        :internshipHostedCases([row.id])[0];
      const plan=buildInternshipFixturePlan({runId,owners:internshipNativeManifest.owners},
        internshipFixtureKindForCase(testCase));
      const graded=await requestInternshipHostedCase({testCase,plan,chargePlan,timetable,origin:previewOrigin,sourceRevision:previewRevision,runId,
        token:account.token,key:operatorKey,privateMarkers:[...Object.values(plan.ids).flat(),account.token],correlations:new Set(),
        fetchImpl:async (endpoint:URL,init:RequestInit)=>{
          const payload=JSON.parse(String(init.body));
          assert.equal(endpoint.origin,previewOrigin);
          assert.equal(new Headers(init.headers).has('authorization'),row.auth!=='anonymous');
          const actual=await invoke(row.auth==='anonymous'?researchHandler:handler,payload,previewEnv.VERCEL_URL);
          return Response.json(actual.body,{status:actual.status,headers:actual.headers});
        },readResponse:(response:Response)=>response.json()});
      assert.equal(graded.passed,true,row.id+' '+JSON.stringify(graded.failures));
      assert.equal(graded.readCount,row.auth==='anonymous'?null:calls.filter(path=>path.endsWith('/affairs_service_records')).length);
      if(chargePlan||timetable){
        assert.equal(graded.companionReadDigests.length,2*graded.readCount);
        assert.equal(graded.companionProjectionDigests.length,graded.readCount);
        assert.equal(graded.verificationMethod,'native-exact');
        assert.equal(graded.completedNativeCheck,true);
        assert.equal(graded.completedEvidenceReviews,0);
        assert.equal(graded.completedModelCalls,0);
      }
      assert.equal(graded.completedModelCalls,row.auth==='anonymous'?null:model.length);
      assert.deepEqual(errors,[]);
      assert.equal(broadReads,0);
      return {result:{status:200,body:null,headers:new Headers()},calls,model};
    }
    assert.equal(observed&&row.history.length>0,false);
    const probe=observed?createInternshipProbe(scope,{question:row.question,route:row.route,history:[],stream:false,consentedResearchUse:false},operatorKey):null;
    const result=await invoke(handler,probe?.body??row,probe?previewEnv.VERCEL_URL:undefined);
    assert.deepEqual(errors,[]);
    assert.equal(broadReads,0);
    if(probe){
      const receipt=result.headers.get(internshipObservationHeader);
      const correlationId=result.headers.get('x-assistant-request-id');
      const binding={receipt,correlationId,binding:probe.binding,body:result.body};
      const observation=verifyInternshipObservation(binding,operatorKey);
      assert.ok(observation,suffix+' returned '+result.status);
      assert.deepEqual(observation.attempts.flatMap(attempt=>attempt.reads),readDigests);
      assert.deepEqual(observation.modelOperations,model);
      assert.equal(observation.verificationMethod,model.length?'model':sourceRead?'native-exact':'none');
      assert.equal(verifyInternshipObservation({...binding,body:{...result.body,answer:'Tampered'}},operatorKey),null);
      assert.doesNotMatch(Buffer.from(receipt!.split('.')[0],'base64url').toString('utf8'),/QA private|OFFLINE_|QA Harbor Analytics/iu);
    }
    return {result,calls,model};
  }finally{
    if(observed||hosted)for(const [name,value] of Object.entries(envBefore))if(value===undefined)delete process.env[name];else process.env[name]=value;
    globalThis.fetch=originalFetch;
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  }
}

test('all four internship views verify literal own rows with exact local citations',async()=>{
  for(const suffix of ['contract-dates','self-assessment-reflection','company-review-zh','directory-personal']){
    const {result,calls,model}=await exercise(suffix,{providerAbsent:true});
    const row=rowFor(suffix),fixture=internshipNativeFixtureForCase(row);
    assert.equal(result.status,200,suffix);
    assert.equal(result.body.verification?.status,'verified',suffix);
    assert.equal(result.body.citations.find((item:any)=>item.chunkId==='account:internshipRecords')?.url,row.route);
    assert.equal(result.body.views[0].url,row.route);
    for(const entry of fixture.sourceRead!.records)assert.ok(result.body.answer.includes(entry.title));
    assert.deepEqual(calls,['/rest/v1/affairs_service_records']);
    assert.deepEqual(model,[]);
    assert.ok(result.body.activity.some((step:any)=>step.kind==='internship-evidence-check'&&step.status==='complete'));
    if(suffix==='directory-personal')assert.match(result.body.answer,/directory lists company rows saved to your account/iu);
  }
});

test('all exact standalone Internship controls pass their record-scoped rubric without a provider',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(internshipNativeManifest.asOf)});
  const exact=bank.filter(row=>row.auth!=='anonymous'&&!row.observationExpectation.companion
    &&row.observationExpectation.read&&row.observationExpectation.read.state!=='unavailable');
  assert.equal(exact.length,17);
  for(const row of exact){
    t.mock.timers.setTime(Date.now()+61_000);
    const {result,calls,model}=await exercise(row.id.replace(/^account:internship-native-/u,''),{providerAbsent:true});
    assert.deepEqual(calls,['/rest/v1/affairs_service_records']);
    assert.deepEqual(model,[]);
    assert.equal(result.body.verification.attempts,1);
    const graded=gradeCase(row,{statusCode:result.status,fixtureKey:row.fixtureKey,body:result.body,events:result.body.activity,execution:'deterministic'});
    assert.equal(graded.passed,true,row.id+' '+JSON.stringify(graded.failures));
  }
});

test('tuition and class companions remain independent in both orders, even if internship transport fails',async()=>{
  for(const suffix of ['fees','fees-reversed','next-class','next-class-reversed','failed-companion']){
    const {result,calls}=await exercise(suffix),row=rowFor(suffix);
    assert.equal(result.body.verification?.status,'verified',suffix);
    assert.deepEqual(calls.sort(),['/rest/v1/affairs_service_records','/rest/v1/affairs_students',
      row.observationExpectation.companion==='courses'?'/rest/v1/affairs_enrollments':'/rest/v1/affairs_charges'].sort());
    if(row.observationExpectation.companion==='courses')assert.match(result.body.answer,/QA Research Practice.*QA\\?-R201/su);
    else assert.match(result.body.answer,/23,?000/u);
    if(suffix==='failed-companion')assert.match(result.body.answer,/could not be read/u);
  }
});

test('independent review reuses the same bounded reader and withholds branches with unproven fields',async()=>{
  const recovered=await exercise('contract-list',{retry:true});
  assert.equal(recovered.result.body.verification.attempts,2);
  assert.equal(recovered.result.body.verification.status,'verified');
  assert.match(recovered.result.body.answer,/withdrawn from tracking/u);
  assert.deepEqual(recovered.calls,['/rest/v1/affairs_service_records','/rest/v1/affairs_service_records']);
  assert.deepEqual(recovered.model,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  const rejected=await exercise('contract-list',{unverifiable:true});
  assert.equal(rejected.result.body.verification.status,'unverified');
  assert.deepEqual(rejected.result.body.views,[]);
  assert.doesNotMatch(rejected.result.body.answer,/QA Harbor Analytics/u);
});

test('empty records, foreign requests, conflicting scopes and unsupported writes retain distinct outcomes',async()=>{
  const empty=await exercise('empty-company');
  assert.equal(empty.result.body.verification?.status,'verified');
  assert.match(empty.result.body.answer,/no matching saved records/iu);
  for(const suffix of ['foreign-prefix','foreign-postfix','foreign-zh','subtype-conflict','official-submit','public-enterprises']){
    const reply=await exercise(suffix);
    assert.equal(reply.result.status,200);
    assert.equal(reply.calls.length,0);
    assert.equal(reply.model.length,0);
    assert.deepEqual(reply.result.body.citations,[]);
    assert.equal(reply.result.body.proposedAction,undefined);
  }
});

test('the guest handler retains exact sign-in links and performs no private lookup',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('No provider calls on guest internship access boundaries.');
  try{
    for(const suffix of ['anonymous','directory-personal','foreign-zh','next-class']){
      const row=rowFor(suffix),reply=await invoke(researchHandler,row);
      assert.equal(reply.status,200);
      const urls=reply.body.citations.map((citation:any)=>citation.url);
      if(suffix==='foreign-zh')assert.deepEqual(urls,[]);
      else{
        assert.ok(urls.includes('/school-affairs/login?next='+encodeURIComponent(row.route)));
        if(suffix==='next-class')assert.ok(urls.includes('/school-affairs/login?next='+encodeURIComponent('/school-affairs/records/subjects')));
      }
    }
  }finally{globalThis.fetch=originalFetch;}
});

test('all 30 registered internship oracles grade actual endpoint answers under controlled records and reviewer',async t=>{
  const cases=internshipRunnerCases() as ReturnType<typeof buildInternshipNativeCases>;
  assert.equal(cases.length,30);
  t.mock.timers.enable({apis:['Date'],now:new Date(internshipNativeManifest.asOf)});
  for(const row of cases){
    // Move across independent caller request windows without altering the rate guard.
    t.mock.timers.setTime(Date.now()+61_000);
    const reply=row.auth==='anonymous'?await invoke(researchHandler,row)
      :(await exercise(row.id.replace(/^account:internship-native-/u,''))).result;
    const result=gradeCase(row,{statusCode:reply.status,body:reply.body,events:[],execution:'recorded',fixtureKey:row.fixtureKey});
    assert.equal(result.passed,true,row.id+': '+JSON.stringify(result.failures));
    if(row.id.endsWith('contract-dates'))assert.doesNotMatch(reply.body.answer,/ask the other part/iu);
    if(row.id.endsWith('filed-boundary')||row.id.endsWith('failed-companion')){
      const falseClaim=row.id.endsWith('filed-boundary')
        ?'The university received your internship application.' : 'There are no saved internship records.';
      const en={statusCode:reply.status,body:{...reply.body,answer:reply.body.answer+'\n\n'+falseClaim},
        events:[],execution:'recorded',fixtureKey:row.fixtureKey};
      assert.ok(gradeCase(row,en).failures.some((failure:{id:string})=>failure.id.startsWith('evidence.boundary.')));
    }
  }
});

test('an unsupported mutation cannot authorize a read of coordinated objects',async()=>{
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account as any,
    loadSnapshot:async()=>assert.fail('Unexpected broad read.'),answerAccount:async()=>assert.fail('Unexpected private evidence.')});
  const response=await invoke(handler,{question:'Delete my internship contract and my tuition balance.',
    route:'/school-affairs/services/internship/contract'});
  assert.equal(response.status,200);
  assert.equal(response.body.status,'handoff');
  assert.match(response.body.answer,/No action was taken/u);
  assert.equal(response.body.proposedAction,undefined);
});

test('protected internship receipts bind exact native reads, bounded model operations, and zero-read branches',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(internshipNativeManifest.asOf)});
  for(const row of bank.filter(row=>row.auth!=='anonymous'&&!row.observationExpectation.companion&&row.observationExpectation.read?.state!=='unavailable')){
    t.mock.timers.setTime(Date.now()+61_000);
    await exercise(row.id.replace(/^account:internship-native-/u,''),{observed:true});
  }
  t.mock.timers.setTime(Date.now()+61_000);
  await exercise('contract-list',{observed:true,retry:true});
});

test('an internship probe cannot reach a different release, caller, route or malformed request',async t=>{
  const bankRow=rowFor('contract-list');
  const request={question:bankRow.question,route:bankRow.route,history:[],stream:false,consentedResearchUse:false} as const;
  const {body}=createInternshipProbe(scope,{...request,history:[]},operatorKey);
  const wrongCompanion=createInternshipProbe({...scope,companion:'charges'},{...request,history:[]},operatorKey).body;
  const missingCompanion=createInternshipProbe(scope,{...request,history:[],question:rowFor('fees').question},operatorKey).body;
  for(const [env,altered,host,identity] of [
    [{...previewEnv,VERCEL_ENV:'production'},body,previewEnv.VERCEL_URL,owner],
    [previewEnv,body,'invalid.example',owner],
    [{...previewEnv,VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},body,previewEnv.VERCEL_URL,owner],
    [previewEnv,body,previewEnv.VERCEL_URL,internshipNativeManifest.owners.B],
    [previewEnv,{...body,route:rowFor('company-list').route},previewEnv.VERCEL_URL,owner],
    [previewEnv,{...body,evaluationLeaveProbe:'other'},previewEnv.VERCEL_URL,owner],
    [previewEnv,wrongCompanion,previewEnv.VERCEL_URL,owner],
    [previewEnv,missingCompanion,previewEnv.VERCEL_URL,owner],
  ] as const){
    const before=Object.fromEntries(Object.keys(previewEnv).map(name=>[name,process.env[name]]));
    Object.assign(process.env,env);
    t.mock.method(globalThis,'fetch',async()=>assert.fail('Rejected probe used transport.'));
    try{
      const handler=createAffairsAssistantHandler({verifyToken:async()=>({...account,user:{id:identity,email:'evaluation.student@example.invalid',
        user_metadata:{assistant_evaluation_run:runId}}})});
      const result=await invoke(handler,altered,host);
      assert.equal(result.status,404);
      assert.equal(result.headers.get(internshipObservationHeader),null);
    }finally{
      for(const [name,value] of Object.entries(before))if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
  }
});

test('all 26 mounted independent hosted rubrics grade the real handlers and expected read digests under controlled providers',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(internshipNativeManifest.asOf)});
  for(const testCase of internshipHostedCases()){
    t.mock.timers.setTime(Date.now()+61_000);
    await exercise(testCase.id.replace(/^account:internship-native-/u,''),{hosted:true,
      providerAbsent:testCase.observationExpectation.companion==='charges'});
  }
});


test('the independent protected published timetable packet verifies both orders without a model',async t=>{
  // Advance past the earlier fixture's caller window without changing the next Friday class.
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-17T00:00:00.000Z')});
  for(const suffix of ['next-class','next-class-reversed']){
    await exercise(suffix,{hosted:true,published:true,providerAbsent:true});
    const {result,model}=await exercise(suffix,{published:true,providerAbsent:true});
    assert.equal(result.status,200,suffix);
    assert.deepEqual(model,[],suffix);
    assert.deepEqual(result.body.verification,{status:'verified',attempts:1},suffix);
    assert.deepEqual(result.body.citations.map(({chunkId,url}:{chunkId:string;url:string})=>[chunkId,url]),[
      ['account:internshipRecords',rowFor(suffix).route],['account:courses',schoolSubjectRecordsPath],
    ]);
    const firstCompany=result.body.answer.indexOf(internshipNativeFixtureForCase(rowFor(suffix)).sourceRead!.records[0].title);
    const classTitle=result.body.answer.indexOf('SAMP103 Student Services Practice');
    assert.ok(firstCompany>=0&&classTitle>=0,suffix);
    assert.equal(classTitle<firstCompany,suffix==='next-class-reversed',suffix);
    assert.match(result.body.answer,/2026-11-20, 10:00–11:30 \(Taipei time\) in Sample Room 305/u,suffix);
  }
});

test('complete Internship and fee blocks preserve their exact facts and question order without a model',async()=>{
  for(const suffix of ['fees','fees-reversed']){
    const {result,model}=await exercise(suffix,{providerAbsent:true});
    assert.deepEqual(model,[],suffix);
    assert.deepEqual(result.body.verification,{status:'verified',attempts:1},suffix);
    assert.deepEqual(result.body.citations.map((entry:{chunkId:string})=>entry.chunkId),['account:internshipRecords','account:charges']);
    const firstContract=result.body.answer.indexOf(internshipNativeFixtureForCase(rowFor(suffix)).sourceRead!.records[0].title);
    const tuition=result.body.answer.indexOf('QA Internship Tuition');
    assert.ok(firstContract>=0&&tuition>=0,suffix);
    assert.equal(tuition<firstContract,suffix==='fees-reversed',suffix);
    assert.match(result.body.answer,/Remaining balance ` NT\$23,000 `/u,suffix);
  }
});

test('an unavailable fee reader stays outside the exact paired rendering',async()=>{
  const {result,model}=await exercise('fees',{chargeUnavailable:true});
  assert.ok(model.includes('answer_evidence_review'));
  assert.equal(result.body.activity.some((step:{kind:string})=>step.kind==='internship-evidence-check'),false);
  assert.doesNotMatch(result.body.answer,/23,?000/u);
});

test('unavailable, incomplete or unresolved timetable results stay outside the exact paired rendering',async t=>{
  // Do not move behind prior request-rate windows from real-clock cases.
  t.mock.timers.enable({apis:['Date'],now:Math.max(Date.now()+61_000,Date.parse('2026-11-17T01:00:00.000Z'))});
  for(const timetableIssue of ['unavailable','truncated','empty','tie','missing-room'] as const){
    t.mock.timers.setTime(Date.now()+61_000);
    const {result,model}=await exercise('next-class',{timetableIssue});
    assert.equal(result.status,200,timetableIssue);
    assert.ok(model.includes('answer_evidence_review'),timetableIssue);
    assert.equal(result.body.activity.some((step:{kind:string})=>step.kind==='internship-evidence-check'),false,timetableIssue);
    if(timetableIssue==='unavailable'||timetableIssue==='truncated')assert.match(result.body.answer,/saved timetable could not be read/u);
    if(timetableIssue==='empty')assert.match(result.body.answer,/no upcoming meeting/u);
    if(timetableIssue==='missing-room')assert.match(result.body.answer,/No room is saved/u);
  }
});
