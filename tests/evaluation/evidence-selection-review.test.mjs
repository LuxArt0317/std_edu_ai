import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectServiceRecords,selectAccountEvidence,ownEvidenceRows} from '../../server/accountEvidenceSelection.js';
import {answerSavedServiceRecords} from '../../server/savedServiceAnswers.js';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID,EVAL_IDS,evalId} from './fixtures.mjs';
import {serviceNoteFixture} from './service-cases.mjs';

const courseRoute=id=>'/dtm/course/'+id;
const ids=rows=>rows.map(row=>row.id);
const serviceFixture=()=>{
  const snapshot=buildAccountFixture();
  snapshot.serviceRecords=['29-1','37-1','38-1'].map(key=>serviceNoteFixture(key,EVAL_USER_ID));
  return snapshot;
};

test('mixed-language multipart service questions retain exact titles and English aliases',()=>{
  const selected=selectServiceRecords(serviceFixture(),{question:'Show my 心理諮商/測驗申請 and payroll records.',route:'/school-affairs/services/38-1'});
  assert.deepEqual(selected.selection.serviceKeys.toSorted(),['29-1','37-1']);
  assert.deepEqual(selected.records.map(row=>row.serviceKey).toSorted(),['29-1','37-1']);
});

for(const question of ['Show all my saved service records.','顯示我的全部服務紀錄。']){
  test('explicit all-service scope overrides the current page: '+question,()=>{
    const snapshot=serviceFixture();
    const selected=selectServiceRecords(snapshot,{question,route:'/school-affairs/services/29-1'});
    assert.deepEqual(ids(selected.records).toSorted(),ids(snapshot.serviceRecords).toSorted());
    assert.equal(selected.selection.scope,'all_saved_services');
  });
}

test('a full reference token never matches a longer reference with the same prefix',()=>{
  const snapshot=serviceFixture(),base=snapshot.serviceRecords[0];
  const target={...base,id:evalId(90001),title:'Appointment A',notes:'Reference QA-29-1. Discuss the timetable.'};
  const collision={...base,id:evalId(90002),title:'Appointment B',notes:'Reference QA-29-10. Discuss accommodation.'};
  snapshot.serviceRecords=[collision,target];
  const selected=selectServiceRecords(snapshot,{question:'Find my saved reference QA-29-1.',route:'/school-affairs/services/29-1'});
  assert.deepEqual(ids(selected.records),[target.id]);
  const answer=answerSavedServiceRecords('Find my saved reference QA-29-1.',snapshot,'/school-affairs/services/29-1');
  assert.doesNotMatch(answer.answer,/QA-29-10|accommodation/);
});

test('an absent exact reference does not substitute unrelated saved service notes',()=>{
  const snapshot=serviceFixture();
  const selected=selectServiceRecords(snapshot,{question:'Find my saved reference QA-29-999.',route:'/school-affairs/services/29-1'});
  assert.deepEqual(selected.records,[]);
});

test('explicit all Moodle courses overrides an individual course page',()=>{
  const snapshot=buildAccountFixture();
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Show all my Moodle courses.',route:courseRoute(EVAL_IDS.dtmCourse)});
  assert.deepEqual(ids(selected.records.courses).toSorted(),ids(snapshot.dtm.courses).toSorted());
});

test('naming every available course remains explicit even if the result count is unchanged',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses=snapshot.dtm.courses.filter(row=>row.id!==EVAL_IDS.historicalDtmCourse);
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Compare Learning Research and Advanced Research.',route:courseRoute(EVAL_IDS.dtmCourse)});
  assert.deepEqual(ids(selected.records.courses).toSorted(),ids(snapshot.dtm.courses).toSorted());
});

test('a single explicitly named owned course overrides an unrelated route',()=>{
  const snapshot=buildAccountFixture();snapshot.dtm.courses=snapshot.dtm.courses.slice(0,1);
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'What materials are in Learning Research?',route:courseRoute(EVAL_IDS.historicalDtmCourse)});
  assert.deepEqual(ids(selected.records.courses),[EVAL_IDS.dtmCourse]);
});

test('a three-character exact course code overrides the current course route',()=>{
  const snapshot=buildAccountFixture();snapshot.dtm.courses[0].code='MA1';
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'What materials do I have in MA1?',route:courseRoute(EVAL_IDS.historicalDtmCourse)});
  assert.deepEqual(ids(selected.records.courses),[EVAL_IDS.dtmCourse]);
});

