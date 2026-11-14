import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {answerAccountWithVerification,planAccountLookup} from '../../server/answerVerificationAccount.js';
import {nativePageLookupContext,requiredSupplementalTools,readSupplementalLookups} from '../../server/accountSupplementalLookup.js';
import {readHousingBedEvidence} from '../../server/accountHousingBedEvidence.js';
import {readDormitoryConductEvidence} from '../../server/accountDormitoryConductEvidence.js';
import {readElearningOutlineEvidence} from '../../server/accountElearningOutlineEvidence.js';
import {readElearningEvidence} from '../../server/accountElearningEvidence.js';
import * as dormIntent from '../../server/dormitoryConductEvidenceIntent.js';
import * as feeIntent from '../../server/feeRemissionEvidenceIntent.js';
import * as outlineIntent from '../../server/elearningOutlineEvidenceIntent.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';

const owner='52000000-0000-4000-8000-000000000001';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'PRIVATE_KEY',token:'PRIVATE_TOKEN',user:{id:owner}};
const dormRoute='/school-affairs/services/34-2',outlineRoute='/elearning/course/9408';
const dormQuestion='Show my dormitory conduct record.',outlineQuestion='Which videos are linked in this remote-learning course? List all four with their local links.';
const dormNative=(result='unknown')=>({snapshot:{userId:owner,sourceMode:'local_demo',version:1,result}});
const outlineNative=()=>({userId:owner,courseId:9408,sections:[{position:1,title:'Orientation',activities:[
  {id:11,title:'First video',kind:'url',purpose:'video'},{id:12,title:'Lecture slides',kind:'url',purpose:'slides'},
  {id:13,title:'Feedback form',kind:'url',purpose:'feedback'},
  {id:14,title:'Second video',kind:'url',purpose:'video'},{id:15,title:'Third video',kind:'url',purpose:'video'},
  {id:16,title:'Fourth video',kind:'url',purpose:'video'}]}]});
const snapshot=()=>({checkedAt:'2026-11-16T08:00:00Z',profile:{userId:owner},student:{displayName:'UNREQUESTED_IDENTITY'},
  courses:[],housing:{periods:[],applications:[],assignments:[]},charges:[{id:'q-charge',label:'Tuition',amountDue:1300,amountPaid:0,currency:'TWD',sourceMode:'local_demo',dueOn:'2026-11-20'}]});
