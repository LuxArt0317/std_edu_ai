import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadStudentLoan,loadStudentLoanAdmin,manageStudentLoanRecord,parseStudentLoanSnapshot,StudentLoanError,
  studentLoanApplicationStates,studentLoanFields,studentLoanHistoryCountMax,studentLoanKinds,studentLoanMaxPayloadBytes,
  studentLoanPayloadBytes,studentLoanReadSource,studentLoanTextLimits,validateStudentLoanPayload,
  type StudentLoanAccount,type StudentLoanKind,type StudentLoanRecord} from '../../server/studentLoan.js';
import {ownStudentLoanData} from '../../src/services/studentLoan.ts';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',stamp='2030-01-02T03:04:05.123456+08:00';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:owner}} as StudentLoanAccount;
const saveKind='save_student_loan',deleteKind='delete_student_loan';
const payload={id,user_id:owner,request_id:requestId,expected_version:0,current_term_label:' Local term ',current_application_state:'unknown',
  current_application_text:null,progress_text:'',history_count:null,history_text:'  '};
const deletion={id,user_id:owner,request_id:requestId,expected_version:1};
const raw:Record<string,unknown>={...payload,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null};delete raw.request_id;delete raw.expected_version;
const record:StudentLoanRecord={id,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,currentTermLabel:' Local term ',
  currentApplicationState:'unknown',currentApplicationText:null,progressText:'',historyCount:null,historyText:'  '};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof StudentLoanError&&error.status===status;
type Call={url:URL;headers:Headers;method:string;body:unknown;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){
  const saved=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),
    method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=saved;}
}

test('loan snapshots preserve explicit unknown, null, zero and blank independently without inferred application/history state',()=>{
  for(const state of studentLoanApplicationStates)for(const count of [null,0,1,studentLoanHistoryCountMax])
    assert.equal(validateStudentLoanPayload(saveKind,{...payload,current_application_state:state,history_count:count}),null);
  for(const [field,limit] of Object.entries(studentLoanTextLimits)){
    for(const value of [null,'','  ','0','😀'.repeat(limit),'𠮷'.repeat(limit)])assert.equal(validateStudentLoanPayload(saveKind,{...payload,[field]:value}),null,field);
    for(const value of [0,false,{},[],undefined,'x'.repeat(limit+1),'😀'.repeat(limit+1),'\0','\ud800','\udfff'])assert.ok(validateStudentLoanPayload(saveKind,{...payload,[field]:value}),field);
  }
  for(const value of [-1,1000001,0.1,'0',false,undefined,NaN,Infinity])assert.ok(validateStudentLoanPayload(saveKind,{...payload,history_count:value}));
  for(const value of [null,'','applied','approved','UNKNOWN',0,{}])assert.ok(validateStudentLoanPayload(saveKind,{...payload,current_application_state:value}));
  assert.deepEqual(parseStudentLoanSnapshot({status:'loaded',record:null},owner),{status:'loaded',record:null});
  assert.deepEqual(ownStudentLoanData({status:'loaded',record:null},owner),{status:'unavailable'});
});

test('save/delete require exact nullable fields and bounded identities/versions before any transport',async()=>{
  for(const [kind,fixture] of [[saveKind,payload],[deleteKind,deletion]] as [StudentLoanKind,Record<string,unknown>][]){
    assert.equal(validateStudentLoanPayload(kind,fixture),null);assert.equal(validateStudentLoanPayload(kind,Object.assign(Object.create(null),fixture)),null);
    assert.equal(validateStudentLoanPayload(kind,{...fixture,expected_version:999999998}),null);
    for(const key of Object.keys(fixture)){const missing={...fixture};delete missing[key];assert.ok(validateStudentLoanPayload(kind,missing),key);}
    for(const value of [null,[],Object.create(fixture),{...fixture,extra:null},{...fixture,user_id:null},{...fixture,id:'bad'},
      {...fixture,request_id:'ABCDEF00-0000-4000-8000-000000000001'},{...fixture,expected_version:'1'},{...fixture,expected_version:999999999},
      {...fixture,expected_version:-1},{...fixture,expected_version:0.1},{...fixture,source_mode:'official'},{...fixture,amount:0},
      {...fixture,document_url:'/private'},{...fixture,approved:true}])assert.ok(validateStudentLoanPayload(kind,value));
  }
  assert.ok(validateStudentLoanPayload(deleteKind,{...deletion,expected_version:0}));
  for(const kind of [null,undefined,{},[],'constructor','__proto__','toString','save_loan',''])assert.ok(validateStudentLoanPayload(kind,payload));
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    await assert.rejects(manageStudentLoanRecord(account,saveKind,{...payload,signed_url:'unapproved'}),statusIs(400));
    await assert.rejects(manageStudentLoanRecord(account,deleteKind,{...deletion,history_text:null}),statusIs(400));
  });assert.equal(calls,0);
});

