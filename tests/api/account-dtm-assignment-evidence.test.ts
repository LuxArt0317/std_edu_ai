import assert from 'node:assert/strict';
import test from 'node:test';
import {readDtmAssignmentEvidence,parseDtmAssignmentEvidence,dtmAssignmentEvidenceMaxBytes} from '../../server/accountDtmAssignmentEvidence.js';
import {dtmAssignmentLookupContext as select} from '../../server/dtmAssignmentEvidenceIntent.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
const owner='79000000-0000-4000-8000-000000000001',course='79000000-0000-4000-8000-000000000101',assignment='79000000-0000-4000-8000-000000000201';
const route='/dtm/course/'+course+'/assignment/'+assignment,account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC_KEY',token:'SYNTHETIC_TOKEN',user:{id:owner}};
const raw=()=>({assignment:{id:assignment,userId:owner,courseId:course,title:'Sampling comparison',details:'Compare stratified and systematic sampling.',dueAt:'2026-11-17T18:30:00+08:00',status:'submitted' as const,submittedAt:'2026-11-15T08:00:00+08:00',sourceMode:'personal' as const,meetingId:null,origin:'manual' as const}});
const options={question:'Show my assignment instructions and due date.',route};
test('literal native metadata is paired with exact assignment and omits unrequested tracker and identity fields',async()=>{
  let calls=0;
  const result=await readDtmAssignmentEvidence(account,options,{load:async(caller,target)=>{calls++;assert.equal(caller.user.id,owner);assert.deepEqual(target,{courseId:course,assignmentId:assignment});return raw();}});
  const p=parseDtmAssignmentEvidence(result);assert.ok(p);assert.equal(result.readState,'ok');assert.equal(calls,1);
  assert.deepEqual(p.record,{sourceMode:'personal',title:'Sampling comparison',details:'Compare stratified and systematic sampling.',dueAt:'2026-11-17T18:30:00+08:00'});
  assert.doesNotMatch(result.evidence.content,/SYNTHETIC|79000000-0000-4000-8000-000000000001/);
  assert.doesNotMatch(JSON.stringify(p.record),/meetingId|origin|submittedAt/);
  const answer=formatSupplementalAccountAnswers([result],options);assert.match(answer.answer,/Compare stratified/);assert.match(answer.answer,/2026-11-17T18:30:00\+08:00/);assert.equal(answer.citations[0].url,route);
});
test('exact route/edit and paired IDs select, while stale other-topic history and separate file reports do not',()=>{
  assert.deepEqual(select('When is it due?',route+'/edit').selection?.fields,['title','dueAt']);
  for(const q of ['Show my assignment deadline for completion.','Show my assignment deadline for submission.'])assert.deepEqual(select(q,route).selection?.fields,['title','dueAt']);
  assert.equal(select('When is it due?',route,[{role:'user',content:'What is my tuition balance?'}]).selection,null);
  assert.equal(select('Show my saved assignment files.',route).selection,null);
  assert.equal(select('Show assignment feedback and grade.',route).selection,null);
  assert.equal(select("Show Alice’s dormitory bed assignment.",'/school-affairs/services/34-1').selection,null);
  assert.equal(select('Which assignments are unfinished?','/dtm/assignments').selection,null);
  const explicit=select('Show instructions for this assignment. Course ID '+course+' assignment ID '+assignment,'.');
  assert.equal(explicit.selection?.reason,'invalid_route');
  assert.equal(select('Show assignment instructions course ID '+course+' assignment ID '+assignment,'/').selection?.courseId,course);
  assert.equal(select('Show assignment instructions for course ID '+course+' assignment ID '+assignment,'/').selection?.courseId,course);
  assert.equal(select('Show assignment instructions course ID '+course+' assignment ID '+assignment+' assignment ID '+owner,route).selection?.reason,'ambiguous_selector');
  assert.equal(select('Show assignment instructions course ID '+course+' assignment ID '+assignment+'-invalid',route).selection?.reason,'ambiguous_selector');
});
test('foreign, mutation, malformed targets and ambiguous named assignments stop before native transport',async()=>{
  for(const question of ['Show my friend’s assignment due date.','What is the assignment deadline for Alice?',"Show QA123’s assignment instructions.","Show Alice’s instructions.",'Show her due date.','王小明的作業截止時間是什麼？','Show the assignment details for my mother.','Change my assignment deadline.','Show my assignment instructions and delete it.','Show assignment "Other paper" instructions.','Show assignment ID ABC instructions.']){
    let calls=0;const result=await readDtmAssignmentEvidence(account,{question,route},{load:async()=>{calls++;return raw();}});
    assert.equal(result.readState,'unavailable',question);assert.equal(calls,0,question);
  }
  for(const bad of [route+'/../edit',route+'?user_id='+owner,route.replace('/assignment/','/%2e%2e/assignment/'),'https://example.com'+route]){
    let calls=0;const result=await readDtmAssignmentEvidence(account,{...options,route:bad},{load:async()=>{calls++;return raw();}});assert.equal(calls,0,bad);assert.equal(result.reason,'invalid_route');
  }
});
test('formatter rejects forged timestamps, capability flags and unselected private fields',async()=>{
  const result=await readDtmAssignmentEvidence(account,options,{load:async()=>raw()});
  for(const mutate of [(p:any)=>{p.record.dueAt='2026-02-30T18:30:00Z';},(p:any)=>{p.capabilities.write=0;},(p:any)=>{p.record.privateName='PRIVATE';},(p:any)=>{p.record.trackerStatus='submitted';}]){
    const forged=structuredClone(result),payload=JSON.parse(forged.evidence.content);mutate(payload);forged.evidence.content=JSON.stringify(payload);
    assert.equal(parseDtmAssignmentEvidence(forged),null);assert.throws(()=>formatSupplementalAccountAnswers([forged]),TypeError);
  }
});
test('coordinated negatives exclude fields without discarding an independently requested fee clause',()=>{
  assert.equal(select('Do not show my assignment instructions and due date.',route).selection,null);
  assert.deepEqual(select('Show my assignment due date but not instructions.',route).selection?.fields,['title','dueAt']);
  assert.deepEqual(select('Do not show my assignment instructions, then show the assignment due date.',route).selection?.fields,['title','dueAt']);
  assert.equal(select('Do not show my assignment details and my tuition balance.',route).otherQuestion,'');
  assert.equal(select('Show my assignment due date but do not show my tuition balance.',route).otherQuestion,'');
  assert.equal(select('Show my assignment details and my tuition balance.',route).otherQuestion,'my tuition balance');
});
test('null deadline, blank instructions, empty record and failed reads remain distinct',async()=>{
  const empty=await readDtmAssignmentEvidence(account,options,{load:async()=>({assignment:null})});assert.equal(empty.readState,'empty');assert.equal(parseDtmAssignmentEvidence(empty)?.recordPresent,false);
  const failed=await readDtmAssignmentEvidence(account,options,{load:async()=>{throw Error('SECRET');}});assert.equal(failed.readState,'unavailable');assert.equal(parseDtmAssignmentEvidence(failed)?.recordPresent,null);assert.doesNotMatch(failed.evidence.content,/SECRET/);
  const row=raw();Object.assign(row.assignment,{details:'',dueAt:null});
  const result=await readDtmAssignmentEvidence(account,options,{load:async()=>row});assert.deepEqual(parseDtmAssignmentEvidence(result)?.record,{sourceMode:'personal',title:row.assignment.title,details:'',dueAt:null});
  const answer=formatSupplementalAccountAnswers([result],options);assert.match(answer.answer,/\(blank\)/);assert.match(answer.answer,/No deadline is recorded/);assert.doesNotMatch(answer.answer,/you are late|unlimited time/iu);
});
test('tracker values require explicit request and never establish a real file submission',async()=>{
  const result=await readDtmAssignmentEvidence(account,{question:'Show the personal tracker status and tracker submitted time for this assignment.',route},{load:async()=>raw()});
  assert.deepEqual(parseDtmAssignmentEvidence(result)?.record,{sourceMode:'personal',title:raw().assignment.title,trackerStatus:'submitted',trackerSubmittedAt:raw().assignment.submittedAt});
  assert.match(formatSupplementalAccountAnswers([result]).answer,/Tracker status does not prove a committed file/);
});
test('strict own native DTO rejects mismatched linkage, extra fields and getters without invoking accessors',async()=>{
  for(const key of ['id','userId','courseId']){const row=raw();row.assignment[key as 'id']='79000000-0000-4000-8000-000000000099';const result=await readDtmAssignmentEvidence(account,options,{load:async()=>row});assert.equal(result.reason,'invalid_records');}
  let accesses=0;const row=raw();Object.defineProperty(row.assignment,'details',{get(){accesses++;return 'SECRET';}});
  const result=await readDtmAssignmentEvidence(account,options,{load:async()=>row});assert.equal(result.reason,'invalid_records');assert.equal(accesses,0);
  const extra={...raw().assignment,privateProfile:'SECRET'};assert.equal((await readDtmAssignmentEvidence(account,options,{load:async()=>({assignment:extra})})).reason,'invalid_records');
});
test('bounded whole fields, deadlines and immutable caller capture survive oversized or hung reads',async()=>{
  const row=raw();row.assignment.details='文'.repeat(8000);
  const result=await readDtmAssignmentEvidence(account,options,{load:async()=>row});assert.ok(Buffer.byteLength(JSON.stringify(result))<=dtmAssignmentEvidenceMaxBytes);assert.equal(result.readState,'partial');assert.deepEqual(parseDtmAssignmentEvidence(result)?.omittedFields,['details']);
  let calls=0;assert.equal((await readDtmAssignmentEvidence(account,{...options,deadline:Date.now()-1},{load:async()=>{calls++;return raw();}})).reason,'deadline_exceeded');assert.equal(calls,0);
  const hung=await readDtmAssignmentEvidence(account,{...options,deadline:Date.now()+15},{load:async()=>new Promise(()=>{})});assert.equal(hung.reason,'deadline_exceeded');
  const mutable=structuredClone(account);let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let captured='';
  const pending=readDtmAssignmentEvidence(mutable,options,{load:async caller=>{await gate;captured=caller.token;return raw();}});mutable.token='CHANGED';mutable.user.id='79000000-0000-4000-8000-000000000099';release();await pending;assert.equal(captured,'SYNTHETIC_TOKEN');
});
test('default native transport uses the exact caller-only assignment RPC without management or Storage',async()=>{
  const previous=globalThis.fetch,calls:any[]=[];globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init});return Response.json(raw());};
  try{assert.equal((await readDtmAssignmentEvidence(account,options)).readState,'ok');assert.equal(calls.length,1);assert.equal(calls[0].url,account.url+'/rest/v1/rpc/dtm_course_content_assignment');
    assert.deepEqual(JSON.parse(calls[0].init.body),{p_course_id:course,p_assignment_id:assignment});assert.equal(calls[0].init.headers.Authorization,'Bearer SYNTHETIC_TOKEN');assert.equal(calls[0].init.redirect,'error');}
  finally{globalThis.fetch=previous;}
});
