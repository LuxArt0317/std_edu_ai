import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTuitionDocuments,loadTuitionDocumentsAdmin,manageTuitionDocumentRecord,tuitionDocumentFields,tuitionDocumentKinds,tuitionDocumentMaxPayloadBytes,tuitionDocumentPayloadBytes,tuitionDocumentReadSources,TuitionDocumentsError,validateTuitionDocumentPayload,type TuitionDocumentsAccount,type TuitionDocumentKind} from '../../server/tuitionDocuments.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001',documentId='20000000-0000-4000-8000-000000000002',requestId='30000000-0000-4000-8000-000000000001';
const stamp='2030-01-02T03:04:05.123456+08:00';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public-key',token:'synthetic-caller-token',user:{id:owner}} as TuitionDocumentsAccount;
const saveKind='save_tuition_settlement',documentKind='save_tuition_document_metadata';
const payload={id,user_id:owner,request_id:requestId,expected_version:0,period_label:' Local period ',statement_text:null,row_order:0};
const document={id:documentId,user_id:owner,request_id:requestId,expected_version:0,kind:'summer',period_label:null,note_text:'',status:'metadata_only',issuer:'stu.best'};
const deletion={id,user_id:owner,request_id:requestId,expected_version:1};
const row={id,user_id:owner,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null,period_label:payload.period_label,statement_text:null,row_order:0};
const documentRow={...row,id:documentId,kind:'summer',period_label:null,note_text:'',status:'metadata_only',issuer:'stu.best'} as Record<string,unknown>;delete documentRow.statement_text;delete documentRow.row_order;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof TuitionDocumentsError&&error.status===status;
const identifier=(n:number)=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
type Call={url:URL;headers:Headers;method:string;body:unknown;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(handler:(call:Call)=>Response|Promise<Response>,run:()=>void|Promise<void>){
  const saved=globalThis.fetch;globalThis.fetch=(input,init)=>Promise.resolve(handler({url:new URL(String(input)),headers:new Headers(init?.headers),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined,signal:init?.signal,redirect:init?.redirect}));
  try{await run();}finally{globalThis.fetch=saved;}
}

test('tuition operations preserve literal labels/null statements/zero order without inferred academic or payment fields',()=>{
  assert.equal(validateTuitionDocumentPayload(saveKind,payload),null);
  for(const statement_text of [null,'',' paid is only literal prose ','界'.repeat(4000),'😀'.repeat(4000)])assert.equal(validateTuitionDocumentPayload(saveKind,{...payload,statement_text}),null);
  assert.equal(validateTuitionDocumentPayload(saveKind,{...payload,period_label:'😀'.repeat(160),row_order:10000}),null);
  for(const patch of [{period_label:null},{period_label:''},{period_label:' \n\t\u3000\u00a0\ufeff'},{period_label:'a'.repeat(161)},{statement_text:0},{statement_text:'界'.repeat(4001)},{statement_text:'\0'},{statement_text:'\ud800'},{row_order:null},{row_order:0.5},{row_order:-1},{row_order:10001},{row_order:'0'},{academic_year:130},{semester:1},{amount:300},{paid:true},{source_mode:'official'}])assert.ok(validateTuitionDocumentPayload(saveKind,{...payload,...patch}),JSON.stringify(patch));
});

test('all approved keys are mandatory own keys, unknown operation names and fields fail closed',()=>{
  const cases:[TuitionDocumentKind,Record<string,unknown>][]=[[saveKind,payload],[documentKind,document],['delete_tuition_settlement',deletion],['delete_tuition_document_metadata',{...deletion,id:documentId}]];
  for(const [kind,fixture] of cases){
    assert.equal(validateTuitionDocumentPayload(kind,fixture),null);
    for(const key of Object.keys(fixture)){const missing={...fixture};delete missing[key];assert.ok(validateTuitionDocumentPayload(kind,missing),kind+':'+key);}
    for(const value of [null,[],Object.create(fixture),{...fixture,extra:null},{...fixture,user_id:null},{...fixture,id:'bad'},{...fixture,request_id:requestId+'/'},{...fixture,expected_version:'1'},{...fixture,expected_version:999999999},{...fixture,expected_version:-1}])assert.ok(validateTuitionDocumentPayload(kind,value));
  }
  for(const kind of [null,undefined,{},[],'constructor','__proto__','toString','save_tuition_document',''])assert.ok(validateTuitionDocumentPayload(kind,payload));
  assert.ok(validateTuitionDocumentPayload('delete_tuition_settlement',{...deletion,expected_version:0}));
  assert.ok(validateTuitionDocumentPayload('delete_tuition_settlement',{...deletion,statement_text:null}));
});

test('flat JSONB byte accounting includes escaping and Unicode without retaining unknown nested payloads',()=>{
  const maximum={...payload,period_label:'x'.repeat(160),statement_text:'\u0001'.repeat(4000)};
  assert.ok(tuitionDocumentPayloadBytes(maximum)>24000);assert.ok(tuitionDocumentPayloadBytes(maximum)<tuitionDocumentMaxPayloadBytes);assert.equal(validateTuitionDocumentPayload(saveKind,maximum),null);
  assert.equal(tuitionDocumentPayloadBytes({text:'界'}),Buffer.byteLength('{"text": "界"}'));
  for(const value of [{nested:{private:'no'}},{value:NaN},{value:Infinity},[],null])assert.equal(tuitionDocumentPayloadBytes(value),Infinity);
});

test('document metadata cannot claim issued/verified files, official issuer, extended-study output or signed capabilities',()=>{
  for(const patch of [{},{kind:'evening',status:'revoked',period_label:' literal ',note_text:null}])assert.equal(validateTuitionDocumentPayload(documentKind,{...document,...patch}),null);
  for(const patch of [{kind:'extended'},{kind:'settlement'},{status:'issued'},{status:'verified_local_file'},{status:'available'},{issuer:'University'},{verified_at:stamp},{availability:'verified_local_file'},{storage_path:'private/path'},{download_url:'https://example.invalid/private.pdf'},{signed_url:'capability'},{bytes:'pdf'},{file_hash:'abc'},{note_text:'x'.repeat(1001)},{period_label:'x'.repeat(161)}])assert.ok(validateTuitionDocumentPayload(documentKind,{...document,...patch}));
});

test('personal reader is strictly caller scoped even for admins; its periods map exactly to literal local records',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);assert.equal(call.url.pathname,'/rest/v1/affairs_tuition_settlements');assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(call.url.searchParams.get('deleted_at'),'is.null');return json([row,{...row,id:identifier(2),statement_text:'',row_order:1}]);},async()=>{
    const result=await loadTuitionDocuments(account);assert.deepEqual(result.documents,[]);assert.equal(result.settlements.length,2);assert.equal(result.settlements[0].text,null);assert.equal(result.settlements[1].text,'');assert.equal(result.settlements[0].rowOrder,0);assert.equal(result.settlements[0].updatedAt,stamp);assert.equal(result.settlements[0].sourceMode,'local_demo');assert.deepEqual(result.periods[0],{id,userId:owner,label:' Local period '});assert.equal(result.settlements[0].periodId,id);
  });
  assert.equal(calls.length,1);assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(calls[0].headers.get('apikey'),'synthetic-public-key');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);
  await mockFetch(()=>json([]),async()=>assert.deepEqual(await loadTuitionDocuments(account),{periods:[],settlements:[],documents:[]}));
});

