import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'75010000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:origin,key:'TEACHING_TEST_KEY',token:'TEACHING_TEST_TOKEN',user:{id:id(1)}};
const surveyPath='/school-affairs/services/7-5',immediatePath='/school-affairs/services/7-6';
const blocked=async()=>assert.fail('No full-account snapshot or public lookup is needed.');
const handler=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:blocked,publicResearch:blocked});
const guest=createResearchAssistantHandler();
const surveyQuestion='Show my teaching survey completion.';
const immediateQuestion='For course "Database Design", show my immediate teaching feedback comments.';
const yearQuestion='What courses do I have this semester and what year am I in?';
const payQuestion='How much is my remaining balance in school?';

async function ask(question:string,route=surveyPath,signedIn=true){
  const output:{status:number;body:any}={status:200,body:null};
  const reply={setHeader(){},status(code:number){output.status=code;return reply;},json(body:unknown){output.body=body;}};
  await (signedIn?handler:guest)({method:'POST',headers:{
    authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.75',
  },body:{question,route}},reply);
  assert.equal(output.status,200,JSON.stringify(output.body));
  return output.body;
}

const course={id:id(2),course:'Database Design',code:'DB701',term:'QA demo term',section:'A1'};
const survey={id:id(3),termId:id(4),term:course.term,phase:'midterm',questions:['PRIVATE_QUESTION'],
  opensAt:'2026-10-01T00:00:00Z',closesAt:'2026-10-31T00:00:00Z',version:1,released:true,state:'closed',
  courses:[{...course,completed:true}]};
const enrollment={id:id(7),student_id:id(5),status:'enrolled',source_mode:'sample',section_id:id(8),student:{id:id(5),user_id:id(1)},
  section:{id:id(8),course_id:id(9),term_id:id(4),weekday:1,starts_at:'09:00:00',ends_at:'10:30:00',room:'QA Room',
    course:{id:id(9),code:'SAVED1',title:'Current timetable class'},term:{id:id(4),label:course.term,starts_on:'2021-01-01',ends_on:'2098-12-31'}}};
