import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {isOwnCounselingTrackingNoteQuestion} from '../../server/counselingEvidenceIntent.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {buildAccountCases} from '../evaluation/account-cases.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const base='/school-affairs/services/29-1';
const path=base+'/appointments';
const question='Show my saved counseling appointment history.';
const owner='29000000-0000-4000-8000-000000000001';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'TEST_COUNSELING_KEY',token:'TEST_COUNSELING_TOKEN',user:{id:owner}};
const tuition='QA Counseling Tuition instalment';
const mixed='Show my saved counseling appointments and the unpaid balance of '+tuition+' separately.';
const reversed='What remains unpaid for '+tuition+'? Also show my saved counseling appointments.';
const excluded='Show my unpaid balance for '+tuition+' and do not show my counseling appointments.';
const nav='Where can I find my counseling appointments?';
const foreign='Show another student’s counseling appointment history.';
const queue='Show the counseling coordinator queue and student contact emails.';
const write='Reschedule my counseling appointment now.';
type Handler=ReturnType<typeof createAffairsAssistantHandler>;
type Event={kind:string;status:string};
type History=Array<{role:string;content:string}>;
async function call(handler:Handler,prompt:string,route=path,authenticated=true,history:History=[]){
  const result:{status:number;body:any;steps:Event[]}={status:200,body:null,steps:[]};
  const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(){},
    write(chunk:string){
      const frame=/^event: (.+)\ndata: (.+)\n\n$/u.exec(chunk);
      assert.ok(frame);
      const value=JSON.parse(frame[2]);
      if(['result','error'].includes(frame[1]))result.body=value;
      else result.steps.push(value);
    },end(){}};
  await handler({method:'POST',headers:authenticated?{authorization:'Bearer '+account.token}:{},body:{question:prompt,route,history,stream:true}},response);
  return result;
}
const makeHandler=()=>createAffairsAssistantHandler({
  verifyToken:async(token)=>{
    if(token!==account.token)throw new Error('Invalid test session');
    return account;
  },
  loadSnapshot:async()=>assert.fail('A scoped appointment question must not load the broad workspace'),
  publicResearch:async()=>assert.fail('A scoped appointment question must not search the public web'),
});
const observedTools=(steps:Event[])=>[...new Set(steps.filter(step=>step.kind.startsWith('account-read:')).map(step=>step.kind.split(':')[1]))].sort();

test('appointment planning separates account history, dependent topics, balance, navigation, and exclusions',async()=>{
  const ownQuestions=[question,
    'What is the saved scheduled time of my counseling appointment, separately from my preferred date?',
    'Show my closed psychological assessment appointment and explain whether the saved time makes it active.',
    'How many counseling appointment records were returned, and is that my exact complete history?',
    'Show my counseling appointment history and the clinical notes or psychological diagnosis.',
    'Show my counseling appointments and download their report files.',
    'Show my counseling appointments with my student identity and the counselor contact email.',
    queue,write];
  for(const prompt of ownQuestions){
    assert.equal(nativePageLookupContext(prompt,path).readerOnly,true,prompt);
    assert.deepEqual((await planAccountLookup(prompt,[],path,Date.now()+1000)).tools,['counselingAppointments']);
  }
  for(const prompt of [mixed,reversed]){
    const selector=nativePageLookupContext(prompt,path);
    assert.equal(selector.feeAndBalance,true,prompt);
    assert.equal(selector.feeChargeLabel,tuition);
    assert.deepEqual((await planAccountLookup(prompt,[],path,Date.now()+1000)).tools,['counselingAppointments','charges']);
  }
  assert.deepEqual((await planAccountLookup(excluded,[],path,Date.now()+1000)).tools,['charges']);
  const priorNote='What reference is in my counseling note?';
  assert.equal(nativePageLookupContext(priorNote,path).selected,false);
  assert.deepEqual((await planAccountLookup(priorNote,[],path,Date.now()+1000)).tools,['serviceRecords']);
  assert.equal(isOwnCounselingTrackingNoteQuestion('Show my counseling tracking note and scholarship status.'),false);
  assert.equal(nativePageLookupContext(nav,path).selected,false);
  assert.equal(nativePageLookupContext(foreign,path).foreign,true);
  assert.equal(nativePageLookupContext('Show my counseling appointment history and my next class.',path).otherQuestion,'my next class');
});

