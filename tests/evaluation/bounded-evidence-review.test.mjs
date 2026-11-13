import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as selection from '../../server/accountEvidenceSelection.js';
import {buildAccountFixture,EVAL_IDS,EVAL_USER_ID,evalId} from './fixtures.mjs';

const size=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const bound=(selected,options)=>{
  assert.equal(typeof selection.boundSelectedEvidence,'function','Selected account evidence must have an explicit whole-record byte budget.');
  return selection.boundSelectedEvidence(selected,options);
};
const count=(value,collection,parentId)=>{
  const row=value.counts?.find(item=>item.collection===collection&&(!parentId||item.parentId===parentId));
  assert.ok(row,`Missing ${collection} count for ${parentId||'top-level'}`);return row;
};
function largeDtm(){
  const snapshot=buildAccountFixture(),course=snapshot.dtm.courses[0];
  snapshot.dtm.courses=[course];
  course.materials=Array.from({length:150},(_,i)=>({id:evalId(30000+i),title:'Material topic '+i,kind:'page',summary:'研究資料'.repeat(90)+' COMPLETE MATERIAL '+i,position:i,sourceMode:'personal',sourceUrl:null}));
  course.meetings=Array.from({length:150},(_,i)=>({id:evalId(31000+i),title:'Meeting topic '+i,date:'2026-11-10',startsAt:'09:00:00',attendance:'absent',notes:'會議內容'.repeat(90)+' COMPLETE MEETING '+i}));
  course.grades=Array.from({length:150},(_,i)=>({id:evalId(32000+i),label:'Grade topic '+i,score:17,maximum:20,date:'2026-11-10',feedback:'評分回饋'.repeat(90)+' COMPLETE GRADE '+i}));
  return snapshot;
}

test('queried tail material, meeting and grade survive budgeting with course lineage and provenance',()=>{
  const snapshot=largeDtm(),course=snapshot.dtm.courses[0];
  const selected=selection.selectAccountEvidence(snapshot,'dtm',{question:'Show Material topic 149, Meeting topic 149 and Grade topic 149 in Learning Research.',route:'/dtm'});
  const budget=12000,value=bound(selected,{key:'dtm',budget});
  assert.ok(size(value)<=budget,`Evidence used ${size(value)} UTF-8 bytes for a ${budget}-byte limit.`);
  assert.equal(value.records.sourceMode,'personal');assert.equal(value.excerpted,true);
  const returned=value.records.courses.find(row=>row.id===course.id);
  assert.ok(returned);assert.equal(returned.code,course.code);assert.equal(returned.title,course.title);assert.equal(returned.term,course.term);assert.equal(returned.sourceMode,'personal');
  for(const collection of ['materials','meetings','grades']){
    const target=course[collection].at(-1);
    assert.deepEqual(returned[collection].find(row=>row.id===target.id),target,`${collection} target must remain whole, with full saved fields.`);
    const counts=count(value,collection,course.id);
    assert.equal(counts.availableRows,150);assert.equal(counts.matchingRows,150);
    assert.equal(counts.includedRows,returned[collection].length);assert.equal(counts.partial,true);
    for(const row of returned[collection])assert.deepEqual(row,course[collection].find(original=>original.id===row.id),'Every included leaf is an original complete record.');
  }
  assert.equal(count(value,'courses').includedRows,value.records.courses.length);
});

test('large note omission does not starve a later whole record that fits',()=>{
  const huge={id:evalId(33000),userId:EVAL_USER_ID,title:'Large saved note',notes:'Extremely long complete note '.repeat(2000),status:'draft',serviceKey:'29-1'};
  const small={id:evalId(33001),userId:EVAL_USER_ID,title:'Small saved note',notes:'My appointment is next Tuesday.',status:'draft',serviceKey:'29-1'};
  const selected={records:[huge,small],selection:{scope:'selected_services',serviceKeys:['29-1'],availableRows:2,matchingRows:2}};
  const value=bound(selected,{key:'serviceRecords',budget:2500});
  assert.deepEqual(value.records,[small]);assert.equal(value.excerpted,true);assert.ok(size(value)<=2500);
  assert.deepEqual(selected.records,[huge,small],'Budgeting must not mutate the source snapshot.');
  const counts=count(value,'records');
  assert.equal(counts.availableRows,2);assert.equal(counts.matchingRows,2);assert.equal(counts.includedRows,1);assert.equal(counts.partial,true);
});

