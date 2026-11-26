import test from 'node:test';
import assert from 'node:assert/strict';
import {planAccountLookup,accountEvidence} from '../../server/answerVerificationAccount.js';
import {isAcademicGradeOnlyQuestion} from '../../server/academicGrades.js';
test('standalone grade paraphrases select academic records without practice-course fallback',async()=>{
 for(const question of ['what are my grades','Show my grades','Can I see my academic results?','我的成績']){
 assert.equal(isAcademicGradeOnlyQuestion(question,'/',[]),true,question);
 const plan=await planAccountLookup(question,[],'/',Date.now()+1000,{previousTools:[],feedback:[]});assert.deepEqual(plan.tools,['academicGrades']);
 const evidence=accountEvidence({profile:{userId:'owner'},checkedAt:'2026-11-26T00:00:00Z',courses:[{grades:[{label:'SECRET PRACTICE QUIZ',score:8,maximum:10}]}],dtm:{courses:[{title:'SECRET DTM COURSE'}]},academicGrades:{records:[],termSummaries:[],rankings:[],metadata:[]}},['courses','dtm','academicGrades'],{question,route:'/'});
 assert.doesNotMatch(JSON.stringify(evidence),/SECRET PRACTICE QUIZ|SECRET DTM COURSE/);assert.ok(!evidence.some(item=>['account:courses','account:dtm'].includes(item.id)));
 }
});
test('compound subjects and explicit Moodle or practice questions retain independent routing',()=>{
 for(const question of ['Show my subjects and grades','Show my Moodle grades','What is my practice quiz grade?'])assert.equal(isAcademicGradeOnlyQuestion(question,'/',[]),false);
});
