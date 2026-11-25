import assert from 'node:assert/strict';
import test from 'node:test';
import {runAnswerVerification} from '../../server/answerVerification.js';

const candidate={status:'answered',answer:'A source-backed draft.',citations:[]};
const evidence=[{id:'public-document:fixture',content:'A source-backed draft.'}];
test('an interrupted public review can recheck the same draft once without new sources or a rewrite',async()=>{
 for(const failure of [{code:'VERIFICATION_TIMEOUT'},{retryable:true}]){
  let reads=0,reviews=0;
  const result=await runAnswerVerification({question:'Explain this public procedure.',initialAnswer:candidate,
   deadline:Date.now()+35000,maxChecks:4,allowDeeperReview:true,hasUnreadPublicLead:()=>false,
   loadEvidence:async()=>{reads++;return evidence;},loadDeeperEvidence:async()=>assert.fail('No new public source was requested'),
   repair:async()=>assert.fail('A review interruption is not a faulty draft'),
   verify:async({candidate:current,evidence:sources})=>{
    reviews++;assert.deepEqual(current,candidate);assert.deepEqual(sources,evidence);
    if(reviews===1)throw Object.assign(Error('Temporary checker interruption'),failure);
    return {ok:true};
   }});
  assert.equal(reads,1);assert.equal(reviews,2);assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,2);assert.ok(result.activity.some(step=>step.kind==='verification-review-retry'));
 }
});
test('review-only recovery stays bounded and respects time, quota and proposed actions',async()=>{
 for(const control of ['repeat','time','quota','action']){
  let reviews=0;
  const result=await runAnswerVerification({question:'Explain this public procedure.',
   initialAnswer:control==='action'?{...candidate,proposedAction:{kind:'create_task'}}:candidate,
   deadline:Date.now()+(control==='time'?10000:35000),maxChecks:4,allowDeeperReview:true,hasUnreadPublicLead:()=>false,
   loadEvidence:async()=>evidence,loadDeeperEvidence:async()=>assert.fail('No eligible new source'),
   repair:async()=>assert.fail('No rewrite allowed in this fixture'),
   verify:async()=>{reviews++;throw Object.assign(Error('Interrupted'),{code:control==='quota'?'VERIFICATION_QUOTA_EXHAUSTED':'VERIFICATION_TIMEOUT'});}});
  assert.equal(reviews,control==='repeat'?2:1);assert.equal(result.verification.status,'unverified');
  assert.equal(result.status,'abstained');assert.equal(result.proposedAction,undefined);
 }
});