test('malformed, foreign, deleted, duplicated and out-of-order rows never become a partial personal result',async()=>{
  for(const patch of [{user_id:other},{source_mode:'official'},{source_mode:'sample'},{version:0},{created_at:'2030-02-30T00:00:00Z'},{updated_at:'2030-01-01T24:00:00Z'},{updated_at:'bad'},{deleted_at:stamp},{statement_text:1},{period_label:' '},{signed_url:'private'}, {row_order:-1}])
    await mockFetch(()=>json([{...row,...patch}]),async()=>assert.rejects(loadTuitionDocuments(account),statusIs(503)));
  for(const body of [[row,row],[{...row,id:identifier(2)},row],{rows:[row]},null])await mockFetch(()=>json(body),async()=>assert.rejects(loadTuitionDocuments(account),statusIs(503)));
});

test('administrator reads require live trusted access and preserve owner-scoped complete cursor pages',async()=>{
  const rows=Array.from({length:201},(_,index)=>({...row,id:identifier(index+1),row_order:201-index})),calls:Call[]=[],options={userId:owner};
  await mockFetch(call=>{
    calls.push(call);if(call.url.pathname.endsWith('/affairs_tuition_access')){options.userId=other;return json({userId:owner,canManage:true});}
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(call.url.searchParams.get('deleted_at'),'is.null');assert.equal(call.url.searchParams.get('limit'),'200');
    if(call.url.pathname.endsWith('/affairs_tuition_document_metadata'))return json([documentRow]);
    const cursor=call.url.searchParams.get('id');assert.ok(cursor===null||cursor==='gt.'+identifier(200));return json(cursor?rows.slice(200):rows.slice(0,200));
  },async()=>{
    const result=await loadTuitionDocumentsAdmin(account,options);assert.equal(result.settlements.length,201);assert.equal(result.settlements[0].id,identifier(201));assert.equal(result.documentMetadata[0].noteText,'');assert.equal(result.documentMetadata[0].status,'metadata_only');assert.deepEqual(result.documents,[]);assert.equal(JSON.stringify(result).includes('verified_local_file'),false);
  });assert.equal(calls.length,4);
  for(const access of [null,[],{userId:owner,canManage:false},{userId:other,canManage:true},{userId:owner,canManage:true,extra:true}]){
    let count=0;await mockFetch(()=>{count++;return json(access);},async()=>assert.rejects(loadTuitionDocumentsAdmin(account),statusIs(403)));assert.equal(count,1);
  }
});

