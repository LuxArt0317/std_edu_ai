import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectedEvidenceLinks} from '../../server/accountEvidenceLinks.js';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {academicGradesPaths} from '../../server/academicGrades.js';

const byteSize=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const course=(id,children=1)=>({id,title:'Synthetic '+id,
  meetings:Array.from({length:children},(_,index)=>({id:'meeting-'+id+'-'+index})),
  grades:Array.from({length:children},(_,index)=>({id:'grade-'+id+'-'+index})),
  assignments:Array.from({length:children},(_,index)=>({id:'assignment-'+id+'-'+index})),
});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};

test('DTM links follow only included course and child records with actual UI anchor patterns',()=>{
  const links=selectedEvidenceLinks('dtm',{courses:[course('alpha')]});
  for(const expected of ['/dtm','/dtm/dashboard','/dtm/assignments','/dtm/grades','/dtm/course/alpha','/dtm/course/alpha/meetings#meeting-meeting-alpha-0','/dtm/course/alpha/grades#grade-grade-alpha-0','/dtm/course/alpha/assignments#assignment-assignment-alpha-0','/dtm/course/alpha/materials'])assert.ok(links.includes(expected),expected);
});

test('five courses with150children per type remain bounded and excluded courses never leak into links',()=>{
  const excluded=Array.from({length:40},(_,index)=>course('EXCLUDED-'+index,150));
  const excerpt={courses:Array.from({length:5},(_,index)=>course('included-'+index,150)),snapshot:{dtm:{courses:excluded}},excluded};
  const links=selectedEvidenceLinks('dtm',excerpt);
  assert.ok(byteSize(links)<=2000);assert.ok(links.length<=24);assert.equal(new Set(links).size,links.length);
  assert.doesNotMatch(JSON.stringify(links),/EXCLUDED/);
  for(let index=0;index<5;index++)assert.ok(links.includes('/dtm/course/included-'+index));
  assert.ok(links.some(link=>link.includes('#meeting-')));assert.ok(links.some(link=>link.includes('#grade-')));
});

test('assignment destinations come from projected rows without an external snapshot join',()=>{
  const links=selectedEvidenceLinks('assignments',[{id:'task-a',dtmCourseId:'course-a',meetingId:'UNRETRIEVED-MEETING',url:'https://evil.invalid'},{id:'task-b',dtmCourseId:'course-b'}]);
  for(const expected of ['/dtm/assignments','/dtm/course/course-a','/dtm/course/course-a/assignments#assignment-task-a','/dtm/course/course-a/assignment/task-a','/dtm/course/course-b/assignments#assignment-task-b'])assert.ok(links.includes(expected),expected);
  assert.doesNotMatch(JSON.stringify(links),/UNRETRIEVED|evil/);
});

test('service records use only authoritative catalog routes and known native aliases',()=>{
  const input=[{serviceKey:'29-1'},{serviceKey:'37-1'},{serviceKey:'leave'},{serviceKey:'internship'},{serviceKey:'__proto__'},{serviceKey:'99-999'},{serviceKey:'https://evil.invalid'}];
  const links=selectedEvidenceLinks('serviceRecords',input);
  assert.deepEqual(links,['/school-affairs/records','/school-affairs/services/29-1','/school-affairs/services/37-1','/school-affairs/services/leave','/school-affairs/services/internship']);
  const allowed=new Set(['/school-affairs/records',...schoolServiceEntries.map(row=>row.localUrl),'/school-affairs/services/leave','/school-affairs/services/internship']);
  for(const url of links)assert.ok(allowed.has(url));
});

test('a validated empty service primary remains first even when there are no matching rows',()=>{
  assert.deepEqual(selectedEvidenceLinks('serviceRecords',[],{primaryUrl:'/school-affairs/services/37-1'}),['/school-affairs/services/37-1','/school-affairs/records']);
});

test('the primary URL is exact, first, deduplicated, and must belong to the excerpt domain',()=>{
  const primary='/dtm/course/alpha/grades#grade-grade-alpha-0';
  const links=selectedEvidenceLinks('dtm',{courses:[course('alpha')]},{primaryUrl:primary});
  assert.equal(links[0],primary);assert.equal(links.filter(value=>value===primary).length,1);
  for(const url of ['https://stu.best/dtm','//evil.invalid/dtm','/dtm/course/omitted','/dtm/course/alpha?next=https://evil.invalid','/school-affairs/services/29-1'])assert.throws(()=>selectedEvidenceLinks('dtm',{courses:[course('alpha')]},{primaryUrl:url}),/not an allowed/);
});