test('one oversized record produces explicit partial evidence, never a complete absence',()=>{
  const selected={records:[{id:evalId(33002),title:'Long note',notes:'醫療追蹤'.repeat(8000),status:'draft'}],selection:{scope:'selected_services',availableRows:1,matchingRows:1}};
  const value=bound(selected,{key:'serviceRecords',budget:1600});
  assert.deepEqual(value.records,[]);assert.equal(value.excerpted,true);
  const counts=count(value,'records');
  assert.equal(counts.availableRows,1);assert.equal(counts.matchingRows,1);assert.equal(counts.includedRows,0);assert.equal(counts.partial,true);
  assert.match(String(value.rules),/absence|complet|omitted|unknown/i,'A model needs an explicit limitation rule alongside the empty excerpt.');
  assert.ok(size(value)<=1600);
});

test('UTF-8 Chinese content and JSON escaping count toward the complete envelope budget',()=>{
  const rows=Array.from({length:30},(_,i)=>({id:evalId(34000+i),title:'備註 '+i,notes:'學期\n"內容"\\'.repeat(22),status:'draft',sourceMode:'personal'}));
  const value=bound({records:rows,selection:{scope:'all_saved_services',availableRows:30,matchingRows:30}},{key:'serviceRecords',budget:3000});
  assert.ok(size(value)<=3000);assert.ok(value.records.length>0);assert.ok(value.records.length<30);assert.equal(value.excerpted,true);
  for(const row of value.records)assert.deepEqual(row,rows.find(original=>original.id===row.id));
  const counts=count(value,'records');assert.equal(counts.includedRows,value.records.length);assert.equal(counts.matchingRows,30);
});

test('small complete evidence keeps original provenance and has exact nonpartial counts',()=>{
  const rows=[{id:EVAL_IDS.assignment,title:'Index plan',details:'Compare B-tree indexes.',sourceMode:'personal',dtmCourseId:EVAL_IDS.dtmCourse,meetingId:EVAL_IDS.meeting}];
  const selected={records:rows,selection:{scope:'matching_owned_assignments',matchingRows:1}};
  const value=bound(selected,{key:'assignments',budget:4096});
  assert.deepEqual(value.records,rows);assert.deepEqual(value.selection,selected.selection);assert.equal(value.excerpted,false);
  const counts=count(value,'records');assert.equal(counts.availableRows,1);assert.equal(counts.matchingRows,1);assert.equal(counts.includedRows,1);assert.equal(counts.partial,false);
});

test('an actually empty selected collection is distinct from a budget-omitted collection',()=>{
  const value=bound({records:[],selection:{scope:'selected_services',availableRows:8,matchingRows:0}},{key:'serviceRecords',budget:2048});
  assert.equal(value.excerpted,false);assert.deepEqual(value.records,[]);
  const counts=count(value,'records');assert.equal(counts.availableRows,8);assert.equal(counts.matchingRows,0);assert.equal(counts.includedRows,0);assert.equal(counts.partial,false);
});

test('invalid or impossibly small budgets fail explicitly instead of returning misleading empty records',()=>{
  const selected={records:[],selection:{scope:'all_saved_services',matchingRows:0}};
  for(const budget of [0,100,1023,NaN,Infinity,-1])assert.throws(()=>bound(selected,{key:'serviceRecords',budget}),RangeError);
  assert.throws(()=>bound({records:[],selection:{scope:'x'.repeat(10000),matchingRows:0}},{key:'serviceRecords',budget:1024}),RangeError);
});

test('DTM notices retain independent counts and provenance without becoming child course records',()=>{
  const snapshot=buildAccountFixture();
  const selected=selection.selectAccountEvidence(snapshot,'dtm',{question:'Show all my Moodle courses and notices.',route:'/dtm'});
  const value=bound(selected,{key:'dtm',budget:10000});
  assert.deepEqual(value.records.notices,snapshot.dtm.notices);
  assert.equal(value.records.notices[0].sourceMode,'sample');assert.equal(value.records.courses[0].sourceMode,'personal');
  const counts=count(value,'notices');assert.equal(counts.availableRows,1);assert.equal(counts.includedRows,1);assert.equal(counts.partial,false);
});
