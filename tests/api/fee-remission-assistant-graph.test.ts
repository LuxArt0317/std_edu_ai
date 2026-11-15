import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {readFeeRemissionEvidence} from '../../server/accountFeeRemissionEvidence.js';
// @ts-expect-error Independently authored offline case bank has no TypeScript declaration.
import {buildFeeRemissionCases,feeRemissionFixtureForCase,gradeFeeRemissionCase} from '../evaluation/fee-remission-cases.mjs';

const route='/school-affairs/services/21-3';
const owner='22000000-0000-4000-8000-000000000001';
const student='22000000-0000-4000-8000-000000000002';
const charge='22000000-0000-4000-8000-000000000003';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLIC',token:'OFFLINE_CALLER',user:{id:owner}};
const next='/school-affairs/login?next='+encodeURIComponent(route);
const feeOnly='For academic year 115, semester 1, show my fee remission amount but do not show my student number.';
const namedBoth='Show my fee remission amount for academic year 115 semester 1 and the unpaid balance of QA Tuition instalment separately.';
const reverseBoth='What remains unpaid for QA Tuition instalment? Also show my fee remission amount for academic year 115 semester 1 separately.';
const native=(amount:string)=>({userId:owner,records:[
  {id:charge,version:1,row_order:0,academic_year_text:'115',semester_text:'1',category_text:'QA Local Support',amount_text:amount,
    check_status_text:'Awaiting review',notes_text:null,student_number:'NOT_REQUESTED_STUDENT_NUMBER'},
  {id:student,version:1,row_order:1,academic_year_text:'114',semester_text:'2',category_text:'PREVIOUS_PERIOD',amount_text:'22',
    check_status_text:null,notes_text:'',student_number:null},
]});

type Handler=ReturnType<typeof createAffairsAssistantHandler>;
async function call(handler:Handler,question:string,authenticated=true,path=route){
  const responseBody:{status:number;body:any;events:Array<{kind:string;status:string}>}={status:200,body:null,events:[]};
  const response={
    status(status:number){responseBody.status=status;return response;},
    json(body:unknown){responseBody.body=body;},setHeader(){},
    write(text:string){
      const match=/^event: (.+)\ndata: (.+)\n\n$/u.exec(text);
      assert.ok(match);
      const data=JSON.parse(match[2]);
      if(['result','error'].includes(match[1]))responseBody.body=data;
      else responseBody.events.push(data);
    },
    end(){},
  };
  await handler({method:'POST',headers:authenticated?{authorization:'Bearer '+account.token}:{},body:{question,route:path,stream:true}},response);
  return responseBody;
}

test('the fee-remission plan keeps exact periods, exclusions, public questions and separate fees',async()=>{
  for(const question of [feeOnly,'Show my tuition reduction for academic year 115. Never show my grades.']){
    assert.deepEqual((await planAccountLookup(question,[],route,Date.now()+1000)).tools,['feeRemission']);
    assert.equal(nativePageLookupContext(question,route).readerOnly,true);
  }
  for(const question of [namedBoth,reverseBoth,'Show my fee remission and my remaining balance.']){
    const selected=nativePageLookupContext(question,route);
    assert.equal(selected.feeAndBalance,true,question);
    assert.deepEqual((await planAccountLookup(question,[],route,Date.now()+1000)).tools,['feeRemission','charges']);
  }
  assert.equal(nativePageLookupContext('How do I apply for tuition reduction?',route).selected,false);
  assert.equal(nativePageLookupContext('Show my fee remission status for Alice.',route).foreign,true);
});

