import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {composeCurrentStudyEvidence} from '../../server/affairsAnswer.js';
import {currentStudyCoachingQuestion} from '../../server/currentStudyOwnerScope.js';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';
import {buildGuidanceReviewBinding,validateGuidanceReview} from './guidance-rubric.mjs';

const frozen=buildAccountCases().find(row=>row.id==='account:current-courses-plus-interview-draft');
const yearQuestion='What courses do I have this semester and what year am I currently in? Then help me practice an interview answer.';
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='scoped-coaching-synthetic-db-key',caller='scoped-coaching-synthetic-caller-token';
const id=n=>'49000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),student=id(2);
const exercise='Pick one real exercise and describe what you personally contributed.';
const wording='Practice draft: “In [real exercise], I [your actual contribution] using [tools you really used].”';

function enrollment(index,code,title,starts,ends){
  const day=offset=>new Date(Date.now()+offset*86_400_000).toISOString().slice(0,10);
  return {id:id(10+index),student_id:student,section_id:id(20+index),status:'enrolled',source_mode:'verified',
    student:{id:student,user_id:owner},section:{id:id(20+index),course_id:id(30+index),term_id:id(40+index),weekday:1,
      starts_at:'09:00:00',ends_at:'10:30:00',room:'Local room',
      course:{id:id(30+index),code,title},term:{id:id(40+index),label:'Saved term '+index,starts_on:day(starts),ends_on:day(ends)}}};
}

