import test from 'node:test';
import assert from 'node:assert/strict';
import {readHousingBedEvidence as nativeRead,housingBedEvidenceLimits as limits,housingBedEvidencePath as path,unavailableHousingBedEvidence} from '../../server/accountHousingBedEvidence.js';
import type {HousingBedEvidencePayload,HousingBedEvidenceOptions,HousingBedEvidenceAccount} from '../../server/accountHousingBedEvidence.js';

const owner='34000000-0000-4000-8000-000000000001',foreign='34000000-0000-4000-8000-000000000002';
const id=(n:number)=>'34010000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const assignments=()=>[
  {id:id(1),user_id:owner,period_id:id(101),bed_number:'QA-A-305',version:1,dormitory:'QA East Hall',bunk:'upper',accommodation_fee:8500.25,deposit:0,subsidy_amount:null},
  {id:id(2),user_id:owner,period_id:id(102),bed_number:'QA-B-207',version:2,dormitory:'QA West Hall',bunk:null,accommodation_fee:null,deposit:1200.5,subsidy_amount:500},
];
const periods=()=>[
  {id:id(101),academic_year:115,semester:1,source_mode:'local_demo',version:1},
  {id:id(102),academic_year:114,semester:2,source_mode:'local_demo',version:3},
];
const full:HousingBedEvidenceOptions={fields:['dormitory','bunk','accommodationFee','deposit','subsidyAmount']};
const read=(caller:HousingBedEvidenceAccount,options:HousingBedEvidenceOptions,io:{fetchImpl:typeof fetch})=>nativeRead(caller,options,{fetchImpl:io.fetchImpl});
const payload=(out:Awaited<ReturnType<typeof read>>):HousingBedEvidencePayload=>JSON.parse(out.evidence.content);
const response=(rows:unknown[],total=rows.length,range=rows.length?`0-${rows.length-1}/${total}`:`*/${total}`)=>Response.json(rows,{headers:{'content-range':range}});
type Row=Record<string,unknown>;
function transport(settings:{rows?:Row[];parents?:Row[];total?:number;override?:(url:URL,rows:Row[])=>Response|Promise<Response>|undefined}={}){
  const calls:{url:URL;init:RequestInit|undefined}[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));calls.push({url,init});
    const isAssignment=url.pathname==='/rest/v1/affairs_housing_assignments';
    assert.ok(isAssignment||url.pathname==='/rest/v1/affairs_housing_periods');
    const source:Row[]=isAssignment?settings.rows??assignments():(settings.parents??periods()).filter(row=>url.searchParams.get('id')?.includes(String(row.id)));
    const keys=url.searchParams.get('select')!.split(',');
    const rows=source.map(row=>Object.fromEntries(keys.map(key=>[key,row[key]])));
    return await settings.override?.(url,rows)??response(rows,isAssignment?settings.total??rows.length:rows.length);
  };return {calls,fetchImpl};
}

test('default reads exact own assignments and referenced parents; no money or application fields enter transport or evidence',async()=>{
  const io=transport(),out=await read(account,{},io),data=payload(out);
  assert.equal(io.calls.length,2);assert.equal(out.readState,'ok');assert.equal(out.evidence.id,'account:housing');assert.equal(out.evidence.url,path);assert.deepEqual(out.evidence.urls,[path]);
  assert.deepEqual([...io.calls[0].url.searchParams],[['select','id,user_id,period_id,bed_number,version,dormitory,bunk'],['user_id','eq.'+owner],['order','id.asc'],['limit','200']]);
  assert.deepEqual([...io.calls[1].url.searchParams],[['select','id,academic_year,semester,source_mode,version'],['id',`in.(${id(101)},${id(102)})`],['order','id.asc'],['limit','2']]);
  for(const {url,init}of io.calls){assert.equal(url.origin,account.url);assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.deepEqual([...new Headers(init?.headers)],[['apikey','OFFLINE_KEY'],['authorization','Bearer OFFLINE_TOKEN'],['prefer','count=exact']]);}
  assert.deepEqual(data.records,[{academicYear:115,semester:1,bedNumber:'QA-A-305',dormitory:'QA East Hall',bunk:'upper'},{academicYear:114,semester:2,bedNumber:'QA-B-207',dormitory:'QA West Hall',bunk:null}]);
  assert.deepEqual(data.counts,{available:2,returned:2,matching:2,included:2,omitted:0,unread:0,unresolvedPeriods:0});assert.equal(data.complete,true);
  assert.doesNotMatch(JSON.stringify(data.records),/user_id|period_id|version|accommodation|deposit|subsidy|OFFLINE|email|contact/u);
  assert.deepEqual(data.provenance,{sourceMode:'local_demo',officialUniversityData:false,synchronized:false});assert.equal(data.capability.currentResidence,false);assert.equal(data.capability.payment,false);assert.equal(data.capability.currency,false);
});

