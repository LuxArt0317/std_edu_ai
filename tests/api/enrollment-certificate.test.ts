import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {EnrollmentCertificateError,enrollmentCertificateFields,enrollmentCertificateKinds,enrollmentCertificatePayloadBytes,
  validateEnrollmentCertificatePayload,loadEnrollmentCertificate,loadEnrollmentCertificateAdmin,manageEnrollmentCertificateRecord} from '../../server/enrollmentCertificate.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001',documentId='30000000-0000-4000-8000-000000000001',requestId='40000000-0000-4000-8000-000000000001';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'synthetic-caller-token',key:'synthetic-public-key'};
const stamp='2030-01-01T00:00:00Z',assessmentKind=enrollmentCertificateKinds[0],documentKind=enrollmentCertificateKinds[1];
const payload={id,user_id:owner,request_id:requestId,expected_version:0,academic_year:130,semester:1,has_pending_fees:'Y',status:'blocked',
  result_text:'Synthetic local assessment',assessed_at:stamp,student_number:'QA-CERT',student_name:'Synthetic student',department_name:null,year_text:'',class_label:null};
const document={id:documentId,user_id:owner,request_id:requestId,expected_version:0,assessment_id:id,assessment_version:1,issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verified_at:null,expires_at:null};
const raw=(value:Record<string,unknown>)=>{const row:Record<string,unknown>={...value,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp};delete row.request_id;delete row.expected_version;return row;};
const row=raw(payload),documentRow=raw(document);
const receipt={id,kind:assessmentKind,version:1,summary:'Saved explicit local certificate assessment.'};
type Call={url:URL;method:string;body:Record<string,unknown>|undefined;headers:Headers;signal:AbortSignal|null|undefined;redirect:RequestRedirect|undefined};
async function mockFetch(run:(call:Call)=>Response|Promise<Response>,callback:()=>Promise<void>){
  const prior=globalThis.fetch;
  globalThis.fetch=async(input,init)=>run({url:new URL(String(input)),method:init?.method||'GET',body:init?.body?JSON.parse(String(init.body)):undefined,headers:new Headers(init?.headers),signal:init?.signal,redirect:init?.redirect});
  try{await callback();}finally{globalThis.fetch=prior;}
}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const statusIs=(status:number)=>(error:unknown)=>error instanceof EnrollmentCertificateError&&error.status===status;
const identifier=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('certificate payloads preserve explicit unknowns, blank text and independent status without coercion',()=>{
  assert.equal(validateEnrollmentCertificatePayload(assessmentKind,payload),null);
  const unknown={...payload,academic_year:null,semester:null,has_pending_fees:null,assessed_at:null,status:'unknown',result_text:null,student_number:null,student_name:'',year_text:null};
  assert.equal(validateEnrollmentCertificatePayload(assessmentKind,unknown),null);
  assert.equal(validateEnrollmentCertificatePayload(assessmentKind,{...unknown,has_pending_fees:'N',status:'blocked'}),null,'Fees do not determine local status.');
  assert.equal(validateEnrollmentCertificatePayload(assessmentKind,{...payload,academic_year:9999,semester:3,student_name:'😀'.repeat(160)}),null);
  assert.equal(validateEnrollmentCertificatePayload(assessmentKind,{...payload,assessed_at:'2024-02-29T23:59:59.123456+08:00'}),null);
  for(const patch of [{academic_year:0},{academic_year:10000},{academic_year:'130'},{academic_year:1.5},{semester:0},{semester:4},{semester:'1'},
    {has_pending_fees:false},{has_pending_fees:'n'},{status:'official_eligible'},{result_text:0},{student_number:'x'.repeat(81)},
    {student_name:'😀'.repeat(161)},{department_name:'x'.repeat(161)},{year_text:'x'.repeat(31)},{class_label:'x'.repeat(81)},
    {result_text:'x'.repeat(501)},{student_name:'\ud800'},{result_text:'\0'},{expected_version:'0'},{expected_version:999999999},
    {expected_version:-1},{user_id:null},{id:'wrong'},{request_id:requestId+'/'},{source_mode:'official'},{identity:{student_name:'private'}},
    {url:'https://example.invalid/private'},{storage_path:'private/path'},{signed_url:'private-capability'}])
    assert.ok(validateEnrollmentCertificatePayload(assessmentKind,{...payload,...patch}),JSON.stringify(patch));
});

