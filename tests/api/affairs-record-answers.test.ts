import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fallbackPrivateAnswer} from '../../server/affairsAnswer.js';
import {studyCalendar} from '../../server/affairsSchedule.js';

const checkedAt='2026-11-06T01:00:00Z'; // Friday 09:00 in Taipei.
const course=(code:string,weekday:number,termStartsOn:string,termEndsOn:string,status='enrolled')=>({code,title:`${code} subject`,term:termStartsOn.startsWith('2027')?'Spring 2027':termEndsOn.startsWith('2026')?'Spring 2026':'Fall 2026',termStartsOn,termEndsOn,status,weekday,startsAt:'10:00:00',endsAt:'11:30:00',room:'Sample Room'});
const courses=[
  course('SAMP090',2,'2026-02-16','2026-06-26','completed'),
  course('SAMP103',5,'2026-09-07','2027-01-15'),
  course('SAMP201',2,'2027-02-15','2027-06-25'),
];
const snapshot={checkedAt,profile:{displayName:'Student',email:'student@example.com',role:'student'},student:{studentNumber:'SAMPLE-123',program:'Sample General Studies',yearLevel:1},courses,
  charges:[{label:'Sample Fall 2026 tuition',amountDue:28000,amountPaid:5000,currency:'TWD',dueOn:'2026-12-15'}],
  assignments:[{title:'Practice reflection',course:'DTM-SAMPLE-101',status:'open',dueAt:'2026-11-18T15:59:00Z',dtmCourseId:'dtm-course-1'}],
  dtm:{courses:[],notices:[]},tasks:[],requests:[],announcements:[]};

test('personal timetable uses the campus date and separates current, past and future terms',()=>{
  const plan=studyCalendar(courses,checkedAt);
  assert.deepEqual(plan.today.map(item=>item.code),['SAMP103']);
  assert.equal(plan.next?.course.code,'SAMP103');
  assert.equal(plan.next?.day,'2026-11-06');
  assert.deepEqual(plan.current.map(item=>item.code),['SAMP103']);
  assert.deepEqual(plan.historical.map(item=>item.code),['SAMP090']);
  assert.deepEqual(plan.upcoming.map(item=>item.code),['SAMP201']);
  const afterClass=studyCalendar(courses,'2026-11-06T04:00:00Z');
  assert.equal(afterClass.next?.day,'2026-11-13');
});

test('account questions answer from records with concrete balances and DTM assignments',()=>{
  const cases:[string,RegExp,RegExp][]=[
    ['What subjects do I have today?',/SAMP103/,/SAMP201/],
    ['When is my next class?',/SAMP103.*2026-11-06/,/SAMP090/],
    ['What were my historical subjects?',/SAMP090/,/SAMP201/],
    ['What are my upcoming subjects?',/SAMP201/,/SAMP090/],
    ['How much is my tuition fee?',/NT\$23,000/,/stu\.edu\.tw/],
    ['How about assignments?',/Practice reflection/,/stu\.edu\.tw/],
    ['What are my Moodle assignments?',/DTM-SAMPLE-101.*Practice reflection/,/stu\.edu\.tw/],
    ['What about next semester?',/SAMP201/,/SAMP090/],
  ];
  for(const [question,expected,excluded] of cases){const answer=fallbackPrivateAnswer(question,snapshot);assert.match(answer,expected,question);assert.doesNotMatch(answer,excluded,question);assert.match(answer,/sample/i,question);}
});
