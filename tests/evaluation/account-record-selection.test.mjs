import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountRecordViews} from '../../server/accountRecordViews.js';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID,EVAL_IDS,evalId} from './fixtures.mjs';
import {serviceCapabilities,serviceNoteFixture} from './service-cases.mjs';

const view=(snapshot,key,question='',route='')=>accountRecordViews(snapshot,[key],{question,route})[0];
const fixture=notes=>({...buildAccountFixture(),serviceRecords:notes});

test('every generic service card has the selected catalog URL and only that own note',()=>{
  for(const service of Object.values(serviceCapabilities).filter(row=>row.level==='generic-tracker')){
    const own=serviceNoteFixture(service.serviceId,EVAL_USER_ID),foreign={...own,userId:EVAL_OTHER_USER_ID,title:'PRIVATE_OTHER_NOTE'};
    const card=view(fixture([foreign,own]),'serviceRecords',`Show my saved ${service.title} note.`,service.route);
    assert.equal(card.url,service.route);assert.equal(card.total,1);assert.ok(JSON.stringify(card.rows).includes(own.title));
    assert.doesNotMatch(JSON.stringify(card),/PRIVATE_OTHER_NOTE/);assert.match(card.note,/do not establish university approval/);
  }
});

test('a relevant service record beyond1500unrelated notes is selected before the card limit',()=>{
  const notes=Array.from({length:1500},(_,index)=>({...serviceNoteFixture('30-2',EVAL_USER_ID),id:evalId(70000+index),title:'UNRELATED '+index}));
  notes.push(serviceNoteFixture('29-1',EVAL_USER_ID));
  const card=view(fixture(notes),'serviceRecords','What reference is in my counseling note?','/school-affairs/services/29-1');
  assert.equal(card.total,1);assert.match(JSON.stringify(card),/QA-29-1/);assert.doesNotMatch(JSON.stringify(card),/UNRELATED/);
});

test('missing exact service reference keeps an empty scoped card and explicit absence',()=>{
  const card=view(fixture([serviceNoteFixture('29-1',EVAL_USER_ID)]),'serviceRecords','Find my saved reference QA-29-999.','/school-affairs/services/29-1');
  assert.equal(card.total,0);assert.deepEqual(card.rows,[]);assert.equal(card.url,'/school-affairs/services/29-1');assert.match(card.note,/No saved note matched/);
});

test('multi-service cards distinguish services without including an unrelated current route',()=>{
  const card=view(fixture(['29-1','37-1','38-1'].map(key=>serviceNoteFixture(key,EVAL_USER_ID))),'serviceRecords','Show my counseling and payroll notes.','/school-affairs/services/38-1');
  assert.equal(card.total,2);assert.equal(card.url,'/school-affairs/records');assert.equal(card.columns[0],'Service');
  assert.match(JSON.stringify(card.rows),/QA-29-1/);assert.match(JSON.stringify(card.rows),/QA-37-1/);assert.doesNotMatch(JSON.stringify(card.rows),/QA-38-1/);
});

test('DTM named-course context overrides another course route and excludes foreign courses/materials',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses.push({...snapshot.dtm.courses[0],id:evalId(70100),userId:EVAL_OTHER_USER_ID,title:'PRIVATE_COURSE'});
  snapshot.dtm.courses[0].materials.push({id:evalId(70101),user_id:EVAL_OTHER_USER_ID,title:'PRIVATE_MATERIAL'});
  const card=view(snapshot,'dtm','Show Learning Research materials.','/dtm/course/'+EVAL_IDS.historicalDtmCourse);
  assert.equal(card.total,1);assert.equal(card.url,'/dtm/course/'+EVAL_IDS.dtmCourse);assert.match(JSON.stringify(card.rows),/Learning Research/);
  assert.doesNotMatch(JSON.stringify(card.rows),/Introduction to Research|PRIVATE_/);assert.equal(card.rows[0][2],'1');
});

