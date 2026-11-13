import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadStudentConduct,loadStudentConductAdmin,manageStudentConductRecord,StudentConductError,studentConductFields,studentConductKinds,
  studentConductMaxPayloadBytes,studentConductMaxRecords,studentConductPayloadBytes,studentConductReadSource,studentConductTextLimits,
  validateStudentConductPayload,type StudentConductAccount,type StudentConductKind} from '../../server/studentConduct.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001';
const stamp='2030-01-02T03:04:05.123456+08:00';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:owner}} as StudentConductAccount;
const saveKind='save_student_conduct',deleteKind='delete_student_conduct';
const payload={id,user_id:owner,request_id:requestId,expected_version:0,occurred_on_text:' A literal date ',student_number:null,student_name:null,
  academic_year_text:'local year',semester_text:'term text',year_level_text:null,reason_text:'Local test reason',conduct_code:'local-code',conduct_name:'Local title',quantity_text:'0',void_status_text:null,row_order:0};
const deletion={id,user_id:owner,request_id:requestId,expected_version:1};
const row:Record<string,unknown>={...payload,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null};delete row.request_id;delete row.expected_version;
const identifier=(n:number)=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof StudentConductError&&error.status===status;
type Call={url:URL;headers:Headers;method:string;body:unknown;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){
  const saved=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=saved;}
}

test('conduct preserves nullable literal cells and Unicode bounds, with no date, quantity or status inference',()=>{
  assert.equal(validateStudentConductPayload(saveKind,payload),null);
  for(const [field,limit] of Object.entries(studentConductTextLimits)){
    for(const value of [null,'','  ','0','😀'.repeat(limit)])assert.equal(validateStudentConductPayload(saveKind,{...payload,[field]:value}),null,field);
    for(const value of [0,false,{},[],undefined,'x'.repeat(limit+1),'\0','\ud800','\udfff'])assert.ok(validateStudentConductPayload(saveKind,{...payload,[field]:value}),field);
  }
  for(const patch of [{occurred_on_text:'not a parsed date'},{academic_year_text:'unverified local label'},{quantity_text:'literal: zero'},{void_status_text:'no vocabulary inferred'},{row_order:10000}])assert.equal(validateStudentConductPayload(saveKind,{...payload,...patch}),null);
  for(const patch of [{row_order:-1},{row_order:10001},{row_order:'0'},{row_order:0.1},{row_order:null},{quantity:0},{occurred_on:'2030-01-01'},{merit_total:1},{eligible:true},{detail_url:'/private'},{download_url:'https://example.invalid/file'},{certificate_status:'issued'},{source_mode:'official'}])assert.ok(validateStudentConductPayload(saveKind,{...payload,...patch}));
});

test('both operations require exact own fields and bounded identifiers/versions before transport',async()=>{
  const fixtures:[StudentConductKind,Record<string,unknown>][]=[[saveKind,payload],[deleteKind,deletion]];
  for(const [kind,fixture] of fixtures){
    assert.equal(validateStudentConductPayload(kind,fixture),null);
    assert.equal(validateStudentConductPayload(kind,Object.assign(Object.create(null),fixture)),null);
    for(const key of Object.keys(fixture)){const missing={...fixture};delete missing[key];assert.ok(validateStudentConductPayload(kind,missing),key);}
    for(const value of [null,[],Object.create(fixture),{...fixture,extra:null},{...fixture,user_id:null},{...fixture,id:'bad'},{...fixture,request_id:requestId+'/'},{...fixture,expected_version:'1'},{...fixture,expected_version:999999999},{...fixture,expected_version:-1}])assert.ok(validateStudentConductPayload(kind,value));
  }
  assert.ok(validateStudentConductPayload(deleteKind,{...deletion,expected_version:0}));
  for(const kind of [null,undefined,{},[],'constructor','__proto__','toString','save_conduct',''])assert.ok(validateStudentConductPayload(kind,payload));
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    for(const input of [{...payload,signed_url:'unapproved'},Object.create(payload)])await assert.rejects(manageStudentConductRecord(account,saveKind,input),statusIs(400));
  });assert.equal(calls,0);
});

