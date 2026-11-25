import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  studentLeaveLookupContext, studentLeaveBasePath,
} from '../../server/studentLeaveEvidenceIntent.js';
import {readStudentLeaveEvidence,studentLeaveEvidenceLimits} from '../../server/accountStudentLeaveEvidence.js';
import {
  leaveFixtureOwner as owner,leaveFixtureForeign as foreign,leaveFixtureRow as rowId,
  leaveFixtureOtherRow as otherId,leaveFixtureReview as reviewId,leaveFixtureClock,
  studentLeaveNativeCases as cases,
} from './student-leave-native-cases.mjs';

const path=studentLeaveBasePath;
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLIC_KEY',token:'OFFLINE_VERIFIED_CALLER'};
const rawRow={
  id:rowId,user_id:owner,service_key:'leave',record_type:'leave',
  starts_on:'2026-11-09',ends_on:'2026-11-10',status:'filed',leave_category:'personal',periods:'週一08:10、週二09:10',
  review_request_id:reviewId,notes:'STUDENT_PRIVATE_REASON',contact_phone:'STUDENT_PRIVATE_PHONE',
  leave_time_period:null,title:'Raw title',updated_at:'2026-11-10T01:00:00.000Z',
};
const rowFor=(url,row)=>Object.fromEntries(url.searchParams.get('select').split(',').map(key=>[key,row[key]]));
const packet=result=>JSON.parse(result.evidence.content);
const rangeResponse=(rows,total=rows.length)=>Response.json(rows,{
  status:total>rows.length?206:200,
  headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+total:'*/'+total},
});
const selectionFor=(q,route=path+'/history')=>studentLeaveLookupContext(q,route,[],leaveFixtureClock).selection;
const calls=[];
const read=(selection,respond)=>{
  calls.length=0;
  return readStudentLeaveEvidence(account,{selection},{fetchImpl:async (url,init)=>{
    calls.push({url,init});
    assert.equal(url.origin,account.url);
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer '+account.token);
    assert.equal(init.headers.apikey,account.key);
    assert.equal(init.headers.Prefer,'count=exact');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    return await respond(url,init);
  }});
};
const primary='/rest/v1/affairs_service_records';
const reviews='/rest/v1/affairs_service_requests';

for(const item of cases)test('scope '+item.id,()=>{
  const context=studentLeaveLookupContext(item.question,item.route,item.history??[],leaveFixtureClock);
  assert.equal(context.otherQuestion,item.residual??'');
  assert.equal(context.excluded,item.excluded??false);
  assert.equal(context.navigation,item.navigation??false);
  if(item.reason){
    assert.equal(context.selection?.reason,item.reason);
    assert.deepEqual(context.selection.fields,[]);
  }else if(item.view){
    assert.equal(context.selection?.reason,null);
    assert.equal(context.selection.view,item.view);
    assert.equal(context.selection.id,item.recordId??null);
    assert.equal(context.selection.countOnly,item.countOnly??false);
    assert.deepEqual(context.selection.range,item.from?{from:item.from,through:item.through}:null);
    assert.deepEqual(context.selection.fields,item.fields);
  }else assert.equal(context.selection,null);
});

test('selector carries explicit excluded dates and blocks ambiguous targeting before transport',()=>{
  assert.deepEqual(selectionFor('Show my leave dates and status but do not show dates.').fields,['status']);
  const malformed=selectionFor('Show my leave dates on 2026-02-30');
  assert.equal(malformed.reason,'ambiguous_selector');
  const mixed=studentLeaveLookupContext('Show Alice’s leave status and my leave dates.',path+'/history',[],leaveFixtureClock);
  assert.equal(mixed.foreign,true);
  assert.equal(mixed.selection.question,'my leave dates');
  assert.deepEqual(mixed.selection.fields,['dates']);
  const excluded=studentLeaveLookupContext('Do not show my leave dates and my leave status.',path+'/history',[],leaveFixtureClock);
  assert.equal(excluded.selection,null);
  assert.equal(excluded.excluded,true);
});