type Dependencies=NonNullable<Parameters<typeof createAffairsAssistantHandler>[0]>;
async function invoke(dependencies:Dependencies,body:Record<string,unknown>,authenticated=true){
  const output:{status:number;body:any;events:any[]}={status:200,body:null,events:[]};
  const response={status(code:number){output.status=code;return response;},json(value:unknown){output.body=value;},setHeader(){},
    write(text:string){const match=/^event: (.+)\ndata: (.+)\n\n$/u.exec(text);assert.ok(match);const value=JSON.parse(match[2]);if(['result','error'].includes(match[1]))output.body=value;else output.events.push(value);},end(){}};
  await createAffairsAssistantHandler({verifyToken:async()=>{if(!authenticated)throw new AffairsWorkspaceError('Sign in first.',401);return account;},
    publicResearch:async()=>assert.fail('Private request cannot use public research'),...dependencies})({method:'POST',headers:{authorization:authenticated?'Bearer INPUT_TOKEN':undefined},body},response);
  return output;
}
async function provider(run:(calls:string[])=>Promise<void>,options:{rejectFirst?:boolean;planTools?:string[]}={}){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY,calls:string[]=[];let caught:unknown,checks=0;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER';
  globalThis.fetch=async(input,init)=>{try{
    assert.equal(new URL(String(input)).hostname,'api.openai.com');
    const body=JSON.parse(String(init?.body)),name=body.text.format.name,payload=JSON.parse(body.input[0].content[0].text);calls.push(name);
    let result;
    if(name==='account_lookup_plan')result={tools:options.planTools??[],publicTopics:[],catalogQuery:null,action:null};
    else{
      const sources=payload.evidence as Array<{id:string;content:string}>;
      assert.doesNotMatch(JSON.stringify(sources),/PRIVATE_KEY|PRIVATE_TOKEN|UNREQUESTED_IDENTITY/u);
      const selected=sources.filter(source=>source.id!=='account-scope');
      const clauses:string[]=[],claims:any[]=[];
      for(const source of selected){
        const value=JSON.parse(source.content);
        if(source.id==='account:dormitoryConduct'){
          const field=value.metadataState==='saved'?'/record/result':'/metadataState';
          clauses.push(value.metadataState==='saved'?`The saved local dormitory notice result is ${value.record.result}.`:value.metadataState==='missing'?'No dormitory notice metadata is saved.':'The dormitory lookup is unavailable; record presence is unknown.');
          claims.push({claim:'Saved notice state',supported:true,evidenceId:source.id,quotes:[],jsonPaths:[field]});
        }else if(source.id==='account:elearningOutline'){
          clauses.push(value.records.length?'First video is a listed course activity.':value.reason==='choose_course'?'Please choose a remote-learning course.':'The course outline could not be checked; its content is unknown.');
          claims.push({claim:'Course outline result',supported:true,evidenceId:source.id,quotes:[],jsonPaths:[value.records.length?'/records/0/activities/0/title':'/reason']});
        }else if(source.id==='account:charges'){
          clauses.push('The saved Tuition charge is 1300.');claims.push({claim:'Saved charge',supported:true,evidenceId:source.id,quotes:[],jsonPaths:['/records/0/amountDue']});
        }else if(source.id==='account:elearningEnrollments'){
          clauses.push('The saved remote-learning enrollment is QA remote workshop.');claims.push({claim:'Saved enrollment',supported:true,evidenceId:source.id,quotes:[],jsonPaths:['/rows/0/title']});
        }else if(source.id==='account:housing'&&value.collection==='housingBed'){
          assert.equal((source as {url?:string}).url,'/school-affairs/services/34-1');
          assert.doesNotMatch(source.content,/FOREIGN_BED/u);
          assert.equal(value.records[0].bedNumber,'E-305-2');
          assert.equal(value.records[0].accommodationFee,8500);
          clauses.push('The saved bed number is E-305-2 and accommodation fee is 8500.');
          claims.push({claim:'Saved bed and fields',supported:true,evidenceId:source.id,quotes:[],
            jsonPaths:Object.keys(value.records[0]).map(field=>'/records/0/'+field)});
        }else if(source.id==='account:courses'||source.id==='account:housing'){
          clauses.push('No matching rows are present in the selected local collection.');claims.push({claim:'Selected collection',supported:true,evidenceId:source.id,quotes:[],jsonPaths:['/records']});
        }else assert.fail('Unexpected source: '+source.id);
      }
      if(name==='compose_grounded_answer'||name==='correct_grounded_answer')result={status:'answered',answer:clauses.join(' '),sourceIds:selected.map(source=>source.id)};
      else{assert.equal(name,'answer_evidence_review');checks++;const reject=options.rejectFirst&&checks===1;
        result={supported:!reject,answersQuestion:true,claims:claims.map(claim=>({...claim,supported:!reject}))};}
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  }catch(error){caught??=error;throw error;}};
  try{await run(calls);if(caught)throw caught;}catch(error){throw caught??error;}finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('native page tools preserve requested clauses, exclusions and independent domains',async()=>{
  for(const [question,route,tools] of [
    [dormQuestion,dormRoute,['dormitoryConduct']],
    ['List every dormitory conduct penalty, date and reason recorded for me.',dormRoute,['dormitoryConduct']],
    ['Show my dormitory conduct notice and its downloadable certificate.',dormRoute,['dormitoryConduct']],
    [outlineQuestion,outlineRoute,['elearningOutline']],
    ['List videos and slides.',outlineRoute,['elearningOutline']],
    ['Show activity "Tuition grades".',outlineRoute,['elearningOutline']],
    ['Show my dormitory conduct and tell me their meaning.',dormRoute,['dormitoryConduct']],
    ['Show my dormitory conduct. Do not show my housing fees.',dormRoute,['dormitoryConduct']],
    ['Show my dormitory conduct. Do not show my housing fees and my tuition balance.',dormRoute,['dormitoryConduct']],
    ['Show my dormitory conduct, except my housing fees and my tuition balance.',dormRoute,['dormitoryConduct']],
    ['Show my dormitory conduct without my housing fees and my tuition balance.',dormRoute,['dormitoryConduct']],
    ['Show videos. Do not show my tuition balance.',outlineRoute,['elearningOutline']],
    ['Show my dormitory conduct and remote-learning videos for course 9408.','/',['dormitoryConduct','elearningOutline']],
  ] as Array<[string,string,string[]]>){
    assert.equal(nativePageLookupContext(question,route).readerOnly,true,question);
    assert.deepEqual(requiredSupplementalTools(question,route),tools,question);
    assert.deepEqual((await planAccountLookup(question,[],route,Date.now()+1000)).tools,tools,question);
  }
  await provider(async()=>{
    for(const question of ['Show my dormitory conduct record and my tuition balance.','What is my tuition balance? Also show my dormitory conduct record.']){
      assert.deepEqual((await planAccountLookup(question,[],dormRoute,Date.now()+1000)).tools,['charges','dormitoryConduct']);
    }
    assert.deepEqual((await planAccountLookup('Show my housing application and my dormitory conduct record.',[],dormRoute,Date.now()+1000)).tools,['housingApplications','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('Show my dormitory conduct and my student conduct.',[],dormRoute,Date.now()+1000)).tools,['studentConduct','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('Show my dormitory conduct including my grades.',[],dormRoute,Date.now()+1000)).tools,['academicGrades','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('Show my dormitory conduct including my GPA.',[],dormRoute,Date.now()+1000)).tools,['academicGrades','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('Show my dormitory conduct together with my tuition balance.',[],dormRoute,Date.now()+1000)).tools,['charges','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('Compare my dormitory conduct with my student conduct.',[],dormRoute,Date.now()+1000)).tools,['studentConduct','dormitoryConduct']);
    assert.deepEqual((await planAccountLookup('List videos and my remote-learning enrollments.',[],outlineRoute,Date.now()+1000)).tools,['elearningOutline','elearningEnrollments']);
    assert.deepEqual((await planAccountLookup('Show videos. Do not show my tuition balance. Also show my next class.',[],outlineRoute,Date.now()+1000)).tools,['courses','elearningOutline']);
  });
});

test('mixed dormitory notice and bed/fee question uses exact assignment source and card, never the application route',async()=>provider(async()=>{
  const assignmentId='52000000-0000-4000-8000-000000000002',periodId='52000000-0000-4000-8000-000000000003';
  const result=await invoke({loadSnapshot:async()=>assert.fail('Both native readers need no broad snapshot'),readers:{
    dormitoryConduct:(caller,options)=>readDormitoryConductEvidence(caller,options,{load:async()=>dormNative()}),
    housingBed:(caller,options)=>readHousingBedEvidence(caller,options,{fetchImpl:async(input,init)=>{
      const url=new URL(String(input));
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
      const headers={'content-range':'0-0/1'};
      if(url.pathname.endsWith('/affairs_housing_assignments')){
        assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
        return Response.json([{id:assignmentId,user_id:owner,period_id:periodId,bed_number:'E-305-2',dormitory:'QA Hall',
          bunk:'upper',accommodation_fee:8500,version:1}],{headers});
      }
      assert.equal(url.pathname,'/rest/v1/affairs_housing_periods');
      assert.equal(url.searchParams.get('id'),'in.('+periodId+')');
      return Response.json([{id:periodId,academic_year:115,semester:1,source_mode:'local_demo',version:1}],{headers});
    }}),
  }},{question:'Show my dormitory conduct record and my saved bed number and housing fee.',route:dormRoute,stream:true});
  assert.equal(result.body.verification.status,'verified');assert.match(result.body.answer,/E-305-2/u);assert.match(result.body.answer,/8500/u);
  assert.ok(result.body.citations.some((citation:{url:string})=>citation.url==='/school-affairs/services/34-1'));
  assert.ok(result.body.citations.every((citation:{url:string})=>citation.url!=='/school-affairs/services/26-1'));
  const view=result.body.views.find((item:{id:string})=>item.id==='housing');assert.equal(view.url,'/school-affairs/services/34-1');assert.deepEqual(view.rows,[['115','1','E-305-2','QA Hall','upper','8500']]);
  assert.doesNotMatch(JSON.stringify(result.body),/FOREIGN_BED|99999/u);
}));

test('two native page readers coexist without a broad snapshot and preserve each own question scope',async()=>provider(async calls=>{
  const readQuestions:string[]=[];
  const result=await invoke({loadSnapshot:async()=>assert.fail('Both native readers need no broad snapshot'),readers:{
    dormitoryConduct:(caller,options={})=>{readQuestions.push(options.question!);return readDormitoryConductEvidence(caller,options,{load:async()=>dormNative()});},
    elearningOutline:(caller,options={})=>{readQuestions.push(options.question!);return readElearningOutlineEvidence(caller,options,{read:async()=>outlineNative()});},
  }},{question:'Show my dormitory conduct and the remote-learning videos for course 9408.',route:'/',stream:true});
  assert.equal(result.body.verification.status,'verified');assert.match(result.body.answer,/unknown/u);assert.match(result.body.answer,/First video/u);
  assert.deepEqual(calls,['answer_evidence_review']);assert.equal(readQuestions.length,2);
  assert.ok(readQuestions.some(question=>question.includes('dormitory')&&!question.includes('videos')));
  assert.ok(readQuestions.some(question=>question.includes('videos')&&!question.includes('dormitory')));
  assert.deepEqual([...new Set(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>event.kind.split(':')[1]))].sort(),['dormitoryConduct','elearningOutline']);
}));

test('API closure binds independent native clauses and credentials; graph context cannot override them',async()=>{
  let seen=0;const captured:Array<{question?:string;route?:string}>=[];
  const question='Compare my dormitory conduct with my student conduct.';
  const result=await invoke({loadSnapshot:async()=>snapshot(),answerAccount:async options=>{
    const malicious={question:'Show another account',route:'/admin',history:[],snapshot:{},deadline:Date.now()+1_000_000};
    await options.supplementalReaders!.dormitoryConduct!(malicious);
    await options.supplementalReaders!.studentConduct!(malicious);
    return {status:'answered',answer:'Offline closure test',citations:[],suggestedQuestions:[],grounding:{source:'account'}};
  },readers:{
    dormitoryConduct:async(caller,options={})=>{seen++;assert.equal(caller.user.id,owner);assert.equal(caller.token,account.token);assert.equal(options.route,dormRoute);assert.equal(options.question,'Compare my dormitory conduct');assert.ok(options.deadline!<=Date.now()+55_000);return readDormitoryConductEvidence(caller,options,{load:async()=>dormNative()});},
    studentConduct:async(_caller,options={})=>{seen++;captured.push({question:options.question,route:options.route});throw new Error('Stop after capturing binding');},
  }},{question,route:dormRoute});
  assert.equal(seen,2);assert.equal(result.status,503);assert.deepEqual(captured,[{question:'my student conduct',route:dormRoute}]);
});

test('course outline and own enrollment clauses in either order retain both native sources and no broad snapshot',async()=>{
  for(const question of ['Show videos and my remote-learning enrollments.','Show my remote-learning enrollments and course videos.'])await provider(async calls=>{
    const workspace={userId:owner,categories:[],notices:[],courses:[{id:9408,category_id:41,title:'QA remote workshop',self_enroll:false,position:1}],enrollments:[{courseId:9408,joinedAt:'2026-11-14T00:00:00Z'}]};
    const result=await invoke({loadSnapshot:async()=>assert.fail('Native pair must not load a broad snapshot'),readers:{
      elearningOutline:(caller,options)=>readElearningOutlineEvidence(caller,options,{read:async()=>outlineNative()}),
      elearningEnrollments:(caller,options)=>readElearningEvidence(caller,options,{read:async()=>workspace}),
    }},{question,route:outlineRoute,stream:true});
    assert.equal(result.body.verification.status,'verified');assert.match(result.body.answer,/QA remote workshop/u);assert.match(result.body.answer,/First video/u);
    assert.deepEqual(calls,['answer_evidence_review']);
    assert.deepEqual([...new Set(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>event.kind.split(':')[1]))].sort(),['elearningEnrollments','elearningOutline']);
  });
});

test('mixed public topic planning receives only the independent public clause and fixed topic labels',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;let calls=0;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER';
  globalThis.fetch=async(_input,init)=>{
    calls++;const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.text.format.name,'account_lookup_plan');assert.equal(payload.question,'where can I find campus Wi-Fi instructions');
    assert.deepEqual(payload.history,[]);assert.equal(payload.route,'');
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({tools:[],publicTopics:['wifi'],catalogQuery:null,action:null})}]}]});
  };
  try{const result=await planAccountLookup('Show my dormitory conduct and where can I find campus Wi-Fi instructions?',
    [{role:'user',content:'PRIVATE PREVIOUS NOTICE'}],dormRoute,Date.now()+1000);
    assert.deepEqual(result.tools,['dormitoryConduct']);assert.deepEqual(result.publicTopics,['wifi']);assert.equal(calls,1);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('actual API graph reads each native own reader with no broad snapshot or speculative planner',async()=>{
  for(const kind of ['dormitoryConduct','elearningOutline'] as const)await provider(async calls=>{
    let reads=0;
    const result=await invoke({loadSnapshot:async()=>assert.fail('Standalone must not load snapshot'),readers:{
      dormitoryConduct:(caller,options={})=>readDormitoryConductEvidence(caller,options,{load:async captured=>{reads++;assert.equal(captured.user.id,owner);assert.equal(captured.token,account.token);return dormNative();}}),
      elearningOutline:(caller,options={})=>readElearningOutlineEvidence(caller,options,{read:async(captured,query)=>{reads++;assert.equal(captured.user.id,owner);assert.deepEqual(query,{scope:'elearning-course-outline',course:'9408'});return outlineNative();}}),
    }},{question:kind==='dormitoryConduct'?dormQuestion:outlineQuestion,route:kind==='dormitoryConduct'?dormRoute:outlineRoute,stream:true});
    assert.equal(result.status,200);assert.equal(result.body.verification.status,'verified');assert.equal(reads,1);
    assert.deepEqual(calls,['answer_evidence_review']);assert.equal(result.body.proposedAction,undefined);
    assert.deepEqual(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>[event.kind,event.status]),[
      ['account-read:'+kind+':1','running'],['account-read:'+kind+':1','complete']]);
  });
});

