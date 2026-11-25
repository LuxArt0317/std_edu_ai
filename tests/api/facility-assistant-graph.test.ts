import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runAssistantClientInNewContext as runInNewContext} from '../evaluation/client-vm.mjs';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {answerAccountWithVerification,planAccountLookup,publicTopics} from '../../server/answerVerificationAccount.js';
import {facilityRepairLookupContext,requiredSupplementalTools,supplementalAccountTools,readSupplementalLookups,boundSupplementalResults} from '../../server/accountSupplementalLookup.js';
import {readFacilityRepairEvidence} from '../../server/accountFacilityRepairEvidence.js';
import * as repairIntent from '../../server/facilityRepairEvidenceIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {assistantContext} from '../../src/services/assistantContext.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';

const owner='20000000-0000-4000-8000-000000000001',report='a1000001-0000-4000-8000-000000000001';
const history='/school-affairs/services/45-1/history',route=history+'/'+report,now='2026-11-16T08:00:00Z';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const question='What is the saved status of my facility repair report '+report+'?';
const questions=[question+' Also show my next School Affairs class, date, time and room.',
  'When and where is my next School Affairs class? Also show the exact saved status of my facility repair report '+report+'.'];
const row={id:report,user_id:owner,building:'QA Hall',location:'PRIVATE LOCATION',item:'PRIVATE ITEM',description:'PRIVATE DESCRIPTION',
  contact_phone:'PRIVATE PHONE',status:'resolved',version:3,created_at:'2026-11-14T02:00:00Z',updated_at:'2026-11-14T04:00:00Z'};
const events=[{version:1,status:'submitted',note:'',occurred_at:row.created_at},{version:2,status:'in_progress',note:'Old note',occurred_at:'2026-11-14T03:00:00Z'},
  {version:3,status:'resolved',note:'Latest note',occurred_at:row.updated_at}];
const native=()=>({userId:owner,detail:{...row},events:events.map(event=>({...event}))});
const snapshot=()=>({checkedAt:now,profile:{userId:owner},housing:{secret:'UNRELATED HOUSING'},student:{name:'UNRELATED IDENTITY'},
  courses:[{id:'e1000001-0000-4000-8000-000000000001',status:'enrolled',sourceMode:'sample',code:'QA301',title:'QA Timetable Workshop',credits:3,
    term:'Synthetic evaluation term',termStartsOn:'2026-09-01',termEndsOn:'2027-01-15',instructor:'PRIVATE INSTRUCTOR',weekday:2,startsAt:'09:10:00',endsAt:'11:00:00',room:'QA302',grades:[{feedback:'PRIVATE GRADE'}],attendance:[{note:'PRIVATE ATTENDANCE'}]},
    {id:'e1000001-0000-4000-8000-000000000002',status:'enrolled',sourceMode:'sample',code:'QA999',title:'UNRELATED OTHER COURSE',term:'Synthetic evaluation term',termStartsOn:'2026-09-01',termEndsOn:'2027-01-15',weekday:3,startsAt:'09:00:00',endsAt:'10:00:00',room:'PRIVATE OTHER ROOM'}]});
