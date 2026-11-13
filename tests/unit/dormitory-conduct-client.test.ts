import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDormitoryConductClient,parseDormitoryConduct,parseDormitoryConductAdmin,type DormitoryConductAction} from '../../src/services/dormitoryConductClient';
import type {DormitoryConductSnapshot,DormitoryConductAdminRecord} from '../../src/services/dormitoryConduct';

const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00.123456+08:00';
const snapshot:DormitoryConductSnapshot={userId:owner,sourceMode:'local_demo',version:1,result:'empty'};
const record:DormitoryConductAdminRecord={...snapshot,id,createdAt:date,updatedAt:date};
const action:DormitoryConductAction={kind:'save_dormitory_conduct',payload:{id,user_id:owner,request_id:requestId,expected_version:0,result:'empty'}};

test('strict distinct personal and admin DTOs preserve null, explicit unknown and immutable copies',()=>{
  assert.deepEqual(parseDormitoryConduct({snapshot:null},owner),{snapshot:null});assert.deepEqual(parseDormitoryConductAdmin({record:null},owner),{record:null});
  const copy=parseDormitoryConduct({snapshot},owner);copy.snapshot!.result='unknown';assert.equal(snapshot.result,'empty');
  const admin=parseDormitoryConductAdmin({record},owner);admin.record!.version=2;assert.equal(record.version,1);assert.equal(admin.record!.createdAt,date);
  assert.equal(parseDormitoryConduct({snapshot:{...snapshot,result:'unknown'}},owner).snapshot!.result,'unknown');
  for(const value of [{},{snapshot:null,record:null},{snapshot:{...snapshot,userId:other}},{snapshot:{...snapshot,result:null}},{snapshot:{...snapshot,version:0}},
    {snapshot:{...snapshot,version:1000000000}},{snapshot:{...snapshot,sourceMode:'official'}},{snapshot:{...snapshot,url:'PRIVATE'}},{snapshot:record}]){
    assert.throws(()=>parseDormitoryConduct(value,owner));
  }
  for(const value of [{snapshot},{record:{...record,userId:other}},{record:{...record,createdAt:'2030-02-30T00:00:00Z'}},{record:{...record,id:undefined}},{record:{...record,documents:[]}}])assert.throws(()=>parseDormitoryConductAdmin(value,owner));
  assert.throws(()=>parseDormitoryConduct({snapshot},''));assert.throws(()=>parseDormitoryConduct(Object.create({snapshot}),owner));
});

test('exact personal/admin scopes preserve caller JWT and both operation envelopes',async()=>{
  let caller=owner;const calls:{path:string;init:RequestInit|undefined}[]=[];
  const client=createDormitoryConductClient(async()=>({userId:caller,token:'synthetic-token'}),async(input,init)=>{
    calls.push({path:String(input),init});assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-token');assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');
    if(init?.method==='POST'){const value=JSON.parse(String(init.body));return Response.json({id:value.payload.id,kind:value.kind,version:value.payload.expected_version+1,summary:'Saved'});}
    return Response.json(caller===owner?{snapshot}:{record});
  });
  await client.load(owner);assert.equal(calls[0].path,'/api/affairs-data?scope=dormitory-conduct');caller=manager;
  await client.loadAdmin(manager,owner);assert.equal(calls[1].path,'/api/affairs-data?scope=dormitory-conduct-admin&user_id='+owner);
  await client.manage(manager,action);assert.deepEqual(JSON.parse(String(calls[2].init!.body)),action);
  const remove:DormitoryConductAction={kind:'delete_dormitory_conduct',payload:{id,user_id:owner,request_id:requestId,expected_version:1}};
  assert.equal((await client.manage(manager,remove)).version,2);assert.equal(calls[3].path,'/api/affairs-manage');assert.deepEqual(JSON.parse(String(calls[3].init!.body)),remove);
  await assert.rejects(client.loadAdmin(manager,'bad'),{status:400});assert.equal(calls.length,4);
});

