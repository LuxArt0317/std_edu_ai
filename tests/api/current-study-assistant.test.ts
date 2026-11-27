import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {accountQuestionIntent,isCurrentStudyRecordQuestion} from '../../server/affairsAnswer.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const exact='what courses i have for this semester and what year i am currently at';
const chinese='我這學期有哪些課？我目前是幾年級？';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'14000000-0000-4000-8000-'+String(n).padStart(12,'0');
const caller={url:origin,key:'STUDY_TEST_KEY',token:'STUDY_TEST_TOKEN',user:{id:id(1)}};
const blocked=async()=>assert.fail('A wider or public account lookup is outside the selected question.');
const handler=createAffairsAssistantHandler({verifyToken:async()=>caller,loadSnapshot:blocked,publicResearch:blocked});

async function ask(question:string,route='/'){
  const output:{status:number;body:any}={status:200,body:null};
  const response={setHeader(){},status(code:number){output.status=code;return response;},json(value:unknown){output.body=value;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+caller.token},body:{question,route}},response);
  assert.equal(output.status,200,JSON.stringify(output.body));
  return output.body;
}

test('the narrow current-semester and year route excludes independent topics, history and DTM',()=>{
  assert.ok(isCurrentStudyRecordQuestion(accountQuestionIntent(exact),exact));
  assert.ok(isCurrentStudyRecordQuestion(accountQuestionIntent(chinese),chinese));
  for(const question of [
    exact+' and what is my GPA?',exact+' and show my tuition balance',exact+' and draft an interview answer',
    'What year am I in?','Which courses do I have this semester?','What subjects do I have in Moodle this semester and what year am I in?',
    'Show my current courses and courses for 114-2 and what year I am in.',
  ])assert.equal(isCurrentStudyRecordQuestion(accountQuestionIntent(question),question),false,question);
});

function enrolment(n:number,label:string,start:string,end:string){
  return {id:id(10+n),student_id:id(2),section_id:id(20+n),status:'enrolled',source_mode:'verified',student:{id:id(2),user_id:id(1)},
    section:{id:id(20+n),course_id:id(30+n),term_id:id(40+n),weekday:1,starts_at:'09:00:00',ends_at:'10:30:00',room:'QA Room',
      course:{id:id(30+n),code:'STUDY'+n,title:label},term:{id:id(40+n),label:'QA term '+n,starts_on:start,ends_on:end}}};
}

test('public current-study enquiries point to Google sign-in without sending the question to research',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=blocked;
  try{
    const guest=createResearchAssistantHandler();
    for(const [question,privateReturn] of [
      [exact,true],[chinese,true],['What year level is Alice in?',false],
      ['Show my current courses for student 123 and your recorded year level.',false],
    ] as const){
      let result:any;
      const response={setHeader(){},status(status:number){assert.equal(status,200);return response;},json(value:unknown){result=value;}};
      await guest({method:'POST',headers:{'x-forwarded-for':'192.0.2.19'},body:{question}},response);
      assert.equal(result.status,'handoff');
      assert.equal(result.grounding.webSearched,false);
      const expected=privateReturn?['/school-affairs/login?next='+encodeURIComponent('/school-affairs/records/subjects')]:[];
      assert.deepEqual(result.citations.map((citation:{url:string})=>citation.url),expected);
    }
  }finally{globalThis.fetch=original;}
});

test('explicit foreign year gets no year lookup while the independent self-owned courses still answer',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='STUDY_TEST_MODEL';
  let yearReads=0;
  let courseReads=0;
  const failures:unknown[]=[];
  const request:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.origin===origin){
      if(url.pathname==='/rest/v1/affairs_students'){
        if(url.searchParams.get('select')?.includes('year_level'))yearReads++;
        assert.equal(url.searchParams.get('select'),'id,user_id');
        return Response.json([{id:id(2),user_id:id(1)}]);
      }
      assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
      courseReads++;
      return Response.json([enrolment(2,'Current saved subject','2021-01-01','2098-12-31')],{headers:{'content-range':'0-0/1'}});
    }
    assert.equal(url.origin,'https://api.openai.com');
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.text.format.name,'answer_evidence_review');
    assert.deepEqual(payload.evidence.map((row:{id:string})=>row.id),['account-scope','account:courses']);
    assert.doesNotMatch(payload.question,/年級|recorded year|Alice/u);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
      supported:true,answersQuestion:true,claims:[{claim:'STUDY2 is a current saved sample subject.',supported:true,evidenceId:'account:courses',jsonPaths:['/records/0/code'],quotes:[]}],
    })}]}]});
  };
  globalThis.fetch=(...args)=>request(...args).catch(error=>{failures.push(error);throw error;});
  try{
    const denial=await ask('What year level is Alice in?');
    assert.equal(denial.status,'handoff');
    assert.deepEqual(denial.citations,[]);
    for(const question of [
      'Show my current courses for student 123 and your recorded year level.',
      'Show my current courses for Alice and your recorded year level.',
    ]){
      const conflicting=await ask(question);
      assert.equal(conflicting.status,'handoff');
      assert.deepEqual(conflicting.citations,[]);
    }
    for(const [question,reason] of [
      ['Show my current courses and your recorded year level.',/another person’s year level/u],
      ['我這學期有哪些課？他目前是幾年級？',/他人/u],
    ] as const){
      const answer=await ask(question);
      assert.equal(answer.verification.status,'verified');
      assert.match(answer.answer,reason);
      assert.match(answer.answer,/STUDY2/u);
      assert.ok(answer.citations.some((citation:{chunkId:string})=>citation.chunkId==='account:courses'));
      assert.ok(answer.citations.every((citation:{chunkId:string})=>citation.chunkId!=='account:profile'));
    }
    assert.equal(yearReads,0);
    assert.equal(courseReads,2);
    assert.deepEqual(failures,[]);
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
});

