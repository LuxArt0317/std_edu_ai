import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readDormitoryConductEvidence,dormitoryConductEvidenceMaxBytes} from '../../server/accountDormitoryConductEvidence.js';
import {selectDormitoryConductEvidence,isDormitoryConductEvidenceQuestion} from '../../server/dormitoryConductEvidenceIntent.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline-public',token:'offline-caller',user:{id:owner}};
const route='/school-affairs/services/34-2',question='Show my dormitory conduct record.';
const snapshot={userId:owner,sourceMode:'local_demo',version:3,result:'unknown'};
const payload=(result:Awaited<ReturnType<typeof readDormitoryConductEvidence>>)=>JSON.parse(result.evidence.content);
const read=(value:unknown,q=question)=>readDormitoryConductEvidence(account,{question:q,route},{load:async()=>value});

test('native dormitory intent remains separate from general conduct and ordinary housing facts',()=>{
  for(const q of [question,'What is my dormitory-conduct status?','What is my dormitory disciplinary status?','查詢我的宿舍獎懲紀錄','Show my dormitory conduct record and tuition balance.'])assert.equal(isDormitoryConductEvidenceQuestion(q,'/'),true,q);
  assert.equal(selectDormitoryConductEvidence('Is my dormitory conduct clear?',route)?.operation,false);
  for(const q of ['Show my housing application.','What is my dormitory bed number?','Show my student conduct records.','What is my tuition balance?'])assert.equal(isDormitoryConductEvidenceQuestion(q,route),false,q);
  assert.equal(selectDormitoryConductEvidence('Show my records.',route)?.from,'route');
  assert.equal(selectDormitoryConductEvidence('What is its status?','/',[{role:'user',content:question}])?.from,'history');
  assert.equal(selectDormitoryConductEvidence('What is its status?','/',[{role:'assistant',content:question}]),null);
  assert.equal(selectDormitoryConductEvidence('What is its status?','/',[{role:'user',content:question},{role:'user',content:'What is my tuition balance?'}]),null);
});

test('negated and foreign conduct requests never cause an own-account substitution',async()=>{
  assert.equal(isDormitoryConductEvidenceQuestion('Do not show my dormitory conduct records.',route),false);
  assert.equal(isDormitoryConductEvidenceQuestion('Do not show my dormitory conduct record. Show my tuition balance.',route),false);
  assert.equal(isDormitoryConductEvidenceQuestion('Do not show my tuition balance. Show my dormitory conduct record.',route),true);
  let calls=0;
  for(const q of ["Show Alice's dormitory conduct record.",'Show another student’s dormitory conduct record.',"Show my sister's dormitory conduct record.",'Show their dormitory conduct record.','Show the dormitory conduct record for Alice.']){
    const result=await readDormitoryConductEvidence(account,{question:q,route},{load:async()=>{calls++;return {snapshot};}});
    assert.equal(result.reason,'foreign_request');assert.equal(payload(result).counts.metadataRecords,null);
  }
  assert.equal(calls,0);
});

test('named Chinese owners and personal colleagues are denied without rejecting the notice meaning',async()=>{
  let calls=0;
  for(const q of ['請顯示王小明的宿舍獎懲紀錄。','請顯示王小明自己的宿舍獎懲紀錄。','請顯示王小明本人的宿舍獎懲紀錄。',
    '查看王小明本人的宿舍獎懲紀錄。','Show the dormitory conduct record for my colleague.','Show their saved dormitory conduct record.']){
    const result=await readDormitoryConductEvidence(account,{question:q,route},{load:async()=>{calls++;return {snapshot};}});
    assert.equal(result.reason,'foreign_request',q);
  }
  assert.equal(calls,0);
  for(const q of ['Show my dormitory conduct and tell me their meaning.','請顯示我的宿舍獎懲紀錄。','請查看我自己的宿舍獎懲紀錄。',
    '請顯示本人的宿舍獎懲紀錄。','我想查看我本人的宿舍獎懲紀錄。','請查看自己的宿舍獎懲紀錄。']){
    const result=await read({snapshot},q);assert.equal(result.readState,'ok',q);assert.equal(payload(result).record.result,'unknown');
  }
});