const fee={id:id(10),student_id:id(5),label:'QA Tuition',amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample'};
const ranged=(rows:unknown[])=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
type Source={id:string;url:string;content:string};
type Options={ids:string[];unavailable?:string;reject?:number;asked?:RegExp;reviewOmitsImmediate?:boolean;eligibleCap?:boolean;omitCoverage?:boolean;excerptedDisplay?:boolean};
async function offline(options:Options,exercise:()=>Promise<void>){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY,errors:unknown[]=[],transport:string[]=[];
  process.env.OPENAI_API_KEY='TEACHING_OFFLINE_MODEL';
  let attempt=0,checks=0;
  const mock:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.origin===origin){
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
      const name=url.pathname.split('/').at(-1);
      if(name==='affairs_read_teaching_feedback'){
        assert.equal(init?.method,'POST');
        const {p_scope}=JSON.parse(String(init?.body));
        assert.deepEqual(JSON.parse(String(init?.body)),{p_scope,p_term:null,p_survey:null,p_section:null});
        assert.ok(['survey','immediate'].includes(p_scope));
        transport.push(p_scope);
        attempt++;
        if(options.unavailable===p_scope)return Response.json({error:'PRIVATE_FAILURE'},{status:503});
        const feedback={id:id(11),sectionId:id(2),course:course.course,code:course.code,term:course.term,
          status:attempt===1?'submitted':'reviewed',comment:'Saved explanation '+attempt,
          submittedAt:'2026-10-04T09:00:00Z',reviewedAt:attempt===1?null:'2026-10-05T09:00:00Z'};
        const eligible=options.eligibleCap?Array.from({length:200},(_,index)=>({...course,id:id(100+index),code:'EL'+(index+1),course:'Eligible Lab '+(index+1)})):[course];
        const feedbackRows=options.excerptedDisplay?Array.from({length:13},(_,index)=>({...feedback,id:id(500+index)})):[feedback];
        return Response.json({userId:id(1),surveys:p_scope==='survey'?[survey]:[],courses:p_scope==='immediate'?eligible:[],
          feedback:p_scope==='immediate'&&!options.eligibleCap?feedbackRows:[],terms:[],results:[]});
      }
      assert.equal(init?.method,'GET');
      if(name==='affairs_students'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+id(1));
        if(url.searchParams.get('select')==='user_id,year_level,source_mode'){
          transport.push('year');
          return options.unavailable==='year'?Response.json({}, {status:503}):ranged([{user_id:id(1),year_level:3,source_mode:'sample'}]);
        }
        assert.equal(url.searchParams.get('select'),'id,user_id');
        transport.push('student');
        return Response.json([{id:id(5),user_id:id(1)}]);
      }
      assert.equal(url.searchParams.get('student_id'),'eq.'+id(5));
      if(name==='affairs_charges'){transport.push('fees');return ranged([fee]);}
      assert.equal(name,'affairs_enrollments');
      transport.push('timetable');return ranged([enrollment]);
    }
    assert.equal(url.origin,'https://api.openai.com','No external lookup or unrelated collection is authorized.');
    const request=JSON.parse(String(init?.body)),payload=JSON.parse(request.input[0].content[0].text);
    const stage=request.text.format.name,evidence:Source[]=payload.evidence;
    assert.deepEqual(evidence.map(x=>x.id),['account-scope',...options.ids]);
    assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_|TEACHING_TEST|75010000-0000-4000-8000-000000000001/u);
    if(options.asked)assert.match(payload.question,options.asked);
    assert.doesNotMatch(payload.question,/Alice|your recorded year level/u);
    const scope=JSON.parse(evidence[0].content);
    assert.deepEqual(scope.selectedTools.slice().sort(),options.ids.map(key=>key.slice(8)).sort());
    assert.deepEqual(scope.actions,[]);
    const claims=evidence.slice(1).map(source=>{
      const value=JSON.parse(source.content);
      let path:string,claim:string;
      switch(source.id){
        case 'account:profile':
          path=value.unavailableReason?'/unavailableReason':'/records/student/yearLevel';
          claim=value.unavailableReason?'I could not read your saved year level.':'Your saved year level is 3.';
          break;
        case 'account:courses':
          path='/records/0/code';claim='SAVED1 Current timetable class is in your saved enrollments.';
          break;
        case 'account:charges':
          path='/records/0/amountDue';claim='QA Tuition has NT$23,000 remaining.';
          assert.equal(source.url,'/school-affairs/services/39-1');
          break;
        default:{
          const view=value.views[0];
          assert.equal(source.url,view.view==='survey'?surveyPath:immediatePath);
          if(view.readState==='unavailable'){
            path='/views/0/reason';claim='I could not read your saved teaching feedback.';
          }else if(view.view==='survey'){
            path='/views/0/surveys/0/courses/0/completed';claim='DB701 Database Design is completed.';
          }else if(options.eligibleCap){
            assert.equal(view.counts.eligibleCourses.returned,200);
            assert.equal(view.counts.eligibleCourses.total,null);
            assert.equal(view.courses[0].code,'EL1');
            path='/views/0/courses/0/code';claim='EL1 Eligible Lab 1 is among the returned eligible courses.';
          }else{
            path='/views/0/feedback/0/comment';claim='Saved comment: '+view.feedback[0].comment+'.';
            assert.equal(view.feedback[0].comment,'Saved explanation '+attempt);
          }
        }
      }
      return {claim,evidenceId:source.id,jsonPaths:[path],quotes:[],supported:true};
    });
    if(options.eligibleCap&&!options.omitCoverage)claims.push({
      claim:'The lookup returned 200 eligible courses. It cannot establish a complete list.',evidenceId:'account:teachingFeedback',
      jsonPaths:['/views/0/counts/eligibleCourses/total','/views/0/counts/eligibleCourses/returned'],quotes:[],supported:true,
    });
    if(options.reviewOmitsImmediate){
      const teaching=JSON.parse(evidence.at(-1)!.content);
      assert.deepEqual(teaching.views.map((view:{view:string})=>view.view),['survey','immediate']);
    }
    let answer;
    if(stage==='answer_evidence_review'){
      const passed=++checks>(options.reject??0);
      answer={supported:passed,answersQuestion:passed,claims:claims.map(claim=>({...claim,supported:passed}))};
    }else{
      assert.equal(stage,'correct_grounded_answer');
      answer={status:'answered',answer:claims.map(claim=>claim.claim).join(' '),sourceIds:options.ids};
    }
    transport.push(stage);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
  };
  globalThis.fetch=(...args)=>mock(...args).catch(error=>{errors.push(error);throw error;});
  try{await exercise();assert.deepEqual(errors,[]);return transport;}
  finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('both guest and authenticated navigation and access checks avoid private or model transport',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return blocked();};
  try{
    for(const signedIn of [false,true]){
      for(const question of [
        "Show Alice's teaching evaluation status.",'Submit my teaching evaluation.',
        'Show my anonymous teaching evaluation responses.',
      ]){
        const result=await ask(question,surveyPath,signedIn);
        assert.ok(['handoff','clarification'].includes(result.status),result.answer);
        assert.equal(result.grounding.webSearched,false);
        assert.equal(result.proposedAction,undefined);
      }
      const link=await ask('Where can I open the teaching evaluation questionnaire?',surveyPath,signedIn);
      assert.equal(link.citations[0].url,surveyPath);
      assert.equal(link.status,'answered');
    }
    const guestAnswer=await ask(immediateQuestion,surveyPath,false);
    assert.deepEqual(guestAnswer.citations.map((c:{url:string})=>c.url),['/school-affairs/login?next='+encodeURIComponent(immediatePath)]);
    const combined=await ask(surveyQuestion+' '+yearQuestion,surveyPath,false);
    assert.deepEqual(combined.citations.map((c:{url:string})=>c.url),[
      '/school-affairs/login?next='+encodeURIComponent('/school-affairs/records/subjects'),
      '/school-affairs/login?next='+encodeURIComponent(surveyPath),
    ]);
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

test('an excerpted comment display stays on model review with one scoped reread before completion or abstention',async()=>{
  for(const reject of [0,1,2,3]){
    const transport=await offline({ids:['account:teachingFeedback'],reject,asked:/Database Design/u,excerptedDisplay:true},async()=>{
      const result=await ask(immediateQuestion);
      assert.ok(!result.activity.some((step:{kind:string})=>step.kind==='teaching-feedback-evidence-check'));
      assert.equal(result.verification.status,reject===3?'unverified':'verified');
      if(reject!==3)assert.match(result.answer,new RegExp('Saved explanation '+(reject?2:1),'u'));
      else assert.doesNotMatch(result.answer,/Saved explanation/u);
      assert.equal(result.proposedAction,undefined);
      assert.ok(result.views.every((view:{rows:unknown})=>!JSON.stringify(view.rows).includes('Saved explanation')));
    });
    assert.deepEqual(transport,['immediate','answer_evidence_review',
      ...(reject?['immediate','correct_grounded_answer','answer_evidence_review']:[]),
      ...(reject>1?['correct_grounded_answer','answer_evidence_review']:[]),
    ]);
  }
});

test('a failed standalone reader stays on the existing verification path without an absence or native claim',async()=>{
  const transport=await offline({ids:['account:teachingFeedback'],unavailable:'immediate'},async()=>{
    const reply=await ask(immediateQuestion,immediatePath);
    assert.match(reply.answer,/Immediate teaching feedback could not be read/u);
    assert.doesNotMatch(reply.answer,/No saved/u);
    assert.ok(!reply.activity.some((step:{kind:string})=>step.kind==='teaching-feedback-evidence-check'));
  });
  assert.deepEqual(transport,['immediate','answer_evidence_review']);
});

test('teaching plus current courses and year keeps independent sources and partial answers',async()=>{
  for(const unavailable of [undefined,'year','survey']){
    const transport=await offline({ids:['account:profile','account:courses','account:teachingFeedback'],unavailable},async()=>{
      const result=await ask(unavailable==='year'?yearQuestion+' '+surveyQuestion:surveyQuestion+' '+yearQuestion);
      assert.equal(result.verification.status,'verified');
      assert.match(result.answer,/SAVED1/u);
      assert.match(result.answer,unavailable==='year'?/couldn’t verify your recorded year level/u:/Year level: 3/u);
      assert.match(result.answer,unavailable==='survey'?/Teaching evaluation could not be read/u:/DB701 Database Design/u);
    });
    assert.deepEqual(transport.slice().sort(),['student','year','timetable','survey','answer_evidence_review'].sort());
  }
});

test('teaching plus fees or next class reads only the matching account ledger',async()=>{
  for(const [question,source,reader,content] of [
    [surveyQuestion+' '+payQuestion,'charges','fees',/23,000/u],
    ['What is my next class? '+surveyQuestion,'courses','timetable',/next saved stu.best class is SAVED1/u],
  ] as const){
    const transport=await offline({ids:['account:'+source,'account:teachingFeedback']},async()=>{
      const result=await ask(question);
      assert.equal(result.verification.status,'verified');
      assert.match(result.answer,content);
      assert.match(result.answer,/DB701 Database Design/u);
    });
    assert.deepEqual(transport.slice().sort(),['student',reader,'survey','answer_evidence_review'].sort());
  }
});

test('foreign year is withheld while independently owned feedback or courses still answer',async()=>{
  for(const [ownCourses,question] of [
    [false,'What year level is Alice in?'],
    [false,'Show my current courses taken by Alice and your recorded year level.'],
    [true,'Show my current courses and your recorded year level.'],
  ] as const){
    const transport=await offline({ids:[...(ownCourses?['account:courses']:[]),'account:teachingFeedback']},async()=>{
      const result=await ask(surveyQuestion+' '+question);
      assert.equal(result.verification.status,'verified');
      assert.match(result.answer,/another person’s year level/u);
      assert.match(result.answer,/DB701 Database Design/u);
      assert.equal(result.answer.includes('SAVED1'),ownCourses);
    });
    assert.deepEqual(transport.slice().sort(),[...(ownCourses?['student','timetable']:[]),'survey','answer_evidence_review'].sort());
  }
});

test('a survey reference cannot cover an independently requested immediate-feedback status',async()=>{
  const transport=await offline({ids:['account:teachingFeedback'],reviewOmitsImmediate:true},async()=>{
    const result=await ask(surveyQuestion+' Show my immediate teaching feedback status.');
    assert.equal(result.verification.status,'unverified');
    assert.equal(result.verification.attempts,3);
    assert.doesNotMatch(result.answer,/DB701|Saved status/u);
  });
  assert.deepEqual(transport,[
    'survey','immediate','answer_evidence_review','survey','immediate','correct_grounded_answer','answer_evidence_review',
    'correct_grounded_answer','answer_evidence_review',
  ]);
});

test('eligibility lists and completeness use eligible rows, not unrelated saved-feedback status',async()=>{
  const question='Which of my courses are eligible for immediate teaching feedback, and is the list exhaustive?';
  for(const omitCoverage of [false,true]){
    const transport=await offline({ids:['account:teachingFeedback'],eligibleCap:true,omitCoverage},async()=>{
      const result=await ask(question,surveyPath);
      assert.equal(result.verification.status,omitCoverage?'unverified':'verified');
      if(omitCoverage)return;
      assert.match(result.answer,/Eligible courses returned: 200/u);
      assert.match(result.answer,/total is unknown/u);
      assert.match(result.answer,/EL1 Eligible Lab 1/u);
      assert.doesNotMatch(result.answer,/No saved immediate feedback matched/u);
      assert.ok(result.views[0].rows.some((row:string[])=>row.at(-1)==='eligible'));
    });
    assert.deepEqual(transport,omitCoverage?['immediate','answer_evidence_review','immediate','correct_grounded_answer','answer_evidence_review',
      'correct_grounded_answer','answer_evidence_review']
      :['immediate','answer_evidence_review']);
  }
});