type Fixture={read?:'records'|'empty'|'failed'|'none';charges?:'records'|'failed'|'amount-out-of-contract';retry?:boolean;restriction?:string};
async function offline(run:()=>Promise<void>,{read='records',charges,retry=false,restriction}:Fixture={}){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const errors:unknown[]=[],operations:string[]=[];
  let appointments=0,chargeReads=0,reviews=0;
  process.env.OPENAI_API_KEY='COUNSELING_TEST_MODEL';
  const fetchFixture:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      const query=JSON.parse(String(init?.body)),operation=query.text.format.name;
      const data=JSON.parse(query.input[0].content[0].text);
      operations.push(operation);
      const appointmentEvidence=read!=='none'||Boolean(restriction);
      const expected=['account-scope',...(charges?['account:charges']:[]),...(appointmentEvidence?['account:counselingAppointments']:[])];
      assert.deepEqual(data.evidence.map((item:{id:string})=>item.id),expected);
      assert.doesNotMatch(JSON.stringify(data.evidence),/29000000|TEST_COUNSELING|contact_email|updated_at|storage\/v1|canCoordinate/u);
      if(appointmentEvidence){
        const scope=JSON.parse(data.evidence[0].content);
        assert.equal(scope.catalogScope,'selected_for_this_request');
        assert.deepEqual([...scope.selectedTools].sort(),expected.slice(1).map(id=>id.slice(8)).sort());
        assert.deepEqual(Object.keys(scope.availableTools).sort(),[...scope.selectedTools].sort());
        assert.deepEqual(scope.actions,[]);
      }
      const claims:Array<{claim:string;supported:boolean;evidenceId:string;quotes:string[];jsonPaths:string[]}>=[],
        add=(evidenceId:string,claim:string,jsonPaths:string[])=>claims.push({claim,evidenceId,jsonPaths,quotes:[],supported:true});
      if(appointmentEvidence){
        const source=data.evidence.at(-1),payload=JSON.parse(source.content);
        assert.equal(source.url,path);
        const target='account:counselingAppointments';
        if(restriction||read==='failed'){
          assert.equal(payload.reason,restriction??'read_failed');
          assert.deepEqual(payload.records,[]);
          assert.equal(payload.counts.total,null);
          add(target,restriction?'The assistant cannot perform that appointment operation.':'I couldn’t check your saved appointments.',['/reason']);
        }else if(read==='empty'){
          assert.equal(payload.readState,'empty');
          assert.equal(payload.counts.total,0);
          add(target,'No appointments are saved.',['/counts/total']);
        }else{
          const preferred=appointments===1?'2026-11-25':'2026-11-26';
          assert.deepEqual(payload.records,[{kind:'counseling',status:'requested',preferredOn:preferred,preferredPeriod:'morning',scheduledAt:null}]);
          add(target,'Your counseling request lists '+preferred+' as the preferred date, with no scheduled time saved.',['/records/0/kind','/records/0/status','/records/0/preferredOn','/records/0/scheduledAt']);
        }
      }
      if(charges){
        const payload=JSON.parse(data.evidence[1].content);
        if(charges==='failed'){
          assert.equal(payload.unavailableReason,'read_failed');
          add('account:charges','I couldn’t check your separate fee balance.',['/unavailableReason']);
        }else{
          assert.equal(payload.selectionLabel,tuition);
          assert.equal(payload.records.length,1);
          assert.equal(payload.records[0].label,tuition);
          if(appointmentEvidence)assert.deepEqual(Object.keys(payload.records[0]).sort(),['id','label','amountDue','amountPaid','currency','sourceMode'].sort());
          const amount=charges==='amount-out-of-contract'?'10,000,000,000':chargeReads===1?'23,000':'22,000';
          add('account:charges','The selected saved tuition item has NT$'+amount+' remaining.',['/records/0/label','/records/0/currency','/records/0/amountDue','/records/0/amountPaid']);
        }
      }
      let output;
      if(operation==='answer_evidence_review'){
        reviews++;
        const supported=!retry||reviews===2;
        output={supported,answersQuestion:supported,claims:claims.map(value=>({...value,supported}))};
      }else{
        assert.ok(['compose_grounded_answer','correct_grounded_answer'].includes(operation));
        output={status:'answered',answer:claims.map(value=>value.claim).join(' '),sourceIds:claims.map(value=>value.evidenceId)};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
    }
    assert.equal(url.origin,account.url);
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    if(url.pathname==='/rest/v1/rpc/affairs_read_counseling'){
      assert.notEqual(read,'none');
      assert.equal(init?.method,'POST');
      assert.equal(init?.body,'{"p_view":"mine"}');
      appointments++;
      if(read==='failed')return new Response(null,{status:503});
      const preferred_on=appointments===1?'2026-11-25':'2026-11-26';
      const rows=read==='empty'?[]:[{id:owner,kind:'counseling',status:'requested',preferred_on,
        preferred_period:'morning',scheduled_at:null,version:1,updated_at:'2026-11-14T00:00:00Z'}];
      return Response.json({userId:owner,available:false,canCoordinate:true,rows});
    }
    assert.ok(charges);
    assert.equal(init?.method,'GET');
    const student='31000000-0000-4000-8000-000000000001';
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    chargeReads++;
    if(charges==='failed')return new Response(null,{status:503});
    const saved={student_id:student,amount_due:charges==='amount-out-of-contract'?10_000_005_000:28000,amount_paid:chargeReads===1?5000:6000,currency:'TWD',due_on:null,source_mode:'sample'};
    return Response.json([{...saved,id:'31000000-0000-4000-8000-000000000002',label:tuition},
      {...saved,id:'31000000-0000-4000-8000-000000000003',label:'Unrelated other fee'}]);
  };
  globalThis.fetch=(...args)=>fetchFixture(...args).catch(error=>{errors.push(error);throw error;});
  try{
    await run();
    assert.deepEqual(errors,[]);
    assert.equal(appointments,read==='none'?0:retry?2:1);
    assert.equal(chargeReads,charges?retry?2:1:0);
    assert.equal(reviews,retry&&charges?2:1);
    assert.equal(operations.includes('account_lookup_plan'),false);
    assert.equal(operations.includes('correct_grounded_answer'),retry&&Boolean(charges));
    assert.equal(operations.includes('compose_grounded_answer'),charges==='amount-out-of-contract');
  }catch(error){throw errors[0]??error;}
  finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('the graph checks a rejected appointment answer against a fresh own record',async()=>{
  await offline(async()=>{
    const result=await call(makeHandler(),question);
    assert.equal(result.status,200);
    assert.equal(result.body.verification.status,'verified');
    assert.equal(result.body.verification.attempts,2);
    assert.match(result.body.answer,/2026-11-26/);
    assert.ok(result.steps.some(step=>step.kind==='counseling-appointment-evidence-check'&&step.status==='complete'));
    assert.doesNotMatch(result.body.answer,/2026-11-25/);
    assert.ok(result.body.citations.some((citation:{url:string})=>citation.url===path));
    assert.deepEqual(observedTools(result.steps),['counselingAppointments']);
  },{retry:true});
});

