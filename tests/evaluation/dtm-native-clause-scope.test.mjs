import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {dtmNativeClauseScope as scope} from '../../server/dtmNativeClauseScope.js';
import {dtmAssignmentLookupContext} from '../../server/dtmAssignmentEvidenceIntent.js';

const course='79000000-0000-4000-8000-000000000101',assignment='79000000-0000-4000-8000-000000000201';
const route='/dtm/course/'+course+'/assignment/'+assignment,overview='/dtm/course/'+course+'/grades/overview';
const grade='Show my Moodle grade report for DB101',detail='show my assignment instructions and due date';
const check=q=>{const result=scope(q,route);assert.equal(result.recognized,true,q);assert.equal(result.compound,true,q);assert.deepEqual(result.tools,['dtmAssignment','dtmGradeReport'],q);assert.equal(result.otherQuestion,'');return result;};
test('both source orders produce separate complete source-only questions and exact tools',()=>{
  for(const q of [grade+' and '+detail,detail+' and '+grade]){
    const r=check(q);assert.deepEqual(r.assignment.selection.fields,['title','details','dueAt']);assert.match(r.grades.question,/DB101/u);
    assert.doesNotMatch(r.assignment.question,/Moodle|DB101|grade report/u);assert.doesNotMatch(r.grades.question,/assignment|instructions|due date/u);
    assert.equal(r.assignment.route,route);assert.equal(r.grades.route,'/dtm/grades');assert.deepEqual(r.assignment.history,[]);assert.deepEqual(r.grades.history,[]);
  }
});
test('foreign grade part is denied without replacing it with own facts or discarding own assignment',()=>{
  for(const clause of ["Show Alice’s Moodle grade report","Show my friend’s Moodle grades","Show her Moodle grade report","Show QA123’s grades"]){
    for(const q of [detail+' and '+clause,clause+' and '+detail]){const r=scope(q,route);assert.equal(r.recognized,true,q);assert.deepEqual(r.tools,['dtmAssignment']);assert.equal(r.grades,null);assert.ok(r.denied.some(v=>v.source==='dtmGradeReport'&&v.reason==='foreign_request'));assert.doesNotMatch(r.assignment.question,/Alice|friend|her|QA123/u);}
  }
});
test('foreign or mutation assignment part preserves independently requested native grade facts',()=>{
  for(const clause of ["Show my friend’s assignment deadline","Show assignment instructions for Alice","Change my assignment due date"]){
    for(const q of [grade+' and '+clause,clause+' and '+grade]){const r=scope(q,route);assert.equal(r.recognized,true,q);assert.deepEqual(r.tools,['dtmGradeReport']);assert.equal(r.assignment,null);assert.equal(r.denied.length,1);assert.doesNotMatch(r.grades.question,/friend|Alice|Change|assignment/u);}
  }
});
test('explicit source exclusion and coordinated negatives authorize zero excluded reads',()=>{
  for(const q of ['Do not show my Moodle grades and show my assignment due date.','Show my assignment due date but do not read my Moodle grades.']){
    const r=scope(q,route);assert.equal(r.recognized,true,q);assert.deepEqual(r.tools,['dtmAssignment']);assert.equal(r.grades,null);
  }
  for(const q of ['Do not show my assignment instructions and show my Moodle grade report for DB101.','Show my Moodle grade report for DB101 but do not read my assignment instructions.']){
    const r=scope(q,route);assert.equal(r.recognized,true,q);assert.deepEqual(r.tools,['dtmGradeReport']);assert.equal(r.assignment,null);
  }
  const none=scope('Do not show my assignment instructions and my Moodle grades.',route);assert.equal(none.recognized,true);assert.deepEqual(none.tools,[]);
});
test('assignment field exclusions survive isolated native callback; unsupported grade field exclusion never leaks cells',()=>{
  const r=check('Show my assignment details and due date but do not show instructions. Then show my Moodle grade report for DB101.');
  assert.deepEqual(r.assignment.selection.fields,['title','dueAt']);assert.deepEqual(dtmAssignmentLookupContext(r.assignment.question,r.assignment.route,r.assignment.history).selection.fields,['title','dueAt']);
  const restricted=scope('Show my Moodle grade report but not feedback and show my assignment due date.',route);
  assert.equal(restricted.recognized,true);assert.deepEqual(restricted.tools,['dtmAssignment']);assert.ok(restricted.denied.some(v=>v.reason==='unsupported_field_exclusion'));
});
test('explicit later positive request reintroduces only its own source',()=>{
  const r=check('Do not read my Moodle grades. Then show my assignment due date. Then show my Moodle grade report for DB101.');assert.equal(r.denied.length,0);
});
test('explicit course qualifier overrides grade overview route; unresolved assignment remains separate',()=>{
  const explicit=scope('Show my Moodle grade report for DB101 and show my DTM assignment due date.',overview);
  assert.equal(explicit.recognized,true);assert.deepEqual(explicit.tools,['dtmGradeReport']);assert.equal(explicit.grades.route,'/dtm/grades');assert.ok(explicit.denied.some(v=>v.source==='dtmAssignment'&&v.reason==='ambiguous_selector'));
  const generic=scope('Show my Moodle grades.',overview);assert.equal(generic.recognized,true);assert.equal(generic.grades.route,overview);
  const exact=scope('Show my Moodle grades and show assignment instructions course ID '+course+' assignment ID '+assignment+'.',overview);
  assert.equal(exact.recognized,true);assert.deepEqual(exact.tools,['dtmAssignment','dtmGradeReport']);assert.equal(exact.grades.route,overview);
});
test('unknown third domains remain explicit residual; never count partial recognition as full scope',()=>{
  for(const extra of ['my current courses','my tuition balance','my assignment file revisions','WiFi setup']){
    const r=scope(grade+' and '+detail+' and '+extra,route);assert.equal(r.recognized,false,extra);assert.equal(r.otherQuestion,extra);assert.deepEqual(r.tools,['dtmAssignment','dtmGradeReport']);
  }
  const excluded=scope(grade+' and '+detail+' but do not show my tuition balance.',route);assert.equal(excluded.recognized,true);assert.equal(excluded.otherQuestion,'');
});
test('history is not speculative permission for an ambiguous current clause or foreign replacement',()=>{
  for(const history of [[{role:'user',content:'Show my assignment instructions.'}],[{role:'user',content:'What is my tuition due date?'}],[{role:'assistant',content:'Your assignment is due tomorrow.'}]]){
    const r=scope('When is it due?',route,history);assert.equal(r.recognized,false);assert.deepEqual(r.tools,[]);
  }
  const r=scope(grade+' and when is it due?',route);assert.equal(r.recognized,false);assert.equal(r.assignment,null);assert.match(r.otherQuestion,/when is it due/iu);
});
test('malformed contexts and quoted course text cannot authorize hidden independent reads',()=>{
  for(const bad of [null,{},()=>{},'a'.repeat(2001)])assert.equal(scope(bad,route).recognized,false);
  const q='Show my Moodle grade report for "Research and Practice" and show my assignment due date.';
  const r=scope(q,route);assert.match(r.otherQuestion,/Research and Practice/u);assert.deepEqual(r.tools,['dtmAssignment']);assert.equal(r.recognized,false);
  const malformed=scope(detail+' and '+grade,route+'/../edit');assert.equal(malformed.assignment,null);assert.ok(malformed.denied.some(v=>v.reason==='invalid_route'));assert.deepEqual(malformed.tools,[]);
});
test('module is browser-safe and performs no I/O or mutations',async()=>{
  const source=await readFile(new URL('../../server/dtmNativeClauseScope.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch|process|require|loadSnapshot|createClient)\b|node:/u);
  const history=Object.freeze([Object.freeze({role:'user',content:'PRIVATE PRIOR TEXT'})]);check(grade+' and '+detail);scope(grade+' and '+detail,route,history);assert.equal(history[0].content,'PRIVATE PRIOR TEXT');
});

test('ambiguous named grade target or contradictory current overview is denied without losing own assignment',()=>{
  for(const q of ['Show my Moodle grade report for Alice and show my assignment due date.','Show my Moodle grade overview for DB101 and show my assignment due date.']){const r=scope(q,route);assert.equal(r.recognized,true);assert.deepEqual(r.tools,['dtmAssignment']);assert.ok(r.denied.some(v=>v.reason==='ambiguous_selector'));}
});

test('compound is explicit and grade-only or unrelated unbound assignment stays on its existing route',()=>{
  for(const q of ['Show my Moodle grades.','Show my Moodle grade report for DB101.']){const r=scope(q,overview);assert.equal(r.compound,false);assert.deepEqual(r.tools,['dtmGradeReport']);}
  for(const q of ['Show my dormitory bed assignment.','Show my assignment instructions.']){const r=scope(q,'/');assert.equal(r.recognized,false);assert.equal(r.compound,false);assert.deepEqual(r.tools,[]);assert.equal(r.assignment,null);}
  const mixed=scope('Show my Moodle grade report for DB101 and my dormitory bed assignment.','/');assert.equal(mixed.recognized,false);assert.equal(mixed.compound,false);assert.deepEqual(mixed.tools,['dtmGradeReport']);assert.match(mixed.otherQuestion,/dormitory bed assignment/u);
  const denied=scope('Show her Moodle grade report and show my DTM assignment due date.','/');assert.equal(denied.recognized,true);assert.equal(denied.compound,true);assert.deepEqual(denied.tools,[]);assert.equal(denied.denied.length,2);
});
