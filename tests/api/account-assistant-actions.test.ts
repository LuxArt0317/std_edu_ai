import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareAccountAction} from '../../server/accountAssistantActions.js';
import {accountRecordViews} from '../../server/accountRecordViews.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
const snapshot={profile:{role:'student',displayName:'Test'},tasks:[{id:'own-task',title:'Read chapter',completedAt:null}],assignments:[{id:'own-assignment',title:'Lab reflection',sourceMode:'personal',dtmCourseId:'own-course',status:'open'}]};
test('action planner only prepares exact owned targets and asks on ambiguity or protected records',()=>{
  assert.equal(prepareAccountAction('Complete my task Read chapter',snapshot).action?.payload.task_id,'own-task');
  assert.match(prepareAccountAction('Complete my task unknown',snapshot).clarification!,/Which open stu.best task/);
  assert.ok(prepareAccountAction('Complete my task Read chapter',{...snapshot,tasks:[...snapshot.tasks,...snapshot.tasks]}).clarification);
  assert.ok(prepareAccountAction('Publish an announcement titled Notice with body A notice.',snapshot).clarification);
  const proposed=prepareAccountAction('Mark my personal assignment Lab reflection as submitted',snapshot).action!;
  assert.deepEqual(proposed.payload,{id:'own-assignment',status:'submitted',expected_status:'open'});assert.ok(proposed.requestId);assert.equal(proposed.url,'/dtm/course/own-course/assignments');
  assert.ok(prepareAccountAction('Mark my personal assignment Lab reflection as submitted',{...snapshot,assignments:[{...snapshot.assignments[0],sourceMode:'sample'}]}).clarification);
  assert.deepEqual(prepareAccountAction('What is my display name?',snapshot),{});
  assert.equal(prepareAccountAction('Change my display name to New name',snapshot).action?.payload.expected_name,'Test');
});
test('persisted messages remove executable proposals, image bytes, arbitrary fields and private reasoning',()=>{
  const messages=sanitizeStoredConversation([{id:'u',role:'user',content:'question',images:[{name:'photo.png',dataUrl:'data:image/png;base64,secret'}],token:'secret'},
    {id:'a',role:'assistant',content:'answer',result:{answer:'answer',status:'answered',citations:[],proposedAction:{payload:{secret:'secret'}},reasoning:'secret',verification:{status:'verified',attempts:2}},activity:[{kind:'check',label:'Checked',detail:'Actual records',status:'complete'}]}]);
  assert.ok(!JSON.stringify(messages).includes('secret'));assert.equal(messages[1].actionExpired,true);assert.equal(messages[1].activity.length,1);assert.equal(messages[1].result.verification.attempts,2);
});
test('record cards calculate actual balances and mark bounded results without inventing records',()=>{
  const cards=accountRecordViews({checkedAt:'2026-11-12T00:00:00Z',charges:[{label:'Tuition',amountDue:1000,amountPaid:350,currency:'TWD',sourceMode:'sample'}]},['charges']);
  assert.match(cards[0].rows[0][3],/650/);assert.equal(cards[0].rows[0][4],'sample');assert.equal(cards[0].total,1);assert.equal(cards[0].url,'/school-affairs/services/39-1');
});
