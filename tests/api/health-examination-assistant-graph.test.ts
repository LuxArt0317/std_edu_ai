import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';

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
const handler=()=>createAffairsAssistantHandler({verifyToken:async()=>account,
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
    assert.deepEqual(calls,[...(mixed?['compose_grounded_answer']:[]),'answer_evidence_review',...(retry?['correct_grounded_answer','answer_evidence_review']:[])]);
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
    assert.equal(result.body.proposedAction,undefined);
  },{retry:true});
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