test('UTF8 JSONB payload budget includes escapes and envelope and distinguishes the exact boundary',()=>{
  const large:Record<string,unknown>={...payload};
  for(const [field,limit] of Object.entries(studentConductTextLimits))large[field]='\u0001'.repeat(limit);
  assert.ok(studentConductPayloadBytes(large)>studentConductMaxPayloadBytes);
  assert.match(validateStudentConductPayload(saveKind,large)!,/16000-byte/);
  let text=String(large.reason_text),replaced=0;
  while(studentConductPayloadBytes(large)>studentConductMaxPayloadBytes){text='x'.repeat(++replaced)+'\u0001'.repeat(2000-replaced);large.reason_text=text;}
  const remaining=studentConductMaxPayloadBytes-studentConductPayloadBytes(large);
  large.reason_text=['','é','界','😀','é😀'][remaining]+text.slice(remaining===4?2:remaining?1:0);
  assert.equal(studentConductPayloadBytes(large),16000);assert.equal(validateStudentConductPayload(saveKind,large),null);
  large.reason_text=String(large.reason_text).replace('x','é');assert.equal(studentConductPayloadBytes(large),16001);assert.ok(validateStudentConductPayload(saveKind,large));
  assert.equal(studentConductPayloadBytes({nested:{}}),Infinity);assert.equal(studentConductPayloadBytes({n:NaN}),Infinity);
});

test('personal reads use only caller JWT and owner filter and preserve all literal cells and microseconds',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);return json([row,{...row,id:identifier(2),reason_text:'',quantity_text:null,row_order:1}]);},async()=>{
    const result=await loadStudentConduct(account);assert.equal(result.records.length,2);assert.equal(result.records[0].userId,owner);
    assert.equal(result.records[0].occurredOnText,' A literal date ');assert.equal(result.records[0].studentNumber,null);assert.equal(result.records[0].quantityText,'0');
    assert.equal(result.records[1].quantityText,null);assert.equal(result.records[1].reasonText,'');assert.equal(result.records[0].rowOrder,0);assert.equal(result.records[0].updatedAt,stamp);
    assert.deepEqual(Object.keys(result),['records']);assert.equal(result.records[0].sourceMode,'local_demo');assert.doesNotMatch(JSON.stringify(result),/download|certificate|detailUrl/);
  });
  assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/rest/v1/affairs_student_conduct');assert.equal(calls[0].url.searchParams.get('select'),studentConductReadSource.select);
  assert.equal(calls[0].url.searchParams.get('user_id'),'eq.'+owner);assert.equal(calls[0].url.searchParams.get('deleted_at'),'is.null');assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-caller-token');
  assert.equal(calls[0].headers.get('apikey'),'synthetic-public-key');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);
  await mockFetch(()=>json([]),async()=>assert.deepEqual(await loadStudentConduct(account),{records:[]}));
});

test('malformed, foreign, deleted, repeated and unsorted rows fail closed without partial output',async()=>{
  for(const patch of [{user_id:other},{source_mode:'official'},{source_mode:'sample'},{version:0},{created_at:'2030-02-30T00:00:00Z'},{updated_at:'2030-01-01T24:00:00Z'},{updated_at:'bad'},{deleted_at:stamp},{quantity_text:0},{reason_text:undefined},{signed_url:'private'}, {row_order:-1}])
    await mockFetch(()=>json([{...row,...patch}]),async()=>assert.rejects(loadStudentConduct(account),statusIs(503)));
  for(const body of [[row,row],[{...row,id:identifier(2)},row],{records:[row]},null,Array.from({length:201},(_,i)=>({...row,id:identifier(i+1)}))])
    await mockFetch(()=>json(body),async()=>assert.rejects(loadStudentConduct(account),statusIs(503)));
});

test('administrator reads require an explicit immutable target and trusted live authorization',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    for(const options of [undefined,{},null,{userId:'bad'},{userId:owner,includeDeleted:true},Object.create({userId:owner})])await assert.rejects(loadStudentConductAdmin(account,options as {userId:string}),statusIs(400));
  });assert.equal(calls,0);
  const options={userId:other},input={...account,user:{id:owner}};
  await mockFetch(call=>{
    if(call.url.pathname.endsWith('/affairs_student_conduct_access')){options.userId=owner;input.user.id=other;input.token='mutated';return json({userId:owner,canManage:true});}
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+other);assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');return json([{...row,user_id:other}]);
  },async()=>assert.equal((await loadStudentConductAdmin(input,options)).records[0].userId,other));
  for(const access of [null,[],{userId:owner,canManage:false},{userId:other,canManage:true},{userId:owner,canManage:true,extra:true}]){
    calls=0;await mockFetch(()=>{calls++;return json(access);},async()=>assert.rejects(loadStudentConductAdmin(account,{userId:other}),statusIs(403)));assert.equal(calls,1);
  }
});

