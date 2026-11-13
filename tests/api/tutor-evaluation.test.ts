import assert from 'node:assert/strict';
import test from 'node:test';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {parseTutorEvaluation,parseTutorEvaluationReceipt,validTutorEvaluation} from '../../server/tutorEvaluationContract.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const submittedAt = '2026-11-13T14:00:00Z';
const ratings = [5,4,3,2,1,5,4,3,2,1];

test('tutor evaluation contracts require ten numeric scores, exact fields and owner-bound receipts', () => {
  const input = {request_id:requestId,ratings,comment:'測試'};
  assert.equal(validTutorEvaluation(input),true);
  for (const malformed of [
    {...input,user_id:other},{...input,ratings:[...ratings,5]},{...input,ratings:[...ratings.slice(1),'5']},
    {...input,comment:'測'.repeat(4001)},{...input,comment:'\0'},{...input,comment:'\ud800'},
  ]) assert.equal(validTutorEvaluation(malformed),false);
  const response = {userId:owner,student:null,evaluation:{ratings,comment:input.comment,submittedAt}};
  assert.deepEqual(parseTutorEvaluation(response,owner),response);
  assert.throws(()=>parseTutorEvaluation(response,other));
  assert.throws(()=>parseTutorEvaluation({...response,evaluation:{...response.evaluation,ratings:[]}},owner));
  const receipt = {userId:owner,requestId,submittedAt};
  assert.deepEqual(parseTutorEvaluationReceipt(receipt,owner,requestId),receipt);
  assert.throws(()=>parseTutorEvaluationReceipt(receipt,other,requestId));
});

test('assistant gives local TA and tutor destinations for navigation questions', () => {
  for (const [question,path] of [
    ['Where can I open the teaching assistant learning report?','25-1/report'],
    ['教學助理自我評表在哪裡？','25-1/evaluation'],
    ['Where can I find the tutor evaluation questionnaire?','28-1'],
  ]) {
    const answer = answerCampusNavigation(question);
    assert.ok(answer,question);
    assert.deepEqual(answer.citations.map(citation=>citation.url),['/school-affairs/services/'+path]);
  }
  assert.equal(answerCampusNavigation('Was my tutor evaluation approved?'),null);
});