test('explicit fields preserve paired literal zero/null/cents without calculation, currency or identity',async()=>{
  const io=transport(),data=payload(await read(account,full,io));
  assert.deepEqual(data.records,[{academicYear:115,semester:1,bedNumber:'QA-A-305',dormitory:'QA East Hall',bunk:'upper',accommodationFee:8500.25,deposit:0,subsidyAmount:null},{academicYear:114,semester:2,bedNumber:'QA-B-207',dormitory:'QA West Hall',bunk:null,accommodationFee:null,deposit:1200.5,subsidyAmount:500}]);
  const narrow=transport(),selected=payload(await read(account,{fields:['deposit']},narrow));
  assert.equal(narrow.calls[0].url.searchParams.get('select'),'id,user_id,period_id,bed_number,version,deposit');
  assert.deepEqual(selected.records[0],{academicYear:115,semester:1,bedNumber:'QA-A-305',deposit:0});
});

test('exact year/semester and semester-only matching preserve original paired metadata; absent matches are complete only after a full read',async()=>{
  for(const term of [{academicYear:114,semester:2 as const},{academicYear:null,semester:2 as const},{academicYear:114,semester:null}]){
    const data=payload(await read(account,{...full,term},transport()));assert.equal(data.readState,'ok');assert.equal(data.records.length,1);assert.equal(data.records[0].bedNumber,'QA-B-207');assert.equal(data.counts.matching,1);assert.equal(data.counts.available,2);
  }
  const data=payload(await read(account,{term:{academicYear:113,semester:1}},transport()));assert.equal(data.readState,'empty');assert.equal(data.complete,true);assert.equal(data.counts.available,2);assert.equal(data.counts.matching,0);
});

test('successful no assignment receipt is empty and makes no parent read; unavailable/denied never claim empty',async()=>{
  const io=transport({rows:[]}),data=payload(await read(account,{},io));assert.equal(io.calls.length,1);assert.equal(data.readState,'empty');assert.equal(data.counts.available,0);assert.equal(data.complete,true);
  for(const status of [401,403,404,429,500]){const failed=payload(await read(account,{},transport({override:()=>new Response('PRIVATE_REPLY',{status})})));assert.equal(failed.readState,'unavailable');assert.equal(failed.reason,[401,403].includes(status)?'access_denied':'read_failed');assert.equal(failed.counts.available,null);assert.deepEqual(failed.records,[]);assert.equal(failed.complete,false);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_REPLY/u);}
});

test('hidden or denied parent retains unfiltered own bed as partial; unknown term does not become an exact match',async()=>{
  for(const io of [transport({parents:[periods()[0]]}),transport({override:url=>url.pathname.endsWith('_periods')?new Response('PRIVATE',{status:403}):undefined})]){
    const data=payload(await read(account,{},io));assert.equal(data.readState,'partial');assert.equal(data.reason,'period_metadata_unavailable');assert.equal(data.complete,false);assert.equal(data.records.length,2);assert.equal(data.records[1].academicYear,null);assert.equal(data.records[1].semester,null);assert.ok(data.counts.unresolvedPeriods!>0);
  }
  const data=payload(await read(account,{term:{academicYear:114,semester:2}},transport({parents:[periods()[0]]})));assert.equal(data.readState,'partial');assert.equal(data.counts.matching,0);assert.equal(data.counts.unresolvedPeriods,1);assert.equal(data.records.length,0);
});

