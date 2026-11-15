import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {discoverClientDispatchSurfaces} from '../evaluation/client-dispatch-inventory.mjs';

const original=(await discoverClientDispatchSurfaces()).questions.filter((row:{domain:string})=>row.domain==='club-student');
const cases=Object.fromEntries(original.map((row:{mode:string;question:string})=>[row.mode,row.question]));
assert.equal(original.length,5);
const route='/school-affairs/services/40-1/my-memberships';
const host='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='membership-qa-token',key='membership-qa-publishable';
const id=(value:number)=>'2f734a98-0000-4000-8000-'+String(value).padStart(12,'0');
const ownRoles=[{id:id(150),name:'Computer Society',role_label:'Treasurer',active:true,academic_year:115,term:1},
  {id:id(151),name:'Photography Club',role_label:'Member',active:false,academic_year:114,term:2}];
const student=id(100);
const enrollment=(owner:string,index:number,current=true)=>({id:id(index),student_id:student,section_id:id(index+20),status:'enrolled',source_mode:'verified',
  student:{id:student,user_id:owner},section:{id:id(index+20),course_id:id(index+40),term_id:id(index+60),weekday:1,
    starts_at:'09:00:00',ends_at:'10:00:00',room:'Lab',course:{id:id(index+40),code:current?'CS115':'CS101',title:current?'Database Design':'Past Class'},
    term:{id:id(index+60),label:current?'Saved current term':'Past term',starts_on:current?'2020-01-01':'2010-01-01',ends_on:current?'2100-01-01':'2011-01-01'}}});
let ownerIndex=0;

async function request(handler:ReturnType<typeof createAffairsAssistantHandler>|ReturnType<typeof createResearchAssistantHandler>,question:string){
  const response={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',body:{question,route},headers:{authorization:'Bearer '+token}},response);
  return response;
}

function fixture(t:TestContext,options:{empty?:boolean;invalidOwner?:boolean;clubFailures?:number;subjectFailures?:number;many?:boolean}={}){
  const owner=id(++ownerIndex);
  const disabled=()=>{assert.fail('An unrelated record, model or public research was used.');};
  const handler=createAffairsAssistantHandler({verifyToken:async received=>{
    assert.equal(received,token);return {user:{id:owner},token,key,url:host};
  },loadSnapshot:disabled,answerAccount:disabled,publicResearch:disabled});
  const readPaths:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:string|URL,init:RequestInit)=>{
    const url=new URL(String(input)),headers=new Headers(init.headers);
    assert.equal(url.origin,host);assert.equal(init.redirect,'error');
    assert.equal(headers.get('authorization'),'Bearer '+token);assert.equal(headers.get('apikey'),key);
    readPaths.push(url.pathname);
    if(url.pathname==='/rest/v1/rpc/affairs_read_club_student'){
      assert.equal(init.method,'POST');
      assert.deepEqual(JSON.parse(String(init.body)),{p_view:'my-memberships',p_search:'',p_page:1});
      if(readPaths.filter(path=>path===url.pathname).length<=(options.clubFailures??0))return new Response(null,{status:503});
      const rows=options.empty?[]:options.many?Array.from({length:25},(_,index)=>({...ownRoles[0],id:id(200+index),name:`Saved Club ${index}`})):ownRoles;
      return Response.json({userId:options.invalidOwner?id(990):owner,view:'my-memberships',page:1,eligible:false,hasMore:!!options.many,rows});
    }
    assert.equal(init.method,'GET');
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      if(readPaths.filter(path=>path===url.pathname).length<=(options.subjectFailures??0))return new Response(null,{status:503});
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
    assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    assert.equal(url.searchParams.get('status'),'eq.enrolled');assert.equal(headers.get('prefer'),'count=exact');
    return Response.json([enrollment(owner,101),enrollment(owner,102,false)],{headers:{'content-range':'0-1/2'}});
  });
  return {ask:(question:string)=>request(handler,question),readPaths};
}

const club='/rest/v1/rpc/affairs_read_club_student',students='/rest/v1/affairs_students',courses='/rest/v1/affairs_enrollments';

test('the original membership question returns saved roles and makes the club status explicit',async t=>{
  const h=fixture(t),{statusCode,body}=await h.ask(cases.record);
  assert.equal(statusCode,200);assert.deepEqual(h.readPaths,[club]);
  assert.deepEqual(body.verification,{status:'verified',attempts:1});
  assert.deepEqual(body.views[0].rows,[['Computer Society','Treasurer','Active'],['Photography Club','Member','Inactive']]);
  assert.match(body.answer,/status is for the club itself/u);
  assert.equal(body.citations[0].url,route);assert.equal(body.grounding.webSearched,false);
  assert.doesNotMatch(JSON.stringify(body),/2f734a98|membership-qa-token/u);
});

