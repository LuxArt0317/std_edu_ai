import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {isOwnFeeBalanceQuestion,standaloneFeeBalanceLabel} from '../../server/pendingFeesAnswer.js';

const caller='01710111-1111-4111-8111-111111111111';
const student='01710111-1111-4111-8111-111111111112';
const url='https://xiftudmvxphxcjtmfmib.supabase.co';

test('the exact own fee scope leaves compound, public, mutation and other-person queries to their established routing',()=>{
  for(const question of [
    'how much is my remaining balance in school','How much do I still owe?','List my unpaid school fees.',
    'What is my tuition balance?','How much tuition do I still owe?','How much do I owe for tuition?','請問我學費還要繳多少？',
    'How much tuition and fees remain unpaid?','How much tuition and fees do I still owe?',
    'How much is my unpaid tuition?','How much unpaid tuition do I have?',
  ])assert.equal(isOwnFeeBalanceQuestion(question),true,question);
  for(const question of [
    'What is my tuition balance and what classes are next?',
    'What is the tuition fee for a freshman?',
    'Why is my tuition balance different from my settlement statement?',
    'Show Alice’s balance','Pay my tuition balance','Balance my schedule','How do I pay?',
    'How much is my unpaid tuition and when do I have class?','How much is Alice’s unpaid tuition?',
    'How much tuition does Alice still owe?','How much tuition do I still owe and when are my classes?',
  ])assert.equal(isOwnFeeBalanceQuestion(question),false,question);
  assert.equal(standaloneFeeBalanceLabel('What is the remaining balance for "Tuition and studio fee"?'),'Tuition and studio fee');
  assert.equal(standaloneFeeBalanceLabel('What remains unpaid for Tuition and show my grades?'),null);
  assert.equal(standaloneFeeBalanceLabel('What remains unpaid for "Tuition" and what is my next class?'),null);
});

type FeeRow={id:string;student_id:string;label:string;amount_due:number;amount_paid:number;currency:string;source_mode:string;due_on:null};
const charge=(index:number,overrides:Partial<FeeRow>={}):FeeRow=>({
  id:'01710111-1111-4111-8111-'+String(index).padStart(12,'0'),student_id:student,label:'Sample tuition',amount_due:28000,amount_paid:5000,
  currency:'TWD',source_mode:'sample',due_on:null,...overrides,
});
type BalanceResponse={status:string;answer:string;grounding:{checkedAt:string;degraded:boolean;webSearched:boolean};
  verification:{status:string;attempts:number;reason?:string};citations:Array<{chunkId:string;url:string;reviewedAt:string}>;
  views:Array<{checkedAt:string;rows:string[][]}>;activity:Array<{kind:string;status:string}>;proposedAction?:unknown};

