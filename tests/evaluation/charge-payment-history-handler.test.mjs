import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {chargePaymentHistoryPath,selectChargePaymentHistory} from '../../server/accountChargePaymentHistory.js';
import {readReply} from './run.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co', token='TEST_PAYMENT_HISTORY_TOKEN';
const owner='34000000-0000-4000-8000-000000000001', outsider='34000000-0000-4000-8000-000000000002';
const chargeId='34500000-0000-4000-8000-000000000001';
const row=(index,values={})=>({
  id:'34700000-0000-4000-8000-'+String(index).padStart(12,'0'),chargeId,chargeLabel:'School filing A',chargeCategory:'Tuition',
  entryKind:'payment',paidOn:'2026-09-30',amount:'0.20',currency:'TWD',sourceMode:'local_recorded',reversesPaymentId:null,...values,
});
const original=row(1,{paidOn:'2026-09-01',amount:'0.10'});
const reversal=row(5,{entryKind:'reversal',amount:'0.10',reversesPaymentId:original.id});
const displayRows=[reversal,row(4,{amount:'8888.88',chargeLabel:'Housing amount',chargeCategory:'Housing'}),
  row(3,{amount:'7777.77',chargeLabel:'Tuition-sounding label',chargeCategory:null}),row(2),original];
const historyQuestion='How much tuition did I pay in September 2026?';
const expectedSeptember={p_from:'2026-09-01',p_through:'2026-09-30',p_charge_id:null,p_offset:0,p_limit:25};
const dto=(rows=[],extra={})=>({userId:owner,studentRecordFound:true,rows,total:rows.length,hasUndatedPaidAmount:false,...extra});
const known=[{role:'user',content:'Show my tuition payment history.'}];

test('payment selectors use Taipei month and day boundaries and validate exact dates',()=>{
  const midnightTaipei=Date.parse('2026-10-31T16:01:00Z');
  const beforeTaipei=Date.parse('2026-10-31T15:59:00Z');
  assert.deepEqual(selectChargePaymentHistory('How much tuition did I pay last month?','/',[],midnightTaipei).filter,
    {from:'2026-10-01',through:'2026-10-31'});
  assert.deepEqual(selectChargePaymentHistory('How much tuition did I pay last month?','/',[],beforeTaipei).filter,
    {from:'2026-09-01',through:'2026-09-30'});
  assert.deepEqual(selectChargePaymentHistory('Did I pay tuition today?','/',[],midnightTaipei).filter,
    {from:'2026-11-01',through:'2026-11-01'});
  assert.deepEqual(selectChargePaymentHistory('民國115年十一月學費繳費紀錄','/',[],beforeTaipei).filter,
    {from:'2026-11-01',through:'2026-11-30'});
  assert.deepEqual(selectChargePaymentHistory('What about last month?','/',known,midnightTaipei).filter,
    {from:'2026-10-01',through:'2026-10-31'});
  assert.deepEqual(selectChargePaymentHistory('May I see my tuition payment history?','/',[],midnightTaipei).filter,{});
  assert.deepEqual(selectChargePaymentHistory('Show my tuition payment history on November 5, 2026.','/',[],midnightTaipei).filter,
    {from:'2026-11-05',through:'2026-11-05'});
  assert.deepEqual(selectChargePaymentHistory('Show payment history for last month.',chargePaymentHistoryPath+'?from=2026-09-01',[],midnightTaipei).filter,
    {from:'2026-10-01',through:'2026-10-31'});
  for(const q of ['Show tuition payment history on 2026-02-30','Show my tuition payment history from 2026-11-05 through 2026-11-01',
    'Show my tuition payment history for the past 2 months','Show my tuition payment history since 2026-11-01']){
    assert.equal(selectChargePaymentHistory(q,'/',[],midnightTaipei).reason,'period',q);
  }
  for(const q of ['Can you pay my tuition now?','How much tuition do I still owe?',
    'Show my scholarship payment history.','Show the evening tuition settlement statement.']){
    assert.equal(selectChargePaymentHistory(q,chargePaymentHistoryPath,[],midnightTaipei),null,q);
  }
});