test('admin filter errors never hit transport; malformed or duplicate active metadata fail instead of enabling Print',async()=>{
  let count=0;await mockFetch(()=>{count++;return json({});},async()=>{
    for(const options of [{userId:'bad'},{userId:undefined},{includeDeleted:true},Object.create({userId:owner})])await assert.rejects(loadTuitionDocumentsAdmin(account,options),statusIs(400));
  });assert.equal(count,0);
  for(const documents of [[{...documentRow,status:'available'}],[{...documentRow,verified_at:stamp}],[{...documentRow,kind:'extended'}],[{...documentRow,deleted_at:stamp}],[documentRow,{...documentRow,id:identifier(2)}]]){
    await mockFetch(call=>call.url.pathname.endsWith('/affairs_tuition_access')?json({userId:owner,canManage:true}):json(call.url.pathname.endsWith('/affairs_tuition_settlements')?[]:documents),async()=>assert.rejects(loadTuitionDocumentsAdmin(account),statusIs(503)));
  }
});

test('complete reads over 1000 rows stop and fail rather than truncate; cross-page owner/order is rechecked',async()=>{
  let pages=0;await mockFetch(call=>{const cursor=call.url.searchParams.get('id'),start=cursor?Number(cursor.slice(-12)):0;pages++;return json(Array.from({length:Math.min(200,1001-start)},(_,i)=>({...row,id:identifier(start+i+1)})));},async()=>assert.rejects(loadTuitionDocuments(account),error=>error instanceof TuitionDocumentsError&&/complete-read limit/.test(error.message)));assert.equal(pages,6);
  for(const bad of [{...row,id:identifier(200)},{...row,id:identifier(201),user_id:other}]){
    let count=0;await mockFetch(()=>json(++count===1?Array.from({length:200},(_,i)=>({...row,id:identifier(i+1)})):[bad]),async()=>assert.rejects(loadTuitionDocuments(account),statusIs(503)));
  }
});

test('manager validates before transport, snapshots input, and sends exact caller-JWT RPC with strict receipt checks',async()=>{
  const input={...payload,statement_text:'saved literal'},calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);if(call.url.pathname.endsWith('/affairs_tuition_access')){input.statement_text='mutated after authorization started';return json({userId:owner,canManage:true});}
    assert.equal(call.url.pathname,'/rest/v1/rpc/affairs_manage_tuition_documents');assert.deepEqual(call.body,{p_kind:saveKind,p_payload:{...payload,statement_text:'saved literal'}});return json({id,kind:saveKind,version:1,summary:'Saved'});
  },async()=>assert.equal((await manageTuitionDocumentRecord(account,saveKind,input)).version,1));assert.equal(calls.length,2);assert.equal(calls[1].headers.get('authorization'),'Bearer synthetic-caller-token');
  await mockFetch(()=>{throw new Error('Must not fetch');},async()=>assert.rejects(manageTuitionDocumentRecord(account,saveKind,{...payload,download_url:'secret'}),statusIs(400)));
  for(const bad of [{id:documentId,kind:saveKind,version:1,summary:'bad'},{id,kind:documentKind,version:1,summary:'bad'},{id,kind:saveKind,version:2,summary:'bad'},{id,kind:saveKind,version:1,summary:'x'.repeat(201)},{id,kind:saveKind,version:1,summary:'bad',extra:true}])await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_tuition_access')?{userId:owner,canManage:true}:bad),async()=>assert.rejects(manageTuitionDocumentRecord(account,saveKind,payload),statusIs(503)));
});