test('one bounded own GET projects just the requested dates and excludes model-private payload',async()=>{
  const answer=await read(selectionFor('Show my leave dates'),url=>{
    assert.equal(url.pathname,primary);
    assert.equal(url.searchParams.get('service_key'),'eq.leave');
    assert.equal(url.searchParams.get('record_type'),'eq.leave');
    assert.equal(url.searchParams.get('select'),'id,user_id,service_key,record_type,starts_on,ends_on');
    assert.equal(url.searchParams.get('and'),null);
    return rangeResponse([rowFor(url,rawRow)]);
  });
  assert.equal(calls.length,1);
  assert.equal(answer.readState,'ok');
  assert.equal(answer.evidence.url,path+'/history');
  assert.deepEqual(packet(answer).records,[{startsOn:'2026-11-09',endsOn:'2026-11-10'}]);
  assert.doesNotMatch(answer.evidence.content,/STUDENT_PRIVATE|OFFLINE_VERIFIED_CALLER|11900000/);
});

test('archive uses the native cutoff and only overlapping exact bounded dates',async()=>{
  const selected=selectionFor('Show my archived leave dates from 2019-07-20 to 2019-08-02');
  const answer=await read(selected,url=>{
    assert.equal(url.searchParams.get('and'),'(starts_on.lt.2019-08-01,starts_on.lte.2019-08-02,ends_on.gte.2019-07-20)');
    return rangeResponse([rowFor(url,{...rawRow,starts_on:'2019-07-31',ends_on:'2019-08-02'})]);
  });
  assert.equal(answer.evidence.url,path+'/archive');
  assert.deepEqual(packet(answer).records,[{startsOn:'2019-07-31',endsOn:'2019-08-02'}]);
  const wrong=await read(selected,url=>rangeResponse([rowFor(url,{...rawRow,starts_on:'2019-08-01',ends_on:'2019-08-02'})]));
  assert.equal(wrong.reason,'invalid_records');
  assert.deepEqual(packet(wrong).records,[]);
});

test('exact edit view uses caller plus exact row, returns no proofs for a different row',async()=>{
  const selected=selectionFor('Show my leave dates',path+'/edit/'+rowId);
  const success=await read(selected,url=>{
    assert.equal(url.searchParams.get('id'),'eq.'+rowId);
    assert.equal(url.searchParams.get('limit'),'1');
    return rangeResponse([rowFor(url,rawRow)]);
  });
  assert.equal(success.evidence.url,path+'/edit/'+rowId);
  const wrong=await read(selected,url=>rangeResponse([rowFor(url,{...rawRow,id:otherId})]));
  assert.equal(wrong.readState,'unavailable');
  assert.equal(wrong.reason,'invalid_records');
  assert.deepEqual(packet(wrong).records,[]);
});

test('explicit review reads only the bound local general request and leaves row status and decision absent',async()=>{
  const answer=await read(selectionFor('Is my leave approved?',path+'/edit/'+rowId),url=>{
    if(url.pathname===primary){
      assert.equal(url.searchParams.get('select'),'id,user_id,service_key,record_type,starts_on,ends_on,review_request_id');
      return rangeResponse([rowFor(url,rawRow)]);
    }
    assert.equal(url.pathname,reviews);
    assert.equal(url.searchParams.get('select'),'id,user_id,request_type,status');
    assert.equal(url.searchParams.get('request_type'),'eq.general');
    assert.equal(url.searchParams.get('id'),'in.('+reviewId+')');
    return rangeResponse([{id:reviewId,user_id:owner,request_type:'general',status:'resolved'}]);
  });
  assert.equal(calls.length,2);
  assert.equal(answer.readState,'ok');
  assert.deepEqual(packet(answer).records,[{reviewStatus:'resolved',reviewState:'saved'}]);
  assert.equal(packet(answer).provenance.officialUniversityData,false);
  assert.doesNotMatch(answer.evidence.content,new RegExp(reviewId));
});