test('all keys must be present and exact, with real dates and a byte-aware cap before transport',()=>{
  for(const [kind,fixture] of [[assessmentKind,payload],[documentKind,document]] as const){
    for(const key of Object.keys(fixture)){const missing:Record<string,unknown>={...fixture};delete missing[key];assert.ok(validateEnrollmentCertificatePayload(kind,missing),key);}
    for(const value of [null,[],Object.create(fixture),{...fixture,extra:null}])assert.ok(validateEnrollmentCertificatePayload(kind,value));
  }
  for(const kind of ['__proto__','constructor','toString','',null,{},[]])assert.ok(validateEnrollmentCertificatePayload(kind,payload));
  for(const assessed_at of ['', '2030-01-01','0000-01-01T00:00:00Z','2026-02-29T00:00:00Z','1900-02-29T00:00:00Z','2030-04-31T00:00:00Z',
    '2030-01-01T24:00:00Z','2030-01-01T12:00:60Z','2030-01-01T00:00:00','2030-01-01T00:00:00+16:00'])
    assert.ok(validateEnrollmentCertificatePayload(assessmentKind,{...payload,assessed_at}));
  const escaped={...payload,result_text:'\u0001'.repeat(500),student_name:'\u0001'.repeat(160),department_name:'\u0001'.repeat(160),student_number:'\u0001'.repeat(80),year_text:'\u0001'.repeat(30),class_label:'\u0001'.repeat(80)};
  // This bounded shape is below the cap; escaping is counted, not string character count.
  assert.ok(enrollmentCertificatePayloadBytes(escaped)>6000);assert.equal(validateEnrollmentCertificatePayload(assessmentKind,escaped),null);
  assert.equal(enrollmentCertificatePayloadBytes({nested:{secret:'excluded'}}),Infinity);
  assert.equal(enrollmentCertificatePayloadBytes({value:NaN}),Infinity);
  assert.equal(enrollmentCertificatePayloadBytes({text:'界'}),new TextEncoder().encode('{"text": "界"}').byteLength);
});

test('document metadata cannot be activated, verified, or linked by URL',()=>{
  assert.equal(validateEnrollmentCertificatePayload(documentKind,document),null);
  assert.equal(validateEnrollmentCertificatePayload(documentKind,{...document,status:'revoked',expires_at:'2035-01-01T00:00:00Z'}),null);
  for(const patch of [{status:'available'},{verified_at:stamp},{verified:true},{issuer:'University'},{purpose:'official_certificate'},
    {assessment_id:null},{assessment_id:'https://example.invalid/official.pdf'},{assessment_version:0},{assessment_version:'1'},
    {expires_at:'2026-02-29T00:00:00Z'},{download_url:'https://example.invalid/file'},{storage_path:'private/path'},{bytes:'private'}])
    assert.ok(validateEnrollmentCertificatePayload(documentKind,{...document,...patch}),JSON.stringify(patch));
});

test('own reader uses only caller JWT and exact owner filter even for admin; documents are never projected',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);assert.equal(call.url.pathname,'/rest/v1/affairs_enrollment_certificate_assessments');assert.equal(call.url.searchParams.get('user_id'),'eq.'+owner);return json([row]);},async()=>{
    const data=await loadEnrollmentCertificate(account);
    assert.equal(data.assessments[0].userId,owner);assert.deepEqual(data.assessments[0].identity,{studentNumber:'QA-CERT',studentName:'Synthetic student',departmentName:null,yearText:'',classLabel:null});
    assert.equal(data.assessments[0].semester,1);assert.deepEqual(data.documents,[]);assert.equal(data.assessments[0].hasPendingFees,'Y');
  });assert.equal(calls.length,1);assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-caller-token');assert.equal(calls[0].headers.get('apikey'),'synthetic-public-key');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);
});

test('readers reject foreign, duplicate, malformed or capability-bearing rows rather than publish partial data',async()=>{
  for(const patch of [{user_id:other},{academic_year:'130'},{source_mode:'official'},{version:0},{updated_at:'bad'},
    {signed_url:'private-capability'},{status:'eligible'},{assessed_at:'2026-02-29T00:00:00Z'}])
    await mockFetch(()=>json([{...row,...patch}]),async()=>{await assert.rejects(loadEnrollmentCertificate(account),statusIs(503));});
  await mockFetch(()=>json([row,{...row,id:identifier(1)}]),async()=>{await assert.rejects(loadEnrollmentCertificate(account),statusIs(503));});
  await mockFetch(()=>json({records:[row]}),async()=>{await assert.rejects(loadEnrollmentCertificate(account),statusIs(503));});
  await mockFetch(()=>json([]),async()=>{assert.deepEqual(await loadEnrollmentCertificate(account),{assessments:[],documents:[]});});
});

