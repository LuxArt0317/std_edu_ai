import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {buildAccountCases} from '../evaluation/account-cases.mjs';
import {buildHealthExaminationCases} from '../evaluation/health-examination-cases.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const path='/school-affairs/services/36-1';
const route=path+'?page=2';
const owner='36000000-0000-4000-8000-000000000001';
const rowId='36000000-0000-4000-8000-000000000002';
const student='36000000-0000-4000-8000-000000000003';
const charge='37000000-0000-4000-8000-000000000001';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'HEALTH_OFFLINE_KEY',token:'HEALTH_OFFLINE_TOKEN',user:{id:owner}};
const question='Show my health examination records.';
const both=question+' Also show my tuition balance.';
const reverse='How much tuition do I still owe? Also list my health examination records.';
const noHealth='Show my tuition balance. Also never show my health examination reports.';
const namedWithoutHealth='Show my unpaid balance for QA tuition and do not show my health examination records.';
type Handler=ReturnType<typeof createAffairsAssistantHandler>;
type Step={kind:string;status:string};
async function call(handler:Handler,prompt:string,localRoute=route,authenticated=true){
  const result:{status:number;body:any;steps:Step[]}={status:200,body:null,steps:[]};
  const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(){},
    write(chunk:string){const frame=/^event: (.+)\ndata: (.+)\n\n$/u.exec(chunk);assert.ok(frame);const value=JSON.parse(frame[2]);if(['result','error'].includes(frame[1]))result.body=value;else result.steps.push(value);},end(){}};
  await handler({method:'POST',headers:authenticated?{authorization:'Bearer '+account.token}:{},body:{question:prompt,route:localRoute,stream:true}},response);
  return result;
}
const handler=(caller=account)=>createAffairsAssistantHandler({verifyToken:async()=>caller,
  loadSnapshot:async()=>assert.fail('No broad workspace read for the selected health and balance scopes'),
  publicResearch:async()=>assert.fail('No public retrieval for these private questions')});

test('planning keeps scoped health records, numeric pages, excluded health and unrelated requests distinct',async()=>{
  for(const prompt of [question,'Show my health examination results, examination date and PDF reports.','On page 2, show my health records.',
    'List my saved health examination codes, their report availability and the total number of records.',
    'Show my student number, name, class and examination date from my health examination records.',
    'Delete my health examination records and upload a replacement report.']){
    assert.equal(nativePageLookupContext(prompt,path).readerOnly,true,prompt);
    assert.equal(nativePageLookupContext(prompt,path).foreign,false,prompt);
    assert.deepEqual((await planAccountLookup(prompt,[],path,Date.now()+1000)).tools,['healthExaminations']);
  }
  for(const prompt of [both,reverse,'Show my health examination records on page 2 and my tuition balance.']){
    assert.equal(nativePageLookupContext(prompt,path).feeAndBalance,true,prompt);
    assert.deepEqual((await planAccountLookup(prompt,[],path,Date.now()+1000)).tools,['healthExaminations','charges']);
  }
  assert.deepEqual((await planAccountLookup(noHealth,[],path,Date.now()+1000)).tools,['charges']);
  assert.deepEqual((await planAccountLookup(namedWithoutHealth,[],path,Date.now()+1000)).tools,['charges']);
  assert.equal(nativePageLookupContext('Where can I find my health examination records?',path).selected,false);
  assert.equal(nativePageLookupContext('Show my health examination records and my next class.',path).otherQuestion,'my next class');
});