test('the reported prompt checks only the caller’s current courses and year, including a refreshed retry and partial availability',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='STUDY_TEST_MODEL';
  try{
    for(const mode of ['healthy','retry','missing','year-failed','timetable-failed','both-failed']){
      let yearReads=0,studentReads=0,coursesReads=0;
      const failures:unknown[]=[];
      async function mock(input:RequestInfo|URL,init?:RequestInit){
        const url=new URL(String(input));
        if(url.origin===origin){
          assert.equal(init?.method,'GET');
          assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+caller.token);
          if(url.pathname==='/rest/v1/affairs_students'){
            assert.equal(url.searchParams.get('user_id'),'eq.'+id(1));
            if(url.searchParams.get('select')?.includes('year_level')){
              yearReads++;
              if(['year-failed','both-failed'].includes(mode)||mode==='retry'&&yearReads===1)return Response.json({error:'unavailable'},{status:503});
              return mode==='missing'?Response.json([],{headers:{'content-range':'*/0'}}):
                Response.json([{user_id:id(1),year_level:yearReads+2,source_mode:'sample'}],{headers:{'content-range':'0-0/1'}});
            }
            studentReads++;
            return Response.json(mode==='missing'?[]:[{id:id(2),user_id:id(1)}]);
          }
          assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
          assert.equal(url.searchParams.get('student_id'),'eq.'+id(2));
          coursesReads++;
          if(['timetable-failed','both-failed'].includes(mode)||mode==='retry'&&coursesReads===1)return Response.json({error:'unavailable'},{status:503});
          return Response.json([
            enrolment(1,'Previous subject','2020-01-01','2020-12-31'),
            enrolment(2,'Current saved subject','2021-01-01','2098-12-31'),
            enrolment(3,'Future subject','2099-01-01','2099-12-31'),
          ],{headers:{'content-range':'0-2/3'}});
        }
        assert.fail('Exact course and year answers do not send account records to a model.');
      }
      globalThis.fetch=(...args)=>mock(...args).catch(error=>{failures.push(error);throw error;});
      const result=await ask(exact,mode==='retry'?'/dtm':'/');
      assert.deepEqual(failures,[],mode);
      const attempts=['retry','both-failed'].includes(mode)?2:1;
      assert.equal(yearReads,attempts,mode);assert.equal(studentReads,attempts,mode);
      assert.equal(coursesReads,mode==='missing'?0:attempts,mode);
      assert.equal(result.verification.status,mode==='both-failed'?'unverified':'verified',mode);
      assert.equal(result.verification.attempts,attempts,mode);
      if(attempts===2&&mode!=='both-failed'){
        assert.match(result.answer,/Year level: 4 .*sample data/u);
      }
      if(mode!=='both-failed')assert.ok(result.activity.some((step:{kind:string;status:string})=>step.kind==='current-study-evidence-check'&&step.status==='complete'));
      if(mode==='both-failed'){
        assert.equal(result.verification.reason,'evidence_unavailable');
        assert.deepEqual(result.citations,[]);
      }
      assert.doesNotMatch(JSON.stringify(result),/Previous subject|Future subject|STUDY_TEST/u);
      if(mode==='healthy')assert.match(result.answer,/Year level: 3/u);
      if(mode==='year-failed')assert.match(result.answer,/couldn’t verify your recorded year level/u);
      if(mode==='timetable-failed')assert.match(result.answer,/saved timetable couldn’t be read/u);
      if(mode==='missing')assert.match(result.answer,/No student record is linked/u);
      if(!['timetable-failed','missing','both-failed'].includes(mode))assert.match(result.answer,/Current saved subject/u);
    }
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
});
