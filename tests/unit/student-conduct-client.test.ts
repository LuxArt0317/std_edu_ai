import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStudentConductClient,parseStudentConduct,studentConductFieldMap,type StudentConductAction,type StudentConductRecord} from '../../src/services/studentConductClient';
import {studentConductTextLimits} from '../../server/studentConduct.js';

const owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',requestId='30000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00Z';
const row:StudentConductRecord={id,userId:owner,sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,rowOrder:0,
  occurredOnText:null,studentNumber:'SYNTHETIC',studentName:' Synthetic Student ',academicYearText:'001',semesterText:'',yearLevelText:null,
  reasonText:'\u{20000}'.repeat(40),conductCode:null,conductName:'Literal local record',quantityText:'0',voidStatusText:''};
const action:StudentConductAction={kind:'save_student_conduct',payload:{id,user_id:owner,request_id:requestId,expected_version:0,row_order:0,
  occurred_on_text:null,student_number:'SYNTHETIC',student_name:' Synthetic Student ',academic_year_text:'001',semester_text:'',year_level_text:null,
  reason_text:'\u{20000}'.repeat(40),conduct_code:null,conduct_name:'Literal local record',quantity_text:'0',void_status_text:''}};

test('conduct parser preserves every nullable literal cell and explicit order without mutating input',()=>{
  const later={...row,id:'20000000-0000-4000-8000-000000000002',rowOrder:8};
  const parsed=parseStudentConduct({records:[later,row]},owner);
  assert.deepEqual(parsed.records.map(value=>value.id),[id,later.id]);
  for(const {field,key} of studentConductFieldMap)assert.equal(parsed.records[0][key],action.payload[field as keyof typeof action.payload]);
  parsed.records[0].studentName='changed';assert.equal(row.studentName,' Synthetic Student ');
  assert.deepEqual(parseStudentConduct({records:[]},owner),{records:[]});
});

test('foreign, duplicate, incomplete, malformed or capability-bearing projections fail completely',()=>{
  const withoutCell=Object.fromEntries(Object.entries(row).filter(([key])=>key!=='quantityText'));
  for(const value of [{records:[{...row,userId:other}]},{records:[row,row]},{records:[withoutCell]},
    {records:[{...row,quantityText:0}]},{records:[{...row,rowOrder:10001}]},{records:[{...row,reasonText:'\ud800'}]},
    {records:[{...row,createdAt:'2030-02-30T00:00:00Z'}]},{records:[{...row,version:0}]},{records:[{...row,downloadUrl:'private'}]},
    {records:[row],documents:[]},{records:Array.from({length:1001},()=>row)}])assert.throws(()=>parseStudentConduct(value,owner));
});

test('caller JWT scopes are exact and writes preserve selected owner, null, blank and string zero',async()=>{
  const calls:{path:string;init:RequestInit|undefined}[]=[];let caller=owner;
  const client=createStudentConductClient(async()=>({userId:caller,token:'synthetic-only'}),async(input,init)=>{
    calls.push({path:String(input),init});assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');
    assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(init?.method==='POST'){const sent=JSON.parse(String(init.body));return Response.json({id:sent.payload.id,kind:sent.kind,version:sent.payload.expected_version+1,summary:'Saved'});}
    return Response.json({records:[row]});
  });
  await client.load(owner);assert.equal(calls[0].path,'/api/affairs-data?scope=student-conduct');
  caller=manager;await client.loadAdmin(manager,owner);assert.equal(calls[1].path,'/api/affairs-data?scope=student-conduct-admin&user_id='+owner);
  assert.equal((await client.manage(manager,action)).version,1);assert.deepEqual(JSON.parse(String(calls[2].init!.body)),action);
  const remove:StudentConductAction={kind:'delete_student_conduct',payload:{id,user_id:owner,request_id:requestId,expected_version:1}};
  assert.equal((await client.manage(manager,remove)).version,2);assert.deepEqual(JSON.parse(String(calls[3].init!.body)),remove);
  await assert.rejects(client.loadAdmin(manager,'invalid'),{status:400});assert.equal(calls.length,4);
});

test('account changes before or after requests suppress results; drafts are copied before session awaits',async()=>{
  let sessions=0,fetches=0;
  const changing=createStudentConductClient(async()=>({userId:++sessions===1?owner:other,token:'synthetic'}),async()=>{fetches++;return Response.json({records:[row]});});
  await assert.rejects(changing.load(owner),{status:401});await assert.rejects(changing.manage(manager,action),{status:401});assert.equal(fetches,1);
  const copy=structuredClone(action),expected=structuredClone(action);let sent:unknown;
  const client=createStudentConductClient(async()=>{copy.payload.user_id=other;return {userId:manager,token:'synthetic'};},async(_input,init)=>{
    sent=JSON.parse(String(init?.body));return Response.json({id,kind:action.kind,version:1,summary:'Saved'});
  });
  await client.manage(manager,copy);assert.deepEqual(sent,expected);
});

test('strict writes reject bad cells and byte limits before HTTP; receipts and provider errors are sanitized',async()=>{
  let calls=0;const invalid=createStudentConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>{calls++;throw new Error('No network');});
  for(const patch of [{quantity_text:0},{reason_text:'x'.repeat(2001)},{student_name:'\0'}, {row_order:10001},{unknown:'private'}]){
    await assert.rejects(invalid.manage(manager,{...action,payload:{...action.payload,...patch}} as StudentConductAction),{status:400});
  }
  const escaped=Object.fromEntries(Object.entries(studentConductTextLimits).map(([field,limit])=>[field,'\u0001'.repeat(limit)]));
  await assert.rejects(invalid.manage(manager,{...action,payload:{...action.payload,...escaped}} as StudentConductAction),/16000-byte/);
  assert.equal(calls,0);
  for(const status of [400,401,403,409,500,503]){
    const client=createStudentConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json({error:'PRIVATE PROVIDER VALUE'},{status}));
    await assert.rejects(client.manage(manager,action),(error:unknown)=>{assert.doesNotMatch(String(error),/PRIVATE PROVIDER/);assert.equal((error as {status:number}).status,status>=500?503:status);return true;});
  }
  for(const receipt of [{id,kind:action.kind,version:2,summary:'wrong version'},{id,kind:action.kind,version:1,summary:'ok',url:'private'},
    {id:other,kind:action.kind,version:1,summary:'wrong ID'}]){
    const client=createStudentConductClient(async()=>({userId:manager,token:'synthetic'}),async()=>Response.json(receipt));
    await assert.rejects(client.manage(manager,action),{status:503});
  }
});

test('one deadline covers session, HTTP and response stream; explicit abort and oversized responses fail closed',async()=>{
  const never=()=>new Promise<never>(()=>{}),session=async()=>({userId:owner,token:'synthetic'});
  for(const client of [createStudentConductClient(never,async()=>{throw new Error('No fetch');},15),
    createStudentConductClient(session,never,15),createStudentConductClient(session,async()=>new Response(new ReadableStream({start(){}})),15)]){
    await assert.rejects(client.load(owner),{status:504});
  }
  const controller=new AbortController();controller.abort(new DOMException('cancelled','AbortError'));
  await assert.rejects(createStudentConductClient(session,never).load(owner,controller.signal),{name:'AbortError'});
  const oversized=createStudentConductClient(session,async()=>new Response('{}',{headers:{'content-length':String(20*1024*1024+1)}}));
  await assert.rejects(oversized.load(owner),{status:503});
});