async function withOfflineProviders(run:()=>Promise<void>,{withCharges=false,retry=false,chargeFailure=false}={}){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const transportErrors:unknown[]=[],calls:string[]=[];
  let feeReads=0,chargeReads=0,reviews=0;
  process.env.OPENAI_API_KEY='OFFLINE_MODEL';
  const intercept:typeof fetch=async(input,init)=>{
    const target=new URL(String(input));
    if(target.hostname==='api.openai.com'){
      const body=JSON.parse(String(init?.body)),name=body.text.format.name,data=JSON.parse(body.input[0].content[0].text);
      calls.push(name);
      assert.deepEqual(data.evidence.map((item:{id:string})=>item.id),['account-scope',...(withCharges?['account:charges']:[]),'account:feeRemission']);
      assert.doesNotMatch(JSON.stringify(data.evidence),/OFFLINE_CALLER|OFFLINE_PUBLIC|NOT_REQUESTED_STUDENT_NUMBER|PREVIOUS_PERIOD|UNRELATED_CHARGE/u);
      const fee=data.evidence.at(-1);
      assert.equal(JSON.parse(fee.content).records[0].amount_text,feeReads===1?'0':'001,000');
      const clauses=[feeReads===1?'Your saved local fee-remission amount text is 0.':'Your refreshed saved local fee-remission amount text is 001,000.'];
      const claims=[{claim:clauses[0],supported:true,evidenceId:'account:feeRemission',quotes:[],jsonPaths:['/records/0/amount_text','/provenance/source']}];
      if(withCharges){
        const evidence=JSON.parse(data.evidence[1].content);
        if(chargeFailure){
          assert.equal(evidence.unavailableReason,'read_failed');
          assert.deepEqual(evidence.records,[]);
          clauses.push('The separate fee balance could not be read.');
          claims.push({claim:clauses.at(-1)!,supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/unavailableReason']});
        }else{
          assert.deepEqual(evidence.records.map((row:{label:string})=>row.label),['QA Tuition instalment']);
          clauses.push('The separate saved sample charge has NT$23,000 remaining.');
          claims.push({claim:clauses.at(-1)!,supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/records/0/amountDue','/records/0/amountPaid','/records/0/sourceMode']});
        }
      }
      let result;
      if(name==='answer_evidence_review'){
        reviews++;
        result={supported:!retry||reviews>1,answersQuestion:true,claims:retry&&reviews===1?claims.map(row=>({...row,supported:false})):claims};
      }else{
        assert.ok(['compose_grounded_answer','correct_grounded_answer'].includes(name),name);
        result={status:'answered',answer:clauses.join(' '),sourceIds:claims.map(row=>row.evidenceId)};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }
    assert.equal(target.origin,account.url);
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    if(target.pathname.endsWith('/rpc/affairs_read_fee_remission')){
      assert.equal(init?.method,'POST');assert.equal(init?.body,'{}');
      feeReads++;return Response.json(native(feeReads===1?'0':'001,000'));
    }
    assert.ok(withCharges,'Only fee-remission RPC allowed');
    assert.equal(init?.method,'GET');
    if(target.pathname.endsWith('/affairs_students')){
      assert.equal(target.searchParams.get('user_id'),'eq.'+owner);
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(target.pathname,'/rest/v1/affairs_charges');assert.equal(target.searchParams.get('student_id'),'eq.'+student);
    chargeReads++;
    if(chargeFailure)return new Response(null,{status:503});
    return Response.json([
      {id:charge,student_id:student,label:'QA Tuition instalment',amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample',due_on:null},
      {id:owner,student_id:student,label:'UNRELATED_CHARGE',amount_due:100,amount_paid:0,currency:'TWD',source_mode:'sample',due_on:null},
    ]);
  };
  globalThis.fetch=(...args)=>intercept(...args).catch(error=>{transportErrors.push(error);throw error;});
  try{
    await run();
    assert.deepEqual(transportErrors,[]);
    assert.equal(feeReads,retry?2:1);
    assert.equal(chargeReads,Number(withCharges)*(retry?2:1));
    assert.deepEqual(calls,[...(withCharges?['compose_grounded_answer']:[]),'answer_evidence_review',
      ...(retry?['correct_grounded_answer','answer_evidence_review']:[])]);
  }catch(error){throw transportErrors[0]??error;}
  finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}
const handler=()=>createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>assert.fail('Unrelated workspace records are out of scope'),
  publicResearch:async()=>assert.fail('No public search for saved records')});

test('a fee-remission change and submit request reaches the read-only boundary without loading the workspace',async()=>{
  const bounded=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>assert.fail('No workspace load for a refused change'),
    answerAccount:async options=>{
      assert.deepEqual(Object.keys(options.snapshot).sort(),['checkedAt','profile']);
      const evidence=await options.supplementalReaders?.feeRemission?.({question:options.question,route:options.route??route,
        history:options.history??[],snapshot:options.snapshot,deadline:Date.now()+1000});
      assert.equal(evidence?.reason,'unsupported_operation');
      return {status:'handoff',answer:'I cannot change or submit the fee remission record.',citations:[]};
    }});
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('A refused action must not read or write records');
  try{
    const result=await call(bounded,'Change my fee remission amount for academic year 115 semester 1 to 9000 and submit it to the university.');
    assert.equal(result.body.status,'handoff');
    assert.equal(result.body.proposedAction,undefined);
  }finally{globalThis.fetch=original;}
});

test('the mixed signed-in graph rereads only the same two authorized sources after a rejected answer',async()=>{
  await withOfflineProviders(async()=>{
    const result=await call(handler(),namedBoth);
    assert.equal(result.status,200);
    assert.equal(result.body.verification.status,'verified');
    assert.equal(result.body.verification.attempts,2);
    assert.match(result.body.answer,/001,000/u);
    assert.ok(result.body.citations.some((row:{url:string})=>row.url===route));
    assert.equal(result.body.proposedAction,undefined);
  },{withCharges:true,retry:true});
});

const directCases=['all-history','historical-period','zero-amount','null-not-zero','blank-not-null','leading-zero-period','exact-period-absent',
  'student-number-explicit','student-number-not-requested','payout-not-proved','eligibility-not-proved','document-not-created','empty','bounded-omission'];
test('the actual handler verifies standalone literal history against the independent fee-remission case bank without a provider',async()=>{
  const selected=buildFeeRemissionCases().filter((item:{id:string})=>directCases.includes(item.id.slice('account:fee-remission-'.length)));
  assert.equal(selected.length,directCases.length);
  const original=globalThis.fetch;
  try{
    for(const item of selected){
      const fixture=feeRemissionFixtureForCase(item);
      let reads=0;
      const transportErrors:unknown[]=[];
      globalThis.fetch=async(input,init)=>{
        try{
          assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_read_fee_remission');
          assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
          assert.equal(init?.method,'POST');assert.equal(init?.body,'{}');
          reads++;
          return Response.json(fixture.response);
        }catch(error){transportErrors.push(error);throw error;}
      };
      const result=await call(handler(),item.question);
      assert.deepEqual(transportErrors,[],item.id);
      assert.equal(reads,1,item.id);assert.equal(result.status,200,item.id);
      assert.deepEqual(result.body.verification,{status:'verified',attempts:1},item.id);
      assert.equal(result.events.filter(event=>event.kind==='fee-remission-evidence-check'&&event.status==='complete').length,1,item.id);
      const grade=gradeFeeRemissionCase(item,{statusCode:result.status,body:result.body,events:result.events,fixtureKey:item.fixtureKey,execution:'deterministic'});
      assert.deepEqual(grade.failures,[],item.id);
    }
  }finally{globalThis.fetch=original;}
});

test('a mismatched literal fee-remission selector cannot verify or display the returned rows',async()=>{
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=async(input)=>{calls.push(String(input));return Promise.reject(new Error('unexpected network call'));};
  try{
    const mismatched=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>assert.fail('No workspace load'),
      publicResearch:async()=>assert.fail('No web research for personal rows'),
      readers:{feeRemission:(current,context)=>readFeeRemissionEvidence(current,{...context,
        question:'Show my fee remission for academic year 114 semester 2.'},{load:async()=>native('0')})}});
    const result=await call(mismatched,feeOnly);
    assert.equal(result.status,200);
    assert.equal(result.body.verification?.status,'unverified');
    assert.equal(result.events.some(event=>event.kind==='fee-remission-evidence-check'),false);
    assert.doesNotMatch(JSON.stringify({answer:result.body.answer,views:result.body.views}),/PREVIOUS_PERIOD/u);
    assert.deepEqual(calls,[]);
  }finally{globalThis.fetch=original;}
});

test('mixed balance and remission use separate checked sources and retain the answer when balance is unavailable',async()=>{
  for(const [question,chargeFailure] of [[namedBoth,false],[reverseBoth,false],[namedBoth,true]] as const){
    await withOfflineProviders(async()=>{
      const result=await call(handler(),question);
      assert.equal(result.status,200);
      assert.equal(result.body.verification.status,'verified');
      assert.match(result.body.answer,/remission amount text is 0/u);
      assert.match(result.body.answer,chargeFailure?/fee balance could not be read/u:/NT\$23,000/u);
      const reads=result.events.filter(row=>row.kind.startsWith('account-read:'));
      assert.ok(reads.some(row=>row.kind==='account-read:feeRemission:1'&&row.status==='complete'));
      assert.ok(reads.some(row=>row.kind==='account-read:charges:1'&&row.status===(chargeFailure?'unavailable':'complete')));
      if(chargeFailure)assert.doesNotMatch(JSON.stringify(result.body.views),/Tuition and fees/u);
    },{withCharges:true,chargeFailure});
  }
});

test('guest sign-in and foreign-subject denial precede both readers',async()=>{
  const guest=createResearchAssistantHandler() as unknown as Handler;
  const guestResult=await call(guest,'Show my fee remission status.',false);
  assert.equal(guestResult.body.status,'handoff');
  assert.equal(guestResult.body.citations[0].url,next);
  for(const question of ['how much is my remaining balance in school','How much tuition do I still owe?']){
    const balance=await call(guest,question,false,'/');
    assert.equal(balance.body.status,'handoff');
    assert.equal(balance.body.citations[0].url,'/school-affairs/login?next=%2Fschool-affairs%2Fservices%2F39-1');
  }
  const foreign=await call(createAffairsAssistantHandler({verifyToken:async()=>account,
    answerAccount:async()=>assert.fail('Foreign records cannot reach the graph')}),'Show another student’s fee remission records.');
  assert.equal(foreign.body.status,'handoff');
  assert.deepEqual(foreign.body.citations,[]);
});
