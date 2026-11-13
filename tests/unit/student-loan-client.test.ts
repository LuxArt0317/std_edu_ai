import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStudentLoanClient,parseStudentLoan,type StudentLoanAction,type StudentLoanRecord} from '../../src/services/studentLoanClient';
import {studentLoanTextLimits} from '../../server/studentLoan.js';

const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00.123456+08:00';
const row:StudentLoanRecord={id,userId:owner,sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,currentTermLabel:' 001 ',currentApplicationState:'unknown',currentApplicationText:null,progressText:'',historyCount:0,historyText:' Literal 😀 '};
const action:StudentLoanAction={kind:'save_student_loan',payload:{id,user_id:owner,request_id:requestId,expected_version:0,current_term_label:' 001 ',current_application_state:'unknown',current_application_text:null,progress_text:'',history_count:0,history_text:' Literal 😀 '}};

test('strict loan snapshots preserve absent, null, blank, zero and exact microseconds without mutation',()=>{
  assert.deepEqual(parseStudentLoan({status:'loaded',record:null},owner),{status:'loaded',record:null});
  const copy=parseStudentLoan({status:'loaded',record:row},owner);assert.deepEqual(copy.record,row);copy.record!.historyText='changed';assert.equal(row.historyText,' Literal 😀 ');
  assert.equal(copy.record!.createdAt,date);assert.equal(copy.record!.historyCount,0);assert.equal(copy.record!.currentApplicationText,null);assert.equal(copy.record!.progressText,'');
});

test('foreign, missing, malformed and capability-bearing snapshots fail closed instead of empty history',()=>{
  for(const value of [{status:'loaded'},{status:'unavailable',record:null},{status:'loaded',record:null,url:'private'},
    ...[{userId:other},{currentApplicationState:'approved'},{historyCount:'0'},{historyCount:-1},{historyCount:1000001},{version:0},{version:1000000000},{createdAt:'2030-02-30T00:00:00Z'},
      {currentApplicationText:undefined},{progressText:'\ud800'},{historyText:'\0'},{downloadUrl:'PRIVATE'}].map(patch=>({status:'loaded',record:{...row,...patch}}))])assert.throws(()=>parseStudentLoan(value,owner));
  assert.throws(()=>parseStudentLoan(Object.create({status:'loaded',record:row}),owner));assert.throws(()=>parseStudentLoan({status:'loaded',record:row},'invalid'));
});

test('personal and selected-admin reads use exact caller JWT scopes; both writes preserve literal payloads',async()=>{
  const calls:{path:string;init:RequestInit|undefined}[]=[];let caller=owner;
  const client=createStudentLoanClient(async()=>({userId:caller,token:'synthetic-only'}),async(input,init)=>{
    calls.push({path:String(input),init});assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');
    assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(init?.method==='POST'){const sent=JSON.parse(String(init.body));return Response.json({id:sent.payload.id,kind:sent.kind,version:sent.payload.expected_version+1,summary:'Saved'});}
    return Response.json({status:'loaded',record:row});
  });
  await client.load(owner);assert.equal(calls[0].path,'/api/affairs-data?scope=student-loan');caller=manager;
  await client.loadAdmin(manager,owner);assert.equal(calls[1].path,'/api/affairs-data?scope=student-loan-admin&user_id='+owner);
  assert.equal((await client.manage(manager,action)).version,1);assert.deepEqual(JSON.parse(String(calls[2].init!.body)),action);
  const remove:StudentLoanAction={kind:'delete_student_loan',payload:{id,user_id:owner,request_id:requestId,expected_version:1}};
  assert.equal((await client.manage(manager,remove)).version,2);assert.deepEqual(JSON.parse(String(calls[3].init!.body)),remove);
  await assert.rejects(client.loadAdmin(manager,'invalid'),{status:400});assert.equal(calls.length,4);
});

