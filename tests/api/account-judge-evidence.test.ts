import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccountJudgeEvidence} from '../../server/accountJudgeEvidence.js';
const id='10000000-0000-4000-8000-000000000001';
const account={user:{id},url:'https://test.supabase.co',key:'PRIVATEKEY',token:'PRIVATETOKEN'};
const row={id:'survey-faq-q03',version:2,scope:'account',question:'Can I see my real-time tuition and fee payment status?',route:'/school-affairs/services/39-1'};
const run={caseId:row.id,caseVersion:2,scope:'account',question:row.question,actor:{id},verification:{status:'verified'},views:[{amount:'invented'}]};
const snapshot={checkedAt:'2026-11-25T00:00:00.000Z',profile:{userId:id},studentRecordFound:true,charges:[]};
test('owned current charge read requires exact projection and ignores saved views and verification',async()=>{
 let reads=0;const result=await resolveAccountJudgeEvidence(account,run,row,{loadCharges:async(caller,options)=>{reads++;assert.equal(caller.user.id,id);assert.equal(options?.requireExactProjection,true);assert.ok(options!.deadline!<=Date.now()+5000);return snapshot;}});
 assert.equal(reads,1);assert.ok(result.evidence.some(item=>item.id==='account:charges'));
 assert.equal(result.summary.actorAttested,false);assert.equal(result.summary.temporalComparability,'current-reconstruction-only');
 assert.doesNotMatch(JSON.stringify(result),/invented|PRIVATEKEY|PRIVATETOKEN/u);
 assert.equal(result.summary.routeResolution,'explicit_matching_case_snapshot');
});
test('different caller, missing auth and case/route drift never read records',async()=>{
 const loadCharges=async()=>assert.fail('unauthorized read');
 for(const [caller,item,version] of [[null,run,row],[account,{...run,actor:{id:'foreign'}},row],[account,run,{...row,version:3}],[account,{...run,route:'/dtm'},row],[account,run,null]] as const){
  const result=await resolveAccountJudgeEvidence(caller,item,version,{loadCharges});assert.deepEqual(result.evidence,[]);assert.ok(result.summary.reason);
 }
});
test('failed and crossed-owner reads stay unavailable rather than empty',async()=>{
 for(const loadCharges of [async()=>{throw Error('SECRET transport');},async()=>({...snapshot,profile:{userId:'foreign'}})]){
  const result=await resolveAccountJudgeEvidence(account,run,row,{loadCharges});assert.equal(result.summary.reason,'read_unavailable');assert.deepEqual(result.evidence,[]);assert.doesNotMatch(JSON.stringify(result),/SECRET/u);
 }
});
test('actual selected amounts enter only ephemeral evidence; summary contains hashes, not account values',async()=>{
 const charges=[{id:'10000000-0000-4000-8000-000000000002',label:'Private tuition item',amountDue:12345.67,amountPaid:2345.67,currency:'TWD',sourceMode:'sample',dueOn:null,occurrenceOn:null,category:null,contactUnit:null,contactExtension:null,paymentUnit:null}];
 const result=await resolveAccountJudgeEvidence(account,{...run,route:row.route},row,{loadCharges:async()=>({...snapshot,charges})});
 assert.equal(result.summary.reason,null);
 const record=JSON.parse(result.evidence.find(item=>item.id==='account:charges')!.content);
 assert.equal(record.records[0].amountDue,12345.67);assert.equal(record.records[0].amountPaid,2345.67);
 assert.doesNotMatch(JSON.stringify(result.summary),/Private tuition|12345|2345|PRIVATEKEY|PRIVATETOKEN/u);
 assert.ok(result.summary.sources.every((item:any)=>/^[a-f0-9]{64}$/u.test(item.checksum)));
});
test('only exact current or retained case versions resolve; no silent current-version fallback',async()=>{
 const {accountJudgeCaseSnapshot}=await import('../../server/accountJudgeEvidence.js');
 assert.equal(accountJudgeCaseSnapshot({cases:[{...row,version:3}]},run),null);
 assert.equal(accountJudgeCaseSnapshot({cases:[{...row,version:3}],referenceHistory:[{...row,id:undefined,caseId:row.id}]},run)?.route,row.route);
 assert.equal(accountJudgeCaseSnapshot({cases:[row],referenceHistory:[{...row,id:undefined,caseId:row.id,route:'/dtm'}]},run),null);
});