async function offline(run:()=>Promise<void>,{mixed=false,retry=false,denyHealth=false,chargesOnly=false,clarify=false,healthUnavailable=false,chargeUnavailable=false,emptyPage=false,named=false}={}){
  const original=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
  const calls:string[]=[],errors:unknown[]=[];let health=0,charges=0,reviews=0;
  process.env.OPENAI_API_KEY='HEALTH_TEST_MODEL';
  const intercepted:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      const query=JSON.parse(String(init?.body)),operation=query.text.format.name;
      const data=JSON.parse(query.input[0].content[0].text);
      calls.push(operation);
      assert.deepEqual(data.evidence.map((item:{id:string})=>item.id),['account-scope',...(mixed||chargesOnly?['account:charges']:[]),...(!chargesOnly?['account:healthExaminations']:[])]);
      assert.doesNotMatch(JSON.stringify(data.evidence),/HEALTH_OFFLINE|OFFLINE_PERSON|HIDDEN_STUDENT_NUMBER|HIDDEN_CLASS|36000000|storage\/v1|signedURL/u);
      const claims:Array<{claim:string;supported:boolean;evidenceId:string;quotes:string[];jsonPaths:string[]}>=[];
      if(!chargesOnly){
        const source=data.evidence.at(-1),payload=JSON.parse(source.content);
        assert.equal(payload.counts.offset,clarify?0:25);
        assert.equal(source.url,clarify?path:route);
        assert.equal(payload.capability.clinicalContent,false);assert.equal(payload.capability.downloads,false);
        const label=health===1?'QA-HEALTH-OLD':'QA-HEALTH-REFRESHED';
        if(clarify||healthUnavailable||emptyPage){
          assert.deepEqual(payload.records,[]);
          assert.equal(payload.counts.total,emptyPage?2:null);
          const limitation=clarify?'Please specify a numbered health examination page.':healthUnavailable?'The health examination records could not be checked.':'Page 2 has no rows; 2 records are saved in total.';
          claims.push({claim:limitation,supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:emptyPage?['/counts/total','/counts/returned']:['/reason']});
        }else{
          assert.deepEqual(payload.records,[{examinationCode:label,reportAvailable:false}]);
          claims.push({claim:'Saved examination '+label+' has no available report.',supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:['/records/0/examinationCode','/records/0/reportAvailable']});
        }
      }
      if(mixed||chargesOnly){
        const payload=JSON.parse(data.evidence[1].content);
        assert.equal(payload.records.length,chargeUnavailable?0:1);
        if(chargeUnavailable){
          assert.equal(payload.unavailableReason,'read_failed');
          claims.push({claim:'The separate tuition balance could not be read.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/unavailableReason']});
        }else{
          assert.equal(payload.records[0].amountDue,28000);
          assert.equal(payload.selectionLabel,named?'QA tuition':undefined);
          claims.push({claim:'The separate saved tuition balance is NT$23,000.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/records/0/amountDue','/records/0/amountPaid','/records/0/currency']});
        }
      }
      let output;
      if(operation==='answer_evidence_review'){
        reviews++;
        const supported=!retry||reviews===2;
        output={supported,answersQuestion:supported,claims:claims.map(value=>({...value,supported}))};
      }else{
        assert.ok(['compose_grounded_answer','correct_grounded_answer'].includes(operation));
        output={status:'answered',answer:claims.map(value=>value.claim).join(' '),sourceIds:claims.map(value=>value.evidenceId)};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
    }
    assert.equal(url.origin,account.url);
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    if(url.pathname==='/rest/v1/rpc/affairs_read_health_examinations'){
      assert.equal(denyHealth,false,'No excluded or invalid health lookup');
      assert.equal(init?.method,'POST');assert.equal(init?.body,'{"p_offset":25}');
      health++;
      if(healthUnavailable)return new Response(null,{status:503});
      if(emptyPage)return Response.json({userId:owner,total:2,rows:[]});
      return Response.json({userId:owner,total:26,rows:[{id:rowId,examination_code:health===1?'QA-HEALTH-OLD':'QA-HEALTH-REFRESHED',
        student_number:'HIDDEN_STUDENT_NUMBER',student_name:'OFFLINE_PERSON',class_label:'HIDDEN_CLASS',report_available:false}]});
    }
    assert.ok(mixed||chargesOnly);
    assert.equal(init?.method,'GET');
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_charges');assert.equal(url.searchParams.get('student_id'),'eq.'+student);charges++;
    if(chargeUnavailable)return new Response(null,{status:503});
    const row={id:charge,student_id:student,label:'QA tuition',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample'};
    return Response.json(named?[row,{...row,id:'37000000-0000-4000-8000-000000000002',label:'Unrelated fee'}]:[row]);
  };
  globalThis.fetch=(...args)=>intercepted(...args).catch(error=>{errors.push(error);throw error;});
  try{
    await run();
    assert.deepEqual(errors,[]);
    assert.equal(health,denyHealth?0:retry?2:1);
    assert.equal(charges,mixed||chargesOnly?1:0);
    assert.deepEqual(calls,[...(mixed?['compose_grounded_answer']:[]),'answer_evidence_review',...(retry&&mixed?['correct_grounded_answer','answer_evidence_review']:[])]);
  }catch(error){throw errors[0]??error;}
  finally{globalThis.fetch=original;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}
}