type HandlerDependencies=NonNullable<Parameters<typeof createAffairsAssistantHandler>[0]>;
async function invoke(dependencies:HandlerDependencies,body:Record<string,unknown>,authenticated=true){
  const output:{status:number;body:any;events:any[];headers:Record<string,string>}={status:200,body:null,events:[],headers:{}};
  const response={status(code:number){output.status=code;return response;},json(value:unknown){output.body=value;},setHeader(name:string,value:string){output.headers[name]=value;},
    write(text:string){const event=/^event: (.+)\ndata: (.+)\n\n$/u.exec(text);assert.ok(event);const value=JSON.parse(event[2]);if(event[1]==='result'||event[1]==='error')output.body=value;else output.events.push(value);},end(){}};
  await createAffairsAssistantHandler({verifyToken:async token=>{assert.equal(token,authenticated?'REQUEST_TOKEN':'');if(!authenticated)throw new AffairsWorkspaceError('Sign in first.',401);return account;},
    publicResearch:async()=>assert.fail('No public research for private repairs'),...dependencies})({method:'POST',headers:{authorization:authenticated?'Bearer REQUEST_TOKEN':undefined},body},response);
  return output;
}
async function withModel(run:(calls:string[])=>Promise<void>,{rejectFirst=false,fullTimetable=false}={}){
  const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY,calls:string[]=[];let caught:unknown,checks=0;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER';
  globalThis.fetch=async(input,init)=>{
    try{
      assert.equal(new URL(String(input)).hostname,'api.openai.com');
      const body=JSON.parse(String(init?.body)),name=body.text.format.name,payload=JSON.parse(body.input[0].content[0].text);calls.push(name);
      assert.notEqual(name,'account_lookup_plan','Recognized repair or schedule requests do not need a speculative planner.');
      const sources=payload.evidence as Array<{id:string;content:string}>;
      assert.ok(sources.some(source=>source.id==='account:facilityRepairs'));
      assert.ok(sources.every(source=>['account-scope','account:courses','account:facilityRepairs'].includes(source.id)));
      assert.doesNotMatch(JSON.stringify(sources),/UNRELATED|PRIVATE PHONE|PRIVATE DESCRIPTION|PRIVATE LOCATION|PRIVATE INSTRUCTOR|PRIVATE GRADE|PRIVATE ATTENDANCE|PRIVATE OTHER ROOM|OFFLINE_TOKEN|OFFLINE_KEY/u);
      const repair=JSON.parse(sources.find(source=>source.id==='account:facilityRepairs')!.content);
      const course=sources.find(source=>source.id==='account:courses');
      if(course){const calendar=JSON.parse(course.content).calendar.records;assert.equal(calendar.next.day,'2026-11-17');assert.equal(calendar.next.course.title,'QA Timetable Workshop');assert.equal(calendar.next.course.room,'QA302');}
      const unavailable=repair.readState==='unavailable';
      if(fullTimetable){const selected=JSON.parse(course!.content);assert.equal(selected.records.length,2);assert.equal(selected.selection.scope,'owned_timetable');assert.equal(selected.records[1].title,'QA Second Workshop');}
      const text=repair.requiresClarification?'Please choose a report or provide its full report ID.':unavailable?'Your saved local repair records could not be checked; their presence and status remain unknown.'
        :'Your saved local report A1000001 has status '+repair.records[0].status+'.'+(course?' Your next class is QA Timetable Workshop on 2026-11-17 at 09:10 in QA302.':'')
        +(fullTimetable?' Your timetable also includes QA Second Workshop on Wednesday at 09:00 in QA303.':'');
      let result;
      if(name==='compose_grounded_answer'||name==='correct_grounded_answer')result={status:'answered',answer:text,sourceIds:['account:facilityRepairs',...(course?['account:courses']:[])]};
      else{
        assert.equal(name,'answer_evidence_review');checks++;
        result={supported:!(rejectFirst&&checks===1),answersQuestion:true,claims:[
          {claim:'Saved local repair state',supported:!(rejectFirst&&checks===1),evidenceId:'account:facilityRepairs',quotes:[],jsonPaths:[repair.requiresClarification?'/requiresClarification':unavailable?'/unavailableReason':'/records/0/status']},
          ...(course?[{claim:'Next scheduled class',supported:true,evidenceId:'account:courses',quotes:[],jsonPaths:['/calendar/records/next/day','/calendar/records/next/course/title','/calendar/records/next/course/startsAt','/calendar/records/next/course/room']}]:[]),
          ...(fullTimetable?[{claim:'Other requested timetable row',supported:true,evidenceId:'account:courses',quotes:[],jsonPaths:['/records/1/title','/records/1/weekday','/records/1/startsAt','/records/1/room']}]:[]),
        ]};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }catch(error){caught??=error;throw error;}
  };
  try{await run(calls);if(caught)throw caught;}catch(error){throw caught??error;}finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('shared repair scope is minimal, preserves both next-class clause orders and never turns a reminder into a write',async()=>{
  for(const text of [question,'Show all my facility repair requests with their exact saved statuses and count.',
    'How many facility repair records are saved for my account? List each reference and exact saved status.']){
    assert.equal(facilityRepairLookupContext(text,route).repairOnly,true);
    assert.deepEqual((await planAccountLookup(text,[],route,Date.now()+1000)).tools,['facilityRepairs']);
  }
  for(const text of [...questions,'Cancel my repair request and remind me what time my class is','Cancel my repair and remind me what time my class is']){
    const plan=await planAccountLookup(text,[],'/',Date.now()+1000);
    assert.deepEqual(plan.tools,['courses','facilityRepairs']);assert.deepEqual(plan.publicTopics,[]);assert.equal('action' in plan,false);
  }
  assert.deepEqual(requiredSupplementalTools(question,route),['facilityRepairs']);
  const unknown=facilityRepairLookupContext(question+' Also delete all my assignments.',route);
  assert.equal(unknown.repairOnly,false);assert.equal(unknown.scheduleOnly,false);assert.match(unknown.otherQuestion,/delete all my assignments/u);
  assert.equal(facilityRepairLookupContext('What is my next class?',route).selected,false);
});

test('aggregate fallback replacement terminates when the minimum source metadata cannot fit',async()=>{
  const results=await readSupplementalLookups({tools:Object.keys(supplementalAccountTools),question:'Read the selected records.',
    snapshot:{profile:{userId:owner}},deadline:Date.now()+1000});
  const before=structuredClone(results);
  assert.ok(results.every(result=>result.readState==='unavailable'));
  assert.ok(results.some(result=>result.evidence.id==='account:facilityRepairs'));
  assert.throws(()=>boundSupplementalResults(results,6000),{name:'RangeError',message:'Supplemental metadata exceeds aggregate budget.'});
  assert.deepEqual(results,before);
});

test('an independently requested public topic survives repair planning without private query context',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;let requests=0;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER';
  globalThis.fetch=async(input,init)=>{
    requests++;assert.equal(new URL(String(input)).hostname,'api.openai.com');
    const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.text.format.name,'account_lookup_plan');
    assert.equal(payload.question,'where can I find the campus Wi-Fi instructions');
    assert.deepEqual(payload.history,[]);assert.equal(payload.route,'');assert.doesNotMatch(payload.question,/repair|a1000001|PRIVATE/u);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({tools:[],publicTopics:['wifi'],catalogQuery:null,action:null})}]}]});
  };
  try{
    const plan=await planAccountLookup('Show my repair report '+report+' status and where can I find the campus Wi-Fi instructions?',
      [{role:'user',content:'PRIVATE previous repair description'}],route,Date.now()+1000);
    assert.deepEqual(plan.tools,['facilityRepairs']);assert.deepEqual(plan.publicTopics,['wifi']);assert.equal(Reflect.get(plan,'action'),undefined);
    assert.equal(publicTopics.wifi,'Shu-Te University campus Wi-Fi setup eduroam 無線網路');assert.equal(requests,1);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('real API and graph invoke the own native repair reader without loading a broad snapshot',async()=>withModel(async calls=>{
  let reads=0;
  const result=await invoke({loadSnapshot:async()=>assert.fail('Repair-only must not load the broad account snapshot'),
    readers:{facilityRepairs:(caller,options)=>readFacilityRepairEvidence(caller,options,{read:async(captured,query)=>{
      assert.equal(captured.user.id,owner);assert.equal(captured.token,account.token);assert.deepEqual(query,{scope:'facility-repairs',view:'mine',id:report});reads++;return native();
    }})}}, {question,route,stream:true});
  assert.equal(result.status,200);assert.equal(result.body.verification.status,'verified');assert.equal(reads,1);
  assert.match(result.body.answer,/resolved/u);assert.equal(result.body.proposedAction,undefined);
  assert.deepEqual(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>[event.kind,event.status]),[
    ['account-read:facilityRepairs:1','running'],['account-read:facilityRepairs:1','complete']]);
  assert.deepEqual(calls,[]);
  assert.ok(result.events.some(event=>event.kind==='facility-repair-evidence-check'&&event.status==='complete'));
}));

