import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectServiceRecords,selectAccountEvidence} from '../../server/accountEvidenceSelection.js';
import {answerSavedServiceRecords} from '../../server/savedServiceAnswers.js';
import {buildAccountFixture,fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {serviceNoteFixture} from './service-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';

test('service selection preserves requested notes beyond a large unrelated history',()=>{
  const snapshot=buildAccountFixture();
  snapshot.serviceRecords=Array.from({length:1500},(_,i)=>({...serviceNoteFixture('30-2',EVAL_USER_ID),id:evalId(15000+i)}));
  snapshot.serviceRecords.push(serviceNoteFixture('29-1',EVAL_USER_ID));
  const selection=selectServiceRecords(snapshot,{question:'What reference is in my counseling note?',route:'/school-affairs/services/29-1'});
  assert.equal(selection.records.length,1);assert.equal(selection.records[0].serviceKey,'29-1');assert.equal(selection.url,'/school-affairs/services/29-1');
});
test('exact references rank whole rows and never include an explicit foreign owner',()=>{
  const snapshot=buildAccountFixture(),target=serviceNoteFixture('29-1',EVAL_USER_ID);
  snapshot.serviceRecords=[{...target,id:evalId(88000),userId:EVAL_OTHER_USER_ID,notes:'PRIVATE FOREIGN'},...Array.from({length:30},(_,i)=>({...target,id:evalId(18000+i),title:'Old note '+i,notes:'Different reference OLD-'+i})),target];
  const selection=selectServiceRecords(snapshot,{question:'Find QA-29-1.',route:'/school-affairs/services/29-1'});
  assert.deepEqual(selection.records,[target]);assert.ok(!JSON.stringify(selection).includes('PRIVATE FOREIGN'));
});
test('empty selected service does not substitute another service or claim institutional absence',()=>{
  const snapshot=buildAccountFixture();snapshot.serviceRecords=[serviceNoteFixture('29-1',EVAL_USER_ID)];
  const context={question:'What payroll records are saved?',route:'/school-affairs/services/37-1'};
  assert.deepEqual(selectServiceRecords(snapshot,context).records,[]);
  const answer=answerSavedServiceRecords(context.question,snapshot,context.route);
  assert.match(answer.answer,/No saved local records/);assert.match(answer.answer,/does not establish/);assert.match(answer.answer,/37-1/);assert.doesNotMatch(answer.answer,/QA-29-1/);
});
test('explicit service title resolves from another page and preserves multiple requested services',()=>{
  const snapshot=buildAccountFixture();snapshot.serviceRecords=['29-1','37-1','38-1'].map(id=>serviceNoteFixture(id,EVAL_USER_ID));
  const selected=selectServiceRecords(snapshot,{question:'Show my 心理諮商/測驗申請 and 獎助金薪資查詢 records.',route:'/'});
  assert.deepEqual(selected.selection.serviceKeys.sort(),['29-1','37-1']);assert.equal(selected.records.length,2);
});
test('exact DTM course and assignment questions retain their saved content before budgeting',()=>{
  const cases=buildAccountCases();
  for(const [id,key,expected] of [['account:dtm-tail-retrieval','dtm','Target Research Seminar'],['account:assignment-tail-retrieval','assignments','Compare B-tree and hash indexes in two pages']]){
    const item=cases.find(row=>row.id===id),selected=selectAccountEvidence(fixtureForCase(item),key,item);
    assert.ok(JSON.stringify(selected.records).includes(expected));
    assert.ok(JSON.stringify(selected.records).length<24000,'Relevant records fit without archived filler');
  }
});