test('a valid late included child can be primary despite preceding hundreds of rows',()=>{
  const records={courses:[course('alpha',150)]},primary='/dtm/course/alpha/grades#grade-grade-alpha-149';
  const links=selectedEvidenceLinks('dtm',records,{primaryUrl:primary,maxLinks:1});
  assert.deepEqual(links,[primary]);
});

test('an unrepresentable primary throws rather than silently dropping it',()=>{
  const primary='/school-affairs/services/29-1',size=byteSize([primary]);
  assert.throws(()=>selectedEvidenceLinks('serviceRecords',[],{primaryUrl:primary,maxBytes:size-1}),/does not fit/);
  assert.throws(()=>selectedEvidenceLinks('serviceRecords',[],{primaryUrl:primary,maxLinks:0}),/does not fit/);
  assert.deepEqual(selectedEvidenceLinks('serviceRecords',[],{primaryUrl:primary,maxBytes:size}),[primary]);
});

test('the complete JSON array fits exact UTF-8 bytes, including punctuation and encoded Chinese IDs',()=>{
  const id='資料庫課程',child='期中考',records={courses:[{id,grades:[{id:child}]}]};
  const primary='/dtm/course/'+encodeURIComponent(id)+'/grades#grade-'+encodeURIComponent(child),limit=byteSize([primary]);
  assert.deepEqual(selectedEvidenceLinks('dtm',records,{primaryUrl:primary,maxBytes:limit}),[primary]);
  assert.throws(()=>selectedEvidenceLinks('dtm',records,{primaryUrl:primary,maxBytes:limit-1}),/does not fit/);
  for(let maxBytes=2;maxBytes<400;maxBytes+=7){
    const links=selectedEvidenceLinks('dtm',records,{maxBytes});assert.ok(byteSize(links)<=maxBytes);
  }
});

test('count and byte limits are validated instead of coercing NaN, strings or fractions',()=>{
  for(const value of [-1,1,NaN,Infinity,2.5,'2000'])assert.throws(()=>selectedEvidenceLinks('dtm',{}, {maxBytes:value}),RangeError);
  for(const value of [-1,NaN,Infinity,1.5,'24'])assert.throws(()=>selectedEvidenceLinks('dtm',{}, {maxLinks:value}),RangeError);
  assert.deepEqual(selectedEvidenceLinks('dtm',{}, {maxBytes:2}),[]);
  assert.deepEqual(selectedEvidenceLinks('dtm',{}, {maxLinks:0}),[]);
});

test('malicious IDs cannot escape a path segment or manufacture encoded traversal or external links',()=>{
  const invalid=['../admin','..','%2Fadmin','x/y','x?token=secret','x#secret','https://evil.invalid','x\\y','x\nsecret','__proto__','constructor','x'.repeat(129)];
  const records={courses:[...invalid.map(id=>course(id)),{id:'safe',meetings:invalid.map(id=>({id})),grades:[{id:'kept'}]}]};
  const links=selectedEvidenceLinks('dtm',records,{maxLinks:200,maxBytes:20000});
  assert.ok(links.includes('/dtm/course/safe/grades#grade-kept'));
  assert.doesNotMatch(JSON.stringify(links),/admin|secret|evil|%25|__proto__|constructor|x{129}/);
  assert.ok(links.every(url=>url.startsWith('/dtm')&&!url.startsWith('//')));
});

test('contradictory child parent IDs never create meeting or grade evidence anchors',()=>{
  const records={courses:[{id:'alpha',meetings:[{id:'foreign-meeting',courseId:'beta'},{id:'local-meeting',course_id:'alpha'}],grades:[{id:'foreign-grade',dtmCourseId:'beta'}]}]};
  const links=selectedEvidenceLinks('dtm',records);
  assert.ok(links.includes('/dtm/course/alpha/meetings#meeting-local-meeting'));
  assert.doesNotMatch(JSON.stringify(links),/foreign/);
});

test('native collections keep their exact curated pages without arbitrary input URL propagation',()=>{
  const primary=academicGradesPaths.transcript;
  const links=selectedEvidenceLinks('academicGrades',{url:'https://evil.invalid'},{primaryUrl:primary});
  assert.equal(links[0],primary);assert.ok(links.every(url=>Object.values(academicGradesPaths).includes(url)));
  for(const key of ['__proto__','constructor','unknown'])assert.throws(()=>selectedEvidenceLinks(key,[]),/Unknown/);
});

test('inputs are never mutated and duplicate records do not duplicate destinations',()=>{
  const selected=course('alpha');const records=deepFreeze({courses:[selected,selected]});
  const before=JSON.stringify(records),links=selectedEvidenceLinks('dtm',records);
  assert.equal(JSON.stringify(records),before);assert.equal(new Set(links).size,links.length);
  assert.deepEqual(links,selectedEvidenceLinks('dtm',records));
});
