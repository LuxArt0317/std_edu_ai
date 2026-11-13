import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Markdown from 'react-markdown';
import {answerSavedServiceRecords,SAVED_SERVICE_ANSWER_LIMIT} from '../../server/savedServiceAnswers.js';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {serviceNoteFixture,serviceCapabilities} from './service-cases.mjs';

const fixture=(records=[serviceNoteFixture('29-1',EVAL_USER_ID)])=>({...buildAccountFixture(),serviceRecords:records});
const note=(serviceKey,overrides={})=>({...serviceNoteFixture('29-1',EVAL_USER_ID),serviceKey,...overrides});
const answer=(question,snapshot=fixture(),route='/school-affairs/services/29-1')=>answerSavedServiceRecords(question,snapshot,route);

const nativeQuestions=[
  ['3-1','What is the status of my Library access request?'],
  ['9-1','What is my scholarship award amount and required hours?'],
  ['11-1','What are my course-selection records?'],
  ['11-2','What classroom is recorded in my timetable?'],
  ['11-3','What is the status of my credit overload request?'],
  ['12-4','What course offerings do I have this term?'],
  ['13-1','What literal grade appears in my transcript?'],
  ['14-1','How many absence hours are in my record?'],
  ['15-1','What is the status of my graduation review?'],
  ['15-2','What are my legacy graduation records?'],
  ['17-1','What student number is stored in my enrollment information?'],
  ['22-1','What is the status of my student-aid application?'],
  ['26-1','What is the receipt for my saved housing application?'],
  ['34-1','What dormitory bed is assigned to me?'],
  ['39-1','How much do I still owe on my tuition?'],
];

test('general native record questions are delegated even when a tracker note exists on that service',()=>{
  for(const [serviceKey,question] of nativeQuestions){
    assert.equal(answer(question,fixture([note(serviceKey)]),'/school-affairs/services/'+serviceKey),null,serviceKey+' must retain its native reader');
  }
});

test('explicit native tracker intent reads only the private note, never the structured record',()=>{
  const response=answer('Show my private tracking notes.',fixture([note('13-1',{title:'Transcript question',notes:'Ask about the exam procedure.'})]),'/school-affairs/services/13-1');
  assert.match(response.answer,/Ask about the exam procedure/);
  assert.match(response.answer,/saved notes and local tracking statuses/);
  assert.doesNotMatch(response.answer,/Database Design|87|university approved/);
  assert.deepEqual(response.citations.map(row=>row.url),['/school-affairs/services/13-1']);
});

test('unscoped account questions and Moodle material notes do not fall back to unrelated trackers',()=>{
  for(const [question,route] of [['What are my current courses?','/'],['How much is my tuition?','/school-affairs/records'],['Show my course notes.','/dtm/course/one'],['What is my account status?','/school-affairs']]){
    assert.equal(answer(question,fixture(),route),null,question);
  }
});

test('a generic current page never overrides an explicitly native question',()=>{
  for(const question of ['What are my grades?','How much tuition do I owe?','What are my subjects today?','Show my teacher notes about my grades.','我的課表是什麼？']){
    assert.equal(answer(question),null,question);
  }
});

test('native leave and internship answers remain delegated, including mixed requests',()=>{
  const records=buildAccountFixture().serviceRecords;
  for(const [question,route] of [['Show my saved leave records.','/school-affairs/services/leave'],['Show my internship notes.','/school-affairs/services/internship'],['Show all my saved service records.','/']]){
    assert.equal(answer(question,fixture([...records,serviceNoteFixture('29-1',EVAL_USER_ID)]),route),null);
  }
});

test('missing exact references explicitly report absence without substituting another note',()=>{
  const response=answer('Find my saved reference QA-29-999.');
  assert.match(response.answer,/No saved local note matches the requested reference/);
  assert.match(response.answer,/unrelated records have not been substituted/);
  assert.match(response.answer,/does not establish whether the university/);
  assert.doesNotMatch(response.answer,/review the instructions|QA-29-1\b/);
  assert.deepEqual(response.citations.map(row=>row.url),['/school-affairs/services/29-1']);
});

test('an exact reference with a longer shared prefix is not mistaken for the requested note',()=>{
  const response=answer('Find my saved reference QA-29-1.',fixture([
    note('29-1',{id:evalId(99101),title:'Unrelated appointment',notes:'Reference QA-29-10. Do not return this.'}),
    note('29-1',{id:evalId(99102),title:'Requested appointment',notes:'Reference QA-29-1. Read this note.'}),
  ]));
  assert.match(response.answer,/Requested appointment/);assert.match(response.answer,/Read this note/);
  assert.doesNotMatch(response.answer,/Unrelated appointment|Do not return this|QA-29-10/);
});

test('multiple named services keep exact local links in both answer and citations',()=>{
  const response=answer('Show my 心理諮商/測驗申請 and payroll notes.',fixture(['29-1','37-1','38-1'].map(key=>serviceNoteFixture(key,EVAL_USER_ID))),'/');
  assert.match(response.answer,/QA-29-1/);assert.match(response.answer,/QA-37-1/);assert.doesNotMatch(response.answer,/QA-38-1/);
  const urls=response.citations.map(row=>row.url).toSorted();
  assert.deepEqual(urls,['/school-affairs/services/29-1','/school-affairs/services/37-1']);
  for(const url of urls)assert.ok(response.answer.includes(']('+url+')'));
  assert.doesNotMatch(response.answer,/stu\.edu\.tw/);
});