test('complete cursor pagination loads 1000 rows, verifies every page and refuses 1001 rather than truncate',async()=>{
  for(const total of [201,1000,1001]){
    let pages=0;await mockFetch(call=>{
      assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(call.url.searchParams.get('limit'),'200');assert.equal(call.url.searchParams.get('order'),'id.asc');
      const cursor=call.url.searchParams.get('id'),start=cursor?Number(cursor.slice(-12)):0;pages++;
      return json(Array.from({length:Math.min(200,total-start)},(_,i)=>({...row,id:identifier(start+i+1),row_order:total-start-i})));
    },async()=>{
      if(total>studentConductMaxRecords)await assert.rejects(loadStudentConduct(account),error=>error instanceof StudentConductError&&/complete-read limit/.test(error.message));
      else{const result=await loadStudentConduct(account);assert.equal(result.records.length,total);assert.equal(result.records[0].id,identifier(total));}
    });assert.equal(pages,Math.floor(total/200)+1);
  }
  for(const bad of [{...row,id:identifier(200)},{...row,id:identifier(201),user_id:other}]){
    let calls=0;await mockFetch(()=>json(++calls===1?Array.from({length:200},(_,i)=>({...row,id:identifier(i+1)})):[bad]),async()=>assert.rejects(loadStudentConduct(account),statusIs(503)));
  }
});

test('manager snapshots exact payload, uses caller JWT and rejects mismatched receipt identities/versions',async()=>{
  const input={...payload},calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);if(call.url.pathname.endsWith('/affairs_student_conduct_access')){input.reason_text='mutation after authorization';return json({userId:owner,canManage:true});}
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_student_conduct');assert.deepEqual(call.body,{p_kind:saveKind,p_payload:payload});return json({id,kind:saveKind,version:1,summary:'Saved literal record'});
  },async()=>assert.equal((await manageStudentConductRecord(account,saveKind,input)).version,1));assert.equal(calls.length,2);assert.equal(calls[1].headers.get('authorization'),'Bearer synthetic-caller-token');
  for(const bad of [{id:other,kind:saveKind,version:1,summary:'bad'},{id,kind:deleteKind,version:1,summary:'bad'},{id,kind:saveKind,version:2,summary:'bad'},{id,kind:saveKind,version:1,summary:'x'.repeat(201)},{id,kind:saveKind,version:1,summary:'bad',extra:true}])
    await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_student_conduct_access')?{userId:owner,canManage:true}:bad),async()=>assert.rejects(manageStudentConductRecord(account,saveKind,payload),statusIs(503)));
});

test('save and tombstone retries retain the exact request and never claim an ambiguous response succeeded',async()=>{
  for(const [kind,fixture] of [[saveKind,payload],[deleteKind,deletion]] as const){
    const calls:unknown[]=[];await mockFetch(call=>{
      if(call.url.pathname.endsWith('/affairs_student_conduct_access'))return json({userId:owner,canManage:true});
      calls.push(call.body);if(calls.length===1)throw new Error('Synthetic lost response');return json({id,kind,version:fixture.expected_version+1,summary:'Durable receipt'});
    },async()=>{
      await assert.rejects(manageStudentConductRecord(account,kind,fixture),statusIs(503));
      const retry=await manageStudentConductRecord(account,kind,fixture),replay=await manageStudentConductRecord(account,kind,fixture);assert.deepEqual(retry,replay);
    });assert.equal(calls.length,3);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
  }
});

