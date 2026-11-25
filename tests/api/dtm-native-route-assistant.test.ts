import assert from 'node:assert/strict';
import test,{afterEach,beforeEach} from 'node:test';
import {readFile} from 'node:fs/promises';
import {runAssistantClientInNewContext as runInNewContext} from '../evaluation/client-vm.mjs';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import * as nativeIntent from '../../server/dtmGradeEvidenceIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';
import {buildDtmNativeRouteCases,dtmNativeRouteFixture,dtmNativeRouteManifest,gradeDtmNativeRouteCase} from '../evaluation/dtm-native-route-cases.mjs';
import {buildDtmGradePreview,dtmGradePreviewCases} from '../evaluation/dtm-grade-report-preview.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const exactAvailability=new Set(['null-total','absent','unknown-course'].map(value=>'account:dtm-native-route-'+value));
const exactFields=new Set(['dashboard','my','grades','course-overview','all-feedback','item-feedback','followup','saved-total'].map(value=>'account:dtm-native-route-'+value));
const bank=buildDtmNativeRouteCases(),origin='https://xiftudmvxphxcjtmfmib.supabase.co',owner=dtmNativeRouteManifest.ownerId;
const account={url:origin,key:'OFFLINE_DTM_KEY',token:'OFFLINE_DTM_TOKEN',user:{id:owner}};
const wallClock=Date.now;
let elapsedTestWindows=0;
beforeEach(()=>{
  elapsedTestWindows+=61_000;
  Date.now=()=>wallClock()+elapsedTestWindows;
});
afterEach(()=>{Date.now=wallClock;});
type Case=ReturnType<typeof buildDtmNativeRouteCases>[number];
type TransportCase=Pick<Case,'id'|'question'|'route'|'history'|'fixtureKey'>&Partial<Pick<Case,'nativeExpectation'>>;
async function invoke(handler:ReturnType<typeof createAffairsAssistantHandler>,row:TransportCase){
  const output:{statusCode:number;body:any}={statusCode:200,body:null};
  const response={setHeader(){},status(code:number){output.statusCode=code;return response;},json(body:unknown){output.body=body;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token},body:{question:row.question,route:row.route,history:row.history}},response);
  return output;
}
async function actual(row:TransportCase,{rejectOnce=false,providerAvailable=true,fixtureOverride=undefined as ReturnType<typeof dtmNativeRouteFixture>|undefined}={}){
  const fixture=fixtureOverride??dtmNativeRouteFixture(row.nativeExpectation?.fixture),reads:any[]=[],wire:any[]=[],errors:unknown[]=[],stages:string[]=[];
  const selectedCourseId=fixture.report.report?.courseId??dtmNativeRouteManifest.courseId,sourceFailed=row.nativeExpectation?.fixture==='failed';
  const observation={ownerId:owner,execution:'mocked',reads,evidence:null as any,broadReads:0,publicReads:0,writes:0};
  const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY;let reviews=0,lastDraft='';
  if(providerAvailable)process.env.OPENAI_API_KEY='OFFLINE_DTM_MODEL';else delete process.env.OPENAI_API_KEY;
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input)),headers=new Headers(init?.headers),body=init?.body?JSON.parse(String(init.body)):null;
      if(url.origin===origin){
        wire.push({path:url.pathname,method:init?.method,query:Object.fromEntries(url.searchParams),body});
        assert.equal(headers.get('authorization'),'Bearer '+account.token);assert.equal(init?.redirect,'error');
        if(url.pathname==='/rest/v1/rpc/dtm_grade_report_overview'){
          assert.equal(init?.method,'POST');assert.deepEqual(body,{});
          reads.push({operation:'overview',ownerId:owner,query:{},...(sourceFailed?{failed:true}:{data:structuredClone(fixture.overview)})});
          return sourceFailed?Response.json({}, {status:503}):Response.json(fixture.overview);
        }
        assert.equal(init?.method,'GET');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
        if(url.pathname==='/rest/v1/dtm_courses'){
          assert.equal(url.searchParams.get('id'),'eq.'+selectedCourseId);assert.equal(url.searchParams.get('select'),'id,user_id');
          return Response.json([{id:selectedCourseId,user_id:owner}]);
        }
        assert.equal(url.pathname,'/rest/v1/dtm_grade_reports');assert.equal(url.searchParams.get('course_id'),'eq.'+selectedCourseId);
        assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.get('limit'),'2');
        reads.push({operation:'report',ownerId:owner,courseId:selectedCourseId,data:structuredClone(fixture.report)});
        const saved=fixture.report.report;
        return Response.json(saved?[{id:saved.id,user_id:owner,course_id:saved.courseId,source_mode:saved.sourceMode,version:saved.version,
          created_at:saved.createdAt,updated_at:saved.updatedAt,deleted_at:null,report:{items:saved.items,total:saved.total}}]:[]);
      }
      assert.equal(url.origin,'https://api.openai.com','Every external transport must be intercepted.');
      const stage=body.text.format.name,packet=JSON.parse(body.input[0].content[0].text);stages.push(stage);
      assert.ok(stage==='answer_evidence_review'||stage==='correct_grounded_answer'&&(sourceFailed||rejectOnce),row.id+': unexpected '+stage);
      assert.deepEqual(packet.evidence.map((source:any)=>source.id),['account-scope','account:dtmGradeReport']);
      assert.deepEqual(JSON.parse(packet.evidence[0].content).selectedTools,['dtmGradeReport']);
      assert.doesNotMatch(JSON.stringify(packet),/OFFLINE_DTM|78000000-0000-4000-8000-00000000000[12]|TRACKER|INVENTED_PRIVATE/u);
      const data=JSON.parse(packet.evidence[1].content);assert.deepEqual(data,observation.evidence);
      assert.equal(data.readState,row.nativeExpectation?.read);
      if(stage==='correct_grounded_answer')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',
        answer:sourceFailed?'The native grade-report lookup is unavailable. I cannot determine the saved grades.':lastDraft,sourceIds:['account:dtmGradeReport']})}]}]});
      lastDraft=typeof packet.answer==='string'?packet.answer:packet.answer.answer;
      const paths=['/readState','/courseCoverage/complete','/counts/included'];
      if(data.selection.view==='overview')data.courses.forEach((_:unknown,index:number)=>paths.push('/courses/'+index+'/title','/courses/'+index+'/gradeText'));
      if(data.selection.view==='report'){
        paths.push('/reportPresent');if(data.report){
          data.report.items.forEach((_:unknown,index:number)=>paths.push('/report/items/'+index+'/label','/report/items/'+index+'/feedbackText','/report/items/'+index+'/weightText','/report/items/'+index+'/gradeText'));
          paths.push('/report/totalPresent');if(data.report.total)paths.push('/report/total/gradeText','/report/total/feedbackText');
        }
      }
      const supported=!rejectOnce||++reviews>1;
      const claims=Array.from({length:Math.ceil(paths.length/8)},(_,index)=>({claim:'Saved native grade-report cells and explicit read limitations.',evidenceId:'account:dtmGradeReport',jsonPaths:paths.slice(index*8,index*8+8),quotes:[],supported}));
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported,answersQuestion:supported,claims})}]}]});
    }catch(error){errors.push(error);throw error;}
  };
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account,
    loadSnapshot:async()=>{observation.broadReads++;throw Error('Unrelated snapshot forbidden.');},
    publicResearch:async()=>{observation.publicReads++;throw Error('Public research forbidden.');},
    readers:{dtmGradeReport:async(caller,options)=>{
      const result=await readDtmGradeReportEvidence(caller,options);
      observation.evidence=JSON.parse(result.evidence.content);
      return result;
    }}});
  try{
    const envelope=await invoke(handler,row);assert.deepEqual(errors,[]);return {envelope:{...envelope,execution:'deterministic',fixtureKey:row.fixtureKey,events:envelope.body?.activity??[]},observation,wire,stages};
  }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('actual authenticated native transport and graph answer the independent route packet without the general snapshot',async()=>{
  for(const row of bank.filter((item:Case)=>!['failed','foreign'].includes(item.id.split('-').at(-1)!))){
    const value=await actual(row,{providerAvailable:!exactFields.has(row.id)});assert.equal(value.envelope.statusCode,200,row.id);
    const graded=gradeDtmNativeRouteCase(row,value.envelope,value.observation);
    assert.equal(graded.passed,true,row.id+': '+JSON.stringify(graded.failures));assert.equal(graded.modelAcceptance,false);
    assert.equal(value.envelope.body.verification.status,'verified');
    assert.deepEqual(value.stages,exactAvailability.has(row.id)||exactFields.has(row.id)?[]:['answer_evidence_review']);
    if(exactAvailability.has(row.id)){
      assert.match(value.envelope.body.answer,/^(?:No saved course matches|There is no saved native grade report|No course total is saved)/u);
      assert.equal(value.envelope.body.verification.attempts,1);
      assert.deepEqual(value.envelope.body.citations.map((item:any)=>item.chunkId),['account:dtmGradeReport']);
    }
    if(exactFields.has(row.id)){
      assert.equal(value.envelope.body.verification.attempts,1);
      assert.equal(value.envelope.body.views.length,1);
      assert.match(value.envelope.body.answer,/^- (?:Report row|Saved course): .+\n  - (?:Saved feedback text|Saved total grade text|Displayed grade text): /mu);
      assert.doesNotMatch(value.envelope.body.answer,/rank|numeric score metadata|independent saved cells|term label/iu);
    }
    if(exactAvailability.has(row.id)||exactFields.has(row.id))
      assert.ok(value.envelope.events.some((event:any)=>event.kind==='dtm-grade-evidence-check'&&event.status==='complete'));
    assert.ok(value.wire.every((request:any)=>['/rest/v1/rpc/dtm_grade_report_overview','/rest/v1/dtm_courses','/rest/v1/dtm_grade_reports'].includes(request.path)));
  }
});
test('the native unavailable outcomes localize without borrowing a saved report from the current course',async()=>{
  for(const [caseId,question,statement] of [
    ['null-total','我的 Moodle 成績報告中儲存的課程總分是多少？',/^這份 Moodle 成績報告沒有已儲存的課程總分/u],
    ['absent','這門課有已儲存的 Moodle 成績報告嗎？',/^這門課沒有已儲存的 Moodle 成績報告/u],
    ['unknown-course','請顯示 Moodle 課程「ZZ999」的成績報告。',/^找不到符合您提供的代碼或名稱的已儲存課程/u],
  ] as const){
    const row=bank.find((item:Case)=>item.id.endsWith('-'+caseId))!;
    assert.equal(nativeIntent.isNativeDtmGradeOnlyQuestion(question,row.route),true,caseId);
    const value=await actual({...row,question});
    assert.equal(value.envelope.body.verification.status,'verified',caseId);
    assert.match(value.envelope.body.answer,statement);
    assert.deepEqual(value.stages,[]);
    assert.equal(value.observation.reads.filter(read=>read.operation==='report').length,caseId==='unknown-course'?0:1);
  }
});