async function invoke(handler,question,history=[]){
  let status,body;
  const response={status(code){status=code;return response;},json(value){body=value;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer '+caller},body:{question,route:'/',history,stream:false}},response);
  return {status,body};
}

function modelJSON(result){
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
}
function claim(evidenceId,jsonPaths,text){
  return {claim:text,supported:true,evidenceId,quotes:[],jsonPaths};
}

function harness(t,{courses='success',year='success',retry=false,keepRejected=false,provider='healthy'}={}){
  const calls=[],modelInputs=[],assertionFailures=[];
  const scopedRows=[enrollment(0,'HIS102','Historical Methods',-180,-90),enrollment(1,'DB301','Database Design',-45,45),
    enrollment(2,'FUT401','Research Practicum',90,180)];
  for(const [name,value] of Object.entries({VITE_SUPABASE_URL:project,VITE_SUPABASE_PUBLISHABLE_KEY:key,OPENAI_API_KEY:'scoped-coaching-synthetic-model-key'})){
    const previous=process.env[name];
    if(name==='OPENAI_API_KEY'&&provider==='missing-key')delete process.env[name];else process.env[name]=value;
    t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
  }
  let modelReviews=0;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const url=new URL(String(input));
    try{
      if(url.origin===project){
        const headers=new Headers(init?.headers);
        assert.equal(headers.get('authorization'),'Bearer '+caller);
        assert.equal(headers.get('apikey'),key);
        if(url.pathname==='/auth/v1/user'){
          calls.push('auth');
          return Response.json({id:owner,email:'PRIVATE_SCOPE_EMAIL@example.invalid',identities:[{provider:'google'}]});
        }
        assert.equal(init?.method,'GET');
        assert.equal(init?.redirect,'error');
        assert.equal(init?.body,undefined);
        const select=url.searchParams.get('select');
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          if(select==='user_id,year_level,source_mode'){
            calls.push('year');
            if(year==='failure')return Response.json({}, {status:503});
            assert.equal(headers.get('prefer'),'count=exact');
            return Response.json([{user_id:owner,year_level:3,source_mode:'sample'}],{headers:{'content-range':'0-0/1'}});
          }
          assert.equal(select,'id,user_id');
          calls.push('student');
          const linked=courses!=='unlinked';
          return Response.json(linked?[{id:student,user_id:owner}]:[]);
        }
        calls.push('enrollments');
        assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
        assert.equal(url.searchParams.get('student_id'),'eq.'+student);
        assert.equal(url.searchParams.get('status'),'eq.enrolled');
        assert.equal(headers.get('prefer'),'count=exact');
        assert.match(select,/id,code,title/u);
        assert.doesNotMatch(select,/\*|grade|attendance|instructor|dtm/iu);
        if(courses==='failure')return Response.json({}, {status:503});
        if(courses==='empty')return Response.json([],{headers:{'content-range':'*/0'}});
        return Response.json(scopedRows,{headers:{'content-range':'0-2/3'}});
      }
      assert.equal(url.href,'https://api.openai.com/v1/responses');
      const body=JSON.parse(init.body),op=body.text.format.name;
      calls.push(op);
      const payload=JSON.parse(body.input[0].content[0].text);
      modelInputs.push({op,payload});
      assert.notEqual(op,'account_lookup_plan');
      if(provider==='unavailable'||provider==='review-unavailable'&&op==='answer_evidence_review')
        return Response.json({}, {status:503});
      if(provider==='quota')return Response.json({error:{code:'insufficient_quota'}},{status:429});
      assert.equal(payload.responseIntent,'mixed');
      assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_SCOPE_EMAIL|STALE_FINANCE_SENTINEL|Historical Methods|Research Practicum/u);
      const courseSource=payload.evidence.find(row=>row.id==='account:courses');
      const yearSource=payload.evidence.find(row=>row.id==='account:profile');
      assert.deepEqual(payload.evidence.map(row=>row.id).sort(),yearSource?['account-scope','account:courses','account:profile']:['account-scope','account:courses']);
      const course=JSON.parse(courseSource.content);
      assert.equal(course.selection.scope,'current_enrolled_term');
      const yearPart=yearSource?JSON.parse(yearSource.content):null;
      if(yearPart?.records.student)assert.deepEqual(yearPart.records.student,{yearLevel:3,sourceMode:'sample'});
      let courseText,coursePointers;
      if(courses==='failure'){
        assert.equal(course.unavailableReason,'read_failed');assert.deepEqual(course.records,[]);
        courseText='I could not verify your current subjects because the saved timetable could not be read.';
        coursePointers=['/unavailableReason'];
      }else if(courses==='unlinked'){
        assert.equal(course.studentRecordFound,false);assert.deepEqual(course.records,[]);
        courseText='No student record is linked to this account for checking subjects.';
        coursePointers=['/studentRecordFound'];
      }else if(courses==='empty'){
        assert.equal(course.studentRecordFound,true);assert.deepEqual(course.records,[]);
        courseText='The saved local timetable has no matching current subjects.';
        coursePointers=['/records'];
      }else{
        assert.equal(course.studentRecordFound,true);
        assert.deepEqual(course.records.map(row=>[row.code,row.title,row.sourceMode]),[['DB301','Database Design','verified']]);
        courseText='The current subject in your saved local records is Database Design (DB301).';
        coursePointers=['/records/0/title','/records/0/code'];
      }
      const claims=[claim('account:courses',coursePointers,courseText)];
      let facts=courseText;
      if(yearPart){
        const yearText=yearPart.unavailableReason?'I could not verify your recorded year level.':'The recorded local sample year level is 3.';
        claims.push(claim('account:profile',[yearPart.unavailableReason?'/unavailableReason':'/records/student/yearLevel'],yearText));
        facts+=' '+yearText;
      }
      const draft=[keepRejected?'Your official enrollment and job qualifications are confirmed.':facts,exercise,wording].join('\n\n');
      if(op==='compose_grounded_answer'||op==='correct_grounded_answer'){
        if(provider==='invalid-draft'&&op==='compose_grounded_answer')
          return modelJSON({status:'answered',answer:'Unsupported source',sourceIds:['account:unread']});
        const sourceIds=['account:courses','account-scope',...(yearSource?['account:profile']:[])];
        return modelJSON({status:'answered',answer:draft,sourceIds});
      }
      assert.equal(op,'answer_evidence_review');
      assert.equal(payload.answerParts.map(row=>row.text).join('\n\n'),draft);
      const reject=keepRejected||retry&&modelReviews===0;
      modelReviews++;
      return modelJSON({supported:!reject,answersQuestion:!reject,parts:[
        {id:1,kind:'factual',accepted:!reject,claims},
        {id:2,kind:'suggestion',accepted:!reject,claims:[]},
        {id:3,kind:'template',accepted:!reject,claims:[]},
      ]});
    }catch(error){
      assertionFailures.push(error);
      return Response.json({}, {status:500});
    }
  });
  const handler=createAffairsAssistantHandler({publicResearch:async()=>assert.fail('Unexpected public search')});
  return {handler,calls,modelInputs,assertionFailures};
}

function assertFrozenGrade(status,body,spans){
  const envelope={body,statusCode:status,events:body.activity,fixtureKey:frozen.fixtureKey,execution:'deterministic',sourceRevision:'offline-handler-test'};
  const binding=buildGuidanceReviewBinding({runId:'controlled-scoped-coaching',finalSuiteHash:'a'.repeat(64),sourceRevision:envelope.sourceRevision,testCase:frozen,envelope});
  const criteria=frozen.expected.guidanceRubric.criteria.map(({id,proof})=>{
    if(proof==='whole_answer')return {id,passed:true,answerSpans:[],examinedRange:{start:0,end:body.answer.length}};
    const text=spans[id],start=body.answer.indexOf(text);
    assert.ok(start>=0,id);
    return {id,passed:true,answerSpans:[{start,end:start+text.length,text}]};
  });
  const artifact={binding,criteria,reviewer:{id:'controlled-content-review',method:'manual'}};
  const independentReview=validateGuidanceReview({testCase:frozen,envelope,binding,artifact});
  const result=gradeCase(frozen,envelope,{independentReview});
  assert.equal(result.passed,true,JSON.stringify(result.failures));
}