async function exercise(question,output=[],{authenticated=true,route='/',history=[],images}={}){
  const globalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(input,{method,headers,body,redirect,credentials}={})=>{
    const url=new URL(String(input)),h=new Headers(headers);
    assert.equal(url.href,project+'/rest/v1/rpc/affairs_read_charge_payment_history');
    assert.equal(method,'POST');
    assert.equal(h.get('authorization'),'Bearer '+token);
    assert.equal(h.get('apikey'),'TEST_PAYMENT_HISTORY_KEY');
    assert.equal(redirect,'error');
    assert.ok(credentials===undefined||credentials==='omit');
    const data=JSON.parse(body);
    calls.push(data);
    const next=output[Math.min(calls.length-1,output.length-1)];
    assert.ok(next,'No request was expected');
    return next instanceof Response?next:Response.json(next);
  };
  try{
    const handler=createAffairsAssistantHandler({
      ...(authenticated?{verifyToken:async()=>({user:{id:owner},url:project,key:'TEST_PAYMENT_HISTORY_KEY',token})}:{}),
      publicResearch:async()=>assert.fail('Payment history went to public research'),
      loadSnapshot:async()=>assert.fail('Payment history opened a broad workspace or aggregate charges'),
      answerAccount:async()=>assert.fail('Exact payment history went to the general model planner'),
    });
    let code=200,outputJson;const headers=new Headers(),chunks=[];
    const out={setHeader(name,value){headers.set(name,value);},status(status){code=status;return this;},json(value){outputJson=value;},
      write(chunk){chunks.push(chunk);},end(){}};
    await handler({method:'POST',headers:authenticated?{authorization:'Bearer '+token}:{},
      body:{question,route,history,stream:true,consentedResearchUse:false,...(images?{images}:{})}},out);
    const reply=outputJson?{body:outputJson,events:[]}:await readReply(new Response(chunks.join(''),{headers}));
    return {code,calls,...reply};
  }finally{globalThis.fetch=globalFetch;}
}

test('signed-in tuition history uses the month RPC and exact cents, with separate reversals and uncategorized entries',async()=>{
  const observed=await exercise(historyQuestion,[dto(displayRows,{hasUndatedPaidAmount:true})]);
  assert.equal(observed.code,200);
  assert.deepEqual(observed.calls,[expectedSeptember]);
  assert.equal(observed.body.verification.status,'verified');
  assert.match(observed.body.answer,/Recorded payments: TWD 0\.30 · Reversals: TWD 0\.10 · Net recorded change: TWD 0\.20/u);
  assert.match(observed.body.answer,/Uncategorized entries shown separately:[\s\S]+TWD 7,777\.77/u);
  assert.match(observed.body.answer,/Some saved paid amounts have no payment date/u);
  assert.doesNotMatch(observed.body.answer,/8,888\.88|Housing amount|bank.(?:confirmed|settled)/iu);
  assert.equal(observed.body.citations[0].chunkId,'account:paymentHistory');
  assert.equal(observed.body.citations[0].url,chargePaymentHistoryPath+'?from=2026-09-01&through=2026-09-30');
  assert.ok(observed.events.some(step=>step.kind==='account-read:paymentHistory:1'&&step.status==='complete'));
  assert.equal(observed.body.grounding.webSearched,false);
  assert.doesNotMatch(JSON.stringify(observed.body),new RegExp([owner,original.id,token].join('|'),'u'));
});

test('partial and uncategorized pages cannot establish tuition totals or a complete empty history',async()=>{
  const extras=Array.from({length:25},(_,i)=>row(25-i,{chargeCategory:'Housing',amount:'7777.77'}));
  const partial=await exercise(historyQuestion,[dto(extras,{total:26})]);
  assert.match(partial.body.answer,/appears on the page read/u);
  assert.match(partial.body.answer,/Only 25 of 26 dated entries/u);
  assert.doesNotMatch(partial.body.answer,/Recorded payments:|No dated tuition-tagged payment entries were found/u);
  const unclear=await exercise(historyQuestion,[dto([displayRows[2]])]);
  assert.match(unclear.body.answer,/No dated tuition-tagged payment entries were found/u);
  assert.match(unclear.body.answer,/Uncategorized entries shown separately/u);
  assert.doesNotMatch(unclear.body.answer,/Recorded payments:/u);
});