test('leave grading reconstructs only caller-scoped request counts, never approval or attendance totals',async()=>{
 const {readStudentLeaveEvidence}=await import('../../server/accountStudentLeaveEvidence.js');
 const leaveCase={...row,id:'survey-faq-q12',question:'How many leaves have I already used?',route:'/school-affairs/services/leave/history'};
 const leaveRun={...run,caseId:leaveCase.id,question:leaveCase.question,route:leaveCase.route};
 let reads=0;
 const result=await resolveAccountJudgeEvidence({...account,url:'https://xiftudmvxphxcjtmfmib.supabase.co'},leaveRun,leaveCase,{
  loadCharges:async()=>assert.fail('No tuition lookup for leave grading'),
  loadLeaves:async(caller,options)=>readStudentLeaveEvidence(caller,options,{fetchImpl:async(input,init)=>{
   reads++;const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/affairs_service_records');
   assert.equal(url.searchParams.get('user_id'),'eq.'+id);
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer PRIVATETOKEN');
   return Response.json([],{headers:{'content-range':'*/0'}});
  }}),
 });
 assert.equal(reads,1);assert.equal(result.summary.reason,null);
 const payload=JSON.parse(result.evidence[0].content);
 assert.equal(payload.counts.matching,0);assert.equal(payload.selection.countOnly,true);
 assert.equal(payload.selection.range,null);assert.deepEqual(payload.selection.filters.statuses,{included:[],excluded:[]});
 assert.equal(result.summary.selection,'current_caller_leave_records_only');
 assert.doesNotMatch(JSON.stringify(result.summary),/PRIVATETOKEN|PRIVATEKEY|"matching":|"records":/u);
 let forbidden=0;
 const denied=await resolveAccountJudgeEvidence(account,{...leaveRun,actor:{id:'foreign'}},leaveCase,{loadLeaves:async()=>{forbidden++;throw Error('forbidden');}});
 assert.equal(forbidden,0);assert.equal(denied.summary.reason,'different_or_missing_actor');
});

const timetableCase={...row,id:'survey-faq-q13',question:'What is my class schedule?',route:'/school-affairs/services/11-2'};
const timetableRun={...run,caseId:timetableCase.id,question:timetableCase.question,route:timetableCase.route};
const timetable=(linked=true,courses:any[]=[])=>({profile:{userId:id},checkedAt:snapshot.checkedAt,source:'stu.best School Affairs' as const,officialUniversityData:false as const,studentRecordFound:linked,courses,
 completeness:{courses:{scope:'owned_enrolled_timetable' as const,returned:courses.length,complete:linked,cap:200 as const,reason:linked?null:'student_unlinked' as const,meaning:'Owned bounded timetable only'}}});
test('timetable grading retains explicit empty versus unlinked coverage and reads only the current caller',async()=>{
 for(const linked of [true,false]){
  let calls=0;
  const result=await resolveAccountJudgeEvidence(account,timetableRun,timetableCase,{loadCharges:async()=>assert.fail('No charges'),loadTimetable:async(caller,options)=>{
   calls++;assert.equal(caller.user.id,id);assert.ok(options!.deadline!<=Date.now()+5000);return timetable(linked);
  }});
  assert.equal(calls,1);assert.equal(result.summary.reason,null);assert.equal(result.summary.selection,'current_caller_timetable_only');
  const data=JSON.parse(result.evidence.find(item=>item.id==='account:courses')!.content);
  assert.equal(data.studentRecordFound,linked);assert.equal(data.readerCoverage.complete,linked);assert.equal(data.readerCoverage.reason,linked?null:'student_unlinked');
  assert.doesNotMatch(JSON.stringify(result.summary),/PRIVATETOKEN|PRIVATEKEY|studentRecordFound|readerCoverage/u);
 }
});
test('timetable failures, partial/capped or crossed-owner results never become a verified empty schedule',async()=>{
 const variants=[{...timetable(),profile:{userId:'foreign'}},{...timetable(),completeness:{courses:{...timetable().completeness.courses,complete:false}}},{...timetable(),completeness:{courses:{...timetable().completeness.courses,returned:201}}}];
 for(const value of variants){const result=await resolveAccountJudgeEvidence(account,timetableRun,timetableCase,{loadTimetable:async()=>value});assert.deepEqual(result.evidence,[]);assert.equal(result.summary.reason,'read_unavailable');}
 const failure=await resolveAccountJudgeEvidence(account,timetableRun,timetableCase,{loadTimetable:async()=>{throw Error('private transport detail');}});
 assert.equal(failure.summary.reason,'read_unavailable');assert.doesNotMatch(JSON.stringify(failure),/private transport detail/u);
 const denied=await resolveAccountJudgeEvidence(account,{...timetableRun,actor:{id:'foreign'}},timetableCase,{loadTimetable:async()=>assert.fail('No foreign read')});assert.equal(denied.summary.reason,'different_or_missing_actor');
});
test('timetable fields remain ephemeral while summary exposes only source hashes and read scope',async()=>{
 const courses=[{enrollmentId:'10000000-0000-4000-8000-000000000008',status:'enrolled' as const,sourceMode:'sample' as const,code:'OFFLINE101',title:'Private timetable course',term:'Offline term',termStartsOn:'2026-09-01',termEndsOn:'2027-01-31',weekday:2,startsAt:'09:00',endsAt:'10:30',room:'PRIVATE_ROOM'}];
 const result=await resolveAccountJudgeEvidence(account,timetableRun,timetableCase,{loadTimetable:async()=>timetable(true,courses)});
 assert.equal(result.summary.reason,null);const data=JSON.parse(result.evidence.find(item=>item.id==='account:courses')!.content);
 assert.equal(data.records[0].room,'PRIVATE_ROOM');assert.equal(data.records[0].weekday,2);assert.equal(data.records[0].startsAt,'09:00');
 assert.doesNotMatch(JSON.stringify(result.summary),/PRIVATE_ROOM|OFFLINE101|Private timetable/u);
 assert.equal(result.summary.actorAttested,false);assert.equal(result.summary.temporalComparability,'current-reconstruction-only');
});
