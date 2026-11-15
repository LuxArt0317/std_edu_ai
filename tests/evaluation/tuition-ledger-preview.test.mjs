import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {checkTuitionLedgerPreview,deleteTuitionLedgerPreviewState,tuitionLedgerHistoryPath,tuitionLedgerPlan,
  tuitionLedgerPreviewDates,tuitionLedgerPreviewQuestion} from './tuition-ledger-preview.mjs';

function fixture(){
  const owners=Array.from({length:2},()=>({userId:randomUUID(),studentId:randomUUID()}));
  const plan=tuitionLedgerPlan({runId:randomUUID(),owners});
  const byId=(a,b)=>a.id.localeCompare(b.id);
  const baseline={
    charges:plan.accounts.map(a=>({id:a.chargeId,studentId:a.studentId,label:a.chargeLabel,category:'Tuition',
      amountDue:'120.00',amountPaid:a===plan.accounts[0]?'33.80':'72.36',legacy:a===plan.accounts[0]?'4.00':'0.00',
      currency:'TWD',sourceMode:'sample',dueOn:null,occurrenceOn:null,contactUnit:null,contactExtension:null,paymentUnit:null})).sort(byId),
    entries:plan.accounts.flatMap(a=>a.entries).sort(byId),audits:[],receipts:[],
  };
  const expected=new Map(plan.accounts.map((account,index)=>[index===0?'A':'B',account]));
  const history=async(side,chargeId)=>{
    const a=expected.get(side);
    const rows=a.chargeId!==chargeId?[]:a.entries.toReversed().map(({studentId:_studentId,...row})=>
      ({...row,chargeLabel:a.chargeLabel,chargeCategory:'Tuition'}));
    return {status:200,body:{userId:a.userId,studentRecordFound:true,rows,total:rows.length,
      hasUndatedPaidAmount:rows.length>0&&side==='A'}};
  };
  const ask=async(side,question)=>{
    assert.equal(question,tuitionLedgerPreviewQuestion);
    if(side==='guest')return {status:401,body:{error:'Sign in'}};
    const summary=side==='A'
      ?'Recorded payments: TWD 43.05 · Reversals: TWD 13.25 · Net recorded change: TWD 29.80\nSome saved paid amounts have no payment date'
      :'Recorded payments: TWD 72.36';
    return {status:200,correlationId:randomUUID(),body:{status:'answered',answer:expected.get(side).chargeLabel+'\n'+summary,
      citations:[{chunkId:'account:paymentHistory',url:tuitionLedgerHistoryPath+'?'+new URLSearchParams(tuitionLedgerPreviewDates)}],
      verification:{status:'verified',attempts:1},grounding:{webSearched:false}}};
  };
  return {plan,baseline,observe:async()=>structuredClone(baseline),history,ask};
}

test('the Preview acceptance requires distinct, complete paired answers and denies the guest',async()=>{
  const result=await checkTuitionLedgerPreview(fixture());
  assert.deepEqual({...result,readbackDigest:undefined},{passed:true,ownHistoryReads:2,crossedHistoryReads:2,
    verifiedMonthlyAnswers:2,anonymousDenial:true,staffHttpVerified:false,readbackDigest:undefined});
  assert.match(result.readbackDigest,/^[a-f0-9]{64}$/u);
});

test('the acceptance rejects crossed student data, wrong summary, stale result, anonymous access and writes',async()=>{
  const f=fixture();
  await assert.rejects(checkTuitionLedgerPreview({...f,history:(side)=>f.history(side,f.plan.accounts[side==='A'?0:1].chargeId)}),
    /foreign charge HTTP/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(side,question)=>{
    const response=await f.ask(side,question);
    return side==='A'?{...response,body:{...response.body,answer:response.body.answer.replace('29.80','33.80')}}:response;
  }}),/monthly assistant grounding/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(side,question)=>{
    const response=await f.ask(side,question);
    return side==='B'?{...response,body:{...response.body,debug:f.plan.accounts[0].entries[0].id}}:response;
  }}),/assistant data boundary/u);
  const repeated=randomUUID();
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(...args)=>({...await f.ask(...args),correlationId:repeated})}),
    /B monthly assistant grounding/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:(side,question)=>f.ask(side==='guest'?'A':side,question)}),
    /anonymous assistant denial/u);
  let count=0;
  await assert.rejects(checkTuitionLedgerPreview({...f,observe:async()=>{
    const snapshot=await f.observe();
    if(++count>1)snapshot.audits.push({id:randomUUID()});
    return snapshot;
  }}),/student reads left ledger/u);
});

test('cleanup refuses any extra event and performs no deletion on a changed fingerprint',async()=>{
  const {plan,baseline}=fixture();
  const {charges,entries}=baseline;
  const sql=(strings,...values)=>{
    if(!Array.isArray(strings.raw))return strings;
    const query=strings.join('?');
    assert.doesNotMatch(query,/delete from/u);
    if(query.includes('from public.affairs_charges'))return charges;
    if(query.includes('from public.affairs_charge_payment_entries'))return [{...entries[0],id:randomUUID()},...entries];
    if(query.includes('from public.affairs_agent_audit')||query.includes('from private.affairs_charge_payment_operations'))return [];
    if(query.includes('from auth.users'))return plan.accounts.map(row=>({userId:row.userId,studentId:row.studentId,
      role:'student',runId:plan.runId,google:true}));
    assert.fail('Unexpected cleanup SQL: '+query+' '+values.length);
  };
  await assert.rejects(deleteTuitionLedgerPreviewState(sql,plan),/cleanup ownership and full fingerprint/u);
});
