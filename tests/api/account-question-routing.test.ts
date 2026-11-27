import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountEvidence,planAccountLookup,answerAccountWithVerification} from '../../server/answerVerificationAccount.js';
import {buildAccountFixture,evalId} from '../evaluation/fixtures.mjs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';

const combined='what courses i have for this semester and what year i am currently at';
const coaching='i am asked what makes me qualified to be a software engineer i dont know what cna you help me?';
const fixture=()=>{
  const data:Record<string,any>=buildAccountFixture({now:'2026-11-13T02:00:00Z'});
  const current=data.courses.find((row:any)=>row.code==='DB301')!;
  data.courses=[current,...data.courses.filter((row:any)=>['HIS102','FUT401'].includes(row.code)),
    {...structuredClone(current),enrollmentId:evalId(5),code:'QA302',title:'Networks Fundamentals'},
    {...structuredClone(current),enrollmentId:evalId(6),code:'QA303',title:'Software Studio'}];
  data.courses=data.courses.map((row:any)=>({...row,sourceMode:'verified'}));
  return data;
};
async function withPlanner(tools:string[]|Error,work:()=>Promise<void>){
  const fetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='synthetic-routing-key';
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body));assert.equal(body.text.format.name,'account_lookup_plan');
    if(tools instanceof Error)throw tools;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({tools,publicTopics:[],catalogQuery:null,action:null})}]}]});
  };
  try{await work();}finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('multipart course and year dependencies override missing and irrelevant plans on each page',async()=>{
  for(const tools of [[],['courses'],['charges','academicAttendance']])await withPlanner(tools,async()=>{
    for(const route of ['/','/dtm','/school-affairs','/school-affairs/services/13-1']){
      const plan=await planAccountLookup(combined,[],route,Date.now()+5000);
      assert.deepEqual(new Set(plan.tools),new Set(['profile','courses']),route);
      assert.deepEqual(plan.publicTopics,[]);assert.equal(plan.responseIntent,'records');
    }
  });
});

test('planner outage retrieves known dependencies without expanding into unrelated personal collections',async()=>{
  await withPlanner(new Error('Synthetic unavailable planner'),async()=>{
    const plan=await planAccountLookup(combined,[],'/school-affairs',Date.now()+5000);
    assert.equal(plan.degraded,true);assert.deepEqual(new Set(plan.tools),new Set(['profile','courses']));
    const data=fixture();
    const evidence=accountEvidence(data,plan.tools,{question:combined});
    const courses=JSON.parse(evidence.find(row=>row.id==='account:courses')!.content);
    assert.deepEqual(new Set(courses.records.map((row:any)=>row.code)),new Set(['DB301','QA302','QA303']));
    assert.equal(courses.excerpted,false);assert.equal(courses.counts[0].matchingRows,3);
    assert.equal(courses.counts[0].includedRows,3);
  });
});

test('calculated course identities use real enrollment IDs and keep historical and future membership distinct',()=>{
  const data=fixture();
  const payload=JSON.parse(accountEvidence(data,['courses'],{question:'Show my course records'}).find(row=>row.id==='account:courses')!.content);
  const calendar=payload.calendar.records;
  assert.deepEqual(new Set(calendar.currentCourseIds),new Set(data.courses.filter((row:any)=>['DB301','QA302','QA303'].includes(row.code)).map((row:any)=>row.enrollmentId)));
  assert.deepEqual(calendar.historicalCourseIds,[data.courses.find((row:any)=>row.code==='HIS102')!.enrollmentId]);
  assert.deepEqual(calendar.upcomingCourseIds,[data.courses.find((row:any)=>row.code==='FUT401')!.enrollmentId]);
  assert.ok([...calendar.currentCourseIds,...calendar.historicalCourseIds,...calendar.upcomingCourseIds].every(id=>typeof id==='string'&&id));
});

