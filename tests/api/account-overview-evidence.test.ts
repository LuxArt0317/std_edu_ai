import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {loadAccountOverviewSnapshot as load,accountOverviewLimits} from '../../server/accountOverviewEvidence.js';

const id=(n:number)=>'86000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),studentId=id(2),programId=id(3),foreign=id(99);
const account=()=>({user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_PUBLIC_KEY',token:'OFFLINE_CALLER_TOKEN'});
const profile=()=>({user_id:owner,display_name:'Evaluation Student',preferred_name:null});
const student=()=>({id:studentId,user_id:owner,year_level:3,source_mode:'sample',program_id:programId,program:{id:programId,name:'Information Studies',source_mode:'sample'}});
const enrollment=()=>({id:id(6),student_id:studentId,section_id:id(7),status:'enrolled',source_mode:'sample',student:{id:studentId,user_id:owner},
  section:{id:id(7),course_id:id(4),term_id:id(5),weekday:2,starts_at:'13:10:00',ends_at:'15:00:00',room:'R301',
    course:{id:id(4),code:'DB301',title:'Database Design'},term:{id:id(5),label:'115學年度第1學期',starts_on:'2021-09-01',ends_on:'2098-01-15'}}});
const dtmCourse=(n=8)=>({id:id(n),user_id:owner,code:'DTM301',title:'Learning Research',term:'115學年度第1學期',source_mode:'personal'});
type Seen={url:URL;method:string;headers:Headers};
type Override=(request:Seen)=>Response|Promise<Response>|undefined;
function json(rows:unknown[],total=rows.length){return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json','content-range':rows.length?`0-${rows.length-1}/${total}`:`*/${total}`}});}
function transport(override?:Override){
  const seen:Seen[]=[];
  const fetchImpl:typeof fetch=async(input,options)=>{
    const url=new URL(String(input)),request={url,method:options?.method??'GET',headers:new Headers(options?.headers)};seen.push(request);
    assert.equal(url.origin,account().url);assert.ok(['GET','HEAD'].includes(request.method));assert.equal(options?.redirect,'error');
    assert.equal(request.headers.get('authorization'),'Bearer OFFLINE_CALLER_TOKEN');assert.equal(request.headers.get('apikey'),'OFFLINE_PUBLIC_KEY');
    const replacement=override?.(request);if(replacement!==undefined)return await replacement;
    const table=url.pathname.slice('/rest/v1/'.length),params=url.searchParams;
    if(request.method==='HEAD'){
      assert.equal(params.get('select'),'id');assert.equal(params.get('limit'),'0');assert.equal(request.headers.get('prefer'),'count=exact');
      const counts:Record<string,number>={affairs_assignments:3,affairs_charges:2,affairs_tasks:2,affairs_service_requests:1};assert.ok(Object.hasOwn(counts,table));
      assert.equal(params.get(['affairs_assignments','affairs_charges'].includes(table)?'student_id':'user_id'),'eq.'+(['affairs_assignments','affairs_charges'].includes(table)?studentId:owner));
      return new Response(null,{headers:{'content-range':'*/'+counts[table]}});
    }
    if(table==='affairs_profiles'){assert.equal(params.get('user_id'),'eq.'+owner);return json([profile()]);}
    if(table==='affairs_students'){assert.equal(params.get('user_id'),'eq.'+owner);return json([params.get('select')==='id,user_id'?{id:studentId,user_id:owner}:student()]);}
    if(table==='affairs_enrollments'){assert.equal(params.get('student_id'),'eq.'+studentId);assert.equal(params.get('status'),'eq.enrolled');return json([enrollment()]);}
    if(table==='dtm_courses'){assert.equal(params.get('user_id'),'eq.'+owner);assert.equal(params.get('order'),'id.asc');return json([dtmCourse()]);}
    throw Error('Unexpected source '+table);
  };
  return {seen,fetchImpl};
}

test('seven-source overview uses only exact owned metadata GETs and four count-only HEADs, never initialization',async()=>{
  const io=transport(),result=await load(account(),{},{fetchImpl:io.fetchImpl});
  assert.equal(result.overviewScope,true);assert.equal(result.profile.displayName,'Evaluation Student');
  assert.deepEqual(result.student,{yearLevel:3,sourceMode:'sample',program:'Information Studies',programSourceMode:'sample'});
  assert.equal(result.courses[0].code,'DB301');assert.equal(result.dtm.courses[0].title,'Learning Research');
  for(const [key,total]of Object.entries({assignments:3,charges:2,tasks:2,requests:1}))assert.deepEqual(result.overview[key as 'tasks'],{readState:'ok',total,included:0,complete:true,reason:null});
  assert.equal(io.seen.filter(row=>row.method==='HEAD').length,4);
  assert.deepEqual([...new Set(io.seen.map(row=>row.url.pathname.split('/').at(-1)))].sort(),['affairs_assignments','affairs_charges','affairs_enrollments','affairs_profiles','affairs_service_requests','affairs_students','affairs_tasks','dtm_courses']);
  const sources=io.seen.map(row=>row.url.searchParams.get('select')).join('\n');
  assert.doesNotMatch(sources,/\*|email|student_number|full_name|notes|details|grades|materials|attendance|amount_due|amount_paid|role/u);
  assert.doesNotMatch(JSON.stringify(result),/OFFLINE_|student_number|email|fullName|"(?:requests|tasks|assignments|charges)":\[/u);
  assert.deepEqual(Object.keys(result.overview).sort(),['profile','courses','dtm','assignments','charges','tasks','requests'].sort());
});

test('successful zero counts differ from failed or malformed exact-count responses',async()=>{
  for(const value of [new Response(null,{headers:{'content-range':'*/0'}}),new Response(null,{status:403}),new Response(null,{headers:{'content-range':'*/42'}}),new Response(null,{headers:{'content-range':'0-0/*'}}),new Response(null,{headers:{'content-range':'0-0/1'}})]){
    const io=transport(row=>row.url.pathname.endsWith('/affairs_tasks')?value:undefined),result=await load(account(),{},{fetchImpl:io.fetchImpl});
    const range=value.headers.get('content-range');
    if(range==='*/0')assert.deepEqual(result.overview.tasks,{readState:'empty',total:0,included:0,complete:true,reason:null});
    else if(range==='*/42')assert.equal(result.overview.tasks.total,42);
    else{assert.equal(result.overview.tasks.readState,'unavailable');assert.equal(result.overview.tasks.total,null);}
    assert.equal(result.overview.requests.total,1);
  }
});

test('unlinked School Affairs does not initialize or erase independently saved DTM metadata',async()=>{
  const io=transport(row=>/\/(?:affairs_profiles|affairs_students)$/u.test(row.url.pathname)?json([]):undefined);
  const result=await load(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.studentRecordFound,false);assert.equal(result.profileRecordFound,false);
  assert.equal(result.student,null);assert.equal(result.overview.profile.readState,'empty');assert.equal(result.overview.courses.reason,'student_unlinked');
  for(const key of ['assignments','charges'] as const){assert.equal(result.overview[key].reason,'student_unlinked');assert.equal(result.overview[key].total,null);}
  assert.equal(result.dtm.courses[0].code,'DTM301');assert.equal(result.overview.tasks.total,2);
  assert.equal(io.seen.some(row=>/\/(?:affairs_enrollments|affairs_assignments|affairs_charges)$/u.test(row.url.pathname)),false);
});

test('foreign or malformed parent rows stop dependent reads without disclosing fields',async()=>{
  for(const bad of [{...student(),user_id:foreign},{...student(),program:{...student().program,id:foreign}},{...student(),year_level:0},{...student(),full_name:'PRIVATE EXTRA'}]){
    const io=transport(row=>row.url.pathname.endsWith('/affairs_students')&&row.url.searchParams.get('select')!=='id,user_id'?json([bad]):undefined);
    const result=await load(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.overview.profile.readState,'partial');assert.equal(result.studentRecordFound,null);assert.equal(result.student,null);
    assert.equal(result.overview.assignments.reason,'student_lookup_unavailable');assert.equal(result.overview.charges.total,null);
    assert.equal(io.seen.some(row=>/\/(?:affairs_assignments|affairs_charges)$/u.test(row.url.pathname)),false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE EXTRA/u);
  }
  for(const table of ['affairs_profiles','dtm_courses']){
    const io=transport(row=>row.url.pathname.endsWith('/'+table)?json([{...(table==='affairs_profiles'?profile():dtmCourse()),user_id:foreign}]):undefined),result=await load(account(),{},{fetchImpl:io.fetchImpl});
    assert.equal(result.overview[table==='affairs_profiles'?'profile':'dtm'].complete,false);
    assert.doesNotMatch(JSON.stringify(result),new RegExp(foreign));
  }
});

test('successful empty DTM, cap overflow and JSON-byte omission retain truthful separate totals',async()=>{
  const empty=await load(account(),{},{fetchImpl:transport(row=>row.url.pathname.endsWith('/dtm_courses')?json([]):undefined).fetchImpl});
  assert.deepEqual(empty.overview.dtm,{readState:'empty',total:0,included:0,complete:true,reason:null});
  const rows=Array.from({length:200},(_,index)=>({...dtmCourse(index+100),title:'界'.repeat(300)}));
  const result=await load(account(),{},{fetchImpl:transport(row=>row.url.pathname.endsWith('/dtm_courses')?json(rows,201):undefined).fetchImpl});
  assert.equal(result.overview.dtm.readState,'partial');assert.equal(result.overview.dtm.total,201);assert.ok(result.overview.dtm.included<200);
  assert.equal(result.overview.dtm.included,result.dtm.courses.length);assert.equal(result.overview.dtm.reason,'response_budget');
  assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=accountOverviewLimits.responseBytes);assert.equal(rows.length,200);assert.equal(rows[0].title.length,300);
  assert.equal(result.overview.requests.total,1);
});

test('failed profile does not erase valid year/program, and failed timetable is not zero enrollment',async()=>{
  const io=transport(row=>row.url.pathname.endsWith('/affairs_profiles')||row.url.pathname.endsWith('/affairs_enrollments')?new Response(null,{status:503}):undefined);
  const result=await load(account(),{},{fetchImpl:io.fetchImpl});assert.equal(result.profile.displayName,undefined);assert.equal(result.profileRecordFound,null);assert.equal(result.student?.yearLevel,3);
  assert.equal(result.overview.profile.readState,'partial');assert.equal(result.overview.courses.readState,'unavailable');assert.equal(result.overview.courses.total,null);assert.equal(result.overview.requests.total,1);
});

test('invalid project, caller and options stop before any transport',async()=>{
  let calls=0;const fetchImpl:typeof fetch=async()=>{calls++;throw Error('Must not read');};
  for(const caller of [{...account(),url:'https://elsewhere.invalid'},{...account(),user:{id:foreign+'bad'}},{...account(),token:'bad\nheader'}])await assert.rejects(load(caller,{}, {fetchImpl}));
  await assert.rejects(load(account(),{deadline:NaN},{fetchImpl}));
  await assert.rejects(load(account(),{userId:foreign} as never,{fetchImpl}));
  assert.equal(calls,0);
});

test('caller credentials and transport are captured before asynchronous reads',async()=>{
  const caller=account(),io=transport(),dependencies={fetchImpl:io.fetchImpl};
  const pending=load(caller,{},dependencies);caller.user.id=foreign;caller.token='CHANGED_TOKEN';caller.key='CHANGED_KEY';dependencies.fetchImpl=async()=>{throw Error('Replaced transport');};
  const result=await pending;assert.equal(result.profile.userId,owner);assert.equal(result.overview.tasks.total,2);
  assert.ok(io.seen.every(row=>row.headers.get('authorization')==='Bearer OFFLINE_CALLER_TOKEN'));
});

test('shared inherited deadline bounds hung readers and preserves unavailable states without retry',async()=>{
  let calls=0;const caller={...account(),requestDeadline:Date.now()+25};
  const result=await load(caller,{deadline:Date.now()+5000},{fetchImpl:async()=>{calls++;return new Promise<Response>(()=>{});}});
  assert.equal(calls,5);assert.equal(result.studentRecordFound,null);assert.equal(result.overview.dtm.reason,'deadline_exceeded');
  assert.equal(result.overview.tasks.total,null);assert.equal(result.overview.assignments.reason,'student_lookup_unavailable');
  assert.ok(Object.values(result.overview).every(row=>!row.complete));
});

test('mismatched successful student linkage is unknown and never claims absence or renders courses',async()=>{
  for(const metadataMissing of [true,false]){
    const io=transport(row=>row.url.pathname.endsWith('/affairs_students')&&((row.url.searchParams.get('select')!=='id,user_id')===metadataMissing)?json([]):undefined);
    const result=await load(account(),{},{fetchImpl:io.fetchImpl});
    assert.equal(result.overview.courses.readState,'unavailable');assert.equal(result.overview.courses.total,null);assert.deepEqual(result.courses,[]);
  }
});

test('same-owner student replacement cannot combine old metadata/counts with a new enrolled course',async()=>{
  const replacement=id(20);
  const io=transport(row=>row.url.pathname.endsWith('/affairs_students')&&row.url.searchParams.get('select')==='id,user_id'?json([{id:replacement,user_id:owner}]):undefined);
  const result=await load(account(),{},{fetchImpl:io.fetchImpl});
  assert.equal(result.student?.program,'Information Studies');assert.equal(result.overview.assignments.total,3);
  assert.equal(result.overview.courses.readState,'unavailable');assert.equal(result.overview.courses.total,null);assert.deepEqual(result.courses,[]);
  assert.equal(io.seen.some(row=>row.url.pathname.endsWith('/affairs_enrollments')),false);
  assert.ok(io.seen.filter(row=>['affairs_assignments','affairs_charges'].some(table=>row.url.pathname.endsWith('/'+table))).every(row=>row.url.searchParams.get('student_id')==='eq.'+studentId));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(studentId+'|'+replacement));assert.equal(result.dtm.courses[0].code,'DTM301');
});

test('invalid exact ranges cancel their body and malformed or oversized metadata never becomes an empty source',async()=>{
  let cancelled=false;
  const invalidRange=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-range':'*/unknown'}});
  const bad=[invalidRange,new Response('{broken',{headers:{'content-range':'0-0/1'}}),new Response('[]',{headers:{'content-range':'*/0','content-length':String(accountOverviewLimits.readBytes+1)}}),json([dtmCourse(),dtmCourse()])];
  for(const response of bad){
    const io=transport(row=>row.url.pathname.endsWith('/dtm_courses')?response:undefined),result=await load(account(),{},{fetchImpl:io.fetchImpl});
    assert.equal(result.overview.dtm.readState,'unavailable');assert.equal(result.overview.dtm.total,null);assert.deepEqual(result.dtm.courses,[]);
    assert.equal(result.overview.tasks.total,2);
  }
  assert.equal(cancelled,true);
});


test('overview route uses exact counts and verifies the requested parts after a fresh scoped read',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY,question='what do you know about my records';
  process.env.OPENAI_API_KEY='OVERVIEW_LOCAL_TEST_ONLY';
  try{
    for(const kind of ['direct','refresh','unavailable','omitted']){
      let reads=0,reviews=0,repairs=0;
      const errors:unknown[]=[];
      const io=transport(request=>{
        if(request.url.pathname.endsWith('/affairs_tasks')&&kind==='unavailable')return new Response(null,{status:503});
        if(request.url.pathname.endsWith('/affairs_service_requests')&&reads>1&&kind==='refresh')
          return new Response(null,{headers:{'content-range':'*/2'}});
      });
      const mock:typeof fetch=async(input,init)=>{
        const url=new URL(String(input));
        if(url.origin===account().url){
          if(url.pathname.endsWith('/affairs_profiles'))reads++;
          return io.fetchImpl(input,init);
        }
        assert.equal(url.origin,'https://api.openai.com');
        const request=JSON.parse(String(init?.body)),stage=request.text.format.name,payload=JSON.parse(request.input[0].content[0].text);
        const ids=payload.evidence.map((source:{id:string})=>source.id);
        const keys=['profile','courses','dtm','assignments','charges','tasks','requests'];
        assert.deepEqual(ids,['account-scope',...keys.map(key=>'account:'+key)]);
        assert.doesNotMatch(JSON.stringify(payload.evidence),/OFFLINE_|private request payload|student_number|amountPaid|fullName|R301/u);
        const data=Object.fromEntries(payload.evidence.slice(1).map((source:{id:string;content:string})=>[source.id.slice(8),JSON.parse(source.content)]));
        assert.equal(data.courses.records[0].code,'DB301');
        assert.equal(data.dtm.records[0].code,'DTM301');
        assert.equal(data.assignments.overview.total,3);
        assert.equal(data.charges.overview.total,2);
        assert.equal(data.tasks.overview.total,kind==='unavailable'?null:2);
        assert.equal(data.requests.overview.total,kind==='refresh'&&reads>1?2:1);
        for(const part of ['assignments','charges','tasks','requests'])assert.equal(data[part].records,undefined);
        const claim=(key:string,path:string,claim:string,supported=true)=>({claim,evidenceId:'account:'+key,jsonPaths:[path],quotes:[],supported});
        if(stage==='answer_evidence_review'){
          reviews++;
          const supported=reviews>1||!['refresh','omitted'].includes(kind);
          const fields=[
            claim('profile','/records/student/program','Your saved program is Information Studies.',supported),
            claim('profile','/records/student/yearLevel','Your saved year level is 3.',supported),
            claim('courses','/records/0/code','Your current saved class is DB301.',supported),
            claim('dtm','/records/0/code','Your saved DTM course is DTM301.',supported),
            claim('assignments','/overview/total','You have 3 saved assignment tracker records.',supported),
            claim('charges','/overview/total','You have 2 saved charge items.',supported),
            claim('tasks',kind==='unavailable'?'/unavailableReason':'/overview/total',kind==='unavailable'?'Saved task count unavailable.':'You have 2 saved tasks.',supported),
            claim('requests','/overview/total','You have '+data.requests.overview.total+' saved requests.',supported),
          ];
          if(kind==='omitted'&&reviews===2)fields.pop();
          return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported,answersQuestion:supported,claims:fields})}]}]});
        }
        assert.equal(stage,'correct_grounded_answer');
        repairs++;
        const answer=kind==='omitted'?'Saved sample program Information Studies, year 3, DB301 and DTM301. 3 tracker items, 2 fee items and 2 tasks.':
          'Saved sample program Information Studies, year 3, DB301 and DTM301. 3 tracker items, 2 fee items, 2 tasks and 2 service requests.';
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer,sourceIds:ids.slice(1)})}]}]});
      };
      globalThis.fetch=(...args)=>mock(...args).catch(error=>{errors.push(error);throw error;});
      const blocked=async()=>assert.fail('Overview must not call the broad snapshot or public research.');
      const handler=createAffairsAssistantHandler({verifyToken:async()=>account(),loadSnapshot:blocked,publicResearch:blocked});
      let result:any;
      const reply={setHeader(){},status(code:number){assert.equal(code,200);return reply;},json(value:unknown){result=value;}};
      await handler({method:'POST',headers:{authorization:'Bearer '+account().token},body:{route:'/dtm',question}},reply);
      assert.deepEqual(errors,[]);
      assert.equal(result.verification.status,kind==='omitted'?'unverified':'verified');
      const refreshed=kind==='omitted'||kind==='refresh';
      assert.equal(reads,refreshed?2:1);assert.equal(reviews,reads);assert.equal(repairs,refreshed?1:0);
      assert.equal(io.seen.filter(row=>row.method==='HEAD').length,4*reads);
      if(kind==='unavailable')assert.match(result.answer,/saved tasks: count unavailable/u);
      if(kind==='refresh')assert.match(result.answer,/2 service requests/u);
      assert.equal(result.proposedAction,undefined);
      assert.ok(result.views.every((view:{id:string})=>['courses','dtm'].includes(view.id)),JSON.stringify(result.views));
      assert.deepEqual(result.views.find((view:{id:string})=>view.id==='dtm')?.columns,['Course','Term','Data']);
    }
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});


test('guest overview offers the saved-records sign-in path without outbound transport',async()=>{
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('Unexpected overview transport');};
  try{
    const serve=createResearchAssistantHandler();
    for(const question of ['what do you know about my records','what are all my school details','what details do you know about me']){
      let result:any;
      const reply={setHeader(){},status(code:number){assert.equal(code,200);return reply;},json(value:unknown){result=value;}};
      await serve({method:'POST',headers:{'x-forwarded-for':'192.0.2.175'},body:{route:'/',question}},reply);
      assert.equal(result.status,'handoff');
      assert.equal(result.grounding.webSearched,false);
      assert.deepEqual(result.citations.map((source:{url:string})=>source.url),
        ['/school-affairs/login?next='+encodeURIComponent('/school-affairs/records')]);
    }
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});