test('HTTP errors remain bounded safe statuses, without exposing upstream row values or capabilities',async()=>{
  for(const status of [400,401,403,409,413,422,500])await mockFetch(()=>json({error:'PRIVATE provider details'},status),async()=>assert.rejects(loadStudentConduct(account),error=>error instanceof StudentConductError&&error.status===([413,422].includes(status)?400:status===500?503:status)&&!error.message.includes('PRIVATE')));
  for(const patch of [{url:'https://wrong.supabase.co'},{token:''},{key:''},{user:{id:'invalid'}},{requestDeadline:NaN}])await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadStudentConduct({...account,...patch} as StudentConductAccount)));
  await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadStudentConduct({...account,requestDeadline:Date.now()-1}),statusIs(503)));
  for(const response of [new Response('PRIVATE invalid json'),new Response('[]',{headers:{'content-length':String(4*1024*1024+1)}}),new Response(new Uint8Array([0xff]))])await mockFetch(()=>response,async()=>assert.rejects(loadStudentConduct(account),statusIs(503)));
});

test('one absolute deadline covers all pages, admin access and stalled response bodies',async()=>{
  const savedNow=Date.now;let now=1000,calls=0;Date.now=()=>now;
  try{
    await mockFetch(()=>{calls++;now=5000;return json(Array.from({length:200},(_,i)=>({...row,id:identifier(i+1)})));},async()=>assert.rejects(loadStudentConduct({...account,requestDeadline:5000}),statusIs(503)));assert.equal(calls,1);
    now=1000;calls=0;await mockFetch(()=>{calls++;now=13000;return json({userId:owner,canManage:true});},async()=>assert.rejects(manageStudentConductRecord(account,saveKind,payload),statusIs(503)));assert.equal(calls,1);
  }finally{Date.now=savedNow;}
  const savedTimeout=AbortSignal.timeout,controller=new AbortController();let cancelled=false;AbortSignal.timeout=()=>controller.signal;
  try{await mockFetch(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{
    const pending=loadStudentConduct(account),timer=setTimeout(()=>controller.abort(),1);
    try{await assert.rejects(pending,statusIs(503));assert.equal(cancelled,true);}finally{clearTimeout(timer);}
  });}finally{AbortSignal.timeout=savedTimeout;}
});

test('draft SQL matches approved fields/bounds, enforces private read and audited durable version/tombstone writes',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261112200000_student_conduct.sql',import.meta.url),'utf8');
  assert.ok(sql.includes('create table public.'+studentConductReadSource.table));
  for(const [field,limit] of Object.entries(studentConductTextLimits))assert.ok(sql.includes(`char_length(${field})<=${limit}`),field);
  for(const kind of studentConductKinds){assert.ok(sql.includes("'"+kind+"'"));assert.ok(Object.hasOwn(studentConductFields,kind));}
  assert.match(sql,/octet_length\(value::text\)>16000/);assert.match(sql,/not\(value \?& fields\) or value-fields<>'\{\}'::jsonb/);
  assert.match(sql,/deleted_at is null and \(select private\.affairs_google_identity\(\)\)/);assert.match(sql,/user_id=\(select auth\.uid\(\)\) or \(select private\.affairs_is_admin\(\)\)/);
  assert.match(sql,/grant select on public\.affairs_student_conduct to authenticated/);assert.match(sql,/alter table private\.affairs_student_conduct_operations enable row level security/);
  assert.match(sql,/new\.user_id<>old\.user_id/);assert.match(sql,/Deleted conduct IDs cannot be reused/);assert.match(sql,/where user_id=owner_id and deleted_at is null\)>=1000/);
  assert.ok(sql.indexOf('select * into receipt')<sql.indexOf('if not exists(select 1 from public.affairs_profiles'));assert.match(sql,/receipt\.payload<>p_payload/);
  assert.match(sql,/conduct:actor:/);assert.match(sql,/conduct:owner:/);assert.match(sql,/conduct:record:/);assert.match(sql,/target\.version=\$3 and target\.deleted_at is null/);
  assert.match(sql,/insert into public\.affairs_agent_audit/);assert.match(sql,/insert into private\.affairs_student_conduct_operations/);
  assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+(?:auth\.|storage\.|public\.affairs_profiles)/i);
  assert.doesNotMatch(sql,/grant (?:all|insert|update|delete).*authenticated/i);assert.doesNotMatch(sql,/insert into public\.affairs_student_conduct\s*\(/i);
});
