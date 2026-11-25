import test from 'node:test';import assert from 'node:assert/strict';
import {publicCalendarAnswer as answer} from './publicCalendarAnswer.js';
test('calendar location provides source-issued student and English editions',()=>{
 const result=answer('Where is the school calendar?');assert.ok(result);assert.match(result.answer,/2026–2027/);assert.match(result.answer,/45b4315881485ac84bff/);assert.match(result.answer,/student or staff/);
});
test('requested years and staff editions are respected without inventing unavailable downloads',()=>{
 assert.match(answer('Where can I download the 114 staff calendar?').answer,/2025–2026/);
 assert.equal(answer('Where can I download the 116 calendar?'),null);
 for(const question of ['When is the midterm in the calendar?','Where is my assignment calendar?','Where is the calendar and how much is tuition?'])assert.equal(answer(question),null);
});
