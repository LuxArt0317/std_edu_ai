import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {buildAccountFixture,EVAL_USER_ID} from './fixtures.mjs';
import {serviceNoteFixture} from './service-cases.mjs';

const fixture=()=>({...buildAccountFixture(),serviceRecords:['29-1','37-1','38-1'].map(key=>serviceNoteFixture(key,EVAL_USER_ID))});
const ask=(question,snapshot=fixture(),route='/school-affairs/services/29-1')=>answerPrivateAffairsQuestion(question,snapshot,[],route,{draftOnly:true});

test('private answer dispatch reads selected generic notes rather than falling back to account identity',async()=>{
  const result=await ask('What is the reference and next step in my counseling note?');
  assert.match(result.answer,/QA-29-1/);assert.match(result.answer,/review the instructions/);
  assert.doesNotMatch(result.answer,/QA-37-1|QA-38-1|Sample stu.best workspace:/);
  assert.equal(result.citations[0].url,'/school-affairs/services/29-1');assert.equal(result.grounding.degraded,false);
  assert.ok(result.activity.some(step=>step.label==='Checked your saved service notes'));
});

test('dispatch preserves every selected service citation and local tracking limitation',async()=>{
  const result=await ask('Show my counseling and payroll notes.',fixture(),'/');
  assert.deepEqual(result.citations.map(row=>row.url).toSorted(),['/school-affairs/services/29-1','/school-affairs/services/37-1']);
  assert.match(result.answer,/not university approval, payment or official submission/);assert.doesNotMatch(result.answer,/QA-38-1/);
});

test('an unknown exact note reference stays explicitly absent through full dispatch',async()=>{
  const result=await ask('Find my saved reference QA-29-999.');
  assert.match(result.answer,/No saved local note matches the requested reference/);
  assert.doesNotMatch(result.answer,/review the instructions|QA-29-1\b/);
});

test('native grades and each graduation report still win before generic-note fallback',async()=>{
  const snapshot=fixture();
  const grades=await ask('What literal grade appears for Database Design in my academic transcript?',snapshot,'/school-affairs/services/13-1');
  assert.match(grades.answer,/Database Design/);assert.match(grades.answer,/87/);assert.doesNotMatch(grades.answer,/QA-29-1/);
  const legacy=await ask('What is my graduation review status?',snapshot,'/school-affairs/services/15-2');
  const modern=await ask('What is my graduation review status?',snapshot,'/school-affairs/services/15-1');
  assert.match(legacy.answer,/Legacy review complete/);assert.doesNotMatch(legacy.answer,/Modern review pending/);
  assert.match(modern.answer,/Modern review pending/);assert.doesNotMatch(modern.answer,/Legacy review complete/);
});

test('native leave and internship delegates retain structured values and do not become generic notes',async()=>{
  const snapshot=buildAccountFixture();
  const leave=await ask('Show my saved Clinic leave request.',snapshot,'/school-affairs/services/leave');
  assert.match(leave.answer,/Clinic leave/);assert.match(leave.answer,/draft/);assert.doesNotMatch(leave.answer,/Your saved local tracking notes/);
  const internship=await ask('What status is saved for my Community Internship?',snapshot,'/school-affairs/services/internship');
  assert.match(internship.answer,/Community Internship/);assert.match(internship.answer,/filed/);
});

test('the integrated note query is read-only and never manufactures an action proposal',async()=>{
  const snapshot=fixture(),before=JSON.stringify(snapshot);
  const result=await ask('Show my counseling note.',snapshot);
  assert.equal(result.proposedAction,undefined);assert.equal(JSON.stringify(snapshot),before);
});
