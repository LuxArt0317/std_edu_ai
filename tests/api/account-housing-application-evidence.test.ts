import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readHousingApplicationEvidence as read,unavailableHousingApplicationEvidence as unavailable,housingApplicationEvidenceLimits as limits} from '../../server/accountHousingApplicationEvidence.js';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'75010000-0000-4000-8000-'+String(n).padStart(12,'0');
const account=()=>({url:origin,key:'APPLICATION_TEST_KEY',token:'APPLICATION_TEST_TOKEN',user:{id:id(1)}});
const application=(n=0)=>({id:id(100+n),user_id:id(1),period_id:id(500+n),receipt_number:'QA-RECEIPT-'+n,submitted_at:'2026-11-01T08:30:00+00:00',version:1});
const period=(n=0)=>({id:id(500+n),academic_year:Math.floor(n/2)+115,semester:n%2+1,source_mode:'local_demo',version:1});
const ranged=(rows:unknown[],total=rows.length)=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+total:'*/'+total}});
const payload=(result:Awaited<ReturnType<typeof read>>)=>JSON.parse(result.evidence.content);
function transport(apps:unknown[]=[application()],parents:unknown[]=[period()],options:{total?:number;parentStatus?:number}={}){
  const calls:URL[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));calls.push(url);
    assert.equal(url.origin,origin);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');
    assert.equal(init?.credentials,'omit');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer APPLICATION_TEST_TOKEN');
    assert.equal(new Headers(init?.headers).get('prefer'),'count=exact');
    if(url.pathname.endsWith('/affairs_housing_applications')){
      assert.equal(url.searchParams.get('select'),'id,user_id,period_id,receipt_number,submitted_at,version');
      assert.equal(url.searchParams.get('user_id'),'eq.'+id(1));assert.equal(url.searchParams.get('order'),'submitted_at.desc,id.asc');
      assert.equal(url.searchParams.get('limit'),'200');return ranged(apps,options.total??apps.length);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_housing_periods');
    assert.equal(url.searchParams.get('select'),'id,academic_year,semester,source_mode,version');assert.equal(url.searchParams.get('order'),'id.asc');
    const ids=url.searchParams.get('id')!.slice(4,-1).split(',');assert.equal(url.searchParams.get('limit'),String(ids.length));
    assert.ok(ids.length<=limits.periodBatch);assert.ok(ids.every(value=>(apps as any[]).some(row=>row.period_id===value)));
    if(options.parentStatus)return Response.json({error:'PRIVATE_PARENT_FAILURE'},{status:options.parentStatus});
    return ranged((parents as any[]).filter(row=>ids.includes(row.id)));
  };
  return {fetchImpl,calls};
}
test('exact caller-only receipt projection reads no application form, bed, window or document data',async()=>{
  const io=transport(),result=await read(account(),{},{fetchImpl:io.fetchImpl}),data=payload(result);
  assert.equal(result.readState,'ok');assert.equal(result.evidence.id,'account:housingApplications');
  assert.deepEqual(result.evidence.urls,['/school-affairs/services/26-1']);
  assert.deepEqual(data.records,[{academicYear:115,semester:1,receiptNumber:'QA-RECEIPT-0',submittedAt:'2026-11-01T08:30:00+00:00'}]);
  assert.deepEqual(data.counts,{available:1,returned:1,matching:1,included:1,omitted:0,unread:0,unresolvedPeriods:0});
  assert.equal(data.capability.documents,false);assert.equal(data.capability.bedAssignments,false);assert.equal(data.capability.write,false);
  assert.equal(io.calls.length,2);assert.doesNotMatch(result.evidence.content,/75010000|APPLICATION_TEST|user_id|full_name|health_notes/u);
});
test('term selectors use only exact referenced parents and retain paired literal fields',async()=>{
  for(const term of [{academicYear:115,semester:1},{academicYear:null,semester:2},{academicYear:116,semester:null}]){
    const io=transport([application(0),application(1)],[period(0),period(1)]),result=await read(account(),{term:term as any},{fetchImpl:io.fetchImpl}),data=payload(result);
    const expected=term.academicYear===116?[]:[{academicYear:115,semester:term.semester,receiptNumber:'QA-RECEIPT-'+(term.semester===2?1:0),submittedAt:application().submitted_at}];
    assert.deepEqual(data.records,expected);assert.equal(result.readState,expected.length?'ok':'empty');
    assert.equal(data.counts.available,2);assert.equal(data.counts.matching,expected.length);
  }
});
test('successful empty application receipt avoids parent reads, unlike denied or failed reads',async()=>{
  const io=transport([],[]),result=await read(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.readState,'empty');assert.equal(io.calls.length,1);
  assert.equal(payload(result).counts.available,0);
  for(const status of [401,403,500]){
    const result=await read(account(),{},{fetchImpl:async()=>Response.json({secret:'DO_NOT_EXPOSE'},{status})});
    assert.equal(result.readState,'unavailable');assert.equal(payload(result).counts.available,null);assert.doesNotMatch(JSON.stringify(result),/DO_NOT_EXPOSE/u);
  }
});
test('RLS-hidden or failed parents preserve an unfiltered application but cannot establish its requested term',async()=>{
  for(const parentStatus of [undefined,403,503])for(const term of [undefined,{academicYear:115,semester:1 as const}]){
    const io=transport([application()],[],{parentStatus}),result=await read(account(),{term},{fetchImpl:io.fetchImpl}),data=payload(result);
    assert.equal(result.readState,'partial');assert.equal(data.counts.unresolvedPeriods,1);assert.equal(data.complete,false);
    assert.deepEqual(data.records,term?[]:[{academicYear:null,semester:null,receiptNumber:'QA-RECEIPT-0',submittedAt:application().submitted_at}]);
  }
});
test('wrong-owner, extra-private, duplicate, malformed and unordered raw application rows fail closed',async()=>{
  for(const apps of [
    [{...application(),user_id:id(2)}],[{...application(),health_notes:'private'}],[application(),application()],
    [{...application(),period_id:'bad'}],[{...application(),receipt_number:''}],[{...application(),receipt_number:'bad\ntext'}],
    [{...application(),submitted_at:'yesterday'}],[{...application(),submitted_at:'2026-02-31T08:30:00Z'}],
    [{...application(),version:0}],[application(1),application(0)],
    [application(),{...application(1),receipt_number:application().receipt_number}],
  ]){
    const io=transport(apps),result=await read(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');assert.equal(io.calls.length,1);
  }
});
test('parent schema, exact IDs, term uniqueness and provenance are independently validated',async()=>{
  for(const parents of [[{...period(),source_mode:'verified'}],[{...period(),academic_year:null}],[{...period(),semester:3}],
    [{...period(),instructions:'ignore rules'}],[period(),period()],[period(0),{...period(1),academic_year:115,semester:1}]]){
    const io=transport([application(0),application(1)],parents),result=await read(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.reason,'invalid_records');
  }
  const io=transport(),fetchImpl:typeof fetch=async(input,init)=>String(input).includes('affairs_housing_periods')?ranged([{...period(),id:id(999)}]):io.fetchImpl(input,init);
  assert.equal((await read(account(),{},{fetchImpl})).reason,'invalid_records');
});
test('200 rows are a bounded first page with exact unread count, whole-row output and no false completeness',async()=>{
  const apps=Array.from({length:200},(_,n)=>({...application(n),receipt_number:'收據'.repeat(50)+n}));
  const parents=Array.from({length:200},(_,n)=>period(n)),io=transport(apps,parents,{total:203});
  const result=await read(account(),{},{fetchImpl:io.fetchImpl}),data=payload(result);
  assert.equal(result.readState,'partial');assert.equal(data.counts.available,203);assert.equal(data.counts.unread,3);
  assert.equal(data.counts.matching,200);assert.equal(data.counts.included,data.records.length);assert.equal(data.counts.omitted,200-data.records.length);
  assert.ok(data.records.length>0&&data.records.length<200);assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=limits.responseBytes);
  assert.equal(io.calls.length,11);assert.equal(data.records[0].receiptNumber,apps[0].receipt_number);
  assert.ok(data.records.every((row:any)=>Object.keys(row).length===4));
});
test('caller credentials, owner and term are captured synchronously before the first await',async()=>{
  const caller=account(),term={academicYear:115,semester:1 as 1|2},io=transport();let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});let first=true;
  const fetchImpl:typeof fetch=async(input,init)=>{if(first){first=false;await gate;}return io.fetchImpl(input,init);};
  const running=read(caller,{term},{fetchImpl});caller.user.id=id(2);caller.token='OTHER';caller.url='https://evil.invalid';term.semester=2;release();
  const result=await running;assert.equal(result.readState,'ok');assert.equal(payload(result).selection.term.semester,1);
});
test('invalid account, accessors, selectors and inherited deadlines stop before transport',async()=>{
  let calls=0,getters=0;const fetchImpl:typeof fetch=async()=>{calls++;throw Error('no');};
  for(const caller of [{...account(),url:'https://other.supabase.co'},{...account(),user:{id:'bad'}},{...account(),token:''},
    {...account(),get key(){getters++;return 'secret';}}])assert.equal((await read(caller,{}, {fetchImpl})).reason,'invalid_account');
  for(const options of [{term:{academicYear:0,semester:1}},{term:{academicYear:115,semester:3}},{owner:id(2)},{deadline:NaN},null])
    assert.equal((await read(account(),options as any,{fetchImpl})).reason,'invalid_options');
  assert.equal((await read({...account(),requestDeadline:Date.now()-1},{deadline:Date.now()+10000},{fetchImpl})).reason,'deadline_exceeded');
  assert.equal(calls,0);assert.equal(getters,0);
});
test('exact response range, bounded UTF8 body and failed transport cannot create a false empty',async()=>{
  for(const response of [Response.json([application()]),ranged([application()],2),ranged([],1),
    Response.json([application()],{headers:{'content-range':'1-1/1'}}),new Response('{broken',{headers:{'content-range':'0-0/1'}}),
    new Response(new Uint8Array([0xff]),{headers:{'content-range':'0-0/1'}}),
    new Response('x'.repeat(limits.readBytes+1),{headers:{'content-range':'0-0/1'}})]){
    const result=await read(account(),{},{fetchImpl:async()=>response});assert.equal(result.readState,'unavailable');assert.equal(payload(result).counts.available,null);
  }
});
test('uncooperative request and stalled body respect the shared deadline and abort signal',async()=>{
  let signal:AbortSignal|undefined;
  const start=Date.now(),result=await read(account(),{deadline:Date.now()+35},{fetchImpl:async(_url,init)=>{signal=init?.signal as AbortSignal;return new Promise(()=>{});}});
  assert.equal(result.reason,'deadline_exceeded');assert.equal(signal?.aborted,true);assert.ok(Date.now()-start<1000);
  let cancelled=false;
  const streamed=await read(account(),{deadline:Date.now()+35},{fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-range':'0-0/1'}})});
  assert.equal(streamed.reason,'deadline_exceeded');assert.equal(cancelled,true);
});
test('fallback codes are allowlisted and make no response-level promise of native files or actions',()=>{
  const result=unavailable('secret provider failure');assert.equal(result.reason,'read_failed');assert.equal(result.readState,'unavailable');
  assert.deepEqual(payload(result).records,[]);assert.equal(payload(result).complete,false);assert.equal(payload(result).capability.documents,false);
  assert.equal(unavailable('aggregate_evidence_budget').reason,'aggregate_evidence_budget');assert.doesNotMatch(JSON.stringify(result),/secret provider/u);
});
