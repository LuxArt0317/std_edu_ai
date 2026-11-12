import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerStudentAidRecords,isStudentAidRecordQuestion,mapStudentAidRecords,studentAidNavigation} from '../../server/studentAidRecords.js';

const record={id:'aid-one',user_id:'student-one',applicant_label:'SAMPLE-001',student_name:'Student One',
  masked_identity_number:'******1234',department_name:'Sample program',phone:'020000000',application_kind:'Local housing aid',
  relative_count:2,subsidy_amount:'12500.00',student_record_locked:true,school_review_status:'人工審核中',ministry_review_status:null,
  academic_year:115,semester:1,source_mode:'local_demo',version:1,updated_at:'2026-11-12T12:00:00Z'};
const snapshot={profile:{userId:'student-one'},studentAid:mapStudentAidRecords([record])};

test('student aid mapping preserves independently entered labels and null or zero amounts',()=>{
  const {records}=mapStudentAidRecords([record,{...record,id:'empty',subsidy_amount:null,relative_count:null,student_record_locked:null},
    {...record,id:'zero',subsidy_amount:'0',relative_count:0}]);
  assert.equal(records[0].schoolReviewStatus,'人工審核中');
  assert.equal(records[0].ministryReviewStatus,null);
  assert.equal(records[0].subsidyAmount,12500);
  assert.equal(records[1].subsidyAmount,null);assert.equal(records[1].relativeCount,null);assert.equal(records[1].studentRecordLocked,null);
  assert.equal(records[2].subsidyAmount,0);assert.equal(records[2].relativeCount,0);
});

test('aid answer reads only caller rows, keeps identifiers/contact details out, and offers no mutation',()=>{
  const mixed={...snapshot,studentAid:mapStudentAidRecords([record,{...record,id:'other',user_id:'student-two',application_kind:'Other private aid'}])};
  const result=answerStudentAidRecords('What is my student aid application status?',mixed)!;
  assert.match(result.answer,/Local housing aid.*12,500.*人工審核中.*ministry review not recorded.*locked/);
  assert.doesNotMatch(result.answer,/Other private aid|SAMPLE-001|1234|020000000|apply now|application submitted/i);
  assert.equal(result.url,'/school-affairs/services/22-1');
  const chinese=answerStudentAidRecords('我的不利處境學生助學紀錄',snapshot)!;
  assert.match(chinese.answer,/115 學年第 1 學期.*12,500.*人工審核中.*教育部審核 未記錄/);
});

test('empty aid history does not fabricate eligibility, awards, periods or application controls',()=>{
  const result=answerStudentAidRecords('What is my financial aid status?',{profile:{userId:'empty'},studentAid:{records:[]}})!;
  assert.match(result.answer,/No student aid records.*site administrator/s);
  assert.doesNotMatch(result.answer,/eligible|approved|6,000|6000|October 20|apply now/i);
  const zero=answerStudentAidRecords('What is my financial aid subsidy?',{
    ...snapshot,studentAid:mapStudentAidRecords([{...record,subsidy_amount:'0',student_record_locked:false}]),
  })!;
  assert.match(zero.answer,/subsidy NT\$0.*unlocked/);
});

test('aid topic and follow-ups remain separate from overseas scholarship and other account topics',()=>{
  const route='/school-affairs/services/22-1';
  const history=[{role:'user',content:'What is my financial aid status?'}];
  for(const question of ['Show my scholarship application history','我的境外學生獎助學金','Show my DTM records',
    'What is my leave status?','My internship application','What homework is due?','我的學費']) {
    assert.equal(isStudentAidRecordQuestion(question,route,history),false,question);
    assert.equal(answerStudentAidRecords(question,snapshot,route,history),null,question);
  }
  for(const question of ['What is the review status?','What is the subsidy amount?','是否已鎖定？'])
    assert.equal(isStudentAidRecordQuestion(question,route,history),true,question);
  assert.equal(isStudentAidRecordQuestion('What is the review status?','/school-affairs/services/9-1',[]),false);
  assert.equal(isStudentAidRecordQuestion('What student aid does STU offer?'),false);
  assert.equal(isStudentAidRecordQuestion('What is my aid status?'),true);
  assert.equal(isStudentAidRecordQuestion('我的助學金申請狀態'),true);
  assert.equal(isStudentAidRecordQuestion('我的獎助學金申請狀態'),false);
});

test('aid navigation points to the observed service instead of overseas scholarship',()=>{
  assert.equal(studentAidNavigation.localUrl,'/school-affairs/services/22-1');
  assert.equal(studentAidNavigation.officialUrl,'https://infosys.stu.edu.tw/ApplyWeak/Login/AspLogin');
  assert.equal(studentAidNavigation.match.test('Where is the financial aid system?'),true);
  assert.equal(studentAidNavigation.match.test('Where is the overseas scholarship system?'),false);
});
