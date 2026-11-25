import assert from 'node:assert/strict';
import {test} from 'node:test';
import {currentStudyForeignYearQuestion,currentStudyOwnYearClause} from '../../server/currentStudyOwnerScope.js';

test('the reported English and Chinese year requests qualify their own clause',()=>{
  for(const question of [
    'what courses i have for this semester and what year i am currently at',
    'Show my current courses and what year am I in?',
    'Show my current courses and my recorded year level.',
    'Which subjects do I have this semester? What year level is recorded for me?',
    '我這學期有哪些課？我目前是幾年級？',
    '我這學期有哪些課？我的年級？',
  ]) {assert.equal(currentStudyOwnYearClause(question),true,question);assert.equal(currentStudyForeignYearQuestion(question),null,question);}
});

test('explicit other-person year questions retain only literal own current-course requests',()=>{
  const course='Show my current courses';
  for(const foreign of [
    'your recorded year level','his current year level','their year level',
    'what year is Alice in','what year is QA123 currently in','what year is student QA in','what year is Summer in',
    "Alice’s recorded year level","my sister's year level",'the year level recorded for student 123',
  ])for(const question of [course+' and '+foreign,foreign+'. '+course]){
    assert.equal(currentStudyOwnYearClause(question),false,question);
    assert.deepEqual(currentStudyForeignYearQuestion(question),{courseQuestion:course},question);
  }
  for(const foreign of ['他目前是幾年級','你目前是幾年級','王小明是幾年級','QA123是幾年級','我的同學目前是幾年級']){
    const question='我這學期有哪些課？'+foreign+'？';
    assert.equal(currentStudyOwnYearClause(question),false,question);
    assert.deepEqual(currentStudyForeignYearQuestion(question),{courseQuestion:'我這學期有哪些課'},question);
  }
});

test('a nearby first-person course does not authorize an ambiguous or foreign year',()=>{
  for(const question of [
    'Show my current courses and your recorded year level.',
    'Show my current courses and the year level.',
    'Show my current courses and my sister’s year level.',
    '我這學期有哪些課？他目前是幾年級？',
    'What courses do I have this semester and what year is Alice in?',
    'Show my current courses and do not show my year level.',
    'Show my current courses and my recorded year level for student 123.',
    'what courses i have for this semester and what year i am currently at for student 123',
  ])assert.equal(currentStudyOwnYearClause(question),false,question);
});

test('residual rewriting refuses additional domains, unsupported course fields and uncertain ownership',()=>{
  for(const question of [
    'Show my current courses and your year level and my tuition balance.',
    'Show my current courses and your year level. Show my GPA.',
    'Show my current courses and your year level and what is my next class?',
    'Show my current courses and your year level and my own year level.',
    'Show my current courses and their credits and your year level.',
    'Show my current Moodle courses and your year level.',
    'Show my courses and your year level.',
    'Do not show my current courses and your year level.',
    'Show my current courses and the current academic year.',
    '我這學期有哪些課？他目前是幾年級？還有我的學費。',
  ])assert.equal(currentStudyForeignYearQuestion(question),null,question);
});

test('pure or explicitly excluded foreign years never become an own-year lookup',()=>{
  for(const question of ['What year is Alice in?',"What is QA123’s year level?",'他目前是幾年級？','Do not show your recorded year level.']){
    assert.equal(currentStudyOwnYearClause(question),false,question);
    assert.deepEqual(currentStudyForeignYearQuestion(question),{courseQuestion:''},question);
  }
  assert.deepEqual(currentStudyForeignYearQuestion('Show my current courses and do not show your year level.'),{courseQuestion:'Show my current courses'});
  assert.deepEqual(currentStudyForeignYearQuestion('what courses i have for this semester and what year i am currently at for student 123'),{courseQuestion:'what courses i have for this semester'});
});

test('an explicitly conflicting course owner cannot survive as a caller-owned residual',()=>{
  for(const question of [
    'Show my current courses for student 123 and your recorded year level.',
    'Show my current courses for Alice and your recorded year level.',
    'Show my current courses belonging to QA123 and your year level.',
    'Show Alice’s current courses and your year level.',
    'Show their current courses and your year level.',
    'Show my sister’s current courses and your year level.',
  ])assert.deepEqual(currentStudyForeignYearQuestion(question),{courseQuestion:''},question);
  assert.deepEqual(currentStudyForeignYearQuestion('Show my current courses for this semester and your year level.'),{courseQuestion:'Show my current courses for this semester'});
  assert.equal(currentStudyForeignYearQuestion('Show my current courses for Alice and your year level and my tuition balance.'),null);
  assert.equal(currentStudyForeignYearQuestion('Show my current courses for Alice.'),null);
});

test('non-questions, huge input and non-person temporal years do not qualify',()=>{
  for(const input of [null,{},[],42,'', 'x'.repeat(2001),'What is the current academic year?','What is my current academic year?','What year is the academic semester?','What year is this school term?','What year is the university calendar for?','What year is fall semester?','What year is the spring term?','What year is 2026?','What year is 115 school year?','Show my current courses for this school year.','Show my current courses for this year.']){
    assert.equal(currentStudyOwnYearClause(input),false);
    assert.equal(currentStudyForeignYearQuestion(input),null);
  }
});