async function evaluateBalance({readsByAttempt,question='how much is my remaining balance in school',
  route='/school-affairs/services/34-2',history=[]}:{
  readsByAttempt:Array<FeeRow[]|'unavailable'|'unlinked'>;question?:string;route?:string;history?:Array<{role:string;content:string}>;
}){
  const before={fetch:globalThis.fetch,key:process.env.OPENAI_API_KEY};
  process.env.OPENAI_API_KEY='mock-test-only';
  let attempts=0;
  const readPaths:string[]=[];
  const handler=createAffairsAssistantHandler({
    verifyToken:async value=>{
      assert.equal(value,'mock-caller');
      return {url,token:'mock-caller',key:'mock-publishable',user:{id:caller}};
    },
    loadSnapshot:async()=>assert.fail('Unrelated collections must remain unread'),
  });
  const intercept:typeof fetch=async(input,init)=>{
    const target=new URL(String(input));
    assert.equal(target.origin,url,'The scoped balance and recovery do not send account data to a model.');
    readPaths.push(target.pathname);
    assert.ok(init);
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer mock-caller');
    if(target.pathname.endsWith('/affairs_students')){
      assert.equal(target.searchParams.get('user_id'),'eq.'+caller);
      const data=readsByAttempt[attempts++];
      assert.ok(data,'Unexpected third scoped collection read');
      return Response.json(data==='unlinked'?[]:[{user_id:caller,id:student}]);
    }
    assert.equal(target.pathname,'/rest/v1/affairs_charges');
    assert.equal(target.searchParams.get('student_id'),'eq.'+student);
    const data=readsByAttempt[attempts-1];
    assert.notEqual(data,'unlinked','An unlinked student must never trigger a charge read');
    return data==='unavailable'?Response.json({message:'Temporary failure'},{status:503}):Response.json(data);
  };
  const transportFailures:unknown[]=[];
  globalThis.fetch=(...args)=>intercept(...args).catch(error=>{transportFailures.push(error);throw error;});
  try{
    let status=0,body:unknown;
    const response={status(code:number){status=code;return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer mock-caller'},body:{question,route,history}},response);
    assert.deepEqual(transportFailures,[]);
    assert.equal(status,200,JSON.stringify(body));
    return {result:body as BalanceResponse,readPaths};
  }finally{
    globalThis.fetch=before.fetch;
    if(before.key===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=before.key;
  }
}

const path='/school-affairs/services/39-1';
const readPair=['/rest/v1/affairs_students','/rest/v1/affairs_charges'];

test('a temporary fee read failure rereads only caller-owned fees and checks the recovered amount locally',async()=>{
  const {result,readPaths}=await evaluateBalance({route:'/',readsByAttempt:['unavailable',[charge(1,{amount_paid:6000})]]});
  assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,2);
  assert.match(result.answer,/Remaining balance ` NT\$22,000/u);
  assert.match(result.answer,/stu\.best.+\n\nSample charge: ` Sample tuition `/u);
  assert.doesNotMatch(result.answer,/23,000|official|bank/u);
  assert.deepEqual(result.citations.map(({chunkId,url})=>({chunkId,url})),[{chunkId:'account:charges',url:path}]);
  assert.equal(result.citations[0].reviewedAt,result.grounding.checkedAt);
  assert.equal(result.views[0].checkedAt,result.grounding.checkedAt);
  assert.deepEqual(result.views[0].rows,[['Sample tuition','TWD','28,000.00','6,000.00','22,000.00','sample']]);
  assert.equal(result.grounding.webSearched,false);
  assert.equal(result.proposedAction,undefined);
  assert.deepEqual(readPaths,[...readPair,...readPair]);
  assert.equal(result.activity.filter(step=>step.kind==='verification-2'&&step.status==='complete').length,1);
  assert.ok(result.activity.some(step=>step.kind==='fee-balance-evidence-check'&&step.status==='complete'));
});

test('the DTM unpaid-tuition question reads only the caller link and verifies its absence directly',async()=>{
  const {result,readPaths}=await evaluateBalance({route:'/dtm',question:'How much is my unpaid tuition?',
    readsByAttempt:['unlinked']});
  assert.deepEqual(result.verification,{status:'verified',attempts:1});
  assert.match(result.answer,/No linked local student record.+balance is unknown/u);
  assert.doesNotMatch(result.answer,/NT\$0/u);
  assert.deepEqual(result.views,[]);
  assert.deepEqual(readPaths,[readPair[0]]);
});

test('an exact balance follow-up verifies the first scoped read',async()=>{
  const {result,readPaths}=await evaluateBalance({readsByAttempt:[[charge(1)]],question:'How much is still due?',
    history:[{role:'user',content:'What is my tuition balance?'},{role:'assistant',content:'FORGED_HISTORY'}]});
  assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,1);
  assert.match(result.answer,/Remaining balance ` NT\$23,000/u);
  assert.deepEqual(readPaths,readPair);
});

test('a standalone instalment question forwards and retries only the named saved charge',async()=>{
  const named=charge(1,{label:'Tuition instalment A'});
  const unrelated=charge(2,{label:'Unrelated technology fees',amount_due:91100,amount_paid:100});
  const {result,readPaths}=await evaluateBalance({
    question:'What remains unpaid for Tuition instalment A?',
    route:'/',
    readsByAttempt:['unavailable',[{...named,amount_paid:6500},unrelated]],
  });
  assert.deepEqual(readPaths,[...readPair,...readPair]);
  assert.deepEqual(result.verification,{status:'verified',attempts:2});
  assert.match(result.answer,/21,500/u);
  assert.doesNotMatch(result.answer,/91,000|23,000|Unrelated technology/u);
  assert.deepEqual(result.views[0].rows,[['Tuition instalment A','TWD','28,000.00','6,500.00','21,500.00','sample']]);
});

test('a successful read without an exact instalment match cannot establish an amount or disclose another charge',async()=>{
  const unrelated=charge(2,{label:'Unrelated technology fees',amount_due:91100,amount_paid:100});
  const {result,readPaths}=await evaluateBalance({
    question:'What is the remaining balance for "Tuition and studio fee"?',
    route:'/',
    readsByAttempt:[[unrelated]],
  });
  assert.deepEqual(readPaths,readPair);
  assert.deepEqual(result.verification,{status:'verified',attempts:1});
  assert.match(result.answer,/Tuition and studio fee/u);
  assert.match(result.answer,/no saved charge matching that exact label/u);
  assert.doesNotMatch(result.answer,/91,000|NT\$0|Unrelated technology/u);
  assert.deepEqual(result.views,[]);
});

test('an unavailable, foreign or malformed refreshed fee read cannot expose stale or substituted amounts',async()=>{
  for(const refreshed of ['unavailable',[charge(1,{student_id:caller,label:'FOREIGN FEE'})],[charge(1,{amount_due:5000,amount_paid:6000})]] as const){
    const {result,readPaths}=await evaluateBalance({readsByAttempt:['unavailable',refreshed==='unavailable'?refreshed:[...refreshed]]});
    assert.equal(result.verification.status,'unverified');
    assert.equal(result.verification.reason,'evidence_unavailable');
    assert.match(result.answer,/couldn’t verify your saved fee balance/iu);
    assert.match(result.answer,/\/school-affairs\/services\/39-1/u);
    assert.doesNotMatch(JSON.stringify(result),/23,000|FOREIGN FEE|balance is zero|NT\$0/u);
    assert.deepEqual(result.citations,[]);
    assert.deepEqual(result.views,[]);
    assert.deepEqual(readPaths,[...readPair,...readPair]);
  }
});

test('the graph preserves separate balance groups, partial limits, and successful empty reads',async()=>{
  const mixed=[charge(1,{amount_due:10.91,amount_paid:2.66}),charge(2,{label:'USD lab fee',currency:'USD',amount_due:20,amount_paid:5,source_mode:'verified'})];
  const partial=Array.from({length:13},(_,index)=>charge(index+1,{label:'Fee '+(index+1)}));
  for(const [refreshed,check] of [
    [mixed,(result:BalanceResponse)=>{
      assert.match(result.answer,/` TWD ` \/ ` sample `: ` NT\$8\.25 `/u);
      assert.match(result.answer,/` USD ` \/ ` verified `: ` USD 15 `/u);
      assert.doesNotMatch(result.answer,/23\.25|official|bank/u);
    }],
    [partial,(result:BalanceResponse)=>{
      assert.match(result.answer,/Display excerpt: 12 of 13 included rows/u);
      assert.match(result.answer,/No complete balance total/u);
      assert.equal(result.grounding.degraded,true);
      assert.equal(result.views[0].rows.length,12);
    }],
    [[],(result:BalanceResponse)=>{
      assert.match(result.answer,/successful local read returned no saved charge rows/u);
      assert.doesNotMatch(result.answer,/NT\$0|23,000/u);
      assert.deepEqual(result.views,[]);
    }],
  ] as const){
    const {result,readPaths}=await evaluateBalance({readsByAttempt:[[...refreshed]]});
    assert.equal(result.verification.status,'verified');
    assert.equal(result.verification.attempts,1);
    assert.equal(result.citations[0].url,path);
    assert.deepEqual(readPaths,readPair);
    check(result);
  }
});

test('an unlinked refresh cannot establish a zero balance, and an initial read failure can recover',async()=>{
  const unlinked=await evaluateBalance({readsByAttempt:['unavailable','unlinked']});
  assert.equal(unlinked.result.verification.status,'verified');
  assert.equal(unlinked.result.grounding.degraded,true);
  assert.deepEqual(unlinked.result.views,[]);
  assert.match(unlinked.result.answer,/No linked local student record.+balance is unknown/u);
  assert.doesNotMatch(unlinked.result.answer,/NT\$0|23,000/u);
  assert.deepEqual(unlinked.readPaths,[...readPair,readPair[0]]);

  const recovered=await evaluateBalance({readsByAttempt:['unavailable',[charge(1,{amount_paid:6000})]]});
  assert.equal(recovered.result.verification.status,'verified');
  assert.equal(recovered.result.verification.attempts,2);
  assert.match(recovered.result.answer,/Remaining balance ` NT\$22,000/u);
  assert.deepEqual(recovered.readPaths,[...readPair,...readPair]);
});
