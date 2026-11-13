import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFirstSelectionNotice} from '../../server/firstSelectionNotice.js';
import {firstSelectionQuestion,firstSelectionTableDate} from '../../src/features/public/affairs/firstSelection.js';

test('private and unrelated questions stay outside the public first selection notice',()=>{
  assert.equal(firstSelectionQuestion('When is initial course selection?'),'schedule');
  assert.equal(firstSelectionQuestion('What does this notice say about fees?','/school-affairs/services/6-1/fees'),'fees');
  assert.equal(firstSelectionQuestion('What are my initial course selection fees?'),null);
  assert.equal(firstSelectionQuestion('Was I enrolled in first course selection?'),null);
  assert.equal(firstSelectionQuestion('When does the library open?','/school-affairs/services/6-1'),null);
  assert.equal(firstSelectionTableDate(new Date('2026-08-30T02:00:00.000Z')),'8/30上午10:00');
});

test('a missing or invalid window fails closed',()=>{
  const window={phase:1,opens_at:'2026-06-08T02:00:00+00:00',closes_at:'2026-06-18T01:00:00+00:00',audience:'全校在學生',audience_en:'Students',details:'Instructions'};
  const row={academic_year:115,semester:1,observed_on:'2026-11-14',notices:['Instructions'],reminders:['Reminders'],fee_notes:['費用'],fee_notes_en:['Fees']};
  assert.throws(()=>parseFirstSelectionNotice([{...row,affairs_first_selection_windows:[window]}]),/Incomplete/u);
  assert.throws(()=>parseFirstSelectionNotice([{...row,affairs_first_selection_windows:[window,window,window]}]),/Invalid first selection window/u);
});