test('inline and curly-apostrophe exclusions cannot be restored by a native route or previous request',async()=>{
  let calls=0;
  for(const q of ['Don’t show my dormitory conduct record.','Show my housing fee without dormitory conduct.',
    'Show my housing application, not my dormitory conduct record.','Show my housing fee excluding dormitory conduct.',
    '查看住宿費，不含宿舍獎懲紀錄。','顯示住宿申請，排除宿舍獎懲紀錄。']){
    assert.equal(selectDormitoryConductEvidence(q,route,[{role:'user',content:question}]),null,q);
    const result=await readDormitoryConductEvidence(account,{question:q,route,history:[{role:'user',content:question}]},
      {load:async()=>{calls++;return {snapshot};}});
    assert.equal(result.reason,'unrelated_question',q);
  }
  assert.equal(calls,0);
  for(const q of ['Don’t show my housing fee. Show my dormitory conduct record.',
    'Show my dormitory conduct record without my housing fee.','不要顯示住宿費。查看我的宿舍獎懲紀錄。'])
    assert.equal(selectDormitoryConductEvidence(q,route)?.reason,null,q);
});

test('saved empty, saved unknown and successful missing metadata remain three distinct literal states',async()=>{
  for(const literal of ['empty','unknown']){
    const result=await read({snapshot:{...snapshot,result:literal}}),body=payload(result);
    assert.equal(result.readState,'ok');assert.equal(body.metadataState,'saved');assert.deepEqual(body.record,{result:literal});
    assert.equal(body.counts.metadataRecords,1);assert.equal(body.provenance.sourceMode,'local_demo');
    assert.equal(body.capability.officialClearance,false);assert.equal(body.capability.detailedEntries,false);
    assert.doesNotMatch(result.evidence.content,/"(?:userId|version)"\s*:|offline-caller|offline-public/);
    assert.deepEqual(result.evidence.urls,[route]);assert.ok(Buffer.byteLength(JSON.stringify(result))<=dormitoryConductEvidenceMaxBytes);
  }
  const missing=await read({snapshot:null}),body=payload(missing);
  assert.equal(missing.readState,'ok');assert.equal(body.metadataState,'missing');assert.equal(body.record,null);assert.equal(body.counts.metadataRecords,0);
});

test('document requests preserve unsupported capability without inventing an issued file or a clearance',async()=>{
  const result=await read({snapshot:{...snapshot,result:'empty'}},'Show my dormitory conduct notice and its downloadable certificate.');
  assert.equal(payload(result).selection.document,true);assert.equal(payload(result).capability.document,false);
  assert.deepEqual(result.evidence.urls,[route]);assert.equal(payload(result).record.result,'empty');
});

test('mutations and malformed/foreign routes do not perform native reads',async()=>{
  let calls=0;
  for(const [q,path] of [['Delete my dormitory conduct record.',route],[question,route+'?user_id='+other],[question,'https://evil.invalid'+route],[question,route+'#owner='+other]]){
    const result=await readDormitoryConductEvidence(account,{question:q,route:path},{load:async()=>{calls++;return {snapshot};}});
    assert.equal(result.readState,'unavailable');assert.equal(payload(result).record,null);
  }
  assert.equal(calls,0);
});

test('immutable minimal caller capture excludes target-user/admin inputs and caps the native deadline',async()=>{
  const mutable={...account,user:{id:owner},targetUserId:other,admin:true};
  const pending=readDormitoryConductEvidence(mutable,{question,route},{load:async selected=>{
    assert.deepEqual(Object.keys(selected).sort(),['key','requestDeadline','token','url','user']);
    assert.deepEqual(selected.user,{id:owner});assert.equal(selected.token,'offline-caller');assert.equal(selected.url,account.url);
    assert.ok(Object.isFrozen(selected));assert.ok(Object.isFrozen(selected.user));assert.ok(selected.requestDeadline!<=Date.now()+8000);
    return {snapshot};
  }});
  mutable.user.id=other;mutable.token='changed';mutable.url='https://evil.invalid';assert.equal((await pending).readState,'ok');
});