test('unlinked, missing, foreign and denied local review remain distinct and do not cancel valid dates',async()=>{
  const selected=selectionFor('Show my leave dates and review status');
  const unlinked=await read(selected,url=>rangeResponse([rowFor(url,{...rawRow,review_request_id:null})]));
  assert.equal(calls.length,1);
  assert.deepEqual(packet(unlinked).records,[{startsOn:'2026-11-09',endsOn:'2026-11-10',reviewStatus:null,reviewState:'no_request'}]);
  for(const reviewReply of [
    rangeResponse([]),
    rangeResponse([{id:reviewId,user_id:foreign,request_type:'general',status:'resolved'}]),
    new Response('',{status:403}),
  ]){
    const result=await read(selected,url=>url.pathname===primary?rangeResponse([rowFor(url,rawRow)]):reviewReply);
    assert.equal(calls.length,2);
    assert.equal(result.readState,'partial');
    assert.equal(result.reason,'review_unavailable');
    assert.deepEqual(packet(result).records,[{startsOn:'2026-11-09',endsOn:'2026-11-10',reviewStatus:null,reviewState:'unavailable'}]);
  }
});

test('short rows, foreign owner, false ranges, provider denial and malformed content are unavailable, never empty',async()=>{
  const selected=selectionFor('Show my leave dates on 2026-11-10');
  for(const response of [
    url=>rangeResponse([rowFor(url,{...rawRow,user_id:foreign})]),
    url=>rangeResponse([rowFor(url,{...rawRow,service_key:'internship'})]),
    url=>rangeResponse([rowFor(url,{...rawRow,starts_on:'2026-11-11',ends_on:'2026-11-13'})]),
    url=>rangeResponse([rowFor(url,rawRow)],2),
    ()=>Response.json([], {headers:{'content-range':'*/1'}}),
    ()=>Response.json([{id:rowId}],{headers:{'content-range':'0-0/1'}}),
    ()=>new Response('bad',{status:200,headers:{'content-range':'0-0/1'}}),
    ()=>new Response('forbidden',{status:403}),
    ()=>new Response('unreachable',{status:503}),
  ]){
    const result=await read(selected,response);
    assert.equal(result.readState,'unavailable');
    assert.equal(packet(result).counts.matching,null);
    assert.deepEqual(packet(result).records,[]);
  }
  const empty=await read(selected,()=>rangeResponse([]));
  assert.equal(empty.readState,'empty');
  assert.equal(packet(empty).counts.matching,0);
});

test('a count-only read verifies exact count without sending row fields to the model',async()=>{
  const chosen=selectionFor('How many saved leave requests did I have this month?');
  const answer=await read(chosen,url=>{
    assert.equal(url.searchParams.get('limit'),'1');
    assert.equal(url.searchParams.get('and'),'(starts_on.lte.2026-11-30,ends_on.gte.2026-11-01)');
    return rangeResponse([rowFor(url,rawRow)],17);
  });
  assert.equal(answer.readState,'ok');
  assert.equal(packet(answer).counts.matching,17);
  assert.equal(packet(answer).counts.unread,0);
  assert.equal(packet(answer).selection.countOnly,true);
  assert.deepEqual(packet(answer).records,[]);
});

test('category and saved-status subsets are filtered before count, and approval subsets cannot use row counts',async()=>{
  const selected=selectionFor('How many draft sick leaves did I have this month?');
  assert.equal(selected.countOnly,true);
  assert.deepEqual(selected.filters,{categories:{included:['sick'],excluded:[]},statuses:{included:['draft'],excluded:[]}});
  const correct=await read(selected,url=>{
    assert.equal(url.searchParams.get('and'),'(starts_on.lte.2026-11-30,ends_on.gte.2026-11-01,leave_category.in.(sick),status.in.(draft))');
    assert.equal(url.searchParams.get('select'),'id,user_id,service_key,record_type,starts_on,ends_on,status,leave_category');
    return rangeResponse([rowFor(url,{...rawRow,leave_category:'sick',status:'draft'})],3);
  });
  assert.equal(correct.readState,'ok');
  assert.equal(packet(correct).counts.matching,3);
  assert.deepEqual(packet(correct).records,[]);
  const incorrect=await read(selected,url=>rangeResponse([rowFor(url,rawRow)],17));
  assert.equal(incorrect.readState,'unavailable');
  assert.equal(packet(incorrect).counts.matching,null);
  assert.equal(selectionFor('How many approved sick leave requests did I have?').reason,'unsupported_field');
  assert.equal(selectionFor('How many sick or personal leaves did I have?').reason,'ambiguous_selector');
});