test('the handler verifies each hosted counseling question against exact refreshed appointment metadata',async()=>{
  const cases=buildAccountCases({includePlannedCounselingAppointments:true});
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  const row=(index:number,kind:string,status:string,preferred_on:string,preferred_period:string,scheduled_at:string|null)=>({
    id:'29000001-0000-4000-8000-'+String(index).padStart(12,'0'),kind,status,preferred_on,preferred_period,scheduled_at,
    updated_at:'2026-11-18T03:00:00+00:00',version:status==='requested'?1:3,
  });
  process.env.OPENAI_API_KEY='COUNSELING_TEST_MODEL';
  try{
    for(const suffix of ['history','requested-date','scheduled-time','assessment-kind','cancelled-history','closed-history','empty','capped-history','history-followup']){
      const testCase=cases.find(value=>value.id==='account:counseling-appointments-'+suffix);
      assert.ok(testCase,suffix);
      const scheduled=suffix==='scheduled-time';
      const regular=[
        row(1,'counseling',scheduled?'scheduled':'requested','2026-11-25','morning',scheduled?'2026-11-27T02:30:00+00:00':null),
        row(2,'counseling','cancelled','2026-10-20','afternoon','2026-10-22T06:00:00+00:00'),
        row(3,'assessment','closed','2026-09-15','morning','2026-09-18T01:00:00+00:00'),
      ];
      const rows=suffix==='empty'?[]:suffix==='capped-history'?Array.from({length:50},(_,i)=>
        row(i+1,'counseling','closed',new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),'morning',null)):regular;
      const data={userId:owner,available:false,canCoordinate:false,rows};
      const before=structuredClone(data);
      const observed:string[]=[],errors:unknown[]=[];
      const intercept:typeof fetch=async(input,init)=>{
        const url=new URL(String(input));
        if(url.hostname==='api.openai.com'){
          observed.push('review');
          const request=JSON.parse(String(init?.body));
          assert.equal(request.text.format.name,'answer_evidence_review');
          const input=JSON.parse(request.input[0].content[0].text);
          assert.deepEqual(input.evidence.map((value:{id:string})=>value.id),['account-scope','account:counselingAppointments']);
          const payload=JSON.parse(input.evidence[1].content);
          assert.doesNotMatch(JSON.stringify(payload),/2900000|canCoordinate|contact_email|updated_at|storage\/v1/u);
          assert.deepEqual(payload.records,rows.map(value=>({kind:value.kind,status:value.status,preferredOn:value.preferred_on,
            preferredPeriod:value.preferred_period,scheduledAt:value.scheduled_at})));
          return Response.json({status:'completed',output:[{content:[{type:'output_text',
            text:JSON.stringify({supported:false,answersQuestion:false,claims:[]})}]}]});
        }
        observed.push('read');
        assert.equal(url.href,account.url+'/rest/v1/rpc/affairs_read_counseling');
        assert.equal(init?.method,'POST');
        assert.equal(init?.body,'{"p_view":"mine"}');
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
        return Response.json(data);
      };
      globalThis.fetch=(...args)=>intercept(...args).catch(error=>{errors.push(error);throw error;});
      const result=await call(makeHandler(),testCase.question,testCase.route,true,testCase.history);
      assert.deepEqual(errors,[],suffix);
      assert.deepEqual(observed,['read','review','read'],suffix);
      assert.deepEqual(data,before,suffix);
      assert.equal(result.body.verification.status,'verified',suffix);
      assert.equal(result.body.verification.attempts,2,suffix);
      assert.ok(result.steps.some(step=>step.kind==='counseling-appointment-evidence-check'&&step.status==='complete'),suffix);
      assert.ok(!result.steps.some(step=>step.kind==='account-replan'||step.kind==='account-compose'),suffix);
      // This local test exercises the independent answer oracle. Hosted fixture readback is independently performed on Preview.
      const {requireUnchangedOwnedRecords:_hostedReadback,...expected}=testCase.expected;
      const grade=gradeCase({...testCase,expected},{statusCode:result.status,execution:'deterministic',fixtureKey:testCase.fixtureKey,
        body:{...result.body,activity:result.steps}});
      assert.deepEqual(grade.failures,[],suffix);
    }
  }finally{
    globalThis.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  }
});

