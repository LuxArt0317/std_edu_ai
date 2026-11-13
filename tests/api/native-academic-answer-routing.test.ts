import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {mapAcademicGrades} from '../../server/academicGrades.js';
import {mapAcademicAttendance} from '../../server/academicAttendance.js';

const owner='00000000-0000-4000-8000-000000000001';
const common={user_id:owner,source_mode:'local_demo',version:1,created_at:'2026-11-13T00:00:00Z',updated_at:'2026-11-13T00:00:00Z'};
const snapshot={profile:{userId:owner,displayName:'Synthetic student',email:'student@example.test',role:'student'},
  checkedAt:'2026-11-13T03:00:00Z',student:null,courses:[],assignments:[],tasks:[],requests:[],charges:[],announcements:[],
  dtm:{courses:[],notices:[]},academicGrades:mapAcademicGrades([],[],[{...common,id:'rank',academic_year:115,semester:1,department_ranking_text:'2 / 40',class_ranking_text:'0'}]),
  academicAttendance:mapAcademicAttendance([{...common,id:'stat',academic_year:115,semester:1,row_order:0,course_code:'LOCAL-1',course_title:'Synthetic attendance course',
    total_teaching_hours:54,current_teaching_weeks:4,current_teaching_hours:12,absence_hours:0,unexcused_absence_hours:null}],[],[]),
  graduationReview:{reports:[]},
};
const answer=(question:string,route='',history:Array<{role:string;content:string}>=[],data:Record<string,unknown>=snapshot)=>
  answerPrivateAffairsQuestion(question,data,history,route,{draftOnly:true});

test('ranking route follow-up uses native literal rankings including trailing slash',async()=>{
  const result=await answer('semester 1','/school-affairs/services/13-1/ranking/');
  assert.match(result.answer,/department ranking: 2 \/ 40; class ranking: 0/);
  assert.equal((result.citations[0] as {url:string}).url,'/school-affairs/services/13-1/ranking');
  assert.equal(result.proposedAction,undefined);
});
test('empty native transcript never substitutes legacy enrollment grades or private foreign rows',async()=>{
  const data={...snapshot,academicGrades:mapAcademicGrades([{...common,user_id:'another-account',id:'foreign',academic_year:115,semester:1,record_kind:'transcript',course_title:'FOREIGN PRIVATE COURSE',credits:3,grade_text:'95',row_order:1}]),
    courses:[{code:'SAMPLE-OLD',title:'Legacy sample',grades:[{label:'LEGACY PRIVATE GRADE',score:99,maximum:100}],attendance:[]}]};
  const result=await answer('Show my academic transcript','',[],data);
  assert.match(result.answer,/No.*transcript|no.*records/i);assert.doesNotMatch(result.answer,/FOREIGN|LEGACY|99|95/);
  assert.equal((result.citations[0] as {url:string}).url,'/school-affairs/services/13-1/transcript');
});
test('attendance query preserves independent saved hours and does not derive details from them',async()=>{
  const stats=await answer('My academic attendance for academic year115 semester1','/school-affairs/services/14-1/');
  assert.match(stats.answer,/Synthetic attendance course/);assert.match(stats.answer,/0/);assert.match(stats.answer,/not recorded/);
  const details=await answer('semester 1','/school-affairs/services/14-1/detail/');
  assert.match(details.answer,/No.*details|no.*records/i);assert.doesNotMatch(details.answer,/Synthetic attendance course/);
});
test('modern and legacy graduation follow-ups retain distinct report kinds without substitution',async()=>{
  const modern=await answer('What is the status?','/school-affairs/services/15-1/');
  assert.match(modern.answer,/no saved Academic Services graduation report/i);
  const legacy=await answer('What are the missing credits?','/',[{role:'user',content:'My legacy graduation review'}]);
  assert.match(legacy.answer,/no saved Legacy graduation report/i);
  assert.equal((legacy.citations[0] as {url:string}).url,'/school-affairs/services/15-2');
});
test('explicit Moodle grades keep their Moodle destination instead of academic transcript records',async()=>{
  const result=await answer('Show my Moodle grades','/dtm');
  assert.match(result.answer,/no saved DTM courses/i);
  assert.equal((result.citations[0] as {url:string}).url,'/dtm/dashboard');
  assert.doesNotMatch(result.answer,/2 \/ 40|Academic transcript/);
});

test('unqualified grades request asks for a view instead of guessing across independent grade stores',async()=>{
  const result=await answer('Show my grades','/');
  assert.match(result.answer,/specify the transcript, warning grades, semester ranking or current-term query/);
  assert.doesNotMatch(result.answer,/2 \/ 40/);
});