test('account changes before and after HTTP reject stale reads and writes; pending payloads are immutable copies',async()=>{
  let sessions=0,fetches=0;const changing=createStudentLoanClient(async()=>({userId:++sessions===1?owner:other,token:'synthetic'}),async()=>{fetches++;return Response.json({status:'loaded',record:row});});
  await assert.rejects(changing.load(owner),{status:401});await assert.rejects(changing.manage(manager,action),{status:401});assert.equal(fetches,1);
  const copy=structuredClone(action),expected=structuredClone(action);let sent:unknown;
  const client=createStudentLoanClient(async()=>{copy.payload.user_id=other;return {userId:manager,token:'synthetic'};},async(_input,init)=>{sent=JSON.parse(String(init?.body));return Response.json({id,kind:action.kind,version:1,summary:'Saved'});});
  await client.manage(manager,copy);assert.deepEqual(sent,expected);
  let reads=0;const changedAfterWrite=createStudentLoanClient(async()=>({userId:++reads===1?manager:other,token:'synthetic'}),async()=>Response.json({id,kind:action.kind,version:1,summary:'Saved'}));
  await assert.rejects(changedAfterWrite.manage(manager,action),{status:401});
});

test('strict payload and JSONB byte checks run before HTTP; errors and receipts cannot expose provider contents',async()=>{
  let calls=0;const invalid=createStudentLoanClient(async()=>({userId:manager,token:'synthetic'}),async()=>{calls++;throw new Error('No HTTP');});
  for(const patch of [{current_application_state:'approved'},{history_count:'0'},{history_count:1000001},{current_term_label:'x'.repeat(161)},{history_text:'\0'},{expected_version:999999999},{unknown:'private'}]){
    await assert.rejects(invalid.manage(manager,{...action,payload:{...action.payload,...patch}} as StudentLoanAction),{status:400});
  }
  await assert.rejects(invalid.manage(manager,{...action,extra:true} as StudentLoanAction),{status:400});
  await assert.rejects(invalid.manage(manager,Object.create(action) as StudentLoanAction),{status:400});
  const escaped=Object.fromEntries(Object.entries(studentLoanTextLimits).map(([field,limit])=>[field,'\u0001'.repeat(limit)]));
  await assert.rejects(invalid.manage(manager,{...action,payload:{...action.payload,...escaped}} as StudentLoanAction),/32000-byte/);assert.equal(calls,0);
  for(const status of [400,401,403,409,500,503]){
    const client=createStudentLoanClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json({error:'PRIVATE PROVIDER VALUE'},{status}));
    await assert.rejects(client.manage(manager,action),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE PROVIDER/);assert.equal((error as {status:number}).status,status>=500?503:status);return true;});
  }
  for(const receipt of [{id,kind:action.kind,version:2,summary:'wrong version'},{id,kind:action.kind,version:1,summary:'ok',url:'private'},{id:other,kind:action.kind,version:1,summary:'wrong ID'},{id,kind:action.kind,version:1,summary:'\ud800'}]){
    const client=createStudentLoanClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json(receipt));await assert.rejects(client.manage(manager,action),{status:503});
  }
});

test('one deadline bounds session, fetch and body; cancellation, malformed UTF8 and oversized reads fail safely',async()=>{
  const never=()=>new Promise<never>(()=>{}),session=async()=>({userId:owner,token:'synthetic'});
  for(const client of [createStudentLoanClient(never,async()=>{throw new Error('No fetch');},15),createStudentLoanClient(session,never,15),createStudentLoanClient(session,async()=>new Response(new ReadableStream({start(){}})),15)])await assert.rejects(client.load(owner),{status:504});
  const controller=new AbortController();controller.abort(new DOMException('cancelled','AbortError'));await assert.rejects(createStudentLoanClient(session,never).load(owner,controller.signal),{name:'AbortError'});
  for(const response of [new Response('{}',{headers:{'content-length':'65537'}}),new Response(new Uint8Array([0xc3,0x28])),new Response('x'.repeat(65537))])await assert.rejects(createStudentLoanClient(session,async()=>response).load(owner),{status:503});
  await assert.rejects(createStudentLoanClient(async()=>{throw new Error('PRIVATE SESSION');},never).load(owner),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE SESSION/);return true;});
});
