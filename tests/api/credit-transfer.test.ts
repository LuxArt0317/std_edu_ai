import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {creditTransferQuestion,creditTransferSave,creditTransferSubmit,creditTransferReview,validCreditTransferAction,
  parseCreditTransferRows} from '../../server/creditTransferContract.js';

const base={id:randomUUID(),request_id:randomUUID(),expected_version:0};
const course={previous_title:'Prior programming',previous_credits:3,requested_title:'Programming',requested_credits:2.5,course_kind:'required'};
const draft={...base,reason:'external_transfer',previous_school:'Previous School',courses:[course]};

test('credit transfer writes validate the exact student or reviewer action',()=>{
  assert.ok(validCreditTransferAction(creditTransferSave,draft));
  assert.equal(validCreditTransferAction(creditTransferSave,{...draft,user_id:randomUUID()}),false);
  assert.equal(validCreditTransferAction(creditTransferSave,{...draft,courses:[{...course,requested_credits:'2.5'}]}),false);
  assert.equal(validCreditTransferAction(creditTransferSave,{...draft,courses:[{...course,requested_credits:2.555}]}),false);
  assert.equal(validCreditTransferAction(creditTransferSubmit,base),false);
  assert.ok(validCreditTransferAction(creditTransferReview,{...base,expected_version:2,decisions:['waived']}));
});

test('saved credit transfer decisions stay account-bound and distinct from transcripts',()=>{
  const user_id=randomUUID(),when='2026-11-14T00:00:00Z';
  const row={id:base.id,user_id,reason:draft.reason,previous_school:draft.previous_school,courses:[course],status:'reviewed',
    decisions:['waived'],version:3,submitted_at:when,reviewed_at:when};
  assert.deepEqual(parseCreditTransferRows([row],user_id),[row]);
  assert.throws(()=>parseCreditTransferRows([row],randomUUID()));
  assert.throws(()=>parseCreditTransferRows([{...row,decisions:['waived','rejected']}],user_id));
  assert.throws(()=>parseCreditTransferRows([{...row,version:'3'}],user_id));
  assert.ok(creditTransferQuestion('What is my credit transfer status?'));
  assert.ok(creditTransferQuestion('我的抵免學分結果？'));
  assert.equal(creditTransferQuestion('When is the credit transfer deadline?'),false);
  assert.equal(creditTransferQuestion('Show transfer grades on my transcript'),false);
});