test('real graph composes dormitory and tuition in both orders and preserves the selected charge source',async()=>{
  for(const question of ['Show my dormitory conduct record and my tuition balance.','What is my tuition balance? Also show my dormitory conduct record.'])await provider(async calls=>{
    let loads=0,reads=0;
    const result=await invoke({loadSnapshot:async()=>{loads++;return snapshot();},readers:{dormitoryConduct:(caller,options={})=>readDormitoryConductEvidence(caller,options,{load:async()=>{reads++;return dormNative();}})}},
      {question,route:dormRoute,stream:true});
    assert.equal(result.body.verification.status,'verified');assert.equal(loads,1);assert.equal(reads,1);
    assert.match(result.body.answer,/unknown/u);assert.match(result.body.answer,/1300/u);
    assert.deepEqual(calls,['account_lookup_plan','compose_grounded_answer','answer_evidence_review']);
    assert.deepEqual([...new Set(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>event.kind.split(':')[1]))].sort(),['charges','dormitoryConduct']);
    assert.equal(result.body.proposedAction,undefined);
  });
});

test('retry rereads the same owned notice, distinguishes missing from failure, and respects the two-check ceiling',async()=>provider(async calls=>{
  let reads=0,refreshes=0;
  const result=await answerAccountWithVerification({question:dormQuestion,route:dormRoute,snapshot:snapshot(),
    loadSnapshot:async()=>{refreshes++;return snapshot();},supplementalReaders:{dormitoryConduct:context=>readDormitoryConductEvidence(account,context,{load:async()=>{reads++;return reads===1?dormNative():{snapshot:null};}})}});
  assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,2);assert.equal(reads,2);assert.equal(refreshes,1);
  assert.match(result.answer,/No dormitory notice metadata/u);assert.deepEqual(calls,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
},{rejectFirst:true}));