test('a rejected answer checks the same caller page again and verifies the refreshed metadata',async()=>{
  await offline(async()=>{
    const result=await call(handler(),question);
    assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.verification.status,'verified');
    assert.equal(result.body.verification.attempts,2);
    assert.match(result.body.answer,/QA-HEALTH-REFRESHED/u);
    assert.doesNotMatch(result.body.answer,/QA-HEALTH-OLD/u);
    assert.deepEqual(result.body.citations.map((value:{url:string})=>value.url),[route]);
    assert.ok(result.steps.some(step=>step.kind==='account-read:healthExaminations:2'&&step.status==='complete'));
    assert.ok(result.steps.some(step=>step.kind==='health-examination-evidence-check'&&step.status==='complete'));
    assert.equal(result.body.proposedAction,undefined);
  },{retry:true});
});

test('the actual handler preserves all 25 health rows and exact boundaries after an independent rejection',async()=>{
  const cases=buildAccountCases({includePlannedHealthExaminations:true});
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  const pageRows=Array.from({length:25},(_,i)=>'QA HEALTH PAGE '+String(i+1).padStart(2,'0'));
  const threeRows=['QA HEALTH A-01','QA HEALTH A-02','QA HEALTH A-03'];
  process.env.OPENAI_API_KEY='HEALTH_TEST_MODEL';
  try{
    for(const suffix of ['page-one','ambiguous-page','document-boundary','identity-boundary','write-boundary']){
      const testCase=cases.find(value=>value.id==='account:health-examinations-'+suffix);
      assert.ok(testCase,suffix);
      const paged=suffix==='page-one',noRead=suffix==='ambiguous-page'||suffix==='write-boundary';
      const rows=(paged?pageRows:threeRows).map((examination_code,i)=>({
        id:'36000000-0000-4000-8010-'+String(i+1).padStart(12,'0'),examination_code,
        student_number:'PRIVATE_STUDENT_NUMBER',student_name:'PRIVATE_STUDENT_NAME',class_label:'PRIVATE_CLASS',report_available:false,
      }));
      const data={userId:owner,total:paged?26:3,rows};
      const before=structuredClone(data);
      const observed:string[]=[],errors:unknown[]=[];
      const intercept:typeof fetch=async(input,init)=>{
        const url=new URL(String(input));
        if(url.hostname==='api.openai.com'){
          observed.push('review');
          const request=JSON.parse(String(init?.body));
          assert.equal(request.text.format.name,'answer_evidence_review');
          const input=JSON.parse(request.input[0].content[0].text);
          assert.deepEqual(input.evidence.map((row:{id:string})=>row.id),['account-scope','account:healthExaminations']);
          const payload=JSON.parse(input.evidence[1].content);
          assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_|36000000|storage\/v1|signedURL/iu);
          if(noRead)assert.deepEqual(payload.records,[]);
          else assert.deepEqual(payload.records,rows.map(row=>({examinationCode:row.examination_code,reportAvailable:false})));
          return Response.json({status:'completed',output:[{content:[{type:'output_text',
            text:JSON.stringify({supported:false,answersQuestion:false,claims:[]})}]}]});
        }
        observed.push('read');
        assert.equal(url.href,account.url+'/rest/v1/rpc/affairs_read_health_examinations');
        assert.equal(init?.method,'POST');
        assert.equal(init?.body,'{"p_offset":0}');
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
        assert.equal(noRead,false);
        return Response.json(data);
      };
      globalThis.fetch=(...args)=>intercept(...args).catch(error=>{errors.push(error);throw error;});
      const result=await call(handler(),testCase.question,testCase.route);
      assert.deepEqual(errors,[],suffix);
      assert.deepEqual(observed,noRead?['review']:['read','review','read'],suffix);
      assert.deepEqual(data,before,suffix);
      assert.equal(result.body.verification.status,'verified',suffix);
      assert.equal(result.body.verification.attempts,2,suffix);
      assert.ok(result.steps.some(step=>step.kind==='health-examination-evidence-check'&&step.status==='complete'),suffix);
      assert.ok(!result.steps.some(step=>step.kind==='account-replan'||step.kind==='account-compose'),suffix);
      assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_|36000000|storage\/v1|signedURL/iu);
      // Hosted readback is covered by the protected fixture. Keep the independent answer, source, tool and safety checks here.
      const {requireUnchangedOwnedRecords:_hostedReadback,...expected}=testCase.expected;
      const grade=gradeCase({...testCase,expected},{statusCode:result.status,execution:'deterministic',fixtureKey:testCase.fixtureKey,
        body:{...result.body,activity:result.steps}});
      assert.deepEqual(grade.failures,[],suffix);
    }
  }finally{
    globalThis.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  }
});