test('200-row cap and whole-row UTF8 budget have exact counts; referenced period batches remain bounded and exclusive',async()=>{
  const rows=Array.from({length:200},(_,i)=>({...assignments()[0],id:id(i+1),period_id:id(i+1001),bed_number:`QA-${i}`,dormitory:'界'.repeat(80)}));
  const parents=rows.map((row,i)=>({id:row.period_id,academic_year:Math.floor(i/2)+1,semester:i%2+1,source_mode:'local_demo',version:1}));
  const io=transport({rows,parents,total:201}),out=await read(account,full,io),data=payload(out);
  assert.equal(io.calls.length,11);assert.equal(data.readState,'partial');assert.equal(data.counts.available,201);assert.equal(data.counts.returned,200);assert.equal(data.counts.unread,1);assert.equal(data.counts.matching,200);assert.ok(data.counts.omitted!>0);assert.equal(data.counts.included+data.counts.omitted!,200);assert.equal(data.records.length,data.counts.included);assert.equal(data.excerpted,true);assert.equal(data.complete,false);
  assert.ok(Buffer.byteLength(JSON.stringify(out))<=limits.responseBytes);
  for(const {url}of io.calls.slice(1)){assert.equal(url.searchParams.get('limit'),'20');assert.equal(url.searchParams.get('id')?.split(',').length,20);}
  const small=payload(await read(account,{},transport({total:3,override:(url,r)=>url.pathname.endsWith('_assignments')?response(r,3):undefined})));assert.equal(small.readState,'unavailable'); // A truncated under-cap receipt is not a real cap.
});

test('wrong owner, duplicate IDs/periods, invalid fields and extra private keys fail closed',async()=>{
  for(const change of [{user_id:foreign},{id:'not-id'},{version:0},{bed_number:'../outside'},{dormitory:''},{bunk:'middle'},{deposit:'0'},{deposit:-1},{deposit:1.001},{deposit:10000000.01}]){
    const bad=payload(await read(account,full,transport({rows:[{...assignments()[0],...change}]})));assert.equal(bad.readState,'unavailable');assert.equal(bad.reason,'invalid_records');
  }
  for(const rows of [[assignments()[1],assignments()[0]],[assignments()[0],assignments()[0]],[assignments()[0],{...assignments()[1],period_id:id(101)}]])assert.equal((await read(account,full,transport({rows}))).reason,'invalid_records');
  const io=transport({override:(url,rows)=>url.pathname.endsWith('_assignments')?response(rows.map(row=>({...row,contact_phone:'PRIVATE'}))):undefined});assert.equal((await read(account,{},io)).reason,'invalid_records');
});

test('referenced-parent identity, exact schema, source and unique term bindings are validated',async()=>{
  for(const change of [{id:id(999)},{academic_year:0},{academic_year:301},{academic_year:'115'},{semester:3},{source_mode:'official'},{version:0},{instructions:'PRIVATE'}]){
    const io=transport({override:(url,rows)=>url.pathname.endsWith('_periods')?response([{...rows[0],...change},...rows.slice(1)]):undefined});const data=payload(await read(account,{},io));assert.equal(data.readState,'unavailable');assert.equal(data.reason,'invalid_records');
  }
  const duplicate=periods();duplicate[1].academic_year=115;duplicate[1].semester=1;assert.equal((await read(account,{},transport({parents:duplicate}))).reason,'invalid_records');
});

test('malformed or contradictory HTTP receipts, redirected response, JSON and UTF8 are rejected',async()=>{
  for(const range of ['', '*/2','0-1/*','1-2/2','0-0/2','0-1/1','0-1/9007199254740992'])assert.equal((await read(account,{},transport({override:(_u,r)=>response(r,r.length,range)}))).reason,'invalid_records');
  for(const make of [()=>new Response(null,{status:204}),()=>new Response('{',{headers:{'content-range':'0-1/2'}}),()=>new Response(new Uint8Array([0xff]),{headers:{'content-range':'0-1/2'}}),()=>response([],1),()=>new Response(null,{status:302,headers:{location:'https://foreign.example'}})])assert.equal((await read(account,{},transport({override:make}))).readState,'unavailable');
});

