import test from 'node:test';
import assert from 'node:assert/strict';
import {courseSelectionTermGuide} from '../../server/accountCourseSelectionAnswer.js';
const route='/school-affairs/services/11-1';
test('missing term asks for scope and links existing history and timetable pages without personal claims',()=>{
 for(const question of ['What are my subjects for a given year and semester?','Where can I find my courses by academic year and semester?','如何查詢我某一學年和學期的課程？']){
  const answer=courseSelectionTermGuide(question,route);assert.equal(answer?.status,'clarification');
  assert.deepEqual(answer?.citations?.map(row=>row.url),[route,'/school-affairs/services/11-2']);
  assert.doesNotMatch(answer?.answer??'',/115|2026|SAMP|^You are enrolled|You have no/iu);
 }
});
test('specified terms, other owners, writes, compounds and unrelated routes retain their existing dispatch',()=>{
 for(const question of ['What are my subjects for academic year 115 semester 1?','What are John’s subjects for a given year and semester?','Enroll me in courses for a given year and semester.','What are my subjects for a given year and semester and how much do I owe?'])assert.equal(courseSelectionTermGuide(question,route),null);
 assert.equal(courseSelectionTermGuide('What are my subjects for a given year and semester?','/dtm'),null);
 assert.equal(courseSelectionTermGuide('What are my subjects for a given year and semester?',route,[{role:'user',content:'115 semester 1'}]),null);
});