test('the exact protected item, follow-up and total cases retain every existing oracle without a model key',async()=>{
  const runId='20000000-0000-4000-8000-000000000001';
  const fixture=buildDtmGradePreview(runId,{A:{id:owner,email:'grade-a@example.invalid',runMarker:runId},
    B:{id:dtmNativeRouteManifest.foreignOwnerId,email:'grade-b@example.invalid',runMarker:runId}});
  const wanted=['account:dtm-native-report-feedback','account:dtm-native-route-followup','account:dtm-native-report-saved-total','account:dtm-native-report-tail'];
  const cases=dtmGradePreviewCases(fixture).filter(testCase=>wanted.includes(testCase.id));
  assert.equal(cases.length,wanted.length);
  for(const row of cases){
    const plan=fixture.plans[row.fixtureKey],course=plan.courseBindings.A,report=plan.expectedByOwner[owner];
    assert.ok(report.report);
    const native=dtmNativeRouteFixture();
    native.report=report;
    native.overview.courses=[{id:course.id,userId:owner,title:course.title,code:course.code,term:course.term,gradeText:report.report.total?.gradeText??null}];
    const result=await actual(row,{fixtureOverride:native,providerAvailable:false});
    const verdict=gradeCase(row,{...result.envelope,execution:'live-native'});
    assert.equal(verdict.passed,true,row.id+': '+JSON.stringify(verdict.failures));
    assert.equal(result.observation.broadReads+result.observation.publicReads+result.observation.writes,0);
    assert.equal(result.envelope.body.verification.attempts,1);
    assert.deepEqual(result.observation.reads.map(read=>read.operation),['overview','report']);
    assert.deepEqual(result.stages,[]);
    assert.equal(result.envelope.body.views[0].rows.length,1);
    assert.doesNotMatch(result.envelope.body.answer,/Numeric score metadata|Displayed rank text|Untrusted invented report content/u);
  }
});