test('the narrow selector accepts the frozen mixed request and keeps independent topics, foreign year and explicit exclusions separate',()=>{
  assert.equal(currentStudyCoachingQuestion(frozen.question)?.scope,'courses');
  assert.equal(currentStudyCoachingQuestion(yearQuestion)?.scope,'courses_and_year');
  assert.equal(currentStudyCoachingQuestion('列出我這學期的課程，然後幫我準備一段誠實的面試自我介紹。')?.scope,'courses');
  for(const prompt of [
    'List my current semester courses and my grades, then help me draft an interview answer.',
    'List my current semester courses and the tuition balance, then help me draft an interview answer.',
    'List my current semester courses and what year my friend is in, then help me draft an interview answer.',
    'Do not list my current semester courses, just help me draft an interview answer.',
    'List my current semester Moodle courses, then help me draft an interview answer.',
    'List my current semester courses, then help me draft an interview answer using my GPA.',
    'List my current semester courses and instructors, then help me draft an interview answer.',
    'List my completed courses, then help me draft an interview answer.',
  ])assert.equal(currentStudyCoachingQuestion(prompt),null,prompt);
});

test('the real handler reads only the caller timetable before composing and verifying the frozen answer',async t=>{
  const io=harness(t);
  const history=[{role:'assistant',content:'Your balance is STALE_FINANCE_SENTINEL.'}];
  const {status,body}=await invoke(io.handler,frozen.question,history);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student','enrollments','compose_grounded_answer','answer_evidence_review']);
  assert.ok(io.modelInputs.every(({payload})=>payload.question===frozen.question));
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.equal(body.proposedAction,undefined);
  assert.match(body.answer,/saved local records/u);
  assert.doesNotMatch(JSON.stringify(body),/HIS102|FUT401|PRIVATE_SCOPE_EMAIL|STALE_FINANCE_SENTINEL/u);
  assert.deepEqual(body.views.find(view=>view.id==='courses').rows.map(row=>row[0]),['DB301 Database Design']);

  assertFrozenGrade(status,body,{requested_parts:body.answer,usable_help:wording,next_step:exercise});
});

