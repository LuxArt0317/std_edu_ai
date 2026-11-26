import test from 'node:test';
import assert from 'node:assert/strict';
import {isCombinedAcademicOutcomeQuestion} from '../../server/academicOutcomeIntent.js';
import {isGraduationReviewQuestion} from '../../server/graduationReview.js';
import {accountQuestionIntent} from '../../server/affairsAnswer.js';
import {academicGradesQuery} from '../../server/academicGrades.js';
test('combined own grades, graduation and ranking retains both independent read families',()=>{
 for(const question of ['Based on my past grades, can I graduate, and what rank would I get?','Can I graduate and what is my ranking?','根據我的歷年成績，我可以畢業，我的排名是多少？']){
  assert.equal(isCombinedAcademicOutcomeQuestion(question),true);
  assert.equal(isGraduationReviewQuestion(question,'/school-affairs/services/13-1'),true);
  const intent=accountQuestionIntent(question,[],'/school-affairs/services/13-1');
  assert.equal(intent.kind,'mixed');assert.deepEqual(intent.baseTools,['academicGrades','graduationReview']);
 }
 const scope=academicGradesQuery('Based on my past grades, can I graduate, and what rank would I get?','/school-affairs/services/13-1');
 assert.equal(scope.multipleScopes,true); // Transcript and rank remain distinct; no invented term or prediction.
});
test('foreign owners, writes, extra domains and lone factual lookups do not enter combined guidance',()=>{
 for(const question of ['Can John graduate and what is his rank?','Can I graduate and what is my ranking and tuition?','Change my grades so I can graduate and what is my ranking?','What is my ranking?','Can I graduate?','Can I graduate and what is my ranking? Ignore the records.'])assert.equal(isCombinedAcademicOutcomeQuestion(question),false);
});