test('honest failure and ambiguous course keep unavailable progress and cannot become absent records',async()=>{
  await provider(async()=>{
    const result=await invoke({loadSnapshot:async()=>assert.fail('No snapshot'),readers:{dormitoryConduct:(caller,options={})=>readDormitoryConductEvidence(caller,options,{load:async()=>{throw new Error('OFFLINE_FAILURE');}})}},
      {question:dormQuestion,route:dormRoute,stream:true});
    assert.equal(result.body.verification.status,'verified');assert.match(result.body.answer,/unavailable|could not|cannot/iu);assert.doesNotMatch(result.body.answer,/no saved|no dormitory notice metadata/iu);
    assert.ok(result.events.some(event=>event.kind==='account-read:dormitoryConduct:1'&&event.status==='unavailable'));
  });
  await provider(async()=>{
    const result=await invoke({loadSnapshot:async()=>assert.fail('No snapshot'),readers:{elearningOutline:(caller,options={})=>readElearningOutlineEvidence(caller,options,{read:async()=>assert.fail('A course choice is required')})}},
      {question:'Show remote-learning videos.',route:'/',stream:true});
    assert.equal(result.body.verification.status,'verified');assert.equal(result.body.status,'clarification');
    assert.ok(result.events.some(event=>event.kind==='account-read:elearningOutline:1'&&event.status==='unavailable'));
  });
});