test('invalid options/account and accessor/nonprimitive selectors perform no native reads or coercions',async()=>{
  const io=transport();let accesses=0;const getter=Object.defineProperty({},'id',{get(){accesses++;return owner;}});
  for(const value of [null,[],{...account,user:getter},{...account,user:{id:{toString(){accesses++;return owner;}}}},{...account,url:account.url+'/'},{...account,token:''},{...account,key:'OFFLINE\nKEY'}])assert.equal((await read(value as HousingBedEvidenceAccount,{},io)).reason,'invalid_account');
  const fieldGetter:string[]=[];Object.defineProperty(fieldGetter,'0',{get(){accesses++;return 'deposit';}});
  for(const options of [null,[],{fields:['email']},{fields:['deposit','deposit']},{fields:fieldGetter},{fields:new Array(1)},{fields:['dormitory'],userId:foreign},{term:{academicYear:115}},{term:{academicYear:115,semester:0}},{term:{academicYear:'115',semester:1}},{deadline:NaN},{deadline:Infinity}])assert.equal((await read(account,options as HousingBedEvidenceOptions,io)).reason,'invalid_options');
  assert.equal(accesses,0);assert.equal(io.calls.length,0);
});

test('caller, credentials, field/term scope and injected transport are captured before I/O',async()=>{
  const mutable=structuredClone(account),options:HousingBedEvidenceOptions={fields:['deposit'],term:{academicYear:115,semester:1},deadline:Date.now()+1000},io=transport(),dependencies={fetchImpl:io.fetchImpl};
  const pending=nativeRead(mutable,options,dependencies);mutable.user.id=foreign;mutable.token='FOREIGN_TOKEN';mutable.url='https://foreign.example';options.fields!.push('accommodationFee');options.term!.academicYear=114;options.deadline=0;dependencies.fetchImpl=async()=>{throw new Error('PRIVATE_WRONG_TRANSPORT');};
  const data=payload(await pending);assert.equal(data.readState,'ok');assert.deepEqual(data.records,[{academicYear:115,semester:1,bedNumber:'QA-A-305',deposit:0}]);assert.equal(io.calls[0].url.searchParams.get('user_id'),'eq.'+owner);assert.equal(new Headers(io.calls[0].init?.headers).get('authorization'),'Bearer OFFLINE_TOKEN');
});

test('inherited deadline is non-extendable and an uncooperative fetch or response stream remains bounded',async()=>{
  const io=transport();assert.equal((await read({...account,requestDeadline:Date.now()-1},{deadline:Date.now()+10000},io)).reason,'deadline_exceeded');assert.equal(io.calls.length,0);
  let signal:AbortSignal|null|undefined;const never:typeof fetch=async(_u,init)=>{signal=init?.signal;return new Promise(()=>{});};assert.equal((await read(account,{deadline:Date.now()+25},{fetchImpl:never})).reason,'deadline_exceeded');assert.equal(signal?.aborted,true);
  let cancelled=0;const stalled:typeof fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-range':'0-0/1'}});assert.equal((await read(account,{deadline:Date.now()+25},{fetchImpl:stalled})).reason,'deadline_exceeded');assert.equal(cancelled,1);
  let settle:(response:Response)=>void=()=>{};const pending=read(account,{deadline:Date.now()+25},{fetchImpl:async()=>new Promise(resolve=>{settle=resolve;})});assert.equal((await pending).reason,'deadline_exceeded');settle(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,2);
});

test('oversized bodies cancel and safe fallback never includes internal errors or credentials',async()=>{
  let cancelled=0;const io=transport({override:()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(limits.readBytes+1));},cancel(){cancelled++;}}),{headers:{'content-range':'0-0/1'}})});assert.equal((await read(account,{},io)).reason,'invalid_records');assert.equal(cancelled,1);
  const out=await read(account,{},transport({override:()=>{throw new Error('PRIVATE_FAILURE OFFLINE_TOKEN');}}));assert.equal(out.reason,'read_failed');assert.doesNotMatch(JSON.stringify(out),/PRIVATE_FAILURE|OFFLINE_TOKEN/u);
  const fallback=payload(unavailableHousingBedEvidence('PRIVATE_REASON'));assert.equal(fallback.reason,'read_failed');assert.equal(fallback.selection,null);assert.equal(fallback.counts.available,null);assert.equal(fallback.complete,false);
});
