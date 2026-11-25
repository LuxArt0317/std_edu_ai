import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {runTuitionLedgerPreview} from './live-fixtures.mjs';
import {checkTuitionLedgerPreview,compactEmptyQuestion,compactPaidQuestion,deleteTuitionLedgerPreviewState,tuitionLedgerHistoryPath,tuitionLedgerPlan,
  tuitionLedgerPreviewDates,tuitionLedgerPreviewQuestion} from './tuition-ledger-preview.mjs';

function fixture({seededUndated=false}={}){
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
  const ask=async(side,question,route)=>{
    assert.ok([tuitionLedgerPreviewQuestion,compactPaidQuestion,compactEmptyQuestion].includes(question));
    assert.equal(route,question===tuitionLedgerPreviewQuestion?tuitionLedgerHistoryPath:'/');
    if(side==='guest')return {status:401,body:{error:'Sign in'}};
    const empty=question===compactEmptyQuestion;
    const summary=empty?'No dated payment entries were found for 2026-11-01 to 2026-11-30.'
      :expected.get(side).chargeLabel+'\n'+(side==='A'?'Recorded payments: TWD 43.05 · Reversals: TWD 13.25 · Net recorded change: TWD 29.80'
        :'Recorded payments: TWD 72.36');
    return {status:200,correlationId:randomUUID(),body:{status:'answered',answer:summary+(side==='A'||seededUndated?'\nSome saved paid amounts have no payment date':''),
      citations:[{chunkId:'account:paymentHistory',url:tuitionLedgerHistoryPath+'?'+new URLSearchParams(empty?{from:'2026-11-01',through:'2026-11-30'}:tuitionLedgerPreviewDates)}],
      verification:{status:'verified',attempts:1},grounding:{webSearched:false}}};
  };
  const observeAccountScopes=async()=>plan.accounts.map((account,index)=>({studentId:account.studentId,total:account.entries.length,emptyPeriodTotal:0,
    hasUndatedPaidAmount:index===0||seededUndated}));
  return {plan,baseline,observe:async()=>structuredClone(baseline),observeAccountScopes,history,ask};
}

test('the Preview acceptance requires distinct, complete paired answers and denies the guest',async()=>{
  const result=await checkTuitionLedgerPreview(fixture());
  assert.deepEqual({...result,readbackDigest:undefined},{passed:true,ownHistoryReads:2,crossedHistoryReads:2,
    verifiedMonthlyAnswers:4,verifiedEmptyMonthAnswers:2,anonymousDenial:true,staffHttpVerified:false,readbackDigest:undefined});
  assert.match(result.readbackDigest,/^[a-f0-9]{64}$/u);
});

test('an undated initial charge belongs to the whole account but not to the selected fixture charge',async()=>{
  const f=fixture({seededUndated:true});
  assert.equal((await f.history('B',f.plan.accounts[1].chargeId)).body.hasUndatedPaidAmount,false);
  assert.equal((await checkTuitionLedgerPreview(f)).passed,true);
  const answerWithoutUndated=async(...args)=>{
    const response=await f.ask(...args);
    if(args[0]==='B')response.body.answer=response.body.answer.split('\nSome saved')[0];
    return response;
  };
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:answerWithoutUndated}),error=>{
    assert.equal(error.stage,'B monthly assistant grounding');
    assert.deepEqual(error.failedFields,['undatedBalanceDisclosure']);
    assert.doesNotMatch(JSON.stringify(error),/QA tuition|72\.36|studentId/u);
    return true;
  });
});

test('the Preview runner reports a rejected release pin without claiming fixture cleanup',async()=>{
  const result=await runTuitionLedgerPreview({origin:'https://stdedu-abcdef123-v1-d286.vercel.app',sourceRevision:'0'.repeat(40)});
  assert.equal(result.liveAcceptance,false);
  assert.deepEqual(result.failure,{phase:'preflight',code:'fixture-target'});
  assert.deepEqual(result.cleanup,{verified:false,status:'not-started'});
  assert.equal(result.deployment,null);
});

test('the acceptance rejects crossed student data, wrong summary, stale result, anonymous access and writes',async()=>{
  const f=fixture();
  await assert.rejects(checkTuitionLedgerPreview({...f,history:(side)=>f.history(side,f.plan.accounts[side==='A'?0:1].chargeId)}),
    /foreign charge HTTP/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(side,question,route)=>{
    const response=await f.ask(side,question,route);
    return side==='A'?{...response,body:{...response.body,answer:response.body.answer.replace('29.80','33.80')}}:response;
  }}),/monthly assistant grounding/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(side,question,route)=>{
    const response=await f.ask(side,question,route);
    return side==='B'?{...response,body:{...response.body,debug:f.plan.accounts[0].entries[0].id}}:response;
  }}),/assistant data boundary/u);
  const repeated=randomUUID();
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(...args)=>({...await f.ask(...args),correlationId:repeated})}),
    /A monthly assistant grounding/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:(side,...args)=>f.ask(side==='guest'?'A':side,...args)}),
    /anonymous assistant denial/u);
  let count=0;
  await assert.rejects(checkTuitionLedgerPreview({...f,observe:async()=>{
    const snapshot=await f.observe();
    if(++count>1)snapshot.audits.push({id:randomUUID()});
    return snapshot;
  }}),/student reads left ledger/u);
});

test('a verified empty month needs independent zero dated entries and cannot report an inferred amount',async()=>{
  const f=fixture();
  await assert.rejects(checkTuitionLedgerPreview({...f,observeAccountScopes:async()=>
    (await f.observeAccountScopes()).map(scope=>({...scope,emptyPeriodTotal:1}))}),/independent dated rows/u);
  await assert.rejects(checkTuitionLedgerPreview({...f,ask:async(side,question,route)=>{
    const reply=await f.ask(side,question,route);
    return question===compactEmptyQuestion?{...reply,body:{...reply.body,answer:reply.body.answer+' Recorded payments: TWD 4.00'}}:reply;
  }}),error=>error.failedFields.includes('noInferredTotal'));
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