test('current plus historical or upcoming questions retain each requested term in evidence',()=>{
  const data=fixture();
  for(const question of ['Compare my current and historical courses.','What courses do I have this semester and what courses did I take last semester?','Show my current courses and upcoming courses.']){
    const payload=JSON.parse(accountEvidence(data,['courses'],{question}).find(row=>row.id==='account:courses')!.content);
    assert.equal(payload.records.length,5,question);
    assert.ok(payload.calendar.records.historicalCourseIds.includes(data.courses.find((row:any)=>row.code==='HIS102')!.enrollmentId));
    assert.ok(payload.calendar.records.upcomingCourseIds.includes(data.courses.find((row:any)=>row.code==='FUT401')!.enrollmentId));
  }
});

test('an explicit numeric semester takes precedence over this-semester wording across draft, evidence and views',async()=>{
  const data=fixture();
  const cases=[
    {question:'What courses do I have this semester 114-2?',tool:'courses',expected:'HIS102',excluded:'DB301'},
    {question:'我這學期114學年度第2學期有哪些課程？',tool:'courses',expected:'HIS102',excluded:'DB301'},
  ];
  data.courses.push({...structuredClone(data.courses.find((row:any)=>row.code==='HIS102')),code:'FOREIGN',userId:evalId(99)});
  for(const {question,tool,expected,excluded} of cases){
    const sources=accountEvidence(data,[tool],{question,route:'/school-affairs'});
    const source=JSON.parse(sources.find(row=>row.id==='account:'+tool)!.content);
    assert.equal(source.selection.scope,'named_course_term',question);
    assert.deepEqual(source.selection.requestedTerms,['114-2']);
    assert.deepEqual(source.records.map((row:any)=>row.code),[expected]);

    const realFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY='synthetic-term-key';
    globalThis.fetch=async(input,init)=>{
      assert.equal(String(input),'https://api.openai.com/v1/responses');
      const body=JSON.parse(String(init?.body)),format=body.text.format.name;
      const payload=JSON.parse(body.input[0].content[0].text);
      const result=format==='account_lookup_plan'?{tools:['charges'],publicTopics:[],catalogQuery:null,action:null}
        :{supported:true,answersQuestion:true,claims:[{claim:'HIS102',supported:true,evidenceId:'account:courses',quotes:[],jsonPaths:['/records/0/code']}]};
      if(format!=='account_lookup_plan'){
        assert.equal(format,'answer_evidence_review');
        assert.match(payload.answer,/HIS102/);
        assert.doesNotMatch(payload.answer,/DB301|FOREIGN/);
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    };
    try{
      const result=await answerAccountWithVerification({question,snapshot:data,route:'/school-affairs',
        loadSnapshot:async()=>assert.fail('Correct named-term answer should not need a retry')});
      assert.equal(result.verification?.status,'verified',question);
      assert.match(result.answer,new RegExp(expected));assert.doesNotMatch(result.answer,new RegExp(excluded+'|FOREIGN'));
      assert.deepEqual(result.views?.find((view:{id:string})=>view.id===tool)?.rows.map((row:string[])=>row[0]),['HIS102 Historical Methods']);
    }finally{globalThis.fetch=realFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
  }
});

test('missing named terms stay empty while explicitly current-plus-named comparisons retain both',()=>{
  const data=fixture();
  const get=(question:string)=>JSON.parse(accountEvidence(data,['courses'],{question}).find(row=>row.id==='account:courses')!.content);
  const missing=get('Show my courses for this semester 111-3.');
  assert.equal(missing.selection.scope,'named_course_term');
  assert.deepEqual(missing.records,[]);
  for(const question of ['Show my current courses and my courses for 114-2.','Show my current courses and courses for 114-2.']){
    const mixed=get(question);
    assert.ok(mixed.records.some((row:any)=>row.code==='DB301'),question);
    assert.ok(mixed.records.some((row:any)=>row.code==='HIS102'),question);
  }
});

test('pure career wording help never speculates about transcript or other private tools',async()=>{
  const fetch=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('Pure coaching should not need a speculative tool planner');
  try{for(const route of ['/dtm','/school-affairs','/school-affairs/services/13-1']){
    const plan=await planAccountLookup(coaching,[],route,Date.now()+5000);
    assert.deepEqual(plan.tools,[]);assert.deepEqual(plan.publicTopics,[]);assert.equal(plan.responseIntent,'coaching');
  }}finally{globalThis.fetch=fetch;}
});

test('an explicitly requested second domain is not discarded by course intent recognition',async()=>{
  await withPlanner(['courses','charges'],async()=>{
    const plan=await planAccountLookup('What courses do I have this semester and how much tuition remains?',[],'/school-affairs',Date.now()+5000);
    assert.ok(plan.tools.includes('courses'));assert.ok(plan.tools.includes('charges'));
  });
});

test('planner failure retains course, recorded year and certificate dependencies for a useful partial answer',async()=>{
  await withPlanner(new Error('Synthetic unavailable planner'),async()=>{
    const plan=await planAccountLookup('Tell me my current courses, my recorded year, and my enrollment-certificate status.',[],'/',Date.now()+5000);
    assert.deepEqual(new Set(plan.tools),new Set(['courses','profile','enrollmentCertificate']));assert.equal(plan.degraded,true);
  });
});

test('a new explicit year-level question does not inherit unrelated transcript or attendance lookups',async()=>{
  await withPlanner([],async()=>{
    for(const content of ['Show my academic grades.','Show my academic attendance.']){
      const plan=await planAccountLookup('What year am I in?',[{role:'user',content}],'/school-affairs',Date.now()+5000);
      assert.deepEqual(plan.tools,['profile']);
    }
  });
});

test('planner failure keeps obvious task and service-request dependencies without every-record fallback',async()=>{
  await withPlanner(new Error('Synthetic unavailable planner'),async()=>{
    for(const [question,expected]of [['What tasks are unfinished?','tasks'],['What is the status of my service requests?','requests']]){
      const plan=await planAccountLookup(question,[],'/school-affairs',Date.now()+5000);
      assert.deepEqual(plan.tools,[expected]);assert.equal(plan.degraded,true);
    }
  });
});

test('authenticated pure coaching skips account initialization, snapshots, readers and action capabilities',async()=>{
  let auth=0,answers=0;const id='70000000-0000-4000-8000-000000000001';
  const forbidden=async()=>assert.fail('Coaching must not read private records or dispatch public research');
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>{auth++;assert.equal(token,'SYNTHETIC');return {user:{id,email:'PRIVATE_EMAIL_SENTINEL'},token:'PRIVATE_TOKEN_SENTINEL',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'PRIVATE_KEY_SENTINEL'};},
    loadSnapshot:forbidden,publicResearch:forbidden,readers:{courseCatalog:forbidden,enrollmentCertificate:forbidden,dtmSubmissions:forbidden,tuition:forbidden},
    answerAccount:async options=>{
      answers++;assert.deepEqual(Object.keys(options.snapshot).sort(),['checkedAt','profile']);
      assert.deepEqual(options.snapshot.profile,{userId:id});assert.deepEqual(options.supplementalReaders,{});
      assert.doesNotMatch(JSON.stringify(options),/PRIVATE_(?:EMAIL|TOKEN|KEY)_SENTINEL/);
      const refreshed=await options.loadSnapshot();assert.deepEqual(refreshed.profile,{userId:id});
      return {status:'answered',answer:'Try describing [a project you actually completed] and [your contribution].',citations:[],verification:{status:'verified'},views:[]};
    },
  });
  let result:any,status=200;const response={status(code:number){status=code;return response;},json(value:unknown){result=value;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer SYNTHETIC'},body:{question:coaching,route:'/school-affairs/services/13-1'}},response);
  assert.equal(status,200);assert.equal(auth,1);assert.equal(answers,1);assert.equal(result.verification.status,'verified');
  assert.equal(result.proposedAction,undefined);
  const denied=createAffairsAssistantHandler({verifyToken:async()=>{throw new AffairsWorkspaceError('Sign in required.',401);},loadSnapshot:forbidden,answerAccount:forbidden});
  await denied({method:'POST',headers:{},body:{question:coaching}},response);
  assert.equal(status,401);assert.equal(answers,1);
});

test('a signed-in instructor and room follow-up reads its own records instead of public research',async()=>{
  const snapshot=fixture();let reads=0,answers=0;const question='Who teaches it, and which room is it in?';
  const history=[{role:'user',content:'What courses do I have this semester?'},{role:'assistant',content:'Your local current enrollment is Database Design (DB301).'}];
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({user:{id:snapshot.profile.userId},token:'SYNTHETIC',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC'}),
    loadSnapshot:async()=>{reads++;return snapshot;},
    publicResearch:async()=>assert.fail('A resolved personal follow-up must never use public research'),
    answerAccount:async options=>{answers++;assert.equal(options.question,question);assert.deepEqual(options.history,history);assert.equal(options.snapshot.profile.userId,snapshot.profile.userId);return {status:'answered',answer:'Synthetic account answer',citations:[],verification:{status:'verified'},views:[]};},
  });
  let status=200,result:any;const response={status(code:number){status=code;return response;},json(value:unknown){result=value;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer SYNTHETIC'},body:{question,history,route:'/'}},response);
  assert.equal(status,200);assert.equal(reads,1);assert.equal(answers,1);assert.equal(result.answer,'Synthetic account answer');
  const denied=createAffairsAssistantHandler({verifyToken:async()=>{throw new AffairsWorkspaceError('Sign in required.',401);},loadSnapshot:async()=>assert.fail('No anonymous records'),answerAccount:async()=>assert.fail('No anonymous account answer')});
  await denied({method:'POST',headers:{},body:{question,history,route:'/'}},response);assert.equal(status,401);assert.equal(reads,1);
});

test('multipart composition uses selected evidence, refreshes after rejection and uses a bounded six-call plan/replan cycle',async()=>{
  const data=fixture(),fetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const calls:string[]=[];let loads=0,reviews=0;
  process.env.OPENAI_API_KEY='synthetic-composition-key';
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body)),name=body.text.format.name;
    const payload=JSON.parse(body.input[0].content[0].text);calls.push(name);
    let result:any;
    if(name==='account_lookup_plan')result={tools:['charges','academicAttendance'],publicTopics:[],catalogQuery:null,action:null};
    else if(name==='compose_grounded_answer'||name==='correct_grounded_answer'){
      assert.deepEqual(new Set(payload.evidence.map((row:any)=>row.id)),new Set(['account-scope','account:profile','account:courses']));
      const courses=JSON.parse(payload.evidence.find((row:any)=>row.id==='account:courses').content);
      assert.deepEqual(new Set(courses.records.map((row:any)=>row.code)),new Set(['DB301','QA302','QA303']));
      assert.equal(courses.excerpted,false);
      if(name==='compose_grounded_answer')assert.equal(payload.previousAnswer,undefined);
      const profile=JSON.parse(payload.evidence.find((row:any)=>row.id==='account:profile').content);
      assert.equal(profile.records.student.yearLevel,name==='compose_grounded_answer'?3:4);
      assert.deepEqual(Object.keys(profile.records.student).sort(),['sourceMode','yearLevel']);
      assert.deepEqual(profile.records.profile,{});
      result={status:'answered',answer:`Your local sample current subjects are DB301, QA302 and QA303. Your recorded year level is ${profile.records.student.yearLevel}.`,sourceIds:['account:profile','account:courses']};
    }else{
      assert.equal(name,'answer_evidence_review');reviews++;
      result=reviews===1?{supported:false,answersQuestion:false,claims:[]}:{supported:true,answersQuestion:true,claims:[
        {claim:'Year level is 4',supported:true,evidenceId:'account:profile',quotes:[],jsonPaths:['/records/student/yearLevel']},
        {claim:'Current subjects DB301, QA302 and QA303',supported:true,evidenceId:'account:courses',quotes:[],jsonPaths:['/records/0/code','/records/1/code','/records/2/code']},
      ]};
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  try{
    const response=await answerAccountWithVerification({question:combined,snapshot:data,route:'/dtm',deadline:Date.now()+55000,
      loadSnapshot:async()=>{loads++;const fresh=structuredClone(data);fresh.student.yearLevel=4;return fresh;}});
    assert.equal(response.verification?.status,'verified');assert.equal(response.verification?.attempts,2);
    assert.match(response.answer,/year level is 4/);assert.doesNotMatch(response.answer,/HIS102|FUT401|academic transcript/i);
    assert.equal(loads,1);assert.deepEqual(calls,['account_lookup_plan','compose_grounded_answer','answer_evidence_review','account_lookup_plan','correct_grounded_answer','answer_evidence_review']);
    assert.equal(response.proposedAction,undefined);
  }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