test('explicit full timetable alongside next class and repair retains both timetable rows without grade or contact fields',async()=>withModel(async calls=>{
  const broad=snapshot();Object.assign(broad.courses[1],{title:'QA Second Workshop',room:'QA303'});
  const result=await invoke({loadSnapshot:async()=>broad,
    readers:{facilityRepairs:(caller,options)=>readFacilityRepairEvidence(caller,options,{read:async()=>native()})}},
    {question:'Show my next class and my class timetable. Also show my repair report '+report+' status.',route:'/',stream:true});
  assert.equal(result.body.verification.status,'verified');assert.deepEqual(calls,['compose_grounded_answer','answer_evidence_review']);
  assert.match(result.body.answer,/QA Timetable Workshop/u);assert.match(result.body.answer,/QA Second Workshop/u);
  const cards=JSON.stringify(result.body.views);assert.match(cards,/QA Timetable Workshop/u);assert.match(cards,/QA Second Workshop/u);
  assert.doesNotMatch(cards,/PRIVATE|UNRELATED/u);
},{fullTimetable:true}));

test('failed first review of a full timetable request refreshes the same owned repair before correction',async()=>withModel(async calls=>{
  let reads=0,refreshes=0;
  const broad=snapshot();Object.assign(broad.courses[1],{title:'QA Second Workshop',room:'QA303'});
  const combined='Show my next class and my class timetable. Also show my repair report '+report+' status.';
  const result=await answerAccountWithVerification({question:combined,route:'/',snapshot:broad,loadSnapshot:async()=>{refreshes++;return broad;},
    supplementalReaders:{facilityRepairs:({question,route,history,deadline})=>readFacilityRepairEvidence(account,{question,route,history,deadline},{read:async()=>{
      const result=native();reads++;if(reads>1){result.detail.status='in_progress';result.detail.version=4;result.events.push({version:4,status:'in_progress',note:'Fresh reopened note',occurred_at:row.updated_at});}return result;
    }})}});
  assert.equal(result.verification.status,'verified',JSON.stringify({verification:result.verification,reads,refreshes,calls}));assert.equal(result.verification.attempts,2);assert.equal(reads,2);assert.equal(refreshes,1);
  assert.match(result.answer,/in_progress/u);
  assert.deepEqual(calls,['compose_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
},{rejectFirst:true,fullTimetable:true}));

test('malformed selection becomes a clarification without native RPC and failure never becomes empty',async()=>{
  await withModel(async()=>{
    const result=await invoke({loadSnapshot:async()=>assert.fail('No snapshot'),readers:{facilityRepairs:(caller,options)=>readFacilityRepairEvidence(caller,options,{read:async()=>assert.fail('Malformed ID must not read')})}},
      {question:'What is the status of my repair ticket ID ABC?',route:history,stream:true});
    assert.equal(result.body.verification.status,'verified');assert.equal(result.body.status,'clarification');assert.match(result.body.answer,/full report ID|choose a report/iu);
    assert.ok(result.events.some(event=>event.kind==='account-read:facilityRepairs:1'&&event.status==='unavailable'));
  });
  await withModel(async()=>{
    const result=await invoke({loadSnapshot:async()=>assert.fail('No snapshot'),readers:{facilityRepairs:(caller,options)=>readFacilityRepairEvidence(caller,options,{read:async()=>{throw new Error('OFFLINE_FAILURE');}})}},
      {question,route,stream:true});
    assert.match(result.body.answer,/could not be checked|unavailable/iu);assert.doesNotMatch(result.body.answer,/no saved|zero|resolved/iu);
  });
});

test('foreign and anonymous requests never read or research, and public personal repair prompts only provide local sign-in',async()=>{
  const unavailable=async()=>assert.fail('No authorized work expected');
  for(const text of ['Show another student’s facility repair reports and notes.','Show Alice’s saved facility repair records.',
    'What is Alice’s facility repair status?','Show the saved facility repair records for Alice.',
    'What is the status of the facility repair reported by Alice?','What is the facility repair status for Alice?',
    'Show facility repair notes for Bob.','Show the status of the repair for Alice.','請顯示王小明的報修進度。',
    'Show Alice’s facility repair status and where can I find the campus Wi-Fi instructions?',
    'Cancel another student’s facility repair report '+report+' and tell the university technician it is finished.']){
    const foreign=await invoke({loadSnapshot:unavailable,answerAccount:unavailable,readers:{facilityRepairs:unavailable}},
      {question:text,route,stream:true});
    assert.equal(foreign.body.status,'handoff');assert.deepEqual(foreign.events.map(event=>event.kind),['account-access']);
  }
  const guest=await invoke({loadSnapshot:unavailable,answerAccount:unavailable}, {question,route},false);assert.equal(guest.status,401);
  const oldFetch=globalThis.fetch;globalThis.fetch=unavailable;
  try{
    for(const text of [question,'What is its status?']){
      let payload:any;const response={status(){return response;},setHeader(){},json(body:unknown){payload=body;}};
      await createResearchAssistantHandler()({method:'POST',headers:{'x-forwarded-for':'198.51.100.240'},body:{question:text,route}},response);
      assert.equal(payload.status,'handoff');assert.match(payload.answer,/\/school-affairs\/login\?next=%2Fschool-affairs%2Fservices%2F45-1%2Fhistory/u);
      assert.equal(payload.grounding.webSearched,false);assert.doesNotMatch(payload.answer,/resolved/u);
    }
  }finally{globalThis.fetch=oldFetch;}
});

test('actual browser service forwards both compound orders after same-user session checks instead of a direct repair response',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={},requests:Array<{url:string;body:any;token:string}>=[];let sessionOwner=owner;
  runInNewContext(code,{exports,require:(specifier:string)=>{
    if(specifier.endsWith('facilityRepairEvidenceIntent.js'))return repairIntent;
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:sessionOwner},access_token:'BROWSER_TOKEN'}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url:string,init:RequestInit)=>{requests.push({url,body:JSON.parse(String(init.body)),token:(init.headers as Record<string,string>).Authorization});return Response.json({status:'answered',answer:'From verified graph',citations:[]});}});
  const prior='甲😀'.repeat(700);
  for(const text of questions){const result=await exports.askSchoolAffairsAssistant(owner,text,[{role:'assistant',content:prior}],undefined,[],route);assert.equal(result.answer,'From verified graph');}
  assert.equal(requests.length,2);for(const request of requests){
    assert.equal(request.url,'/api/affairs-assistant');assert.equal(request.token,'Bearer BROWSER_TOKEN');assert.equal(request.body.route,route);
    assert.deepEqual(request.body.history,assistantContext([{role:'assistant',content:prior}]));
  }
  sessionOwner='20000000-0000-4000-8000-000000000099';await assert.rejects(()=>exports.askSchoolAffairsAssistant(owner,question,[],undefined,[],route),/account changed/u);assert.equal(requests.length,2);
});