test('JSONB UTF8 budget counts all envelope bytes and escapes at exactly32000 and32001 bytes',()=>{
  const large:Record<string,unknown>={...payload};for(const [field,limit] of Object.entries(studentLoanTextLimits))large[field]='\u0001'.repeat(limit);
  assert.ok(studentLoanPayloadBytes(large)>studentLoanMaxPayloadBytes);assert.match(validateStudentLoanPayload(saveKind,large)!,/32000-byte/);
  let text=String(large.current_application_text),replaced=0;
  while(studentLoanPayloadBytes(large)>studentLoanMaxPayloadBytes){text='x'.repeat(++replaced)+'\u0001'.repeat(2000-replaced);large.current_application_text=text;}
  const remaining=studentLoanMaxPayloadBytes-studentLoanPayloadBytes(large);
  large.current_application_text=['','é','界','😀','é😀'][remaining]+text.slice(remaining===4?2:remaining?1:0);
  assert.equal(studentLoanPayloadBytes(large),32000);assert.equal(validateStudentLoanPayload(saveKind,large),null);
  large.current_application_text=String(large.current_application_text).replace('x','é');assert.equal(studentLoanPayloadBytes(large),32001);assert.ok(validateStudentLoanPayload(saveKind,large));
  for(const input of [{nested:{}},{value:NaN},{value:Infinity},{value:undefined},{value:true},[]])assert.equal(studentLoanPayloadBytes(input),Infinity);
});

test('camel snapshot parsing is exact, caller-owned, bounded and preserves literal values and microseconds',()=>{
  const parsed=parseStudentLoanSnapshot({status:'loaded',record},owner);assert.deepEqual(parsed,{status:'loaded',record});assert.notEqual(parsed.record,record);
  assert.deepEqual(parseStudentLoanSnapshot({status:'loaded',record:{...record,historyCount:0,version:999999999}},owner).record?.historyCount,0);
  for(const patch of [{userId:other},{sourceMode:'official'},{version:0},{version:1000000000},{historyCount:1000001},{historyCount:'0'},
    {createdAt:'2030-02-30T00:00:00Z'},{updatedAt:'2030-01-01T24:00:00Z'},{updatedAt:'2030-01-01T00:00:00'},
    {currentApplicationText:undefined},{signedUrl:'private'},{currentApplicationState:'approved'}])
    assert.throws(()=>parseStudentLoanSnapshot({status:'loaded',record:{...record,...patch}},owner),statusIs(503));
  for(const value of [null,[],{status:'loaded'},{status:'loading',record:null},{status:'loaded',record:null,extra:true}])
    assert.throws(()=>parseStudentLoanSnapshot(value,owner),statusIs(503));
  assert.throws(()=>parseStudentLoanSnapshot({status:'loaded',record:null},'bad'),statusIs(503));
});

test('personal read always scopes caller JWT and active owner singleton, returning null honestly when absent',async()=>{
  const calls:Call[]=[];await mockFetch(call=>{calls.push(call);return json([raw]);},async()=>assert.deepEqual(await loadStudentLoan(account),{status:'loaded',record}));
  assert.equal(calls.length,1);const call=calls[0];assert.equal(call.url.pathname,'/rest/v1/affairs_student_loan');assert.equal(call.method,'GET');
  assert.deepEqual(Object.fromEntries(call.url.searchParams),{select:studentLoanReadSource.select,order:'id.asc',limit:'2',deleted_at:'is.null',user_id:'eq.'+owner});
  assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.headers.get('apikey'),'synthetic-public-key');assert.equal(call.redirect,'error');assert.ok(call.signal);
  await mockFetch(()=>json([]),async()=>assert.deepEqual(await loadStudentLoan(account),{status:'loaded',record:null}));
});

test('duplicate, foreign, deleted or malformed raw reads fail closed rather than choose or infer a record',async()=>{
  for(const patch of [{user_id:other},{source_mode:'official'},{version:0},{updated_at:'bad'},{deleted_at:stamp},{history_count:1000001},
    {current_term_label:undefined},{current_application_state:null},{current_application_text:0},{document_url:'private'}])
    await mockFetch(()=>json([{...raw,...patch}]),async()=>assert.rejects(loadStudentLoan(account),statusIs(503)));
  for(const body of [[raw,raw],[raw,{...raw,id:other}],{records:[raw]},null])
    await mockFetch(()=>json(body),async()=>assert.rejects(loadStudentLoan(account),statusIs(503)));
});