test('category exclusion narrows rows without hiding unrelated fields or authorizing foreign scope',async()=>{
  const selection=selectionFor('Show my leave dates but do not show sick leave');
  assert.deepEqual(selection.fields,['dates']);
  assert.deepEqual(selection.filters.categories,{included:[],excluded:['sick']});
  const valid=await read(selection,url=>{
    assert.equal(url.searchParams.get('and'),'(leave_category.not.in.(sick))');
    return rangeResponse([rowFor(url,rawRow)]);
  });
  assert.equal(valid.readState,'ok');
  assert.deepEqual(packet(valid).records,[{startsOn:'2026-11-09',endsOn:'2026-11-10'}]);
  const bad=await read(selection,url=>rangeResponse([rowFor(url,{...rawRow,leave_category:'sick'})]));
  assert.equal(bad.readState,'unavailable');
});

test('bounded rows preserve exact count and do not present an incomplete list as complete',async()=>{
  const {rows}=studentLeaveEvidenceLimits;
  const answer=await read(selectionFor('Show my leave dates'),url=>rangeResponse(
    Array.from({length:rows},(_,index)=>rowFor(url,{...rawRow,id:'11900000-0000-4000-8000-'+String(index).padStart(12,'0')})),rows+3));
  assert.equal(answer.readState,'partial');
  assert.equal(answer.reason,'row_limit');
  assert.equal(packet(answer).counts.matching,rows+3);
  assert.equal(packet(answer).counts.included,rows);
  assert.equal(packet(answer).counts.unread,3);
});

test('foreign/malformed scopes, expired/deceptive options, and accessor inputs do not start transport',async()=>{
  let started=0,accessed=0;
  const traps={fetchImpl:async()=>{started++;throw new Error('invalid request reached transport');}};
  const selected=selectionFor('Show my leave dates');
  for(const options of [
    {selection:selectionFor('Show Alice’s leave dates')},
    {selection:{...selected,userId:foreign}},
    {selection:{...selected,fields:['notes']}},
    {selection:{...selected,range:{from:'2026-02-30',through:'2026-03-01'}}},
    {selection:selected,deadline:Date.now()-1},
    {selection:Object.defineProperty({...selected},'id',{get(){accessed++;return rowId;}})},
  ]){
    assert.equal((await readStudentLeaveEvidence(account,options,traps)).readState,'unavailable');
  }
  assert.equal((await readStudentLeaveEvidence({...account,url:'https://example.invalid'},{selection:selected},traps)).reason,'invalid_account');
  assert.equal(started,0);
  assert.equal(accessed,0);
});

test('hung provider returns deadline failure and makes one attempted read',async()=>{
  let calls=0;
  const result=await readStudentLeaveEvidence(account,{selection:selectionFor('Show my leave dates'),deadline:Date.now()+150},
    {fetchImpl:async()=>{calls++;return new Promise(()=>{});}});
  assert.equal(calls,1);
  assert.equal(result.reason,'deadline_exceeded');
  assert.deepEqual(packet(result).records,[]);
});

test('source dependencies inventory excludes writes, account setup and wide student snapshot',async()=>{
  const source=await readFile(new URL('../../server/accountStudentLeaveEvidence.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/affairs_initialize_account|loadAffairsSnapshot|affairs_manage_service_record|method:'POST'/u);
});

test('exact UUIDs cannot be misread as another student or an undeclared date',()=>{
  for(const id of ['a8212233-86ab-4001-a010-7fdd00223344','77112233-2026-4110-a010-7fdd00223344']){
    const question='Show my leave dates for '+id;
    const ordinary=studentLeaveLookupContext(question).selection;
    assert.equal(ordinary.reason,null);
    assert.equal(ordinary.view,'record');
    assert.equal(ordinary.id,id);
    assert.equal(ordinary.range,null);
    const prior=studentLeaveLookupContext('Status?','/',[{role:'user',content:question}]).selection;
    assert.equal(prior.reason,null);
    assert.equal(prior.id,id);
    const dated=studentLeaveLookupContext(question+' on 2026-11-10').selection;
    assert.deepEqual(dated.range,{from:'2026-11-10',through:'2026-11-10'});
    assert.equal(studentLeaveLookupContext('Show leave dates for Alice '+id).selection.reason,'foreign_request');
  }
});
