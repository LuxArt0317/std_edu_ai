import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runAnswerVerification} from '../../server/answerVerification.js';

const initial={status:'answered',answer:'Unverified draft',citations:[]};
const sources=[{id:'account:charges',content:'PRIVATE_ACCOUNT_VALUE',url:'/school-affairs/records'}];

test('hybrid plan observes results and replans before each new scoped read, then verifies',async()=>{
  const order:string[]=[],progress:any[]=[];
  const result=await runAnswerVerification({question:'My balance and assignments?',initialAnswer:initial,
    allowDeeperReview:true,deadline:Date.now()+60000,
    replanEvidence:async({attempt,feedback})=>{order.push('plan:'+attempt);assert.deepEqual(feedback,['Read the missing collection.']);},
    loadEvidence:async({attempt})=>{order.push('read:'+attempt);return sources;},
    repair:async({attempt,candidate})=>{order.push('draft:'+attempt);return {...candidate,answer:attempt===3?'Verified balance and assignments.':'Incomplete draft'};},
    verify:async({attempt})=>{order.push('verify:'+attempt);return {ok:attempt===3,reason:'no_supported_answer',feedback:['Read the missing collection.']};},
    onProgress:step=>progress.push(step),
  });
  assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,3);
  assert.deepEqual(order,['read:1','verify:1','plan:2','read:2','draft:2','verify:2','plan:3','read:3','draft:3','verify:3']);
  for(const ordinal of [1,2,3]){
    assert.ok(result.activity?.some(step=>step.kind===`agent-plan-${ordinal}`&&step.status==='complete'));
    assert.ok(result.activity?.some(step=>step.kind===`agent-observe-${ordinal}`));
  }
  assert.ok(progress.findIndex(s=>s.kind==='agent-observe-2')<progress.findIndex(s=>s.kind==='verification-2'));
  assert.doesNotMatch(JSON.stringify(result.activity),/PRIVATE_ACCOUNT_VALUE|Read the missing collection/);
});

test('a planner outage retains the authorized reader and cannot approve the answer',async()=>{
  let replans=0,reads=0;
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:initial,allowDeeperReview:true,deadline:Date.now()+60000,
    replanEvidence:async()=>{replans++;throw new Error('PRIVATE_PROVIDER_ERROR');},
    loadEvidence:async()=>{reads++;return sources;},repair:async()=>initial,
    verify:async({attempt})=>({ok:attempt===2,reason:'unsupported_claims',feedback:['Check amount.']}),
  });
  assert.equal(replans,1);assert.equal(reads,2);assert.equal(result.verification.attempts,2);
  assert.ok(result.activity?.some(step=>step.kind==='agent-plan-2'&&step.status==='unavailable'));
  assert.doesNotMatch(JSON.stringify(result.activity),/PRIVATE_PROVIDER_ERROR/);
});

test('proposed actions never enter adaptive replanning or get executed',async()=>{
  let replans=0;
  const action={kind:'create_task',payload:{title:'Review fees'}};
  const result=await runAnswerVerification({question:'Create a reminder',initialAnswer:{...initial,proposedAction:action},allowDeeperReview:true,
    replanEvidence:async()=>{replans++;},loadEvidence:async()=>sources,repair:async({candidate})=>candidate,
    verify:async()=>({ok:false,reason:'unsupported_claims',feedback:['Incorrect amount.']}),
  });
  assert.equal(replans,0);assert.equal(result.status,'abstained');assert.equal(result.proposedAction,undefined);
});

test('small remaining budgets do not start a replanner, and verified answers exit immediately',async()=>{
  for(const ok of [false,true]){
    let replans=0,reads=0;
    const result=await runAnswerVerification({question:'Fees?',initialAnswer:initial,allowDeeperReview:true,deadline:Date.now()+10000,
      replanEvidence:async()=>{replans++;},loadEvidence:async()=>{reads++;return sources;},repair:async()=>initial,
      verify:async()=>({ok,reason:'unsupported_claims',feedback:['Check amount.']}),
    });
    assert.equal(replans,0);assert.equal(reads,ok?1:2);assert.equal(result.verification.status,ok?'verified':'unverified');
  }
});