test('admin reads require explicit selected target and live verified role, snapshotted before any await',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json({});},async()=>{
    for(const options of [undefined,null,{},Object.create({userId:owner}),{userId:'bad'},{userId:owner,all:true}])
      await assert.rejects(loadStudentLoanAdmin(account,options as {userId:string}),statusIs(400));
  });assert.equal(calls,0);
  const selected={userId:other},input={...account,user:{id:owner}};
  await mockFetch(call=>{
    if(call.url.pathname.endsWith('/affairs_student_loan_access')){selected.userId=owner;input.user.id=other;input.token='mutated';input.url='https://wrong.invalid';return json({userId:owner,canManage:true});}
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+other);assert.equal(call.url.origin,account.url);assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');return json([{...raw,user_id:other}]);
  },async()=>assert.equal((await loadStudentLoanAdmin(input,selected)).record?.userId,other));
  for(const access of [null,[],{userId:owner,canManage:false},{userId:other,canManage:true},{userId:owner,canManage:true,extra:true}]){
    calls=0;await mockFetch(()=>{calls++;return json(access);},async()=>assert.rejects(loadStudentLoanAdmin(account,{userId:other}),statusIs(403)));assert.equal(calls,1);
  }
});

test('admin mutations snapshot exact payload and actor before authorization and validate exact receipt',async()=>{
  const input:Record<string,unknown>={...payload},caller={...account,user:{id:owner}},calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);if(call.url.pathname.endsWith('/affairs_student_loan_access')){
      input.current_application_text='mutated';input.user_id=other;caller.user.id=other;caller.token='mutated';return json({userId:owner,canManage:true});
    }
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_student_loan');assert.deepEqual(call.body,{p_kind:saveKind,p_payload:payload});
    assert.equal(call.headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(call.redirect,'error');return json({id,kind:saveKind,version:1,summary:'Saved local metadata'});
  },async()=>assert.equal((await manageStudentLoanRecord(caller,saveKind,input)).version,1));assert.equal(calls.length,2);
  for(const receipt of [{id:other,kind:saveKind,version:1,summary:'bad'},{id,kind:deleteKind,version:1,summary:'bad'},
    {id,kind:saveKind,version:2,summary:'bad'},{id,kind:saveKind,version:1,summary:'x'.repeat(201)},
    {id,kind:saveKind,version:1,summary:'bad',extra:true},{id,kind:saveKind,version:1,summary:'\0'}])
    await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_student_loan_access')?{userId:owner,canManage:true}:receipt),async()=>assert.rejects(manageStudentLoanRecord(account,saveKind,payload),statusIs(503)));
});

test('save/delete retries keep exact request identity and report ambiguous response as failure until receipt arrives',async()=>{
  for(const [kind,fixture] of [[saveKind,payload],[deleteKind,deletion]] as const){
    const calls:unknown[]=[];await mockFetch(call=>{
      if(call.url.pathname.endsWith('/affairs_student_loan_access'))return json({userId:owner,canManage:true});
      calls.push(call.body);if(calls.length===1)throw new Error('Synthetic lost response');return json({id,kind,version:fixture.expected_version+1,summary:'Durable receipt'});
    },async()=>{
      await assert.rejects(manageStudentLoanRecord(account,kind,fixture),statusIs(503));
      const retry=await manageStudentLoanRecord(account,kind,fixture),replay=await manageStudentLoanRecord(account,kind,fixture);assert.deepEqual(retry,replay);
    });assert.equal(calls.length,3);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);
  }
});

test('HTTP and malformed-body errors expose bounded safe statuses without provider details',async()=>{
  for(const status of [400,401,403,409,413,422,500,503])await mockFetch(()=>json({error:'PRIVATE provider data'},status),async()=>assert.rejects(loadStudentLoan(account),
    error=>error instanceof StudentLoanError&&error.status===([413,422].includes(status)?400:[500,503].includes(status)?503:status)&&!error.message.includes('PRIVATE')));
  for(const patch of [{url:'https://wrong.supabase.co'},{url:account.url+'/rest'},{token:''},{key:''},{user:{id:'invalid'}},{requestDeadline:NaN}])
    await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadStudentLoan({...account,...patch} as StudentLoanAccount)));
  await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadStudentLoan({...account,requestDeadline:Date.now()-1}),statusIs(503)));
  for(const response of [new Response('PRIVATE invalid JSON'),new Response('[]',{headers:{'content-length':'65537'}}),new Response(new Uint8Array([0xff])),new Response('x'.repeat(65537))])
    await mockFetch(()=>response,async()=>assert.rejects(loadStudentLoan(account),statusIs(503)));
  await mockFetch(()=>new Response('x'.repeat(4097)),async()=>assert.rejects(loadStudentLoanAdmin(account,{userId:owner}),statusIs(503)));
});