test('all four operation contracts retain request IDs for caller-driven retries and map 400/401/403/409 correctly',async()=>{
  for(const [kind,fixture] of [[saveKind,payload],[documentKind,document],['delete_tuition_settlement',deletion],['delete_tuition_document_metadata',{...deletion,id:documentId}]] as const){
    const calls:unknown[]=[];await mockFetch(call=>{
      if(call.url.pathname.endsWith('/affairs_tuition_access'))return json({userId:owner,canManage:true});calls.push(call.body);return json({id:fixture.id,kind,version:fixture.expected_version+1,summary:'Saved receipt'});
    },async()=>{const first=await manageTuitionDocumentRecord(account,kind,fixture),second=await manageTuitionDocumentRecord(account,kind,fixture);assert.deepEqual(first,second);});assert.deepEqual(calls[0],calls[1]);
  }
  for(const status of [400,401,403,409,413,422,500])await mockFetch(()=>json({error:'PRIVATE provider details'},status),async()=>assert.rejects(loadTuitionDocuments(account),error=>error instanceof TuitionDocumentsError&&error.status===([413,422].includes(status)?400:status===500?503:status)&&!error.message.includes('PRIVATE')));
});

test('exact project, finite deadline and body bounds fail before leaking records or provider error text',async()=>{
  for(const patch of [{url:'https://wrong.supabase.co'},{token:''},{key:''},{user:{id:other.toUpperCase()}},{requestDeadline:NaN}]){
    if(patch.user)patch.user.id='NOT-A-UUID';await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadTuitionDocuments({...account,...patch} as TuitionDocumentsAccount)));
  }
  await mockFetch(()=>{throw new Error('Never fetch');},async()=>assert.rejects(loadTuitionDocuments({...account,requestDeadline:Date.now()-1}),statusIs(503)));
  for(const response of [new Response('PRIVATE invalid json'),new Response('[]',{headers:{'content-length':String(6*1024*1024+1)}})])await mockFetch(()=>response,async()=>assert.rejects(loadTuitionDocuments(account),statusIs(503)));
  const saved=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('PRIVATE network details');};try{await assert.rejects(loadTuitionDocuments(account),error=>error instanceof TuitionDocumentsError&&!error.message.includes('PRIVATE'));}finally{globalThis.fetch=saved;}
});

test('one absolute deadline bounds every page and admin authorization, and abort interrupts a stalled body',async()=>{
  const savedNow=Date.now;let now=1000,count=0;Date.now=()=>now;
  try{
    await mockFetch(()=>{count++;now=5000;return json(Array.from({length:200},(_,i)=>({...row,id:identifier(i+1)})));},async()=>assert.rejects(loadTuitionDocuments({...account,requestDeadline:5000}),statusIs(503)));assert.equal(count,1);
    now=1000;count=0;
    await mockFetch(()=>{count++;now=13000;return json({userId:owner,canManage:true});},async()=>assert.rejects(manageTuitionDocumentRecord(account,saveKind,payload),statusIs(503)));assert.equal(count,1,'No write starts after the shared authorization deadline.');
  }finally{Date.now=savedNow;}
  const savedTimeout=AbortSignal.timeout,controller=new AbortController();let cancelled=false;AbortSignal.timeout=()=>controller.signal;
  try{
    await mockFetch(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{
      const pending=loadTuitionDocuments(account);const timer=setTimeout(()=>controller.abort(),1);
      try{await assert.rejects(pending,statusIs(503));assert.equal(cancelled,true);}finally{clearTimeout(timer);}
    });
  }finally{AbortSignal.timeout=savedTimeout;}
});

test('draft SQL retains private RLS, immutable identity, soft deletion and durable actor receipts without Storage or identity writes',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261112180000_tuition_documents.sql',import.meta.url),'utf8');
  for(const source of tuitionDocumentReadSources)assert.ok(sql.includes('create table public.'+source.table));
  for(const kind of tuitionDocumentKinds){assert.ok(sql.includes("'"+kind+"'"));assert.ok(Object.hasOwn(tuitionDocumentFields,kind));}
  assert.match(sql,/grant select on public/);assert.match(sql,/deleted_at is null and \(select private\.affairs_google_identity\(\)\)/);assert.match(sql,/Deleted tuition IDs cannot be reused/);assert.match(sql,/Document revocation is terminal/);
  assert.ok(sql.indexOf('select * into receipt')<sql.indexOf("if not exists(select 1 from public.affairs_profiles"));assert.match(sql,/receipt\.payload<>p_payload/);assert.match(sql,/on conflict\(id\) do update/);assert.match(sql,/target\.version=\$3 and target\.deleted_at is null/);
  assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+(?:auth\.|storage\.|public\.affairs_profiles)/i);assert.doesNotMatch(sql,/grant (?:all|insert|update|delete).*authenticated/i);
});