test('verification retry repeats only the same scoped timetable, and withholds a rejected draft',async t=>{
  const io=harness(t,{retry:true});
  const {body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student','enrollments','compose_grounded_answer','answer_evidence_review',
    'student','enrollments','correct_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.equal(body.verification.attempts,2);
});

for(const courses of ['failure','unlinked','empty'])test('the real mixed handler makes '+courses+' course evidence explicit and continues coaching',async t=>{
  const io=harness(t,{courses});
  const {body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student',...(courses==='unlinked'?[]:['enrollments']),'compose_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.match(body.answer,courses==='failure'?/could not be read/u:courses==='unlinked'?/No student record is linked/u:/no matching current subjects/u);
  assert.ok(body.answer.includes(wording));
  assert.doesNotMatch(JSON.stringify(body),/DB301|officially enrolled/u);
});

test('rejected enrollment and qualification claims never escape through text, citations or cards',async t=>{
  const io=harness(t,{courses:'unlinked',keepRejected:true});
  const {body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.ok(io.calls.filter(call=>call==='answer_evidence_review').length>=2);
  assert.ok(io.calls.every(call=>['auth','student','compose_grounded_answer','answer_evidence_review','correct_grounded_answer'].includes(call)));
  assert.equal(body.verification?.status,'unverified');
  assert.doesNotMatch(JSON.stringify(body),/official enrollment|job qualifications are confirmed|DB301/u);
  assert.deepEqual(body.views,[]);
  assert.ok(!body.activity.some(step=>step.kind==='current-study-coaching-fallback'));
});

for(const year of ['success','failure'])test('an explicitly requested own year uses its separate '+year+' read alongside the course and coaching',async t=>{
  const io=harness(t,{year});
  const {body}=await invoke(io.handler,yearQuestion);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls.slice(0,4).sort(),['auth','enrollments','student','year']);
  assert.deepEqual(io.calls.slice(4),['compose_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.match(body.answer,/Database Design \(DB301\)/u);
  assert.match(body.answer,year==='failure'?/could not verify your recorded year level/u:/recorded local sample year level is 3/u);
  assert.ok(body.answer.includes(wording));
  if(year==='failure')assert.doesNotMatch(body.answer,/year level is 3/u);
});

for(const [provider,courses,expected] of [
  ['unavailable','success',/DB301 · Database Design/u],
  ['quota','empty',/no current enrollments in your saved timetable/u],
  ['missing-key','unlinked',/No student record is linked to this account/u],
  ['unavailable','failure',/couldn’t be read/u],
])test('total provider outage '+provider+' retains the exact '+courses+' course outcome and gives a record-free guide',async t=>{
  const io=harness(t,{courses,provider});
  const {status,body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student',...(courses==='unlinked'?[]:['enrollments']),
    ...(provider==='missing-key'?[]:['compose_grounded_answer'])]);
  assert.equal(status,200);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.equal(body.verification.attempts,1);
  assert.equal(body.grounding.degraded,true);
  assert.equal(body.grounding.webSearched,false);
  assert.match(body.answer,expected);
  assert.match(body.answer,/A tailored draft was unavailable/u);
  assert.match(body.answer,/Try this aloud with true details: “In \[project\], I \[your actual contribution\]/u);
  assert.doesNotMatch(body.answer,/year level|official enrollment|job qualifications|Research Practicum|Historical Methods/u);
  assert.ok(body.activity.some(step=>step.kind==='account-compose'&&step.status==='unavailable'));
  assert.ok(body.activity.some(step=>step.kind==='current-study-coaching-fallback'&&step.status==='complete'));
  assert.equal(body.proposedAction,undefined);
  if(courses!=='success')assert.doesNotMatch(body.answer,/DB301/u);
  else{
    const paragraphs=body.answer.split('\n\n');
    assertFrozenGrade(status,body,{requested_parts:body.answer,usable_help:paragraphs.at(-2),next_step:paragraphs.at(-1)});
  }
});

for(const year of ['success','failure'])test('provider outage and separately requested year '+year+' retain only the supported facts',async t=>{
  const io=harness(t,{provider:'unavailable',courses:'failure',year});
  const {body}=await invoke(io.handler,yearQuestion);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls.slice(0,4).sort(),['auth','enrollments','student','year']);
  assert.deepEqual(io.calls.slice(4),['compose_grounded_answer']);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.equal(body.grounding.degraded,true);
  assert.match(body.answer,/saved timetable couldn’t be read/u);
  assert.match(body.answer,year==='success'?/Year level: 3 \(sample data\)/u:/couldn’t verify your recorded year level/u);
  assert.match(body.answer,/Try this aloud with true details/u);
  assert.doesNotMatch(body.answer,/DB301/u);
  const sources=io.modelInputs[0].payload.evidence;
  assert.equal(composeCurrentStudyEvidence(yearQuestion,sources.filter(row=>row.id!=='account:profile'),{requireReadStates:true}),null);
  assert.equal(composeCurrentStudyEvidence(yearQuestion,sources.filter(row=>row.id!=='account:courses'),{requireReadStates:true}),null);
});

test('a malformed draft still uses normal model correction and review',async t=>{
  const io=harness(t,{provider:'invalid-draft'});
  const {body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student','enrollments','compose_grounded_answer',
    'student','enrollments','correct_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification?.status,'verified',JSON.stringify(body));
  assert.equal(body.verification.attempts,2);
  assert.ok(!body.activity.some(step=>step.kind==='current-study-coaching-fallback'));
  assert.doesNotMatch(body.answer,/Unsupported source|tailored draft was unavailable/u);
  assert.ok(body.answer.includes(wording));
});

test('an unavailable reviewer cannot approve a generated draft as a native fallback',async t=>{
  const io=harness(t,{provider:'review-unavailable'});
  const {body}=await invoke(io.handler,frozen.question);
  assert.deepEqual(io.assertionFailures,[]);
  assert.deepEqual(io.calls,['auth','student','enrollments','compose_grounded_answer','answer_evidence_review',
    'student','enrollments','correct_grounded_answer','answer_evidence_review']);
  assert.equal(body.verification?.status,'unverified');
  assert.ok(!body.activity.some(step=>step.kind==='current-study-coaching-fallback'));
  assert.doesNotMatch(body.answer,/DB301|Practice draft/u);
  assert.deepEqual(body.views,[]);
});

test('a genuine separate tuition ask still reaches the ordinary mixed path',async()=>{
  const question='List my current semester courses and my unpaid tuition, then help me draft an interview answer.';
  let snapshots=0,answers=0;
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({user:{id:owner},url:project,key,token:caller}),
    loadSnapshot:async()=>{snapshots++;return {profile:{userId:owner}};},
    answerAccount:async options=>{answers++;assert.equal(options.question,question);assert.equal(options.snapshot.currentStudyScope,undefined);
      return {status:'answered',answer:'Ordinary mixed answer.',citations:[],verification:{status:'verified',attempts:1}};},
  });
  const {status}=await invoke(handler,question);
  assert.equal(status,200);assert.equal(snapshots,1);assert.equal(answers,1);
});
