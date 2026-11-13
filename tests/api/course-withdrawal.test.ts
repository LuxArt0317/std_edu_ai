import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {withdrawalChange,withdrawalWindowChange,validWithdrawalPayload,withdrawalTime,withdrawalTaipeiInput,withdrawalQuestion,
  parseWithdrawalSnapshot,parseWithdrawalReceipt} from '../../server/courseWithdrawalContract.js';

test('withdrawal and window payloads restrict fields, versions, identities and time zones',()=>{
  const action={course_id:randomUUID(),operation:'withdraw',expected_version:1,request_id:randomUUID()};
  assert.ok(validWithdrawalPayload(withdrawalChange,action));
  assert.equal(validWithdrawalPayload(withdrawalChange,{...action,user_id:randomUUID()}),false);
  assert.equal(validWithdrawalPayload(withdrawalChange,{...action,expected_version:0}),false);
  assert.equal(withdrawalTime('2026-11-13T10:00'),'2026-11-13T02:00:00.000Z');
  assert.equal(withdrawalTime('2026-02-30T10:00'),null);
  assert.equal(withdrawalTime('2026-11-13T24:00'),null);
  const opens_at=withdrawalTime('2026-11-13T10:00'),closes_at=withdrawalTime('2026-11-13T11:30');
  assert.equal(withdrawalTaipeiInput(opens_at!),'2026-11-13T10:00:00');
  const window={academic_year:115,semester:1,opens_at,closes_at,expected_version:0,request_id:randomUUID()};
  assert.ok(validWithdrawalPayload(withdrawalWindowChange,window));
  assert.equal(validWithdrawalPayload(withdrawalWindowChange,{...window,opens_at:closes_at}),false);
  const userId=randomUUID(),receipt={userId,requestId:action.request_id,courseId:action.course_id,version:2,remark:'Y(W)'};
  assert.deepEqual(parseWithdrawalReceipt(receipt,userId,withdrawalChange,{...action,operation:'withdraw'}),receipt);
  assert.throws(()=>parseWithdrawalReceipt(receipt,randomUUID(),withdrawalChange,{...action,operation:'withdraw'}));
});

test('withdrawal snapshots remain account-scoped and questions preserve history and write boundaries',()=>{
  const userId=randomUUID(),snapshot={userId,academicYear:115,semester:1,state:'unconfigured',window:null,courses:[]};
  assert.deepEqual(parseWithdrawalSnapshot(snapshot,userId),snapshot);
  assert.throws(()=>parseWithdrawalSnapshot(snapshot,randomUUID()));
  assert.throws(()=>parseWithdrawalSnapshot({...snapshot,state:'open'},userId));
  assert.throws(()=>parseWithdrawalSnapshot(snapshot,userId,{academicYear:115,semester:2}));
  assert.equal(withdrawalQuestion('Which courses have I withdrawn?'),'records');
  assert.equal(withdrawalQuestion('棄選何時開放？'),'window');
  assert.equal(withdrawalQuestion('How do I restore a withdrawn course?'),'guide');
  assert.equal(withdrawalQuestion('Please withdraw my course'),null);
  assert.equal(withdrawalQuestion('Show my previous semester withdrawal courses'),null);
});
