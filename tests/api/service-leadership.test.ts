import assert from 'node:assert/strict';
import test from 'node:test';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {selectedEvidenceLinks} from '../../server/accountEvidenceLinks.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {accountRecordViews} from '../../server/accountRecordViews.js';

test('service leadership directions have exact local links in Chinese and English',()=>{
  for (const [question,view] of [
    ['服務領導教育在哪裡？',''],
    ['哪裡可以開啟服務實作單位確認？','/confirmation'],
    ['Where can I open service unit preselection?','/preselection'],
    ['Where are the service leadership lectures?','/lectures'],
    ['Where can I open the service leadership grades?','/assignments'],
  ]) {
    const answer=answerCampusNavigation(question);
    assert.ok(answer,question);
    assert.equal(answer.citations[0].url,'/school-affairs/services/42-1'+view);
  }
  assert.equal(answerCampusNavigation('What is the status of my service leadership application?'),null);
});

test('course evidence and its card open the enrollment rows instead of the retired summary',()=>{
  const snapshot={
    checkedAt:'2026-11-13T00:00:00Z',profile:{userId:'student-a'},
    courses:[{id:'course-a',code:'QA101',title:'Synthetic course',status:'enrolled',term:'QA',sourceMode:'sample'}],
  };
  const path='/school-affairs/records/subjects';
  assert.equal(accountEvidence(snapshot,['courses']).find(source=>source.id==='account:courses')?.url,path);
  assert.equal(accountRecordViews(snapshot,['courses'])[0].url,path);
});

test('Moodle evidence links only render exact local resource IDs',()=>{
  const courseId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const materialId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const links=selectedEvidenceLinks('dtm',{courses:[{id:courseId,materials:[
    {id:materialId,dtmCourseId:courseId,targetUrl:'https://example.invalid'},
    {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',dtmCourseId:'other-course'},
    {id:'../invalid'},
  ]}]});
  assert.ok(links.includes('/dtm/course/'+courseId+'/material/'+materialId));
  assert.doesNotMatch(JSON.stringify(links),/cccccccc|invalid|other-course/);
});