test('caller changes reject results and writes while action input is captured before any await',async()=>{
  let sessions=0,fetches=0;const changing=createDormitoryConductClient(async()=>({userId:++sessions===1?owner:other,token:'synthetic'}),async()=>{fetches++;return Response.json({snapshot});});
  await assert.rejects(changing.load(owner),{status:401});await assert.rejects(changing.manage(manager,action),{status:401});assert.equal(fetches,1);
  const copy=structuredClone(action),expected=structuredClone(action);let sent:unknown;
  const client=createDormitoryConductClient(async()=>{copy.payload.user_id=other;return {userId:manager,token:'synthetic'};},async(_input,init)=>{sent=JSON.parse(String(init?.body));return Response.json({id,kind:action.kind,version:1,summary:'Saved'});});
  await client.manage(manager,copy);assert.deepEqual(sent,expected);
  sessions=0;await assert.rejects(createDormitoryConductClient(async()=>({userId:++sessions===1?manager:other,token:'synthetic'}),async()=>Response.json({id,kind:action.kind,version:1,summary:'Saved'})).manage(manager,action),{status:401});
});

test('invalid payloads never dispatch and provider errors or malformed receipts never expose raw content',async()=>{
  let calls=0;const client=createDormitoryConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>{calls++;throw new Error('No fetch');});
  for(const patch of [{result:'recorded'},{result:null},{expected_version:999999999},{user_id:other+'?bad'},{request_id:undefined},{private:'value'}])await assert.rejects(client.manage(manager,{...action,payload:{...action.payload,...patch}} as DormitoryConductAction),{status:400});
  await assert.rejects(client.manage(manager,{...action,extra:true} as DormitoryConductAction),{status:400});assert.equal(calls,0);
  for(const status of [400,401,403,409,500,503])await assert.rejects(createDormitoryConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json({error:'PRIVATE PROVIDER'},{status})).manage(manager,action),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE PROVIDER/);assert.equal((error as {status:number}).status,status>=500?503:status);return true;});
  for(const receipt of [{id,kind:action.kind,version:2,summary:'wrong'},{id:other,kind:action.kind,version:1,summary:'wrong'},{id,kind:action.kind,version:1,summary:'ok',url:'PRIVATE'},
    {id,kind:action.kind,version:1,summary:'\0'},{id,kind:action.kind,version:1,summary:'\ud800'},{id,kind:action.kind,version:1,summary:'x'.repeat(201)}])await assert.rejects(createDormitoryConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json(receipt)).manage(manager,action),{status:503});
});

test('one deadline bounds session, fetch and stream reads; cancellation and byte bounds fail safely',async()=>{
  const never=()=>new Promise<never>(()=>{}),session=async()=>({userId:owner,token:'synthetic'});
  for(const client of [createDormitoryConductClient(never,never,15),createDormitoryConductClient(session,never,15),createDormitoryConductClient(session,async()=>new Response(new ReadableStream({start(){}})),15)])await assert.rejects(client.load(owner),{status:504});
  const controller=new AbortController();controller.abort(new DOMException('cancelled','AbortError'));await assert.rejects(createDormitoryConductClient(session,never).load(owner,controller.signal),{name:'AbortError'});
  for(const response of [new Response('{}',{headers:{'content-length':'4097'}}),new Response(new Uint8Array([0xc3,0x28])),new Response('x'.repeat(4097))])await assert.rejects(createDormitoryConductClient(session,async()=>response).load(owner),{status:503});
  await assert.rejects(createDormitoryConductClient(async()=>{throw new Error('PRIVATE SESSION');},never).load(owner),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE SESSION/);return true;});
});

test('unchanged transport retries preserve caller-supplied request identity and exact save/delete payloads',async()=>{
  const sent:unknown[]=[];let fail=true;const client=createDormitoryConductClient(async()=>({userId:manager,token:'synthetic'}),async(_input,init)=>{
    const value=JSON.parse(String(init?.body));sent.push(value);if(fail){fail=false;throw new Error('Uncertain response');}return Response.json({id:value.payload.id,kind:value.kind,version:value.payload.expected_version+1,summary:'Saved'});
  });
  await assert.rejects(client.manage(manager,action),{status:503});await client.manage(manager,action);assert.deepEqual(sent[0],sent[1]);
});