test('same-route feedback-only follow-ups reveal no weight or grade cells in either supported language',async()=>{
  const row=bank.find(item=>item.id.endsWith('-followup'))!;
  const route='/dtm/course/'+dtmNativeRouteManifest.courseId+'/grades';
  for(const question of ['What feedback?','評語呢？']){
    const value=await actual({...row,question,route},{providerAvailable:false});
    assert.equal(value.envelope.body.verification.status,'verified',question);
    assert.equal(value.envelope.body.verification.attempts,1);
    assert.deepEqual(value.stages,[]);
    assert.match(value.envelope.body.answer,/Explain the sampling choice\./u);
    assert.match(value.envelope.body.answer,/Compare the two approaches\./u);
    assert.doesNotMatch(value.envelope.body.answer,/Displayed (?:grade|weight) text|顯示(?:權重|成績)文字|0\.00 %|Untrusted invented report content/u);
    assert.ok(value.envelope.body.views[0].rows.every((cells:string[])=>cells.length===2));
    assert.equal(value.envelope.body.citations[0].url,route);
  }
});

test('foreign requests perform no native, snapshot, planner or public transport',async()=>{
  const row=bank.find((item:Case)=>item.id.endsWith('-foreign'))!,value=await actual(row);
  assert.equal(value.envelope.statusCode,200);assert.equal(value.envelope.body.status,'handoff');assert.deepEqual(value.wire,[]);assert.deepEqual(value.stages,[]);
  assert.equal(gradeDtmNativeRouteCase(row,value.envelope,value.observation).passed,true);
});

