import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adjustmentQuestion,adjustmentTerm,parseAdjustmentRow,validAdjustmentPayload} from '../../server/courseAdjustmentContract.js';

const user='cddf188a-1f12-47a0-994f-3f4c210f7fb4';
const payload={user_id:user,phase:'add_drop',academic_year:115,semester:1,decision:'unverified',request_id:user,expected_version:0};

test('course adjustment routes specific eligibility separately from rules and account history',()=>{
  assert.equal(adjustmentQuestion('Am I eligible for add/drop?'),'add_drop');
  assert.equal(adjustmentQuestion('我可以補加選嗎？'),'late_add');
  assert.equal(adjustmentQuestion('What are the late-add rules?'),'rules');
  assert.equal(adjustmentQuestion('Can I add/drop in 114-2?'),null);
  assert.equal(adjustmentQuestion('Show my add/drop records.'),null);
  assert.equal(adjustmentQuestion('Can I do late add or add/drop?'),null);
  assert.deepEqual(adjustmentTerm(new Date('2026-07-31T15:59:00Z')),{academicYear:114,semester:2});
  assert.deepEqual(adjustmentTerm(new Date('2026-07-31T16:00:00Z')),{academicYear:115,semester:1});
});

test('manager mutation and receipt bind phase, student, term and version',()=>{
  assert.ok(validAdjustmentPayload(payload));
  assert.equal(validAdjustmentPayload({...payload,owner:user}),false);
  assert.equal(validAdjustmentPayload({...payload,expected_version:1000000}),false);
  const {expected_version,request_id,...fields}=payload;
  const row={...fields,checked_on:'2026-11-14',version:expected_version+1};
  assert.deepEqual(parseAdjustmentRow(row,request_id,'add_drop',115,1),row);
  assert.throws(()=>parseAdjustmentRow(row,'foreign','add_drop',115,1));
  assert.throws(()=>parseAdjustmentRow(row,user,'late_add',115,1));
  assert.throws(()=>parseAdjustmentRow(row,user,'add_drop',115,2));
});