test('manager reads require current caller admin role and paginate complete ordered collections',async()=>{
  const rows=Array.from({length:201},(_,i)=>({...row,id:identifier(i+1),user_id:identifier(i+1)}));
  const calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);
    if(call.url.pathname.endsWith('/affairs_enrollment_certificate_access')){assert.equal(call.method,'POST');assert.deepEqual(call.body,{});return json({userId:owner,canManage:true});}
    assert.equal(call.url.searchParams.get('user_id'),null);assert.equal(call.url.searchParams.get('order'),'id.asc');assert.equal(call.url.searchParams.get('limit'),'200');
    if(call.url.pathname.endsWith('/affairs_enrollment_certificate_documents'))return json([documentRow]);
    const cursor=call.url.searchParams.get('id');assert.ok(cursor===null||cursor==='gt.'+identifier(200));return json(cursor?rows.slice(200):rows.slice(0,200));
  },async()=>{
    const data=await loadEnrollmentCertificateAdmin(account);assert.equal(data.assessments.length,201);assert.deepEqual(data.documents,[]);
    assert.equal(data.documentMetadata[0].status,'metadata_only');assert.equal(data.documentMetadata[0].verifiedAt,null);assert.equal(data.documentMetadata[0].version,1);
    assert.equal(JSON.stringify(data).includes('storagePath'),false);
  });assert.equal(calls.length,4);
  for(const profile of [null,[],{userId:owner,canManage:false},{userId:other,canManage:true},{userId:owner,canManage:true,extra:true}]){
    let count=0;await mockFetch(()=>{count++;return json(profile);},async()=>{await assert.rejects(loadEnrollmentCertificateAdmin(account),statusIs(403));});assert.equal(count,1);
  }
});

test('pagination rejects repeated pages and enforces the complete-read bound instead of silently truncating',async()=>{
  for(const mode of ['repeat','cap']){
    let pages=0;
    await mockFetch(call=>{
      if(call.url.pathname.endsWith('/affairs_enrollment_certificate_access'))return json({userId:owner,canManage:true});
      if(call.url.pathname.endsWith('/affairs_enrollment_certificate_documents'))return json([]);
      const base=mode==='repeat'?0:pages*200;pages++;return json(Array.from({length:200},(_,i)=>({...row,id:identifier(base+i+1),user_id:identifier(base+i+1)})));
    },async()=>{await assert.rejects(loadEnrollmentCertificateAdmin(account),statusIs(503));});
    assert.equal(pages,mode==='repeat'?2:51);
  }
});

test('administrator account filter is explicit and still rejects a different returned owner',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{
    calls.push(call);if(call.url.pathname.endsWith('/affairs_enrollment_certificate_access'))return json({userId:owner,canManage:true});
    assert.equal(call.url.searchParams.get('user_id'),'eq.'+other);
    return json(call.url.pathname.endsWith('/affairs_enrollment_certificate_assessments')?[{...row,user_id:other}]:[]);
  },async()=>{const data=await loadEnrollmentCertificateAdmin(account,{userId:other});assert.equal(data.assessments[0].userId,other);});
  assert.equal(calls.length,3);
  await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_enrollment_certificate_access')?{userId:owner,canManage:true}:call.url.pathname.endsWith('/affairs_enrollment_certificate_assessments')?[row]:[]),async()=>{
    await assert.rejects(loadEnrollmentCertificateAdmin(account,{userId:other}),statusIs(503));
  });
  let count=0;await mockFetch(()=>{count++;return json([]);},async()=>{await assert.rejects(loadEnrollmentCertificateAdmin(account,{userId:'invalid'}),statusIs(400));});assert.equal(count,0);
});