test('a leading native report scope binds item feedback without broadening mixed clauses',async()=>{
  const row=bank.find((item:Case)=>item.id.endsWith('-item-feedback'))!;
  const scope='In my Moodle grade report for Study Methods, ';
  const question=scope+'what feedback and weight are recorded for Source Analysis?';
  const value=await actual({...row,question});
  assert.equal(gradeDtmNativeRouteCase(row,value.envelope,value.observation).passed,true);
  assert.equal(value.observation.broadReads,0);
  for(const mixed of [scope+'what is the feedback, and list my courses?',scope+'what are my tuition fees?',
    'In my Moodle grade report for Study Methods and Visual Thinking, what feedback is saved?'])
    assert.equal(nativeIntent.isNativeDtmGradeOnlyQuestion(mixed,row.route),false,mixed);
});
test('unavailable native read stays unavailable and cannot borrow tracker grades',async()=>{
  const row=bank.find((item:Case)=>item.id.endsWith('-failed'))!,value=await actual(row);
  assert.equal(value.observation.broadReads,0);assert.equal(value.observation.publicReads,0);assert.ok(value.observation.reads.length>=1&&value.observation.reads.length<=2);
  assert.ok(value.wire.every((request:any)=>request.path==='/rest/v1/rpc/dtm_grade_report_overview'));
  assert.doesNotMatch(value.envelope.body.answer??'',/no saved courses|grade is zero|TRACKER|INVENTED_PRIVATE/iu);
});
test('a rejected review refreshes the same caller-only native source before its one correction',async()=>{
  const original=bank.find((item:Case)=>item.id.endsWith('-item-feedback'))!;
  const row={...original,question:original.question.replace('feedback and weight','feedback, weight and rank')};
  const value=await actual(row,{rejectOnce:true});
  assert.equal(value.envelope.statusCode,200);assert.equal(value.envelope.body.verification.status,'verified');
  assert.equal(value.envelope.body.verification.attempts,2);
  assert.deepEqual(value.stages,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.deepEqual(value.observation.reads.map(read=>read.operation),['overview','report','overview','report']);
  assert.equal(value.observation.broadReads,0);assert.equal(value.observation.publicReads,0);
  assert.equal(value.wire.filter(request=>request.path==='/rest/v1/dtm_courses').length,2);
  assert.equal(gradeDtmNativeRouteCase(row,value.envelope,{...value.observation,reads:value.observation.reads.slice(-2)}).passed,true);
});
test('mixed assignment, tracker and financial requests retain their separate base dependencies',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline planner unavailable');};
  try{
    for(const [question,tools]of [
      ['Show my Moodle grades and list my unfinished assignments.',['dtmGradeReport','assignments','dtm']],
      ['Show my native DTM grade report and my personal grade tracker.',['dtmGradeReport','dtm','assignments']],
      ['Show my Moodle grades and my tuition balance.',['dtmGradeReport','charges']],
    ] as const){
      assert.equal(nativeIntent.isNativeDtmGradeOnlyQuestion(question,'/dtm/grades'),false);
      const plan=await planAccountLookup(question,[],'/dtm/grades',Date.now()-1);for(const tool of tools)assert.ok(plan.tools.includes(tool),question+': '+tool);
      let broad=0,answer=0;
      const handler=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>{broad++;return {checkedAt:new Date().toISOString(),profile:{userId:owner}} as any;},
        answerAccount:async options=>{answer++;assert.equal(options.snapshot.profile.userId,owner);return {status:'abstained',answer:'Offline mixed-path check only.',citations:[],suggestedQuestions:[],verification:{status:'abstained',attempts:0}} as any;},
        publicResearch:async()=>assert.fail('No public dispatch')});
      await invoke(handler,{...bank[0],question});assert.equal(broad,1);assert.equal(answer,1);
    }
  }finally{globalThis.fetch=original;}
});

