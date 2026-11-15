import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {readClearanceEvidence} from '../../server/accountClearanceEvidence.js';

const route='/school-affairs/services/16-1';
const base='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'16000000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:base,key:'CLEARANCE_TEST_KEY',token:'CLEARANCE_TEST_TOKEN',user:{id:id(1)}};
const noteQuestion='What is the saved Cashier note in my graduation clearance application?';
const clearanceFirst='Show my graduation clearance Cashier notes and what is my next class?';
const nextFirst='What is my next class? Also show my graduation clearance Cashier notes.';
const exclude='What is my next class and do not show my graduation clearance notes.';
const handler=createAffairsAssistantHandler({
  verifyToken:async token=>{assert.equal(token,account.token);return account;},
  loadSnapshot:async()=>assert.fail('Unexpected broad snapshot'),
  publicResearch:async()=>assert.fail('Unexpected public lookup'),
});
async function ask(prompt:string,serve=handler){
  const result:{status:number;body:any}={status:200,body:null};
  const reply={setHeader(){},status(code:number){result.status=code;return reply;},json(body:unknown){result.body=body;}};
  await serve({method:'POST',headers:{authorization:'Bearer '+account.token},body:{question:prompt,route}},reply);
  assert.equal(result.status,200,JSON.stringify(result.body));
  return result.body;
}
type Fixture={clearance?:'ok'|'failed'|'retry'|'denied';timetable?:'ok'|'failed'|'unlinked'|'empty';reject?:number;nativeVerification?:boolean};
async function fakeTransport(options:Fixture,run:()=>Promise<void>){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const stages:string[]=[],errors:unknown[]=[];
  let clearanceReads=0,studentReads=0,enrollmentReads=0,reviews=0;
  process.env.OPENAI_API_KEY='CLEARANCE_TEST_MODEL';
  const fetchFixture:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      assert.equal(options.nativeVerification,undefined,'An exact clearance or refusal must not call the provider');
      const request=JSON.parse(String(init?.body)),stage=request.text.format.name;
      const data=JSON.parse(request.input[0].content[0].text);
      const expected=['account-scope',...(options.timetable?['account:courses']:[]),...(options.clearance?['account:graduationClearance']:[])];
      assert.deepEqual(data.evidence.map((source:{id:string})=>source.id),expected);
      assert.doesNotMatch(JSON.stringify(data.evidence),/CLEARANCE_TEST|UNRELATED_LATER_COURSE|OTHER_OFFICE_PRIVATE|affairs_grade|16000000-0000-4000-8000-000000000001/u);
      const scope=JSON.parse(data.evidence[0].content);
      assert.deepEqual(scope.selectedTools.slice().sort(),expected.slice(1).map(id=>id.slice(8)).sort());
      assert.deepEqual(scope.actions,[]);
      assert.equal(scope.catalogScope,'selected_for_this_request');
      const claims:Array<{claim:string;evidenceId:string;jsonPaths:string[];quotes:string[];supported:boolean}>=[];
      const claim=(text:string,evidenceId:string,...jsonPaths:string[])=>claims.push({claim:text,evidenceId,jsonPaths,quotes:[],supported:true});
      for(const source of data.evidence.slice(1)){
        const payload=JSON.parse(source.content);
        if(source.id==='account:graduationClearance'){
          assert.equal(source.url,route);
          if(options.clearance==='failed'){
            assert.match(payload.reason,/read_failed|access_denied/u);
            claim('The saved clearance records could not be read.',source.id,'/reason');
          }else{
            assert.equal(payload.readState,'ok',payload.reason);
            const review=payload.applications[0].reviews[0],note='Bring receipt '+clearanceReads;
            assert.deepEqual(payload.selection.noteOffices,['cashier']);
            assert.equal(review.office,'cashier');
            assert.equal(review.note,note);
            claim('For Local Fall, the Cashier saved the note “'+note+'”.',source.id,
              '/applications/0/term','/applications/0/reviews/0/office','/applications/0/reviews/0/note');
          }
        }else{
          assert.equal(source.url,'/school-affairs/records/subjects');
          assert.equal(payload.selection.scope,'next_scheduled_class');
          if(options.timetable==='failed'){
            assert.equal(payload.unavailableReason,'read_failed');assert.equal(payload.calendar,undefined);
            claim('I could not verify your next class.',source.id,'/unavailableReason');
          }else if(options.timetable==='unlinked'){
            assert.equal(payload.studentRecordFound,false);assert.equal(payload.calendar,undefined);
            claim('Your stu.best account has no linked student record.',source.id,'/studentRecordFound');
          }else if(options.timetable==='empty'){
            assert.equal(payload.studentRecordFound,true);assert.equal(payload.calendar.records.next,null);
            claim('No meeting was found in your saved stu.best enrollments.',source.id,'/studentRecordFound','/selection/matchingRows');
          }else{
            const next=payload.calendar.records.next;
            assert.equal(payload.records.length,1);
            assert.equal(next.course.code,'QA'+enrollmentReads);
            assert.equal(payload.calendar.records.timeZone,'Asia/Taipei');
            assert.equal(Object.hasOwn(payload.calendar.records,'today'),false);
            claim('Your next saved stu.best class is '+next.course.code+' Campus Seminar on '+next.day+' at 10:00 Taipei time. This is sample data.',
              source.id,'/calendar/records/next/day','/records/0/code','/records/0/title','/records/0/startsAt','/records/0/sourceMode');
          }
        }
      }
      stages.push(stage);
      let output;
      if(stage==='answer_evidence_review'){
        reviews++;
        const supported=reviews>(options.reject??0);
        output={supported,answersQuestion:supported,claims:claims.map(value=>({...value,supported}))};
      }else{
        assert.equal(stage,'correct_grounded_answer');
        output={status:'answered',answer:claims.map(value=>value.claim).join(' '),sourceIds:claims.map(value=>value.evidenceId)};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
    }
    assert.equal(url.origin,base);
    const headers=new Headers(init?.headers);
    assert.equal(headers.get('authorization'),'Bearer '+account.token);
    if(url.pathname==='/rest/v1/rpc/affairs_read_graduation_clearance'){
      assert.ok(options.clearance);
      assert.equal(init?.method,'POST');
      assert.deepEqual(JSON.parse(String(init?.body)),{p_view:'student',p_student:null,p_term:null});
      clearanceReads++;
      if(options.clearance==='denied')return new Response(null,{status:403});
      if(options.clearance==='failed'||options.clearance==='retry'&&clearanceReads===1)return new Response(null,{status:503});
      return Response.json({userId:id(1),targetId:id(1),terms:[],periods:[],applications:[
        {id:id(2),termId:id(3),term:'Local Fall',track:'undergraduate',submittedAt:'2026-11-01T12:00:00+08:00',reviews:[
          {office:'cashier',status:'action_required',note:'Bring receipt '+clearanceReads,reviewedAt:'2026-11-02T12:00:00+08:00',version:1},
          {office:'library',status:'pending',note:'OTHER_OFFICE_PRIVATE',reviewedAt:null,version:1},
          ...['academic','department','career'].map(office=>({office,status:'cleared',note:'',reviewedAt:'2026-11-02T12:00:00+08:00',version:1})),
        ]},
      ]});
    }
    assert.ok(options.timetable);
    assert.equal(init?.method,'GET');
    if(url.pathname==='/rest/v1/affairs_students'){
      studentReads++;
      assert.equal(url.searchParams.get('select'),'id,user_id');
      assert.equal(url.searchParams.get('user_id'),'eq.'+id(1));
      return Response.json(options.timetable==='unlinked'?[]:[{id:id(4),user_id:id(1)}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
    assert.equal(url.searchParams.get('student_id'),'eq.'+id(4));
    assert.equal(url.searchParams.get('status'),'eq.enrolled');
    assert.equal(headers.get('prefer'),'count=exact');
    enrollmentReads++;
    if(options.timetable==='failed')return new Response(null,{status:503});
    if(options.timetable==='empty')return Response.json([],{headers:{'Content-Range':'*/0'}});
    const start=new Date(Date.now()+2*86_400_000).toISOString().slice(0,10);
    const end=new Date(Date.now()+20*86_400_000).toISOString().slice(0,10);
    const weekday=new Date(start+'T00:00:00Z').getUTCDay()||7;
    const row=(later:boolean)=>{
      const n=later?10:0,section_id=id(6+n),course_id=id(7+n);
      return {id:id(5+n),student_id:id(4),section_id,status:'enrolled',source_mode:'sample',
        student:{id:id(4),user_id:id(1)},section:{id:section_id,course_id,term_id:id(3),weekday,
          starts_at:later?'12:00:00':'10:00:00',ends_at:later?'13:00:00':'11:00:00',room:'Lab 2',
          course:{id:course_id,code:later?'QA99':'QA'+enrollmentReads,title:later?'UNRELATED_LATER_COURSE':'Campus Seminar'},
          term:{id:id(3),label:'Local Fall',starts_on:start,ends_on:end}}};
    };
    return Response.json([row(false),row(true)],{headers:{'Content-Range':'0-1/2'}});
  };
  globalThis.fetch=(...args)=>fetchFixture(...args).catch(error=>{errors.push(error);throw error;});
  try{
    try{await run();}
    catch(error){if(errors.length)throw new AggregateError(errors,'Unexpected fixture requests');throw error;}
    assert.deepEqual(errors,[]);
    const attempts=options.reject||options.nativeVerification&&['failed','retry'].includes(options.clearance??'')?2:1;
    assert.equal(clearanceReads,options.clearance?attempts:0);
    assert.equal(studentReads,options.timetable?attempts:0);
    assert.equal(enrollmentReads,options.timetable&&options.timetable!=='unlinked'?attempts:0);
    assert.deepEqual(stages,options.nativeVerification?[]:['answer_evidence_review',
      ...(options.reject?['correct_grounded_answer','answer_evidence_review']:[]),
      ...((options.reject??0)>1?['correct_grounded_answer','answer_evidence_review']:[]),
    ]);
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=key;
  }
}

test('reads the requested office note alone or with the next class in both orders',async()=>{
  await fakeTransport({clearance:'ok',nativeVerification:true},async()=>{
    const result=await ask(noteQuestion);
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/Bring receipt 1/u);
  });
  for(const prompt of [clearanceFirst,nextFirst,"What's my next School Affairs class? Also show the Cashier's saved note in my graduation clearance application."])await fakeTransport({clearance:'ok',timetable:'ok'},async()=>{
    const result=await ask(prompt);
    assert.equal(result.verification.status,'verified');
    assert.match(result.answer,/Bring receipt 1/u);assert.match(result.answer,/QA1 Campus Seminar/u);
    assert.match(result.answer,/10:00–11:00 \(Taipei time\)/u);
    assert.doesNotMatch(JSON.stringify(result.views),/UNRELATED_LATER_COURSE|OTHER_OFFICE_PRIVATE/u);
    assert.equal(result.answer.indexOf('Bring receipt 1')<result.answer.indexOf('QA1 Campus Seminar'),prompt===clearanceFirst);
  });
});

test('standalone clearance retries a transient read and never labels a failed or denied read empty',async()=>{
  await fakeTransport({clearance:'retry',nativeVerification:true},async()=>{
    const result=await ask(noteQuestion);
    assert.deepEqual(result.verification,{status:'verified',attempts:2});
    assert.match(result.answer,/Bring receipt 2/u);
    assert.ok(result.activity.some((step:{kind:string;status:string})=>step.kind==='graduation-clearance-evidence-check'&&step.status==='complete'));
  });
  for(const outcome of ['failed','denied'] as const){
    await fakeTransport({clearance:outcome,nativeVerification:true},async()=>{
      const result=await ask(noteQuestion);
      assert.equal(result.status,'abstained');
      assert.equal(result.verification.status,'unverified');
      assert.equal(result.verification.attempts,outcome==='failed'?2:1);
      assert.match(result.answer,/couldn’t verify your saved clearance records/u);
      assert.doesNotMatch(result.answer,/no submitted clearance|Bring receipt|0 applications/iu);
      assert.deepEqual(result.citations,[]);
      assert.deepEqual(result.views,[]);
    });
  }
});

test('a valid reader result for a different office cannot answer or reach a provider',async()=>{
  const mismatched=createAffairsAssistantHandler({
    verifyToken:async()=>account,
    loadSnapshot:async()=>assert.fail('Unexpected broad snapshot'),
    publicResearch:async()=>assert.fail('Unexpected public lookup'),
    readers:{graduationClearance:(caller,options)=>readClearanceEvidence(caller,
      {...options,question:'Show the Library notes in my graduation clearance application.'})},
  });
  await fakeTransport({clearance:'ok',nativeVerification:true},async()=>{
    const result=await ask(noteQuestion,mismatched);
    assert.equal(result.status,'abstained');
    assert.equal(result.verification.status,'unverified');
    assert.doesNotMatch(JSON.stringify(result),/OTHER_OFFICE_PRIVATE|Bring receipt/iu);
    assert.deepEqual(result.citations,[]);
    assert.deepEqual(result.views,[]);
  });
});

test('standalone clearance refuses writes and manager access without a data read or model call',async()=>{
  await fakeTransport({nativeVerification:true},async()=>{
    for(const [question,expected] of [
      ['Submit my graduation clearance application.',/No action was performed/u],
      ['Show my graduation clearance status, then approve it.',/No action was performed/u],
      ['Show my graduation clearance manager queue.',/cannot access clearance manager queues/u],
    ] as const){
      const result=await ask(question);
      assert.equal(result.status,'handoff');
      assert.match(result.answer,expected);
      assert.equal(result.proposedAction,undefined);
      assert.deepEqual(result.citations,[]);
      assert.deepEqual(result.views,[]);
    }
  });
});

test('refreshes both sources once and withholds an answer rejected three times',async()=>{
  for(const reject of [1,3])await fakeTransport({clearance:'ok',timetable:'ok',reject},async()=>{
    const result=await ask(clearanceFirst);
    assert.equal(result.verification.attempts,reject===1?2:3);
    assert.doesNotMatch(result.answer,/Bring receipt 1|QA1 Campus Seminar/u);
    if(reject===1){
      assert.equal(result.verification.status,'verified');
      assert.match(result.answer,/Bring receipt 2/u);assert.match(result.answer,/QA2 Campus Seminar/u);
    }else{
      assert.equal(result.verification.status,'unverified');assert.doesNotMatch(result.answer,/Bring receipt 2|QA2 Campus Seminar/u);
    }
  });
});

test('keeps supported halves and distinguishes failed, unlinked and empty timetable reads',async()=>{
  for(const timetable of ['failed','unlinked','empty'] as const)await fakeTransport({clearance:'ok',timetable},async()=>{
    const result=await ask(clearanceFirst);
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/Bring receipt 1/u);
    assert.match(result.answer,timetable==='failed'?/couldn’t verify your next class/u:timetable==='unlinked'?/no linked student record/u:/no upcoming meeting/u);
    assert.ok(result.views.every((view:{id:string})=>view.id!=='courses'));
  });
  await fakeTransport({clearance:'failed',timetable:'ok'},async()=>{
    const result=await ask(nextFirst);
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/QA1 Campus Seminar/u);
    assert.match(result.answer,/lookup failed or is unavailable/u);
  });
});

test('a negative clearance clause never reads or cites clearance',async()=>{
  await fakeTransport({timetable:'ok'},async()=>{
    const result=await ask(exclude);
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/QA1 Campus Seminar/u);
    assert.doesNotMatch(JSON.stringify(result),/graduationClearance|Bring receipt/u);
  });
});

test('foreign and guest requests do not run student or model tools',async()=>{
  const saved=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('No external calls for denied or directory requests');
  try{
    const foreign=await ask("Show Alice's graduation clearance notes.");
    assert.match(foreign.answer,/another student/u);assert.deepEqual(foreign.citations,[]);
    const nav=await ask('Where can I view my graduation clearance?');
    assert.equal(nav.citations[0].url,route);
    const guest=await ask(noteQuestion,createResearchAssistantHandler());
    assert.equal(guest.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
  }finally{globalThis.fetch=saved;}
});