test('an explicit assignment title can resolve outside the current course page',()=>{
  const snapshot=buildAccountFixture();
  const selected=selectAccountEvidence(snapshot,'assignments',{question:'What is the deadline for Index plan?',route:courseRoute(EVAL_IDS.historicalDtmCourse)});
  assert.deepEqual(ids(selected.records),[EVAL_IDS.assignment]);
});

test('a material title ranks its owning course before unrelated courses',()=>{
  const snapshot=buildAccountFixture();snapshot.dtm.courses.reverse();
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Summarize my Review notes material.',route:'/dtm'});
  assert.equal(selected.records.courses[0]?.id,EVAL_IDS.dtmCourse);
  assert.equal(selected.records.courses[0]?.materials[0]?.id,EVAL_IDS.material);
});

test('an explicitly named material can resolve outside an unrelated course page',()=>{
  const snapshot=buildAccountFixture();
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Summarize my Review notes material.',route:courseRoute(EVAL_IDS.historicalDtmCourse)});
  assert.equal(selected.records.courses[0]?.id,EVAL_IDS.dtmCourse);
});

test('a common child label uses the current course to disambiguate matching courses',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses[1].grades=[{id:evalId(90010),label:'Quiz 1',score:17,maximum:20}];
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'What is my Quiz 1 score?',route:courseRoute(EVAL_IDS.historicalDtmCourse)});
  assert.deepEqual(ids(selected.records.courses),[EVAL_IDS.historicalDtmCourse]);
  assert.equal(selected.records.courses[0].grades[0].score,17);
});

test('an explicit course name takes precedence over a child label found in another course',()=>{
  const snapshot=buildAccountFixture();
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Does Introduction to Research contain Review notes?',route:courseRoute(EVAL_IDS.dtmCourse)});
  assert.deepEqual(ids(selected.records.courses),[EVAL_IDS.historicalDtmCourse]);
  assert.deepEqual(selected.records.courses[0].materials,[]);
});

test('explicit foreign-owner notices are filtered alongside courses and assignments',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.notices.push({id:evalId(90020),userId:EVAL_OTHER_USER_ID,title:'PRIVATE_OTHER_NOTICE',body:'Private timetable'});
  snapshot.dtm.notices.push({id:evalId(90021),user_id:EVAL_OTHER_USER_ID,title:'PRIVATE_OTHER_NOTICE_SNAKE',body:'Private timetable'});
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Show my Moodle notices.',route:'/dtm'});
  assert.doesNotMatch(JSON.stringify(selected.records),/PRIVATE_OTHER_NOTICE/);
  assert.ok(selected.records.notices.some(row=>row.title==='DTM laboratory notice'),'Ownerless public/scoped notices remain available');
});

test('nested DTM rows with contradictory declared parent IDs cannot become course evidence',()=>{
  const snapshot=buildAccountFixture(),course=snapshot.dtm.courses[0];
  for(const [key,parent] of [['materials','courseId'],['meetings','course_id'],['grades','dtmCourseId']]){
    course[key].push({id:evalId(90100+course[key].length),[parent]:EVAL_IDS.historicalDtmCourse,title:'WRONG_PARENT_'+key,label:'WRONG_PARENT_'+key});
  }
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Show all Learning Research materials, meetings and grades.',route:courseRoute(course.id)});
  assert.doesNotMatch(JSON.stringify(selected.records),/WRONG_PARENT_/);
  assert.ok(selected.records.courses[0].materials.some(row=>row.id===EVAL_IDS.material),'Existing scoped rows with no repeated parent ID remain available');
});

test('an unknown route does not expose an explicitly foreign-owned course',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses.push({id:evalId(90200),userId:EVAL_OTHER_USER_ID,title:'PRIVATE_OTHER_COURSE',materials:[],meetings:[],grades:[]});
  const selected=selectAccountEvidence(snapshot,'dtm',{question:'Show all my courses.',route:'/dtm'});
  assert.doesNotMatch(JSON.stringify(selected.records),/PRIVATE_OTHER_COURSE/);
});

test('owner filtering accepts upstream-scoped ownerless rows but rejects either foreign owner declaration',()=>{
  const rows=[{id:'scoped'},{id:'owned',userId:EVAL_USER_ID},{id:'foreign',userId:EVAL_OTHER_USER_ID},{id:'conflict',userId:EVAL_USER_ID,user_id:EVAL_OTHER_USER_ID}];
  assert.deepEqual(ids(ownEvidenceRows(rows,EVAL_USER_ID)),['scoped','owned']);
});