test('both compound orders and unavailable halves use two independently scoped collections',async()=>{
  for(const [prompt,healthUnavailable,chargeUnavailable] of [[both,false,false],[reverse,false,false],[both,true,false],[reverse,false,true]] as const){
    await offline(async()=>{
      const result=await call(handler(),prompt);
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(result.body.verification.status,'verified');
      assert.match(result.body.answer,healthUnavailable?/could not be checked/u:/QA-HEALTH-OLD/u);
      assert.match(result.body.answer,chargeUnavailable?/balance could not be read/u:/NT\$23,000/u);
      assert.ok(result.steps.some(step=>step.kind==='account-read:healthExaminations:1'&&step.status===(healthUnavailable?'unavailable':'complete')));
      assert.ok(result.steps.some(step=>step.kind==='account-read:charges:1'&&step.status===(chargeUnavailable?'unavailable':'complete')));
    },{mixed:true,healthUnavailable,chargeUnavailable});
  }
});

test('named charges keep the exact health page, preserve either half during outages, and respect health exclusions',async t=>{
  const cases=buildHealthExaminationCases();
  const calls:string[]=[],errors:unknown[]=[];
  const priorKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='HEALTH_TEST_MODEL';
  t.after(()=>{if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;});
  let targetPage=1;
  let outage:''|'health'|'charges'='';
  const intercept:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      assert.equal(targetPage,0,'Both exact mixed orders verify without the model.');
      const request=JSON.parse(String(init?.body));
      assert.equal(request.text.format.name,'answer_evidence_review');
      const input=JSON.parse(request.input[0].content[0].text);
      assert.deepEqual(input.evidence.map((row:{id:string})=>row.id),['account-scope','account:charges']);
      assert.doesNotMatch(JSON.stringify(input),/health examination|Unrelated charge/u);
      calls.push('review');
      return Response.json({error:{code:'insufficient_quota',type:'insufficient_quota'}},{status:429});
    }
    assert.equal(url.origin,account.url,'No public research or external file call for an exact pair');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    calls.push(url.pathname);
    if(url.pathname.endsWith('/affairs_read_health_examinations')){
      assert.ok(targetPage>0,'An explicit health exclusion forbids a metadata read.');
      assert.equal(init?.body,JSON.stringify({p_offset:(targetPage-1)*25}));
      if(outage==='health')return new Response(null,{status:503});
      const codes=targetPage===1?['QA HEALTH A-01','QA HEALTH A-02','QA HEALTH A-03']:['QA HEALTH PAGE 26'];
      return Response.json({userId:owner,total:targetPage===1?3:26,rows:codes.map((examination_code,index)=>({
        id:'36000000-0000-4000-8000-'+String(index+200).padStart(12,'0'),examination_code,
        student_number:'PRIVATE HEALTH NUMBER A',student_name:'PRIVATE HEALTH NAME A',class_label:'PRIVATE HEALTH CLASS A',report_available:false,
      }))});
    }
    assert.equal(init?.method,'GET');
    if(url.pathname.endsWith('/affairs_students')){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    if(outage==='charges')return new Response(null,{status:503});
    const due={id:charge,student_id:student,label:'QA Health Tuition instalment',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample'};
    return Response.json([due,{...due,id:'37000000-0000-4000-8000-000000000002',label:'Unrelated charge',amount_due:123456}]);
  };
  t.mock.method(globalThis,'fetch',(...args:Parameters<typeof fetch>)=>intercept(...args).catch(error=>{errors.push(error);throw error;}));
  for(const suffix of ['mixed-tuition','mixed-reversed','mixed-health-unavailable','mixed-charges-unavailable','negative-health']){
    const testCase=cases.find(row=>row.id==='account:health-examinations-'+suffix);
    assert.ok(testCase);
    targetPage=suffix==='negative-health'?0:suffix==='mixed-reversed'?2:1;
    outage=suffix==='mixed-health-unavailable'?'health':suffix==='mixed-charges-unavailable'?'charges':'';
    calls.length=0;
    const actual=await call(handler(),testCase.question,testCase.route);
    assert.equal(actual.status,200);
    assert.deepEqual(actual.body.verification,{status:'verified',attempts:targetPage?1:2});
    const graded=gradeCase(testCase,{body:actual.body,statusCode:actual.status,events:actual.steps,execution:'deterministic',fixtureKey:testCase.fixtureKey});
    assert.equal(graded.passed,true,JSON.stringify(graded.failures));
    if(targetPage&&!outage){
      const healthCode=targetPage===1?'QA HEALTH A-01':'QA HEALTH PAGE 26';
      assert.equal(actual.body.answer.indexOf(healthCode)<actual.body.answer.indexOf('QA Health Tuition instalment'),targetPage===1);
    }
    const ownedReads=['/rest/v1/affairs_charges','/rest/v1/affairs_students'];
    const expected=targetPage?[...ownedReads,'/rest/v1/rpc/affairs_read_health_examinations']:[...ownedReads,...ownedReads,'review'];
    assert.deepEqual(calls.sort(),expected.sort());
    assert.doesNotMatch(JSON.stringify(actual.body),/Unrelated charge|123,456|PRIVATE HEALTH/u);
    const viewIds=actual.body.views.map((view:{id:string})=>view.id);
    assert.deepEqual(viewIds,targetPage?(outage==='health'?['charges']:outage==='charges'?['healthExaminations']:['healthExaminations','charges']):['charges']);
    if(outage){
      assert.equal(actual.body.complete,false);
      assert.equal(actual.body.grounding.degraded,true);
      assert.ok(actual.steps.some(step=>step.kind==='health-examination-evidence-check'&&step.status==='complete'));
      assert.ok(actual.steps.some(step=>step.kind===`account-read:${outage==='health'?'healthExaminations':'charges'}:1`&&step.status==='unavailable'));
      assert.ok(actual.steps.every(step=>!step.kind.includes(':2')&&step.kind!=='account-compose'));
    }
    assert.deepEqual(errors,[]);
  }
});