test('verified empty history, missing linked student and unavailable read stay distinct',async()=>{
  const empty=await exercise(historyQuestion,[dto([],{hasUndatedPaidAmount:true})]);
  assert.equal(empty.body.verification.status,'verified');
  assert.match(empty.body.answer,/No dated tuition-tagged payment entries were found/u);
  assert.match(empty.body.answer,/no payment date/u);
  assert.doesNotMatch(empty.body.answer,/TWD 0\.00/u);
  const unlinked=await exercise(historyQuestion,[dto([],{studentRecordFound:false})]);
  assert.match(unlinked.body.answer,/no linked student record/u);
  assert.doesNotMatch(unlinked.body.answer,/No dated tuition-tagged/u);
  const unsuccessful=await exercise(historyQuestion,[Response.json({private:'PRIVATE SOURCE FAILURE'},{status:503}),dto([],{userId:outsider})]);
  assert.deepEqual(unsuccessful.calls,[expectedSeptember,expectedSeptember]);
  assert.equal(unsuccessful.body.verification.status,'unverified');
  assert.match(unsuccessful.body.answer,/couldn’t read and verify/u);
  assert.doesNotMatch(JSON.stringify(unsuccessful.body),/PRIVATE SOURCE FAILURE|No dated tuition-tagged|no payment date/u);
  const transient=await exercise(historyQuestion,[Response.json({},{status:503}),dto([original])]);
  assert.deepEqual(transient.calls,[expectedSeptember,expectedSeptember]);
  assert.equal(transient.body.verification.status,'verified');
  assert.equal(transient.body.verification.attempts,2);
  assert.match(transient.body.answer,/Recorded payments: TWD 0\.10/u);
});

test('foreign access, writes, inconsistent ranges and signed-out calls never hit the payment RPC',async()=>{
  for(const [question,auth] of [
    ['Show Alice’s tuition payment history for 2026-09.',true],
    ['Show tuition payment history for Alice.',true],
    ['Record my tuition payment of 1.50 today.',true],
    ['Reverse my tuition payment history entry dated 2026-09-01.',true],
    ['Show my tuition payment history for 2026-09-31.',true],
    [historyQuestion,false],
  ]){
    const result=await exercise(question,[],{authenticated:auth});
    assert.deepEqual(result.calls,[]);
    assert.equal(result.code,auth?200:401);
  }
});

test('monthly grouped history preserves exact amounts across dates',async()=>{
  const item=await exercise('Show my monthly tuition payments.',[
    dto([row(4,{paidOn:'2026-10-01',amount:'1.00'}),row(2,{paidOn:'2026-09-30',amount:'2.45'})]),
  ]);
  assert.deepEqual(item.calls,[{...expectedSeptember,p_from:null,p_through:null}]);
  assert.match(item.body.answer,/2026-10 · Recorded payments: TWD 1\.00/u);
  assert.match(item.body.answer,/2026-09 · Recorded payments: TWD 2\.45/u);
});


test('latest paid event uses the first recorded payment and identifies its saved reversal',async()=>{
  const item=await exercise('When was my latest tuition payment?',[
    dto([reversal,row(4,{amount:'8888.88',chargeLabel:'Housing',chargeCategory:'Housing'}),original]),
  ]);
  assert.match(item.body.answer,/Latest recorded payment: 2026-09-01 .* TWD 0\.10/u);
  assert.match(item.body.answer,/A reversal is also saved for this entry/u);
  assert.doesNotMatch(item.body.answer,/8888|Recorded payments:/u);
});

test('a dated personal payment question on the homepage can read school charge history without a tuition tag',async()=>{
  const item=await exercise('How much did I pay in September 2026?',[dto([displayRows[1],row(2)])]);
  assert.deepEqual(item.calls,[expectedSeptember]);
  assert.match(item.body.answer,/Recorded payments: TWD 8,889\.08/u);
  assert.doesNotMatch(item.body.answer,/tuition-tagged/u);
  assert.equal(selectChargePaymentHistory('How much did I pay for groceries last month?'),null);
});