test('combined appointment and fee questions check independent sources in either order and keep one available half',async()=>{
  for(const [prompt,read,charges] of [[mixed,'records','records'],[reversed,'records','records'],[mixed,'failed','records'],[mixed,'records','failed']] as const){
    await offline(async()=>{
      const result=await call(makeHandler(),prompt);
      assert.equal(result.status,200);
      assert.equal(result.body.verification.status,'verified');
      assert.deepEqual(observedTools(result.steps),['charges','counselingAppointments']);
      assert.match(result.body.answer,read==='failed'?/counseling appointment lookup failed/iu:/2026-11-25/);
      assert.match(result.body.answer,charges==='failed'?/balance is unknown/u:/23,000/);
      assert.doesNotMatch(JSON.stringify(result.body),/Unrelated other fee/);
    },{read,charges});
  }
});

test('a compound retry refreshes both readers and renders the new fee amount from bounded evidence',async()=>{
  await offline(async()=>{
    const result=await call(makeHandler(),mixed);
    assert.equal(result.body.verification.status,'verified');
    assert.equal(result.body.verification.attempts,2);
    assert.match(result.body.answer,/2026-11-26/);
    assert.match(result.body.answer,/22,000/);
    const chargeView=result.body.views.find((view:{id:string})=>view.id==='charges');
    assert.deepEqual(chargeView.rows,[[tuition,'TWD','28,000.00','6,000.00','22,000.00','sample']]);
    assert.doesNotMatch(JSON.stringify(result.body.views),/23,000|Unrelated other fee/u);
  },{retry:true,charges:'records'});
});