test('actual mixed graph composes independent tuition and native report facts without substituting either source',async()=>{
  const row={...bank.find((item:Case)=>item.id.endsWith('-item-feedback'))!,question:'Show my native DTM grade report feedback for Study Methods and my tuition balance.'};
  const fixture=dtmNativeRouteFixture(),stages:string[]=[],errors:unknown[]=[],previous=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  let broad=0,native=0;process.env.OPENAI_API_KEY='OFFLINE_DTM_MIXED';
  globalThis.fetch=async(input,init)=>{try{
    assert.equal(new URL(String(input)).origin,'https://api.openai.com');
    const body=JSON.parse(String(init?.body)),stage=body.text.format.name,packet=JSON.parse(body.input[0].content[0].text);stages.push(stage);
    let result:unknown;
    if(stage==='account_lookup_plan')result={tools:['dtmGradeReport','charges'],publicTopics:[],catalogQuery:null,action:null};
    else{
      assert.deepEqual(packet.evidence.map((source:any)=>source.id).sort(),['account-scope','account:charges','account:dtmGradeReport']);
      assert.doesNotMatch(JSON.stringify(packet),/UNREQUESTED_COURSE|UNREQUESTED_PROFILE|OFFLINE_DTM/);
      const charge=JSON.parse(packet.evidence.find((source:any)=>source.id==='account:charges').content);
      assert.equal(charge.records[0].amountDue,28000);assert.equal(charge.records[0].amountPaid,5000);
      const report=JSON.parse(packet.evidence.find((source:any)=>source.id==='account:dtmGradeReport').content);
      assert.equal(report.report.items[0].feedbackText,'Explain the sampling choice.');
      if(stage==='compose_grounded_answer')result={status:'answered',answer:'Source Analysis has saved feedback: Explain the sampling choice. The separate QA Tuition charge has TWD 23000 remaining (28000 charged, 5000 paid). These are saved local demonstration records.',sourceIds:['account:dtmGradeReport','account:charges']};
      else{assert.equal(stage,'answer_evidence_review');result={supported:true,answersQuestion:true,claims:[
        {claim:'Source Analysis saved feedback',evidenceId:'account:dtmGradeReport',jsonPaths:['/report/items/0/label','/report/items/0/feedbackText'],quotes:[],supported:true},
        {claim:'QA Tuition remaining balance',evidenceId:'account:charges',jsonPaths:['/records/0/label','/records/0/amountDue','/records/0/amountPaid','/records/0/currency'],quotes:[],supported:true}]};}
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  }catch(error){errors.push(error);throw error;}};
  try{
    const handler=createAffairsAssistantHandler({verifyToken:async()=>account,publicResearch:async()=>assert.fail('No public source'),
      loadSnapshot:async()=>{broad++;return {checkedAt:'2026-11-14T00:00:00Z',profile:{userId:owner,displayName:'UNREQUESTED_PROFILE'},
        courses:[{title:'UNREQUESTED_COURSE'}],charges:[{id:'78000000-0000-4000-8000-000000000401',userId:owner,label:'QA Tuition',amountDue:28000,amountPaid:5000,currency:'TWD',sourceMode:'sample'}]} as any;},
      readers:{dtmGradeReport:(authorized,options)=>readDtmGradeReportEvidence(authorized,options,{
        loadOverview:async caller=>{native++;assert.equal(caller.user.id,owner);return fixture.overview;},
        loadReport:async(caller,query)=>{assert.equal(caller.user.id,owner);assert.equal(query.courseId,dtmNativeRouteManifest.courseId);return fixture.report;}})}});
    const result=await invoke(handler,row);assert.deepEqual(errors,[]);assert.equal(result.statusCode,200);assert.equal(result.body.verification.status,'verified');
    assert.match(result.body.answer,/Explain the sampling choice/);assert.match(result.body.answer,/23000/);
    assert.deepEqual(result.body.citations.map((item:any)=>item.chunkId).sort(),['account:charges','account:dtmGradeReport']);
    assert.equal(broad,1);assert.equal(native,1);assert.deepEqual(stages,['account_lookup_plan','compose_grounded_answer','answer_evidence_review']);
  }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('actual compiled client preserves every native question/route/history and verifies caller before dispatch',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:any={},calls:any[]=[];let current=owner;
  runInNewContext(code,{exports,require:(specifier:string)=>{
    if(specifier.endsWith('dtmGradeEvidenceIntent.js'))return nativeIntent;
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:current},access_token:'OFFLINE_BROWSER'}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url:string,init:RequestInit)=>{calls.push({url,body:JSON.parse(String(init.body)),headers:init.headers});return Response.json({status:'answered',answer:'Intercepted verified API dispatch.',citations:[]});}});
  for(const row of bank){
    await exports.askSchoolAffairsAssistant(owner,row.question,row.history,undefined,[],row.route);
    const sent=calls.at(-1);assert.equal(sent.url,'/api/affairs-assistant');assert.equal(sent.headers.Authorization,'Bearer OFFLINE_BROWSER');
    assert.equal(sent.body.question,row.question);assert.equal(sent.body.route,row.route);assert.deepEqual(sent.body.history,structuredClone(row.history));
  }
  assert.equal(calls.length,bank.length);current=dtmNativeRouteManifest.foreignOwnerId;
  await assert.rejects(()=>exports.askSchoolAffairsAssistant(owner,bank[0].question,[],undefined,[],bank[0].route),/account changed/u);assert.equal(calls.length,bank.length);
});
