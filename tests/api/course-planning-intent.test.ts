import test from 'node:test';
import assert from 'node:assert/strict';
import {accountQuestionIntent} from '../../server/affairsAnswer.js';
const intent=(question:string)=>accountQuestionIntent(question,[],'/school-affairs/services/11-1');
test('bilingual own course-planning advice uses mixed review with only selected course and degree records',()=>{
 for(const question of ['Which classes should I take next semester to meet my credit threshold?','What courses should I choose for next term?','Can you help me plan my courses for next semester?','Recommend subjects for me next semester.','Which classes should I take next semester to meet credit requirements?','Which subjects would you recommend for next semester?','Can you recommend courses for next semester?','我下學期應該選哪些課程才能達到學分門檻？','請幫我規劃下學期選課','請推薦我下學期的課程']){
  const result=intent(question);assert.equal(result.kind,'mixed',question);assert.equal(result.recognized,true,question);
  assert.deepEqual(result.baseTools,['courseSelection','graduationReview'],question);assert.deepEqual(result.courseTerms,[]);
 }
});
test('planning does not swallow factual lookups, writes, foreign students or unrelated advice',()=>{
 for(const question of ['What are my subjects next semester?','Show my credit load applications.','Enroll me in the next semester courses.','Add a course for me.','Which classes should John take next semester?','Help me plan my friend’s courses for next semester.','Recommend books for me.','Can you recommend courses for John next semester?','Which subjects would you recommend for next semester and where can I park?','Can you recommend courses for next semester and enroll me?','Which classes should I take next semester and pay my tuition?','Which classes should I take next semester for student s1234?','請幫同學規劃下學期選課','幫我加選下學期課程','我下學期有哪些課程？']){
  const result=intent(question);assert.notDeepEqual(result.baseTools,['courseSelection','graduationReview'],question);
 }
});
test('planning never creates term mappings, thresholds, curriculum facts or write capabilities',()=>{
 const result=intent('Which classes should I take next semester to meet my credit threshold?');
 assert.equal(result.year,false);assert.equal(result.currentCourses,false);assert.equal(result.explicitDtm,false);
 assert.doesNotMatch(JSON.stringify(result.baseTools),/profile|grades|charges|catalog|action/iu);
});