test('invalid options, coercible identity and normalized paths fail before any native transport',async()=>{
  let calls=0,coercions=0;
  const deps={load:async()=>{calls++;return {snapshot};}};
  for(const invalid of [null,[],42]){
    // @ts-expect-error Deliberately malformed runtime boundary input.
    const result=await readDormitoryConductEvidence(account,invalid,deps);assert.equal(result.reason,'invalid_options');
  }
  // @ts-expect-error Deliberately nonprimitive runtime account identity.
  const result=await readDormitoryConductEvidence({...account,user:{id:{toString:()=>{coercions++;return owner;}}}},{question,route},deps);
  assert.equal(result.reason,'unauthorized');assert.equal(coercions,0);
  for(const path of ['/school-affairs/services/45-1/../34-2','/school-affairs/services/45-1/%2e%2e/34-2','//stu.best'+route]){
    const denied=await readDormitoryConductEvidence(account,{question,route:path},deps);assert.equal(denied.reason,'invalid_route');
  }
  assert.equal(calls,0);
});

test('foreign, malformed, detailed and admin snapshots fail without an absence claim or private field leakage',async()=>{
  const invalid=[null,[],{snapshot:undefined},{snapshot,extra:true},{record:snapshot},
    ...[{userId:other},{sourceMode:'official'},{version:0},{version:'3'},{result:null},{result:'populated'},{result:''},{result:0},{result:[]},{rows:[]},{id:other},{createdAt:'2026-01-01T00:00:00Z'}].map(patch=>({snapshot:{...snapshot,...patch}}))];
  for(const value of invalid){const result=await read(value);assert.equal(result.reason,'invalid_records');assert.equal(payload(result).metadataState,'unavailable');assert.equal(payload(result).counts.metadataRecords,null);assert.equal(payload(result).record,null);}
});

test('read failures, access denial and deadlines remain unavailable rather than missing/empty metadata',async()=>{
  for(const [error,reason] of [[new Error('PRIVATE provider error'),'read_failed'],[Object.assign(new Error('PRIVATE denied'),{status:403}),'access_denied']] as const){
    const result=await readDormitoryConductEvidence(account,{question,route},{load:async()=>{throw error;}});
    assert.equal(result.reason,reason);assert.equal(payload(result).counts.metadataRecords,null);assert.doesNotMatch(result.evidence.content,/PRIVATE/);
  }
  let calls=0;
  for(const deadline of [Date.now()-1,NaN]){
    const result=await readDormitoryConductEvidence(account,{question,route,deadline},{load:async()=>{calls++;return {snapshot};}});assert.equal(result.readState,'unavailable');
  }
  assert.equal(calls,0);
  const timed=await readDormitoryConductEvidence(account,{question,route,deadline:Date.now()+30},{load:()=>new Promise(()=>{})});assert.equal(timed.reason,'deadline_exceeded');
});

test('actual native loader makes one exact caller-filtered GET, with no administrator/RPC/write path',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/affairs_dormitory_conduct');
    assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.get('limit'),'2');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer offline-caller');
    return Response.json([{id:'20000000-0000-4000-8000-000000000001',user_id:owner,source_mode:'local_demo',version:3,result:'empty',
      created_at:'2026-11-14T00:00:00Z',updated_at:'2026-11-14T00:00:00Z',deleted_at:null}]);
  };
  try{const result=await readDormitoryConductEvidence(account,{question,route});assert.equal(result.readState,'ok');assert.equal(payload(result).record.result,'empty');assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
