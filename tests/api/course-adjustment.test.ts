import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adjustmentQuestion,adjustmentTerm,parseAdjustmentRow,summerSelectionQuestion,validAdjustmentPayload,validAdjustmentSelector} from '../../server/courseAdjustmentContract.js';

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

test('summer checks retain the academic year, reject ambiguous dates and leave course history alone',()=>{
  assert.deepEqual(summerSelectionQuestion('Am I eligible for summer courses in 114?'),{view:'mine',year:114,ambiguousYear:false});
  assert.deepEqual(summerSelectionQuestion('114 學年度暑期選課收費？'),{view:'notice',year:114,ambiguousYear:false});
  assert.deepEqual(summerSelectionQuestion('Where is summer course selection?'),{view:'navigation'});
  assert.equal(summerSelectionQuestion('What are my summer course grades?'),null);
  assert.equal(summerSelectionQuestion('Write code for summer course enrollment'),null);
  assert.deepEqual(summerSelectionQuestion('How much are summer course fees in 2026?'),{view:'notice',year:undefined,ambiguousYear:true});
  assert.deepEqual(adjustmentTerm(new Date('2026-07-31T15:59:00Z'),'summer'),{academicYear:114,semester:3});
  assert.ok(validAdjustmentSelector('summer',115,3));
  assert.equal(validAdjustmentSelector('summer',115,2),false);
  assert.equal(validAdjustmentSelector('late_add',115,3),false);
  assert.equal(validAdjustmentPayload({...payload,decision:'missing_college'}),false);
  assert.ok(validAdjustmentPayload({...payload,phase:'summer',semester:3,decision:'missing_college'}));
});