test('malformed, denied, ambiguous, or doubly unavailable paired reads cannot use native partial verification',async t=>{
  const frozen=buildHealthExaminationCases().find(row=>row.id==='account:health-examinations-mixed-tuition');
  assert.ok(frozen);
  const caller={...account,user:{id:'36000000-0000-4000-8000-000000000007'}};
  const validHealth={userId:caller.user.id,total:1,rows:[{id:rowId,examination_code:'QA HEALTH A-01',student_number:'PRIVATE_NUMBER',
    student_name:'PRIVATE_NAME',class_label:'PRIVATE_CLASS',report_available:false}]};
  const due={id:charge,student_id:student,label:'QA Health Tuition instalment',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample'};
  const originalKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='HEALTH_TEST_MODEL';
  t.after(()=>{if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;});
  let scenario='wrong-health-owner';
  let providerCalls=0;
  t.mock.method(globalThis,'fetch',async(input:URL,init:RequestInit)=>{
    const url=new URL(input);
    if(url.hostname==='api.openai.com'){
      providerCalls++;
      return Response.json({error:{code:'insufficient_quota',type:'insufficient_quota'}},{status:429});
    }
    assert.equal(url.origin,account.url);
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+account.token);
    if(url.pathname==='/rest/v1/rpc/affairs_read_health_examinations'){
      if(['double-outage','empty-charge','duplicate-charge','invalid-charge-amount'].includes(scenario))return new Response(null,{status:503});
      if(scenario==='health-denied')return new Response(null,{status:403});
      if(scenario==='invalid-health-shape')return Response.json({...validHealth,rows:[]});
      return Response.json(scenario==='wrong-health-owner'?{...validHealth,userId:student}:validHealth);
    }
    if(url.pathname==='/rest/v1/affairs_students')return Response.json([{id:student,user_id:caller.user.id}]);
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    if(scenario==='double-outage')return new Response(null,{status:503});
    if(scenario==='charge-denied')return new Response(null,{status:403});
    if(scenario==='wrong-charge-owner')return Response.json([{...due,student_id:owner}]);
    if(scenario==='invalid-charge-shape')return Response.json({records:[due]});
    if(scenario==='invalid-charge-amount')return Response.json([{...due,amount_paid:50000}]);
    if(scenario==='duplicate-charge')return Response.json([due,{...due,id:'37000000-0000-4000-8000-000000000002'}]);
    return Response.json(scenario==='empty-charge'?[]:[due]);
  });
  for(const mode of ['wrong-health-owner','invalid-health-shape','health-denied','wrong-charge-owner','invalid-charge-shape',
    'charge-denied','double-outage','empty-charge','duplicate-charge','invalid-charge-amount']){
    scenario=mode;
    const before=providerCalls;
    const result=await call(handler(caller),frozen.question,frozen.route);
    assert.equal(result.status,200,mode);
    assert.ok(result.steps.every(step=>step.kind!=='health-examination-evidence-check'),mode);
    assert.notEqual(result.body.verification.status,'verified',mode);
    assert.ok(providerCalls>before,mode);
    assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_NUMBER|PRIVATE_NAME|PRIVATE_CLASS|36000000|37000000/u,mode);
    assert.ok(result.body.views.every((view:{id:string})=>view.id!=='charges'),mode);
  }
});