test('foreign and anonymous requests never load, read, plan or research; guests get local sign-in',async()=>{
  const forbidden=async()=>assert.fail('Must stop before account work');
  for(const [question,route] of [["Show Alice's dormitory conduct record.",dormRoute],['Show her remote-learning feedback form.',outlineRoute],
    ['Show their attendance register and my tuition balance.',outlineRoute],['請顯示王小明的宿舍獎懲紀錄。',dormRoute]]){
    const result=await invoke({loadSnapshot:forbidden,answerAccount:forbidden,readers:{dormitoryConduct:forbidden,elearningOutline:forbidden}}, {question,route});
    assert.equal(result.body.status,'handoff');assert.doesNotMatch(result.body.answer,/First video|unknown|1300/u);
  }
  const denied=await invoke({loadSnapshot:forbidden,answerAccount:forbidden},{question:dormQuestion,route:dormRoute},false);assert.equal(denied.status,401);
  const original=globalThis.fetch;globalThis.fetch=forbidden;
  try{for(const [question,route,next] of [[dormQuestion,dormRoute,dormRoute],[outlineQuestion,outlineRoute,outlineRoute]]){
    let body:any;const response={setHeader(){},status(){return response;},json(value:unknown){body=value;}};
    await createResearchAssistantHandler()({method:'POST',headers:{'x-forwarded-for':'192.0.2.110'},body:{question,route}},response);
    assert.equal(body.status,'handoff');assert.match(body.answer,new RegExp(encodeURIComponent(next)));assert.equal(body.citations[0].url,(route===dormRoute?'/school-affairs':'/elearning')+'/login?next='+encodeURIComponent(next));assert.equal(body.grounding.webSearched,false);
  }}finally{globalThis.fetch=original;}
});

