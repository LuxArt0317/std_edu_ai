import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerPrivateAffairsQuestion } from '../../server/affairsAnswer.js';
import { answerCampusNavigation, directoryEntries } from '../../server/schoolAffairsDirectory.js';
import { questionKind } from '../../server/schoolWebSearch.js';
import { officialInternshipUrl, officialLeaveUrl, serviceDestination } from '../../src/features/public/affairs/studentServices.js';

const snapshot = {
  checkedAt:'2026-11-12T03:30:00Z',
  dtm:{courses:[
    {
      id:'personal-course',code:'SYS123',title:'Systems Design',term:'115學年度第1學期',sourceMode:'personal',
      meetings:[
        {id:'missed-class',date:'2026-11-11',startsAt:'09:00:00',title:'Database indexes',attendance:'absent'},
        {id:'previous-class',date:'2026-11-10',startsAt:'09:00:00',title:'Prior meeting',attendance:'present'},
        {id:'future-class',date:'2026-11-13',startsAt:'09:00:00',title:'Future meeting',attendance:'unknown'},
      ],
      grades:[{id:'grade-item',label:'Practice exam',score:32,maximum:40,feedback:'Stored feedback'}],
    },
    {id:'sample-course',code:'SAMPLE',title:'Demo course',term:'115學年度第1學期',sourceMode:'sample',meetings:[],grades:[]},
  ]},
  assignments:[
    {id:'assigned-that-day',dtmCourseId:'personal-course',title:'Index design worksheet',meetingId:'missed-class',status:'open',sourceMode:'personal',dueAt:'2026-11-15T07:00:00Z'},
    {id:'other-work',dtmCourseId:'personal-course',title:'Other assignment due the same day',meetingId:'previous-class',status:'submitted',sourceMode:'personal',dueAt:'2026-11-15T07:00:00Z'},
    {id:'sample-work',dtmCourseId:'sample-course',title:'Sample reflection',status:'open',sourceMode:'sample',dueAt:null},
  ],
  serviceRecords:[{serviceKey:'leave',title:'Leave record',status:'draft',startsOn:'2026-11-11',endsOn:'2026-11-12',notes:'Private leave notes'}],
};

test('missed meeting answer joins only explicitly linked assignments and opens their real DTM view',async()=>{
  const result=await answerPrivateAffairsQuestion('I was absent last meeting in SYS123. What assignments were given?',snapshot,[],'/dtm');
  assert.match(result.answer,/Database indexes.*2026-11-11.*absent/);
  assert.match(result.answer,/Index design worksheet.*\/dtm\/course\/personal-course\/assignments#assignment-assigned-that-day/);
  assert.doesNotMatch(result.answer,/Other assignment|Sample reflection|Future meeting/);
  assert.equal(result.grounding.source,'account');
  assert.equal(result.grounding.webSearched,false);
});

test('unfinished assignments omit submitted and sample work when personal courses exist',async()=>{
  const result=await answerPrivateAffairsQuestion('Which assignments are not yet finished?',snapshot);
  assert.match(result.answer,/Unfinished assignments \(1\)/);
  assert.match(result.answer,/Index design worksheet/);
  assert.doesNotMatch(result.answer,/Other assignment|Sample reflection/);
  assert.equal(questionKind('Which assignments are not yet finished?').personal,true);
});

test('grade report and service status answers link to account views without exposing private notes',async()=>{
  const grade=await answerPrivateAffairsQuestion('Show my Moodle grades',snapshot,[],'/dtm/course/personal-course');
  assert.match(grade.answer,/Practice exam.*\/grades#grade-grade-item.*32\/40 \(80\.0%\)/);
  const leave=await answerPrivateAffairsQuestion('What is my leave status?',snapshot);
  assert.match(leave.answer,/Leave record.*draft/);
  assert.match(leave.answer,/\/school-affairs\/services\/leave\/history/);
  assert.doesNotMatch(leave.answer,/Private leave notes/);
  assert.equal(answerCampusNavigation('Where can I find the status of my leave?'),null);
});

test('verified public links distinguish the leave system, internship, Wi-Fi, and registrar',()=>{
  const leave=answerCampusNavigation('Where can I file leave?');
  assert.equal(leave?.citations[0].url,officialLeaveUrl);
  assert.match(leave?.answer||'',/\/school-affairs\/services\/leave/);
  assert.equal(answerCampusNavigation('Where is the internship system?')?.citations[0].url,officialInternshipUrl);
  assert.match(answerCampusNavigation('Where can I find the Wi-Fi?')?.answer||'',/help\.ecc\.stu\.edu\.tw\/wireless-setting/);
  assert.match(answerCampusNavigation('Where can I find the registrar?')?.answer||'',/www\.aca\.stu\.edu\.tw/);
  assert.match(answerCampusNavigation('What is the contact number of the registrar?')?.answer||'',/615 8000.*2012/);
  assert.equal(directoryEntries.length,94);
  for(const entry of directoryEntries) assert.ok(entry.localUrl.startsWith('/'));
  assert.equal(serviceDestination({id:'1-1',title:'學生請假紀錄查詢',sourcePath:officialLeaveUrl,group:'sao',section:'學生請假',kind:'query'}),'/school-affairs/services/leave/history');
});