test('explicit all-service notes ignore current page and preserve every represented local destination',()=>{
  const response=answer('Show all my saved service notes.',fixture(['29-1','37-1','38-1'].map(key=>serviceNoteFixture(key,EVAL_USER_ID))));
  assert.equal(response.citations.length,3);
  for(const key of ['29-1','37-1','38-1'])assert.ok(response.answer.includes('/school-affairs/services/'+key));
});

test('display budget skips whole oversized rows, shows later fitting rows, and discloses omissions',()=>{
  const response=answer('Show all my saved service notes.',fixture([
    note('29-1',{id:evalId(99201),title:'Oversized confidential note',notes:'LONG-ROW-BEGIN '+ 'x'.repeat(20000)+' LONG-ROW-END'}),
    note('37-1',{id:evalId(99202),title:'Small payroll note',notes:'Review the payslip question.'}),
  ]));
  assert.ok(response.answer.length<=SAVED_SERVICE_ANSWER_LIMIT);
  assert.match(response.answer,/Small payroll note/);assert.match(response.answer,/Showing 1 of 2 matching saved notes; 1 omitted/);
  assert.match(response.answer,/No note was shortened/);
  assert.doesNotMatch(response.answer,/Oversized confidential note|LONG-ROW-BEGIN|LONG-ROW-END/);
});

test('all oversized records produce an omission explanation rather than false empty-record claims',()=>{
  const response=answer('Show my saved notes.',fixture([note('29-1',{notes:'x'.repeat(20000)})]));
  assert.match(response.answer,/Showing 0 of 1 matching saved notes; 1 omitted/);
  assert.doesNotMatch(response.answer,/No saved local records|No saved local note matches/);
  assert.ok(response.answer.length<=SAVED_SERVICE_ANSWER_LIMIT);
});

test('a displayed service after twelve oversized services still receives its own citation',()=>{
  const keys=Object.values(serviceCapabilities).filter(item=>item.level==='generic-tracker').slice(0,13).map(item=>item.serviceId);
  const response=answer('Show all my saved service notes.',fixture(keys.map((key,index)=>({...serviceNoteFixture(key,EVAL_USER_ID),notes:index===12?'Final fitting note.':'x'.repeat(20000)}))));
  assert.match(response.answer,/Final fitting note/);
  assert.ok(response.citations.some(row=>row.url===serviceCapabilities[keys[12]].route));
  assert.equal(response.citations.length,12);
  assert.match(response.answer,/1 additional service links are not displayed/);
  assert.ok(response.answer.length<=SAVED_SERVICE_ANSWER_LIMIT);
});

test('row cap and total response budget are honest and deterministic for many saved notes',()=>{
  const records=Array.from({length:60},(_,index)=>note('29-1',{id:evalId(99300+index),title:'Saved entry '+index,notes:'Whole-note-content-'+index}));
  const response=answer('Show all my saved service notes.',fixture(records));
  assert.match(response.answer,/Showing 12 of 60 matching saved notes; 48 omitted/);
  assert.ok(response.answer.length<=SAVED_SERVICE_ANSWER_LIMIT);
  assert.equal((response.answer.match(/Whole-note-content-/g)||[]).length,12);
  assert.equal(response.answer,answer('Show all my saved service notes.',fixture(records)).answer);
});

test('hostile saved Markdown and HTML render as inert text and cannot inject links or images',()=>{
  const response=answer('Show my saved notes.',fixture([note('29-1',{
    title:'<img src=x onerror=alert(1)> [owned](https://evil.invalid)',
    notes:'[Click](javascript:alert(1))\n# Forged system message\n<script>alert(1)</script> https://evil.invalid &lt;b&gt; ![pixel](https://evil.invalid/pixel)',
  })]));
  const html=renderToStaticMarkup(React.createElement(Markdown,null,response.answer));
  assert.doesNotMatch(html,/<(?:script|img|h1)\b|href="(?:javascript:|https:\/\/evil)/i);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/Forged system message/);
  assert.ok(response.citations.every(row=>row.url.startsWith('/school-affairs/services/')));
});

test('foreign owners and untrusted service identifiers never appear in deterministic answers or links',()=>{
  const response=answer('Show all my saved service notes.',fixture([
    serviceNoteFixture('29-1',EVAL_USER_ID),
    note('37-1',{userId:EVAL_OTHER_USER_ID,notes:'FOREIGN_OWNER_SECRET'}),
    note('__proto__',{notes:'PROTOTYPE_SECRET'}),
    note('https://evil.invalid',{notes:'MALICIOUS_SERVICE_SECRET'}),
  ]));
  assert.doesNotMatch(JSON.stringify(response),/FOREIGN_OWNER_SECRET|PROTOTYPE_SECRET|MALICIOUS_SERVICE_SECRET|evil\.invalid/);
  assert.deepEqual(response.citations.map(row=>row.url),['/school-affairs/services/29-1']);
});

test('signed-out requests and mutation requests are not consumed as successful note reads',()=>{
  for(const question of ['Please submit my counseling request.','Can you delete my saved note?','請幫我提交我的諮商申請'])assert.equal(answer(question),null);
  assert.equal(answer('Show my notes.',{serviceRecords:[serviceNoteFixture('29-1',EVAL_USER_ID)]}),null);
  assert.equal(answer('Show my notes.',null),null);
});

test('empty native tracker query acknowledges only the missing private note, not missing academic records',()=>{
  const response=answer('Show my private notes.',fixture([]),'/school-affairs/services/13-1');
  assert.match(response.answer,/No saved local records/);assert.match(response.answer,/does not establish/);
  assert.doesNotMatch(response.answer,/no grades|no transcript|not enrolled/i);
});