test('an exact assignment can be opened from another course without showing other assignments',()=>{
  const snapshot=buildAccountFixture();snapshot.assignments.push({...snapshot.assignments[0],id:evalId(70102),user_id:EVAL_OTHER_USER_ID,title:'PRIVATE_ASSIGNMENT'});
  const card=view(snapshot,'assignments','What is the deadline for Index plan?','/dtm/course/'+EVAL_IDS.historicalDtmCourse);
  assert.equal(card.total,1);assert.equal(card.url,'/dtm/course/'+EVAL_IDS.dtmCourse+'/assignments');assert.match(JSON.stringify(card.rows),/Index plan/);assert.doesNotMatch(JSON.stringify(card.rows),/PRIVATE_ASSIGNMENT|Reading response/);
});

test('empty course assignments retain the correct course route instead of substituting another course',()=>{
  const card=view(buildAccountFixture(),'assignments','What assignments are here?','/dtm/course/'+EVAL_IDS.historicalDtmCourse);
  assert.equal(card.total,0);assert.deepEqual(card.rows,[]);assert.equal(card.url,'/dtm/course/'+EVAL_IDS.historicalDtmCourse+'/assignments');
});

test('an all-course request overrides the current DTM route',()=>{
  const card=view(buildAccountFixture(),'dtm','Show all my Moodle courses.','/dtm/course/'+EVAL_IDS.dtmCourse);
  assert.equal(card.total,3);assert.equal(card.url,'/dtm');
});

test('ordinary record cards reject both forms of explicit foreign ownership',()=>{
  const snapshot=buildAccountFixture();
  for(const key of ['courses','charges','tasks','requests']){
    snapshot[key].push({...snapshot[key][0],userId:EVAL_OTHER_USER_ID,title:'PRIVATE_CROSS_OWNER',label:'PRIVATE_CROSS_OWNER'});
    snapshot[key].push({...snapshot[key][0],user_id:EVAL_OTHER_USER_ID,title:'PRIVATE_CROSS_OWNER_SNAKE',label:'PRIVATE_CROSS_OWNER_SNAKE'});
    assert.doesNotMatch(JSON.stringify(view(snapshot,key)),/PRIVATE_CROSS_OWNER/);
  }
});

test('native modern and legacy graduation cards remain strictly separated',()=>{
  const snapshot=buildAccountFixture();
  const legacy=view(snapshot,'graduationReview','My status','/school-affairs/services/15-2');
  const modern=view(snapshot,'graduationReview','My status','/school-affairs/services/15-1');
  assert.match(JSON.stringify(legacy),/Legacy review complete/);assert.doesNotMatch(JSON.stringify(legacy),/Modern review pending/);
  assert.match(JSON.stringify(modern),/Modern review pending/);assert.doesNotMatch(JSON.stringify(modern),/Legacy review complete/);
  snapshot.graduationReview.reports=snapshot.graduationReview.reports.filter(row=>row.reportKind!=='legacy');
  const absent=view(snapshot,'graduationReview','My status','/school-affairs/services/15-2');
  assert.equal(absent.total,0);assert.match(absent.note,/no other kind is substituted/);
});

test('invalid course IDs cannot become card URLs and invalid stored dates do not crash rendering',()=>{
  const snapshot=buildAccountFixture();snapshot.dtm.courses=[{id:'../admin',code:'BAD',title:'Unsafe identity',materials:[]}];
  assert.equal(view(snapshot,'dtm').url,'/dtm');
  snapshot.dtm.courses[0].id='\ud800';assert.equal(view(snapshot,'dtm').url,'/dtm');
  snapshot.assignments[0].dueAt='not-a-date';
  assert.match(JSON.stringify(view(snapshot,'assignments','Index plan')),/Invalid saved date/);
});

test('selected card generation never mutates source records or counts',()=>{
  const snapshot=buildAccountFixture(),before=JSON.stringify(snapshot);
  accountRecordViews(snapshot,['dtm','assignments','serviceRecords'],{question:'Show all my records.',route:'/dtm'});
  assert.equal(JSON.stringify(snapshot),before);
});
