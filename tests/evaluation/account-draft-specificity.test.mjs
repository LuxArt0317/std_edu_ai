import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fallbackPrivateAnswer} from '../../server/affairsAnswer.js';
import {fixtureForCase} from './fixtures.mjs';

const fixture=key=>fixtureForCase({fixtureKey:key},{now:'2026-11-13T02:00:00Z'});
test('qualified next-class questions retain a future meeting instead of the current-course list',()=>{
  const current=fallbackPrivateAnswer('What is my next School Affairs class?',fixture('courses'));
  assert.match(current,/next scheduled class/);assert.match(current,/Database Design/);assert.match(current,/2026-11-13/);
  const future=fallbackPrivateAnswer('My current term has ended. What is my next known class?',fixture('future-only'));
  assert.match(future,/next scheduled class/);assert.match(future,/Monday Research Seminar/);
});
test('teacher and room lookup answers from the explicitly named course',()=>{
  const answer=fallbackPrivateAnswer('Who teaches Database Design and in which room?',fixture('courses'));
  assert.match(answer,/instructor: Teacher Lin/);assert.match(answer,/room: R301/);
  assert.doesNotMatch(answer,/Historical Methods|Research Practicum/);
});
test('unfinished tasks exclude completed tasks and completed queries exclude open tasks',()=>{
  const snapshot=fixture('tasks');
  const open=fallbackPrivateAnswer('Which tasks are unfinished?',snapshot);
  assert.match(open,/Collect reading list/);assert.doesNotMatch(open,/Check timetable/);
  const done=fallbackPrivateAnswer('Which tasks are completed?',snapshot);
  assert.match(done,/Check timetable/);assert.doesNotMatch(done,/Collect reading list/);
  snapshot.tasks=[];assert.match(fallbackPrivateAnswer('Which tasks are unfinished?',snapshot),/No matching tasks/);
});
test('notice questions include stored body content rather than title alone',()=>{
  const snapshot=fixture('announcements');
  snapshot.announcements=[{title:'Laboratory update',body:'The laboratory opens at 08:30 on Saturday.'}];
  assert.match(fallbackPrivateAnswer('What does the laboratory announcement say?',snapshot),/08:30 on Saturday/);
});