test('the frozen compound question reads both sources and includes only current subjects',async t=>{
  const h=fixture(t),{body}=await h.ask(cases.multipart);
  assert.deepEqual(h.readPaths.toSorted(),[club,students,courses].sort());
  assert.deepEqual(body.verification,{status:'verified',attempts:1});
  assert.match(body.answer,/Computer Society/u);assert.match(body.answer,/CS115.*Database Design/u);
  assert.doesNotMatch(body.answer,/Past Class|separate lookup/u);
  assert.deepEqual(body.citations.map((value:{chunkId:string})=>value.chunkId),['account:clubMemberships','account:courses']);
});

test('the frozen compound question retries just the failed source and preserves the verified part',async t=>{
  const h=fixture(t,{subjectFailures:2}),{body}=await h.ask(cases.multipart);
  assert.deepEqual(h.readPaths.toSorted(),[club,students,students].sort());
  assert.deepEqual(body.verification,{status:'unverified',attempts:2,reason:'requested_record_source_unavailable'});
  assert.match(body.answer,/Computer Society/u);assert.match(body.answer,/couldn’t verify your current subjects/u);
  assert.deepEqual(body.citations.map((value:{chunkId:string})=>value.chunkId),['account:clubMemberships']);
  assert.ok(body.activity.some(({kind,status}:{kind:string;status:string})=>kind==='account-read:courses:2'&&status==='unavailable'));
  assert.ok(body.activity.some(({kind}:{kind:string})=>kind==='partial-verification'));
});

test('a recovered club read keeps the separately verified timetable',async t=>{
  const h=fixture(t,{clubFailures:1}),{body}=await h.ask(cases.multipart);
  assert.deepEqual(h.readPaths.toSorted(),[club,club,students,courses].sort());
  assert.deepEqual(body.verification,{status:'verified',attempts:2});assert.match(body.answer,/Computer Society/u);
});

test('the original empty account is independent of public records or a read failure',async t=>{
  const h=fixture(t,{empty:true}),{body}=await h.ask(cases.empty);
  assert.deepEqual(h.readPaths,[club]);assert.deepEqual(body.verification,{status:'verified',attempts:1});
  assert.match(body.answer,/no club memberships saved for your account/u);assert.equal(body.views,undefined);
});

test('the original foreign question and a public membership inquiry do not read records',async t=>{
  const h=fixture(t),{body}=await h.ask(cases.foreign);
  assert.equal(body.status,'handoff');assert.deepEqual(h.readPaths,[]);assert.deepEqual(body.citations,[]);
  assert.match(body.answer,/can’t access another student/u);
  const guest=await request(createResearchAssistantHandler(),cases.record);
  assert.equal(guest.body.status,'handoff');assert.match(guest.body.citations[0].url,/^\/school-affairs\/login\?next=/u);
  assert.deepEqual(h.readPaths,[]);
});

test('the original unavailable question and wrong-owner payloads never become empty or public answers',async t=>{
  const h=fixture(t,{clubFailures:2,invalidOwner:true});
  for(let index=0;index<2;index++){
    const {body}=await h.ask(cases['read-failure']);
    assert.equal(body.status,'abstained');assert.equal(body.verification.status,'unverified');
    assert.equal(body.verification.attempts,2);assert.equal(body.grounding.webSearched,false);
    assert.match(body.answer,/couldn’t verify your saved club memberships/u);
    assert.doesNotMatch(body.answer,/no club memberships|Computer Society/u);
  }
  assert.deepEqual(h.readPaths,[club,club,club,club]);
});

test('a long membership list discloses its page and excerpt',async t=>{
  const h=fixture(t,{many:true}),{body}=await h.ask(cases.record);
  assert.deepEqual(h.readPaths,[club]);assert.equal(body.views[0].total,25);assert.equal(body.views[0].rows.length,12);
  assert.match(body.answer,/More records are available/u);
});


test('standalone membership with a partly unsupported ask keeps the known scope',async t=>{
  const h=fixture(t),{body}=await h.ask('Show my club memberships. Also check other details from the archive.');
  assert.deepEqual(h.readPaths,[club]);assert.match(body.answer,/Computer Society.*separate lookup/su);
  const denied=await h.ask('Show my classmate’s club records.');
  assert.equal(denied.body.status,'handoff');assert.deepEqual(h.readPaths,[club]);
});

test('Traditional Chinese uses the same owned sources for a combined question',async t=>{
  const h=fixture(t),{body}=await h.ask('我目前參加哪些社團？另外請查看我本學期的課程。');
  assert.deepEqual(h.readPaths.toSorted(),[club,students,courses].sort());
  assert.deepEqual(body.verification,{status:'verified',attempts:1});
  assert.match(body.answer,/社團狀態：?[: ]*運作中/u);
  assert.match(body.answer,/本學期已儲存的校務課程.*Database Design/su);
});