test('admin writes use exact RPC envelope, stable request IDs and receipts, with no file side effects',async()=>{
  const calls:Call[]=[];
  await mockFetch(call=>{calls.push(call);return json(call.url.pathname.endsWith('/affairs_enrollment_certificate_access')?{userId:owner,canManage:true}:receipt);},async()=>{
    assert.deepEqual(await manageEnrollmentCertificateRecord(account,assessmentKind,payload),receipt);
    assert.deepEqual(await manageEnrollmentCertificateRecord(account,assessmentKind,payload),receipt);
  });assert.equal(calls.length,4);assert.deepEqual(calls[1].body,{p_kind:assessmentKind,p_payload:payload});assert.deepEqual(calls[3].body,calls[1].body);
  assert.equal(calls[1].url.pathname,'/rest/v1/rpc/affairs_manage_enrollment_certificate');assert.equal(calls.some(call=>call.url.pathname.includes('storage')),false);
  let requests=0;await mockFetch(()=>{requests++;throw new Error('Must reject before network');},async()=>{
    await assert.rejects(manageEnrollmentCertificateRecord(account,assessmentKind,{...payload,url:'private'}),statusIs(400));
    await assert.rejects(manageEnrollmentCertificateRecord(account,documentKind,{...document,verified_at:stamp}),statusIs(400));
  });assert.equal(requests,0);
});

test('provider errors and malformed receipts never expose private response data or imply saved state',async()=>{
  for(const status of [400,401,403,409,413,422,500])await mockFetch(call=>call.url.pathname.endsWith('/affairs_enrollment_certificate_access')?json({userId:owner,canManage:true}):json({message:'PRIVATE provider content'},status),async()=>{
    await assert.rejects(manageEnrollmentCertificateRecord(account,assessmentKind,payload),error=>error instanceof EnrollmentCertificateError&&error.status===([413,422].includes(status)?400:status===500?503:status)&&!error.message.includes('PRIVATE'));
  });
  for(const result of [null,{...receipt,id:other},{...receipt,version:2},{...receipt,kind:documentKind},{...receipt,signed_url:'PRIVATE'}])
    await mockFetch(call=>json(call.url.pathname.endsWith('/affairs_enrollment_certificate_access')?{userId:owner,canManage:true}:result),async()=>{await assert.rejects(manageEnrollmentCertificateRecord(account,assessmentKind,payload),statusIs(503));});
});

test('account target, inherited request deadline and total request budget fail closed',async()=>{
  let calls=0;await mockFetch(()=>{calls++;return json([]);},async()=>{
    for(const patch of [{token:''},{key:''},{url:'https://other.supabase.co'},{user:{id:'invalid'}}])await assert.rejects(loadEnrollmentCertificate({...account,...patch}),statusIs(401));
    for(const requestDeadline of [0,NaN,Infinity])await assert.rejects(loadEnrollmentCertificate({...account,requestDeadline}),statusIs(503));
  });assert.equal(calls,0);
  const clock=Date.now;let now=clock();Date.now=()=>now;
  try{await mockFetch(()=>{calls++;now+=100;return json({userId:owner,canManage:true});},async()=>{await assert.rejects(loadEnrollmentCertificateAdmin({...account,requestDeadline:now+50}),statusIs(503));});}
  finally{Date.now=clock;}
  assert.equal(calls,1,'Permission and page reads share one deadline; no fresh per-page budget.');
});

test('draft SQL exposes only scoped reads and audited metadata writes; content activation remains impossible',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261112160000_enrollment_certificate.sql',import.meta.url),'utf8');
  for(const kind of enrollmentCertificateKinds)assert.ok(sql.includes(kind));
  for(const fields of Object.values(enrollmentCertificateFields))for(const field of fields)assert.ok(sql.includes(field));
  assert.match(sql,/verified_at timestamptz check\(verified_at is null\)/);
  assert.match(sql,/status text not null check\(status in \('metadata_only','revoked'\)\)/);
  assert.match(sql,/private\.affairs_google_identity\(\).*user_id=\(select auth\.uid\(\)\).*private\.affairs_is_admin\(\)/);
  assert.match(sql,/receipt\.payload<>p_payload/);assert.match(sql,/return receipt\.result/);
  assert.match(sql,/Document assessment linkage is immutable/);assert.match(sql,/linked\.version<>/);
  assert.match(sql,/where target\.user_id=\$2 and target\.version=\$3 returning/);
  assert.match(sql,/affairs_enrollment_certificate_access\(\)/);
  assert.doesNotMatch(sql,/create policy[^;]*for (?:insert|update|delete)/i);
});
