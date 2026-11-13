import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountEvidence,accountTools} from '../../server/answerVerificationAccount.js';
import {buildAccountFixture,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {serviceNoteFixture} from './service-cases.mjs';

const size=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const source=(evidence,key)=>{
  const result=evidence.find(row=>row.id==='account:'+key);assert.ok(result,key+' evidence is required');return result;
};
function largeFixture(){
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses=Array.from({length:5},(_,courseIndex)=>({
    id:'eval-course-'+courseIndex,code:'EC'+courseIndex,title:'Evaluation course '+courseIndex,term:'115學年度第1學期',sourceMode:'personal',
    materials:Array.from({length:150},(_,index)=>({id:'material-'+courseIndex+'-'+index,title:'Saved material '+courseIndex+' '+index,summary:'內容含引號 " 與反斜線 \\ 。'.repeat(25),kind:'text',sourceMode:'personal'})),
    meetings:Array.from({length:150},(_,index)=>({id:'meeting-'+courseIndex+'-'+index,title:'Saved meeting '+index,date:'2026-11-13',attendance:'unknown',notes:'Local meeting notes. '.repeat(20)})),
    grades:Array.from({length:150},(_,index)=>({id:'grade-'+courseIndex+'-'+index,label:'Saved assessment '+index,score:17,maximum:20,feedback:'請複習本週教材。'.repeat(15)})),
  }));
  snapshot.assignments=snapshot.dtm.courses.flatMap((course,courseIndex)=>Array.from({length:150},(_,index)=>({
    id:'assignment-'+courseIndex+'-'+index,dtmCourseId:course.id,title:'Saved assignment '+courseIndex+' '+index,course:course.code,
    details:'Synthetic assignment details. '.repeat(30),dueAt:'2026-11-20T04:00:00Z',status:'open',sourceMode:'personal',
  })));
  snapshot.serviceRecords=Array.from({length:300},(_,index)=>({...serviceNoteFixture('30-2',EVAL_USER_ID),id:evalId(80000+index),title:'Equipment tracking '+index,notes:'設備借用的私人備註。'.repeat(80)}));
  return snapshot;
}

function assertLinksBackedByIncludedRows(evidence){
  for(const key of ['dtm','assignments']){
    const item=source(evidence,key),content=JSON.parse(item.content);
    const courses=key==='dtm'?content.records?.courses||[]:[];
    const assignments=key==='assignments'&&Array.isArray(content.records)?content.records:[];
    const courseIds=new Set(key==='dtm'?courses.map(row=>row.id):assignments.map(row=>row.dtmCourseId).filter(Boolean));
    for(const url of item.urls){
      assert.ok(url.startsWith('/'),'Every account link is local');
      const parsed=/^\/dtm\/course\/([^/?#]+)(.*)$/.exec(url);if(!parsed)continue;
      const courseId=decodeURIComponent(parsed[1]);assert.ok(courseIds.has(courseId),'Link references an omitted course: '+url);
      const anchor=/^\/(meetings|grades|assignments)#(?:meeting|grade|assignment)-(.+)$/.exec(parsed[2]);
      if(anchor){
        const id=decodeURIComponent(anchor[2]);
        const rows=key==='dtm'?(courses.find(row=>row.id===courseId)?.[anchor[1]]||[]):assignments.filter(row=>row.dtmCourseId===courseId);
        assert.ok(rows.some(row=>row.id===id),'Anchor references an omitted child: '+url);
      }
      const detail=/^\/assignment\/([^/?#]+)$/.exec(parsed[2]);
      if(detail)assert.ok(assignments.some(row=>row.dtmCourseId===courseId&&row.id===decodeURIComponent(detail[1])));
    }
    assert.ok(size(item.urls)<=2000);assert.ok(item.urls.length<=24);
  }
}

test('all-tool evidence stays below70KB including serialized source text, Unicode escaping, metadata and URLs',()=>{
  const snapshot=largeFixture(),before=JSON.stringify(snapshot);
  const evidence=accountEvidence(snapshot,Object.keys(accountTools),{question:'Show all my Moodle courses and assignments.',route:'/dtm'});
  assert.ok(size(evidence)<70000,'Full serialized evidence size: '+size(evidence));
  assertLinksBackedByIncludedRows(evidence);
  assert.equal(JSON.stringify(snapshot),before);
});

test('DTM-only large excerpts never cite courses or child records omitted by their evidence budget',()=>{
  const evidence=accountEvidence(largeFixture(),['dtm'],{question:'Show all my Moodle courses.',route:'/dtm'});
  assert.ok(size(evidence)<70000);assertLinksBackedByIncludedRows(evidence);
  const dtm=JSON.parse(source(evidence,'dtm').content);
  assert.ok(dtm.records.courses.length>0,'A usable excerpt must include at least one actual course');
  assert.equal(dtm.excerpted,true);assert.ok(dtm.counts.some(row=>row.partial));
});

test('a late exact material remains in both narrow and all-tool evidence while excluded course links disappear',()=>{
  const snapshot=largeFixture(),course=snapshot.dtm.courses.at(-1);
  course.materials.at(-1).title='Target independent guide';course.materials.at(-1).summary='Read chapters three and four before the next laboratory.';
  for(const tools of [['dtm'],Object.keys(accountTools)]){
    const evidence=accountEvidence(snapshot,tools,{question:'Show my Target independent guide material in Moodle.',route:'/dtm'});
    const dtm=source(evidence,'dtm'),payload=JSON.parse(dtm.content);
    assert.ok(dtm.content.includes('Read chapters three and four before the next laboratory.'),'Requested full material lost in '+tools.length+'-tool run');
    assert.equal(payload.records.courses.length,1);assert.equal(payload.records.courses[0].id,course.id);
    assert.ok(dtm.urls.includes('/dtm/course/'+course.id));
    assert.doesNotMatch(JSON.stringify(dtm.urls),/eval-course-[0-3]/);
    assert.ok(size(evidence)<70000);
  }
});

test('an exact late assignment remains queryable and its link belongs to the included assignment row',()=>{
  const snapshot=largeFixture(),target=snapshot.assignments.at(-1);
  target.title='Final independent laboratory';target.details='Submit the saved two-page observation report.';
  for(const tools of [['assignments'],Object.keys(accountTools)]){
    const evidence=accountEvidence(snapshot,tools,{question:'What must I do for Final independent laboratory?',route:'/dtm/course/eval-course-0'});
    const assignment=source(evidence,'assignments'),payload=JSON.parse(assignment.content);
    assert.equal(payload.records.length,1);assert.equal(payload.records[0].id,target.id);assert.equal(payload.records[0].details,target.details);
    assert.ok(assignment.urls.includes('/dtm/course/'+target.dtmCourseId+'/assignments#assignment-'+target.id));
    assert.ok(size(evidence)<70000);assertLinksBackedByIncludedRows(evidence);
  }
});

test('a late own service reference survives the all-tool budget and never receives another service URL',()=>{
  const snapshot=largeFixture();snapshot.serviceRecords.push(serviceNoteFixture('29-1',EVAL_USER_ID));
  const evidence=accountEvidence(snapshot,Object.keys(accountTools),{question:'Find my saved counseling reference QA-29-1.',route:'/school-affairs/services/29-1'});
  const item=source(evidence,'serviceRecords'),payload=JSON.parse(item.content);
  assert.equal(payload.records.length,1);assert.equal(payload.records[0].serviceKey,'29-1');assert.ok(payload.records[0].notes.includes('review the instructions'));
  assert.equal(item.url,'/school-affairs/services/29-1');assert.ok(item.urls.includes(item.url));
  assert.doesNotMatch(item.content,/Equipment tracking/);assert.doesNotMatch(JSON.stringify(item.urls),/30-2|internship|leave/);
  assert.ok(size(evidence)<70000);
});

test('foreign records and their identifiers never reach full evidence or its URL allowlists',()=>{
  const snapshot=buildAccountFixture();
  snapshot.dtm.courses.push({...snapshot.dtm.courses[0],id:'FOREIGN-COURSE-ID',userId:EVAL_OTHER_USER_ID,title:'FOREIGN_PRIVATE_SENTINEL'});
  snapshot.assignments.push({...snapshot.assignments[0],id:'FOREIGN-ASSIGNMENT-ID',user_id:EVAL_OTHER_USER_ID,title:'FOREIGN_PRIVATE_SENTINEL'});
  snapshot.serviceRecords.push({...serviceNoteFixture('29-1',EVAL_OTHER_USER_ID),id:'FOREIGN-NOTE-ID',notes:'FOREIGN_PRIVATE_SENTINEL'});
  const evidence=accountEvidence(snapshot,Object.keys(accountTools),{question:'Show all my records.'});
  assert.doesNotMatch(JSON.stringify(evidence),/FOREIGN_PRIVATE_SENTINEL|FOREIGN-COURSE-ID|FOREIGN-ASSIGNMENT-ID|FOREIGN-NOTE-ID/);
  assert.ok(size(evidence)<70000);assertLinksBackedByIncludedRows(evidence);
});
