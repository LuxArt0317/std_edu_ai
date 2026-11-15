import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import * as intent from '../../server/clubAttendanceIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';

const route='/school-affairs/services/40-1/my-attendance';
const host='https://xiftudmvxphxcjtmfmib.supabase.co';
const foreign='ff53d318-0000-4000-8000-0000000000bb';
const token='fixture-student-club-token',key='fixture-publishable-key';
const listed={id:'df32aa98-0000-4000-8000-000000000012',title:'Robotics Lab Workshop',club_name:'Robotics Team',
  starts_at:'2026-11-12T18:10:00.000001+00:00',location:'Engineering Lab 3',academic_year:115,term:1,
  recorded_at:'2026-11-13T20:45:00.000123+00:00'};
const prompt='Show my saved club activity attendance records.';
let suite=0;

type RequestBody={p_view:string;p_search:string;p_page:number};
type Delivery=(request:RequestBody,attempt:number,owner:string)=>Response|Promise<Response>;
type Step={kind:string;status:string};
const workspace=(owner:string,page:number,rows:object[]=[listed],extra={})=>
  ({userId:owner,view:'my-attendance',page,eligible:false,hasMore:false,rows,...extra});

async function request(handler:ReturnType<typeof createAffairsAssistantHandler>|ReturnType<typeof createResearchAssistantHandler>,
  body:Record<string,unknown>,headers:Record<string,string>={authorization:'Bearer '+token}){
  const sink={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',body,headers},sink);
  return sink;
}

function fixture(t:TestContext,delivery:Delivery){
  const owner='df32aa98-0000-4000-8000-'+String(++suite).padStart(12,'0');
  const reads:RequestBody[]=[],unexpected:string[]=[];
  t.mock.method(globalThis,'fetch',async (input:string|URL,init:RequestInit)=>{
    assert.equal(String(input),host+'/rest/v1/rpc/affairs_read_club_student');
    assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    const headers=new Headers(init.headers);
    assert.equal(headers.get('authorization'),'Bearer '+token);assert.equal(headers.get('apikey'),key);
    const body=JSON.parse(String(init.body));
    assert.deepEqual(body,{p_view:'my-attendance',p_search:'',p_page:body.p_page});
    assert.ok(Number.isInteger(body.p_page)&&body.p_page>=1&&body.p_page<=1000);
    reads.push(body);
    return delivery(body,reads.length,owner);
  });
  const guarded=(dependency:string)=>async()=>{unexpected.push(dependency);throw Error('Unexpected '+dependency);};
  const handler=createAffairsAssistantHandler({
    verifyToken:async received=>{assert.equal(received,token);return {user:{id:owner},url:host,token,key};},
    loadSnapshot:guarded('broad account snapshot'),answerAccount:guarded('account model'),publicResearch:guarded('public research'),
  });
  return {reads,unexpected,ask:(question=prompt,options:Record<string,unknown>={})=>request(handler,{question,route,...options})};
}

function expectVerified(body:any,attempts=1){
  assert.equal(body.status,'answered');
  assert.deepEqual(body.verification,{status:'verified',attempts});
  assert.equal(body.grounding.webSearched,false);assert.equal(body.proposedAction,undefined);
}

test('an own activity attendance answer contains literal native facts, not a directory or officer record',async t=>{
  const h=fixture(t,({p_page},_attempt,owner)=>Response.json(workspace(owner,p_page)));
  const {statusCode,body}=await h.ask('What club events have I attended? Include the start, where and when recorded.',{route:'/'});
  assert.equal(statusCode,200);expectVerified(body);
  for(const value of ['Robotics Lab Workshop','Robotics Team','2026-11-13 02:10','Engineering Lab 3','Academic year: 115','Term: 1','2026-11-14 04:45','stu.best account'])
    assert.ok(body.answer.includes(value),value);
  assert.equal(body.citations[0].chunkId,'account:clubAttendance');assert.equal(body.citations[0].url,route);
  assert.ok(body.activity.some((step:Step)=>step.kind==='account-read:clubAttendance:1'&&step.status==='complete'));
  assert.deepEqual(h.reads.map(read=>read.p_page),[1]);assert.deepEqual(h.unexpected,[]);
  assert.doesNotMatch(JSON.stringify(body),/fixture-student-club|fixture-publishable|df32aa98/u);
});

test('exact page two retains null term, 25 page rows, next page evidence and a 12-row rendered card',async t=>{
  const rows=Array.from({length:25},(_,index)=>({...listed,id:'df32aa98-0000-4000-8000-'+String(index+20).padStart(12,'0'),
    title:'Student workshop '+index,academic_year:null,term:null}));
  const h=fixture(t,({p_page},_attempt,owner)=>Response.json(workspace(owner,p_page,rows,{hasMore:true})));
  const {body}=await h.ask('列出我的活動參與紀錄第２頁。',{route:route+'?page=2'});
  expectVerified(body);
  assert.match(body.answer,/第 2 頁有 25 筆/u);assert.match(body.answer,/後續頁面/u);
  assert.equal(body.citations[0].url,route+'?page=2');assert.equal(body.views[0].total,25);assert.equal(body.views[0].rows.length,12);
  assert.deepEqual(body.views[0].rows[0],['Student workshop 0','Robotics Team','2026-11-13 02:10','Engineering Lab 3','未登錄','未登錄','2026-11-14 04:45']);
  assert.deepEqual(h.reads.map(read=>read.p_page),[2]);
});

test('count-only omits activity values and explicitly scopes the count to the selected page',async t=>{
  const h=fixture(t,({p_page},_attempt,owner)=>Response.json(workspace(owner,p_page)));
  const {body}=await h.ask('How many saved club attendance entries are on page 3?',{route:'/'});
  expectVerified(body);
  assert.match(body.answer,/on page 3: 1/u);assert.doesNotMatch(body.answer,/Robotics|Engineering Lab/u);
  assert.equal(body.views,undefined);assert.equal(body.citations[0].url,route+'?page=3');
  assert.deepEqual(h.reads.map(read=>read.p_page),[3]);
});

test('latest uses source order and the saved start time, not the attendance recording time',async t=>{
  const older={...listed,id:'af32aa98-0000-4000-8000-000000000012',title:'Previous event',starts_at:'2026-11-12T18:10:00.000000+00:00',recorded_at:'2026-11-14T10:00:00Z'};
  const h=fixture(t,({p_page},_attempt,owner)=>Response.json(workspace(owner,p_page,[listed,older])));
  const {body}=await h.ask('What was my latest club activity attendance entry?');
  expectVerified(body);
  assert.match(body.answer,/Robotics Lab Workshop/u);assert.match(body.answer,/latest entry by activity start time/u);
  assert.doesNotMatch(body.answer,/Previous event/u);assert.equal(body.views,undefined);
});

test('mixed requests disclose the partial verified read without fetching the other domain',async t=>{
  const h=fixture(t,({p_page},_attempt,owner)=>Response.json(workspace(owner,p_page)));
  for(const question of ['Show my club activity attendance records and tell me my tuition balance.',
    'What is my tuition balance this semester? Also show my club activity attendance records.']){
    const {body}=await h.ask(question);
    expectVerified(body);
    assert.match(body.answer,/Robotics Lab Workshop/u);assert.match(body.answer,/other requested details need a separate lookup/u);
  }
  assert.equal(h.reads.length,2);assert.deepEqual(h.unexpected,[]);
});

test('empty page and an unavailable source differ, with one exact reread on failure',async t=>{
  const h=fixture(t,({p_page},attempt,owner)=>attempt===1?new Response(null,{status:503}):Response.json(workspace(owner,p_page,[])));
  const {body}=await h.ask('Show this page.',{route:route+'?page=5'});
  expectVerified(body,2);
  assert.match(body.answer,/No saved attendance entries were returned on page 5/u);
  assert.deepEqual(h.reads.map(read=>read.p_page),[5,5]);
  assert.deepEqual(body.activity.filter((step:Step)=>step.kind.startsWith('account-read:clubAttendance:')).map((step:Step)=>step.status),['unavailable','complete']);
});

test('foreign caller, sibling view, and malformed ordered evidence never produce private content',async t=>{
  const h=fixture(t,({p_page},attempt,owner)=>Response.json(attempt%2===1
    ?workspace(foreign,p_page,[{...listed,title:'Foreign sentinel'}])
    :workspace(owner,p_page,[{...listed,title:'Sibling sentinel'}],{view:'my-memberships'})));
  const {body}=await h.ask();
  assert.equal(body.status,'abstained');assert.equal(body.verification.status,'unverified');assert.equal(body.verification.attempts,2);
  assert.equal(body.views,undefined);assert.deepEqual(body.citations,[]);
  assert.doesNotMatch(JSON.stringify(body),/Foreign sentinel|Sibling sentinel|No saved attendance entries/u);
  assert.equal(h.reads.length,2);assert.deepEqual(h.unexpected,[]);
});

test('hidden officer fields and bad chronological order cause abstention, with no draft leakage',async t=>{
  const earlier={...listed,id:'af32aa98-0000-4000-8000-000000000012',title:'Wrong ordering',starts_at:'2026-11-12T18:09:00Z'};
  const h=fixture(t,({p_page},attempt,owner)=>Response.json(workspace(owner,p_page,
    attempt===1?[{...listed,review_note:'Review sentinel'}]:[earlier,listed])));
  const {body}=await h.ask('Show my latest club attendance record.');
  assert.equal(body.status,'abstained');assert.equal(body.verification.attempts,2);
  assert.doesNotMatch(JSON.stringify(body),/Review sentinel|Wrong ordering|Robotics Lab/u);
});

test('foreign, excluded, write requests and invalid selectors never read the student RPC',async t=>{
  const h=fixture(t,()=>assert.fail('Unexpected scope read'));
  for(const [question,options,status] of [
    ['Show another student’s club attendance history.',{},'handoff'],
    ['Show Alice’s club activity attendance.',{},'handoff'],
    ['Show club attendance records for alice.',{},'handoff'],
    ['Who attended these events?',{},'handoff'],
    ['不要查詢我的活動參與紀錄。',{},'answered'],
    ['Mark attendance for my club event.',{},'handoff'],
    ['Show my club attendance and delete it.',{},'handoff'],
    ['When and where can I find my club attendance?',{},'navigation'],
    [prompt,{route:route+'?page=2&page=2'},'clarification'],
    [prompt,{route:route+'?view=officer'},'clarification'],
    ['Show my club attendance on page 0.',{},'clarification'],
    ['Show my club attendance this semester.',{},'clarification'],
    ['Show my club attendance for the Robotics Club.',{},'clarification'],
    ['Show my latest club attendance on page 2.',{},'clarification'],
    [prompt,{images:[{name:'private.png',dataUrl:'synthetic'}]},'image'],
  ] as const){
    const response=await h.ask(question,options);
    if(status==='image'){assert.equal(response.statusCode,400);continue;}
    assert.equal(response.body.status,status==='navigation'?'answered':status,question);
    if(question.startsWith('Show another')||question.startsWith('Show Alice')||question.startsWith('Who'))assert.deepEqual(response.body.citations,[]);
    assert.equal(response.body.proposedAction,undefined);assert.equal(response.body.verification,undefined);
  }
  assert.deepEqual(h.reads,[]);assert.deepEqual(h.unexpected,[]);
});

test('guest safe entry preserves the native page and offers no foreign-record link',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Guest club lookup must not make private or public requests'));
  const guest=createResearchAssistantHandler();
  const valid=await request(guest,{question:prompt,route:route+'?page=7'},{'x-forwarded-for':'192.0.2.53'});
  assert.equal(valid.body.status,'handoff');
  assert.equal(valid.body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route+'?page=7'));
  assert.equal(valid.body.views,undefined);
  const other=await request(guest,{question:'請顯示其他學生的活動參與紀錄',route},{'x-forwarded-for':'192.0.2.54'});
  assert.deepEqual(other.body.citations,[]);assert.match(other.body.answer,/自己帳戶/u);
  for(const question of ['Which clubs am I a member of?','Find club activities.','Open the club directory','Where can I start a new club?',
    'Show my class attendance.','Show my Moodle attendance records.','查詢我的課堂出席紀錄。'])
    assert.equal(intent.clubAttendanceSelection(question,route),null);
});

test('the actual authenticated browser dispatcher enters the verification endpoint before the direct club reader',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const owner='ad100000-0000-4000-8000-000000000001';
  const exports:Record<string,any>={},calls:unknown[]=[];
  runInNewContext(code,{exports,require:(specifier:string)=>{
    if(specifier.endsWith('clubAttendanceIntent.js'))return intent;
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:token}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url:string,init:RequestInit)=>{
    calls.push([url,new Headers(init.headers).get('authorization'),JSON.parse(String(init.body))]);
    return Response.json({status:'answered',answer:'Verified attendance response.',citations:[]});
  }});
  await exports.askSchoolAffairsAssistant(owner,prompt,[],undefined,[],route+'?page=2');
  assert.deepEqual(calls,[['/api/affairs-assistant','Bearer '+token,{question:prompt,history:[],images:[],route:route+'?page=2',stream:false}]]);
});
