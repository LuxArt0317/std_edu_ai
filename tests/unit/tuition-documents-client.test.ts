import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTuitionDocumentsClient,parseTuitionDocuments,type TuitionDocumentsAction} from '../../src/services/tuitionDocumentsClient';

const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',date='2026-01-01T00:00:00Z';
const row={id,userId:owner,sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,periodId:id,periodLabel:' Synthetic term ',text:null,rowOrder:0};
const data=()=>({periods:[{id,userId:owner,label:row.periodLabel}],settlements:[{...row}],documents:[]});
const metadata={id,userId:owner,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,kind:'summer',periodLabel:'',noteText:null,status:'metadata_only',issuer:'stu.best'};
const action:TuitionDocumentsAction={kind:'save_tuition_settlement',payload:{id,user_id:owner,request_id:'30000000-0000-4000-8000-000000000001',expected_version:1,period_label:row.periodLabel,statement_text:null,row_order:0}};

test('tuition parser preserves literal null, blank and zero and accepts independently allocated table IDs',()=>{
  const parsed=parseTuitionDocuments({...data(),documentMetadata:[metadata]},owner,true);
  assert.equal(parsed.settlements[0].text,null);assert.equal(parsed.settlements[0].rowOrder,0);assert.equal(parsed.periods[0].label,' Synthetic term ');
  assert.equal(parsed.documentMetadata[0].periodLabel,'');assert.equal(parsed.documentMetadata[0].noteText,null);assert.deepEqual(parsed.documents,[]);
  const input={...data(),settlements:[{...row,text:''}]};assert.equal(parseTuitionDocuments(input,owner).settlements[0].text,'');
  parsed.settlements[0].periodLabel='changed';assert.equal(row.periodLabel,' Synthetic term ');
});

test('tuition parser rejects foreign, ownerless, duplicated, mismatched and capability-bearing responses',()=>{
  for(const value of [{...data(),settlements:[{...row,userId:other}]},{...data(),settlements:[{...row,userId:undefined}]},
    {...data(),periods:[{id,userId:owner,label:'other label'}]},{...data(),periods:[...data().periods,...data().periods],settlements:[row,row]},
    {...data(),documents:[{url:'https://storage.invalid/private'}]},{...data(),secret:'hidden'},
    {...data(),settlements:[{...row,text:'\ud800'}]},{...data(),settlements:[{...row,version:0}]},{...data(),settlements:[{...row,createdAt:'2026-02-30T00:00:00Z'}]}])assert.throws(()=>parseTuitionDocuments(value,owner));
  assert.throws(()=>parseTuitionDocuments(data(),''));
  assert.throws(()=>parseTuitionDocuments({...data(),documentMetadata:[metadata,{...metadata,id:'20000000-0000-4000-8000-000000000002'}]},owner,true));
  assert.throws(()=>parseTuitionDocuments({...data(),documentMetadata:[{...metadata,status:'available'}]},owner,true));
});

test('personal/admin HTTP scopes and four write kinds preserve authenticated manager and selected owner',async()=>{
  const calls:{path:string;init:RequestInit|undefined}[]=[];let caller=owner;
  const client=createTuitionDocumentsClient(async()=>({userId:caller,token:'synthetic-caller-only'}),async(input,init)=>{
    calls.push({path:String(input),init});assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-caller-only');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.equal(body.payload.user_id,owner);return Response.json({id:body.payload.id,kind:body.kind,version:body.payload.expected_version+1,summary:'Saved'});}
    return Response.json(String(input).includes('admin')?{...data(),documentMetadata:[metadata]}:data());
  });
  await client.load(owner);assert.equal(calls[0].path,'/api/affairs-data?scope=tuition-documents');
  caller=manager;await client.loadAdmin(manager,owner);assert.equal(calls[1].path,'/api/affairs-data?scope=tuition-documents-admin&user_id='+owner);
  const actions:TuitionDocumentsAction[]=[action,{kind:'delete_tuition_settlement',payload:{id,user_id:owner,request_id:action.payload.request_id,expected_version:1}},
    {kind:'save_tuition_document_metadata',payload:{id,user_id:owner,request_id:action.payload.request_id,expected_version:0,kind:'evening',period_label:'',note_text:null,status:'revoked',issuer:'stu.best'}},
    {kind:'delete_tuition_document_metadata',payload:{id,user_id:owner,request_id:action.payload.request_id,expected_version:2}}];
  for(const entry of actions){const receipt=await client.manage(manager,entry);assert.equal(receipt.version,entry.payload.expected_version+1);assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)),entry);}
  assert.equal(calls.length,6);
});

test('session mismatch before and after a request prevents cross-account results or writes',async()=>{
  let reads=0,fetches=0;
  const client=createTuitionDocumentsClient(async()=>({userId:++reads===1?owner:other,token:'synthetic'}),async()=>{fetches++;return Response.json(data());});
  await assert.rejects(client.load(owner),{status:401});assert.equal(fetches,1);
  await assert.rejects(client.manage(manager,action),{status:401});assert.equal(fetches,1);
  const invalid=createTuitionDocumentsClient(async()=>null,async()=>{throw new Error('No request allowed');});
  await assert.rejects(invalid.load(owner),{status:401});
  await assert.rejects(invalid.manage(manager,{...action,payload:{...action.payload,expected_version:-1}}),{status:400});
});

test('provider bodies, malformed receipts and nonempty documents never become trusted responses',async()=>{
  for(const status of [400,401,403,409,500]){
    const client=createTuitionDocumentsClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json({error:'PRIVATE PROVIDER TOKEN'}, {status}));
    await assert.rejects(client.manage(manager,action),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE|TOKEN/);assert.equal((error as {status:number}).status,status===500?503:status);return true;});
  }
  const bad=createTuitionDocumentsClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json({id,kind:action.kind,version:9,summary:'Wrong revision'}));
  await assert.rejects(bad.manage(manager,action),{status:503});
});

test('one deadline bounds session, fetch and body reads; abort leaves no valid result',async()=>{
  const never=()=>new Promise<never>(()=>{});
  const session=createTuitionDocumentsClient(never,async()=>{throw new Error('No fetch');},15);await assert.rejects(session.load(owner),{status:504});
  const fetch=createTuitionDocumentsClient(async()=>({userId:owner,token:'synthetic'}),never,15);await assert.rejects(fetch.load(owner),{status:504});
  const body=createTuitionDocumentsClient(async()=>({userId:owner,token:'synthetic'}),async()=>new Response(new ReadableStream({start(){}})),15);await assert.rejects(body.load(owner),{status:504});
  const controller=new AbortController();controller.abort(new DOMException('cancelled','AbortError'));await assert.rejects(body.load(owner,controller.signal),{name:'AbortError'});
});