test('an unsupported exact-arithmetic envelope retains independent composition without exposing a raw charge card',async()=>{
  await offline(async()=>{
    const result=await call(makeHandler(),mixed);
    assert.equal(result.body.verification.status,'verified');
    assert.match(result.body.answer,/2026-11-25/);
    assert.equal(result.body.views.some((view:{id:string})=>view.id==='charges'),false);
  },{charges:'amount-out-of-contract'});
});

test('excluding appointments keeps the exact named fee scope only',async()=>{
  await offline(async()=>{
    const result=await call(makeHandler(),excluded);
    assert.equal(result.status,200);
    assert.equal(result.body.verification.status,'verified');
    assert.deepEqual(observedTools(result.steps),['charges']);
    assert.match(result.body.answer,/23,000/);
  },{read:'none',charges:'records'});
});

test('empty, failed, restricted and unsupported write requests remain distinct',async()=>{
  for(const [prompt,read,restriction] of [[question,'empty',undefined],[question,'failed',undefined],[queue,'none','restricted_view'],[write,'none','unsupported_operation']] as const){
    await offline(async()=>{
      const result=await call(makeHandler(),prompt);
      assert.equal(result.status,200);
      assert.equal(result.body.verification.status,'verified');
      assert.equal(Boolean(result.body.proposedAction),false);
      assert.deepEqual(observedTools(result.steps),['counselingAppointments']);
      if(read==='empty')assert.match(result.body.answer,/no.*(?:saved|appointments)/iu);
      else assert.doesNotMatch(result.body.answer,/no (?:saved )?appointment(?:s| records)/iu);
    },{read,restriction});
  }
});

test('public navigation and a foreign-record request use no workspace or provider',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('Navigation and foreign denial require no transport');
  try{
    const guide=await call(makeHandler(),nav);
    assert.equal(guide.status,200);
    assert.ok(guide.body.citations.some((citation:{url:string})=>citation.url===base));
    assert.deepEqual(observedTools(guide.steps),[]);
    const denied=await call(makeHandler(),foreign);
    assert.equal(denied.status,200);
    assert.match(denied.body.answer,/another student/u);
    assert.deepEqual(denied.body.citations,[]);
    assert.deepEqual(observedTools(denied.steps),[]);
    const research=createResearchAssistantHandler() as unknown as Handler;
    const guest=await call(research,question,path,false);
    assert.equal(guest.status,200);
    assert.ok(guest.body.citations.some((citation:{url:string})=>citation.url==='/school-affairs/login?next='+encodeURIComponent(path)));
    const foreignGuest=await call(research,foreign,path,false);
    assert.equal(foreignGuest.status,200);
    assert.deepEqual(foreignGuest.body.citations,[]);
  }finally{globalThis.fetch=original;}
});