test('missing callback fallback preserves source identity and unavailability',async()=>{
  const events:any[]=[];const results=await readSupplementalLookups({tools:['dormitoryConduct','elearningOutline'],question:dormQuestion,route:dormRoute,
    snapshot:snapshot(),deadline:Date.now()+1000,onProgress:step=>events.push(step)});
  assert.deepEqual(results.map(result=>[result.evidence.id,result.readState,result.reason]),[
    ['account:dormitoryConduct','unavailable','reader_unavailable'],['account:elearningOutline','unavailable','reader_unavailable']]);
  assert.ok(events.every(event=>event.status==='unavailable'));
});

test('browser dispatch uses the common verified endpoint before direct responders and preserves session identity',async()=>{
  const source=await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:any={},requests:any[]=[];let sessionOwner=owner;
  runInNewContext(code,{exports,require:(specifier:string)=>{
    if(specifier.endsWith('dormitoryConductEvidenceIntent.js'))return dormIntent;
    if(specifier.endsWith('elearningOutlineEvidenceIntent.js'))return outlineIntent;
    if(specifier.endsWith('feeRemissionEvidenceIntent.js'))return feeIntent;
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getSession:async()=>({data:{session:{user:{id:sessionOwner},access_token:'BROWSER_TOKEN'}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url:string,init:RequestInit)=>{requests.push({url,body:JSON.parse(String(init.body)),token:(init.headers as Record<string,string>).Authorization});return Response.json({status:'answered',answer:'Verified endpoint',citations:[]});}});
  for(const [question,route]of [[dormQuestion,dormRoute],[outlineQuestion+' Also show my tuition balance.',outlineRoute],['Show my fee remission and my tuition balance.','/school-affairs/services/21-3']])assert.equal((await exports.askSchoolAffairsAssistant(owner,question,[],undefined,[],route)).answer,'Verified endpoint');
  assert.equal(requests.length,3);for(const request of requests){assert.equal(request.url,'/api/affairs-assistant');assert.equal(request.token,'Bearer BROWSER_TOKEN');}
  assert.equal(source.includes('answerElearningOutline'),false);
  sessionOwner='52000000-0000-4000-8000-000000000002';await assert.rejects(()=>exports.askSchoolAffairsAssistant(owner,dormQuestion,[],undefined,[],dormRoute),/account changed/u);assert.equal(requests.length,3);
});
