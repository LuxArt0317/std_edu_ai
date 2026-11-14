import assert from 'node:assert/strict';
import {permanentCoursesPath} from '../../src/features/public/affairs/permanentCourseRouting.js';

const origin=process.env.PERMANENT_COURSE_API_ORIGIN??'https://stu.best';
if(origin==='https://stu.best'){
  const revision=process.env.EXPECTED_RELEASE_REVISION??'';
  assert.match(revision,/^[a-f0-9]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10_000)});
  assert.equal((await response.json()).revision,revision);
}
const api=origin+'/api/affairs-data?scope=permanent-courses';
async function read(query,status=200,method='GET'){
  const response=await fetch(api+query,{method,signal:AbortSignal.timeout(25_000)});
  assert.equal(response.status,status,`${method} ${query}`);
  return response.json();
}
const defaults=await read('');
assert.equal(defaults.rows.length,50);
assert.equal(defaults.total,50);
assert.equal(defaults.rows[0].code,'AAJ00101');
assert.deepEqual(defaults.divisions.map(option=>option.value),['U','G','J']);
const filtered=await read('&kind=IM&division=U&page=1');
assert.ok(filtered.total>50);
assert.equal(filtered.rows[0].display_sequence,51);
const keyword=await read('&kind=IM&division=U&keyword=IMU00101');
assert.deepEqual(keyword.rows.map(row=>row.code),['IMU00101']);
assert.equal((await read('&kind=AA&division=G')).total,0);
await read('&code=ABC123',404);
await read('&code=IMU00101&code=AAJ00101',400);
await read('&kind=QQ&division=U',400);
await read('',405,'POST');
const code=process.env.PERMANENT_COURSE_DESCRIPTION_CODE??'IMU00101';
assert.match(code,/^[A-Z]{2}[UGJ]\d{5}$/);
const first=await read('&code='+code);
assert.equal(first.description.code,code);
assert.ok(first.description.title);
assert.deepEqual(await read('&code='+code),first);
for(const [question,suffix] of [[`Tell me about ${code}`,'?course='+code],['永久課程簡介在哪裡','']]){
  const response=await fetch(origin+'/api/research-assistant',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),signal:AbortSignal.timeout(30_000),
  });
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'answered');
  assert.equal(result.grounding.webSearched,false);
  assert.ok(result.answer.includes(`](${permanentCoursesPath+suffix})`));
}
console.log(`Permanent courses HTTP passed: catalog search, anonymous access boundaries, persisted description ${code}, and bilingual assistant links.`);