test('one absolute deadline covers admin authorization and read/write, including stalled response bodies',async()=>{
  const savedNow=Date.now;let now=1000,calls=0;Date.now=()=>now;
  try{
    await mockFetch(()=>{calls++;now=5000;return json({userId:owner,canManage:true});},async()=>assert.rejects(loadStudentLoanAdmin({...account,requestDeadline:5000},{userId:owner}),statusIs(503)));assert.equal(calls,1);
    now=1000;calls=0;await mockFetch(()=>{calls++;now=13000;return json({userId:owner,canManage:true});},async()=>assert.rejects(manageStudentLoanRecord(account,saveKind,payload),statusIs(503)));assert.equal(calls,1);
  }finally{Date.now=savedNow;}
  const savedTimeout=AbortSignal.timeout,controller=new AbortController();let cancelled=false;AbortSignal.timeout=()=>controller.signal;
  try{await mockFetch(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{
    const pending=loadStudentLoan(account),timer=setTimeout(()=>controller.abort(),1);
    try{await assert.rejects(pending,statusIs(503));assert.equal(cancelled,true);}finally{clearTimeout(timer);}
  });}finally{AbortSignal.timeout=savedTimeout;}
});

test('draft SQL statically preserves Google-own reads and one active, versioned, audited snapshot with exact durable receipts',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261112210000_student_loan.sql',import.meta.url),'utf8');
  assert.ok(sql.includes('create table public.'+studentLoanReadSource.table));
  for(const [field,limit] of Object.entries(studentLoanTextLimits))assert.ok(sql.includes(`char_length(${field})<=${limit}`),field);
  for(const kind of studentLoanKinds){assert.ok(sql.includes("'"+kind+"'"));assert.ok(Object.hasOwn(studentLoanFields,kind));}
  assert.match(sql,/octet_length\(value::text\)>32000/);assert.match(sql,/not\(value \?& fields\) or value-fields<>'\{\}'::jsonb/);
  assert.match(sql,/history_count between 0 and 1000000/);assert.match(sql,/version between 1 and 999999999/);
  assert.match(sql,/create unique index affairs_student_loan_active_owner_idx on public\.affairs_student_loan\(user_id\) where deleted_at is null/);
  assert.match(sql,/deleted_at is null and \(select private\.affairs_google_identity\(\)\)/);assert.match(sql,/user_id=\(select auth\.uid\(\)\) or \(select private\.affairs_is_admin\(\)\)/);
  assert.match(sql,/grant select on public\.affairs_student_loan to authenticated/);assert.match(sql,/alter table private\.affairs_student_loan_operations enable row level security/);
  assert.match(sql,/new\.user_id<>old\.user_id/);assert.match(sql,/new\.source_mode<>old\.source_mode/);assert.match(sql,/Deleted loan metadata IDs cannot be reused/);
  assert.ok(sql.indexOf('select * into receipt')<sql.indexOf('if not exists(select 1 from public.affairs_profiles'));assert.match(sql,/receipt\.payload<>p_payload/);
  assert.ok(sql.indexOf("'loan:actor:'")<sql.indexOf("'loan:owner:'"));assert.ok(sql.indexOf("'loan:owner:'")<sql.indexOf("'loan:record:'"));
  assert.match(sql,/target\.user_id=owner_id and target\.version=expected and target\.deleted_at is null/);
  assert.match(sql,/insert into public\.affairs_agent_audit/);assert.match(sql,/insert into private\.affairs_student_loan_operations/);
  assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+(?:auth\.|storage\.|public\.affairs_profiles)/i);
  assert.doesNotMatch(sql,/grant (?:all|insert|update|delete).*authenticated/i);
  assert.doesNotMatch(sql,/(?:current_term_label|current_application_state|current_application_text|progress_text|history_count|history_text)[^\n]*\bdefault\b/i);
  assert.doesNotMatch(sql,/\b(?:download_url|signed_url|storage_path|document_id|approved_amount)\b/i);
});