test('excluded records stay unread, page validation asks for a number, and later-page emptiness retains total',async()=>{
  await offline(async()=>{const result=await call(handler(),noHealth);assert.equal(result.status,200);assert.equal(result.body.verification.status,'verified');
    assert.ok(!result.steps.some(step=>step.kind.startsWith('account-read:healthExaminations')));},{denyHealth:true,chargesOnly:true});
  await offline(async()=>{const result=await call(handler(),namedWithoutHealth);assert.equal(result.status,200);assert.equal(result.body.verification.status,'verified');
    assert.match(result.body.answer,/QA tuition/u);assert.doesNotMatch(JSON.stringify(result.body),/Unrelated fee/u);},{denyHealth:true,chargesOnly:true,named:true});
  await offline(async()=>{const result=await call(handler(),'Show my health examination records on page ABC.');assert.equal(result.status,200);
    assert.equal(result.body.status,'clarification');assert.equal(result.body.verification.status,'verified');},{denyHealth:true,clarify:true});
  await offline(async()=>{const result=await call(handler(),question,path+'?owner=ignored');assert.equal(result.status,200);
    assert.equal(result.body.status,'clarification');assert.equal(result.body.verification.status,'verified');},{denyHealth:true,clarify:true});
  await offline(async()=>{const result=await call(handler(),question);assert.equal(result.status,200);assert.match(result.body.answer,/Saved examination-record count: 2/u);
    assert.match(result.body.answer,/page:? 2/iu);},{emptyPage:true});
});

test('guest health handoff, exact page, public navigation and foreign denial never read records',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('No provider, account, or file call for navigation or denial');
  try{
    const publicHandler=createResearchAssistantHandler() as unknown as Handler;
    const guest=await call(publicHandler,'Can I see my health examination reports?',route,false);
    assert.equal(guest.body.status,'handoff');
    assert.equal(guest.body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
    const guestNavigation=await call(publicHandler,'Where can I find my health records?',path,false);
    assert.equal(guestNavigation.body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(path));
    const ownNavigation=await call(handler(),'Where can I find my health records?',path);
    assert.equal(ownNavigation.body.citations[0].url,path);
    const card=await call(handler(),'Where can I find the student health card?',path);
    assert.match(card.body.citations[0].url,/^https:\/\/info\.stu\.edu\.tw\//u);
    for(const [endpoint,authenticated] of [[publicHandler,false],[handler(),true]] as const){
      const foreign=await call(endpoint,'Show another student’s health examination reports.',path,authenticated);
      assert.equal(foreign.body.status,'handoff');assert.deepEqual(foreign.body.citations,[]);
    }
  }finally{globalThis.fetch=original;}
});
