import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runAssistantClientInNewContext as runInNewContext} from './client-vm.mjs';
import ts from 'typescript';
import {dtmAssignmentCases as bank,dtmAssignmentFixture as f,dtmAssignmentRaw,dtmAssignmentRoute as route} from './dtm-assignment-native-cases.mjs';
import {readDtmAssignmentEvidence} from '../../server/accountDtmAssignmentEvidence.js';
import * as intent from '../../server/dtmAssignmentEvidenceIntent.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC_KEY',token:'SYNTHETIC_TOKEN',user:{id:f.ownerId}};
function assertFacts(row,answer){
  if(row.mode==='empty'){assert.match(answer,/No matching saved assignment/);return;}
  if(row.mode==='failed'){assert.match(answer,/unavailable|could not|cannot/i);assert.doesNotMatch(answer,/No matching saved assignment/);return;}
  assert.ok(answer.includes(f.title));
  if(row.fields.includes('details'))assert.ok(answer.includes(row.mode==='blank'?'(blank)':f.details));
  else assert.ok(!answer.includes(f.details));
  if(row.fields.includes('dueAt'))assert.ok(answer.includes(row.mode==='null-deadline'?'No deadline is recorded':f.dueAt));
  if(!row.fields.includes('trackerSubmittedAt'))assert.ok(!answer.includes(f.trackerSubmittedAt));
  else assert.ok(answer.includes(f.trackerSubmittedAt));
  assert.match(answer,/Saved DTM assignment detail|Record source:\s*\x60\s*personal/iu);
  assert.doesNotMatch(answer,/you are late|successfully uploaded|file was submitted|official deadline/iu);
}
test('independent bank matches strict native projection and literal/null/blank boundaries without model credit',async()=>{
  assert.equal(bank.length,18);assert.ok(bank.every(row=>!row.mounted&&!row.setupEligible));
  for(const row of bank){
    const context=intent.dtmAssignmentLookupContext(row.question,row.route,row.history);let reads=0,owner;
    const result=await readDtmAssignmentEvidence(account,row,{load:async(caller,target)=>{reads++;owner=caller.user.id;assert.deepEqual(target,{courseId:f.courseId,assignmentId:f.assignmentId});if(row.mode==='failed')throw Error('unavailable');return dtmAssignmentRaw(row.mode);}});
    if(row.stop){assert.equal(context.selection?.reason,row.stop,row.id);assert.equal(reads,0,row.id);continue;}
    if(row.excluded||row.unselected){assert.equal(context.selection,null,row.id);assert.equal(reads,0,row.id);continue;}
    assert.equal(owner,f.ownerId,row.id);assert.equal(reads,1,row.id);assert.deepEqual(context.selection.fields,row.fields,row.id);
    const p=JSON.parse(result.evidence.content),actual=p.record,wanted=dtmAssignmentRaw(row.mode).assignment;
    if(wanted&&row.mode!=='failed')assert.deepEqual(actual,{sourceMode:'personal',...Object.fromEntries(row.fields.map(key=>[key,wanted[key==='trackerStatus'?'status':key==='trackerSubmittedAt'?'submittedAt':key]]))},row.id);
    const answer=formatSupplementalAccountAnswers([result],row);assertFacts(row,answer.answer);assert.equal(answer.verification,undefined);
  }
});
let handlerCaseNumber=0;
async function handlerCase(row,{retry=false,failCharges=false,grades=false,skipAssignment=false,omitGradeReference=false}={}){
  const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY,errors=[],calls=[],model=[],evidence=[];let broad=0,publicReads=0,reviews=0,lastAnswer='';
  process.env.OPENAI_API_KEY='SYNTHETIC_MODEL';
  globalThis.fetch=async(input,init)=>{try{
    const url=new URL(String(input)),headers=new Headers(init?.headers);
    if(url.origin===account.url){
      calls.push({path:url.pathname,method:init.method,query:Object.fromEntries(url.searchParams),body:init.body?JSON.parse(init.body):null});
      assert.equal(headers.get('authorization'),'Bearer '+account.token);assert.equal(init.redirect,'error');
      if(url.pathname==='/rest/v1/rpc/dtm_course_content_assignment'){
        assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{p_course_id:f.courseId,p_assignment_id:f.assignmentId});
        return row.mode==='failed'?Response.json({},{status:503}):Response.json(dtmAssignmentRaw(row.mode));
      }
      if(url.pathname==='/rest/v1/rpc/dtm_grade_report_overview'){
        assert.equal(grades,true);assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{});
        return Response.json({courses:[{id:f.courseId,userId:f.ownerId,code:'DB101',title:'Saved course',
          term:'Saved term',gradeText:'87.00'}],limit:100,nextCursor:null});
      }
      assert.equal(row.companion,'charges','Unexpected non-assignment read');assert.equal(init.method,'GET');
      if(url.pathname==='/rest/v1/affairs_students'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+f.ownerId);assert.equal(url.searchParams.get('select'),'id,user_id');
        return failCharges?Response.json({},{status:503}):Response.json([{id:'79000000-0000-4000-8000-000000000301',user_id:f.ownerId}]);
      }
      assert.equal(url.pathname,'/rest/v1/affairs_charges');assert.equal(url.searchParams.get('student_id'),'eq.79000000-0000-4000-8000-000000000301');
      return Response.json([{id:'79000000-0000-4000-8000-000000000401',student_id:'79000000-0000-4000-8000-000000000301',label:'QA Assignment Tuition',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample',occurrence_on:null,category:null,contact_unit:null,contact_extension:null,payment_unit:null}]);
    }
    assert.equal(url.origin,'https://api.openai.com');const body=JSON.parse(init.body),stage=body.text.format.name,packet=JSON.parse(body.input[0].content[0].text);model.push(stage);
    assert.ok(['compose_grounded_answer','answer_evidence_review','correct_grounded_answer'].includes(stage));
    const sources=packet.evidence;
    const tools=[...(!skipAssignment?['dtmAssignment']:[]),...(grades?['dtmGradeReport']:[]),...(row.companion?['charges']:[])];
    assert.deepEqual(sources.map(source=>source.id).sort(),['account-scope',...tools.map(tool=>'account:'+tool)].sort());
    const scope=JSON.parse(sources[0].content);assert.deepEqual(scope.selectedTools.sort(),[...tools].sort());assert.deepEqual(scope.actions,[]);
    assert.doesNotMatch(JSON.stringify(packet),/SYNTHETIC|UNREQUESTED_PROFILE|FOREIGN_ACCOUNT/);evidence.push(sources);
    const assignmentSource=sources.find(source=>source.id==='account:dtmAssignment');
    const p=assignmentSource?JSON.parse(assignmentSource.content):null;
    let result;
    if(stage!=='answer_evidence_review'){
      const answer=row.mode==='failed'?'The saved assignment lookup is unavailable. I cannot confirm its deadline.':lastAnswer||`${f.title}: saved deadline ${f.dueAt}. Saved local records, not an official university record.`;
      result={status:'answered',answer:answer+(row.companion?(failCharges?' The fee balance is unavailable.':' QA Assignment Tuition: TWD 23000 remains, from 28000 charged and 5000 paid.') :''),sourceIds:sources.filter(source=>source.id!=='account-scope').map(source=>source.id)};
    }else{
      lastAnswer=packet.answer;reviews++;
      const supported=!retry||reviews>1;
      const paths=p?.record?['/record/title',...row.fields.filter(field=>field!=='title').map(field=>'/record/'+field)]:['/readState','/recordPresent'];
      const claims=p?[{claim:'Exact saved assignment fields and state',supported,evidenceId:'account:dtmAssignment',jsonPaths:paths,quotes:[]}]:[];
      if(grades)claims.push({claim:'Saved 87.00 grade text',supported,evidenceId:'account:dtmGradeReport',
        jsonPaths:omitGradeReference?['/sourceMode']:['/courses/0/gradeText'],quotes:[]});
      if(row.companion)claims.push({claim:'Independent fee balance',supported,evidenceId:'account:charges',jsonPaths:failCharges?['/unavailableReason']:['/records/0/amountDue','/records/0/amountPaid','/records/0/currency'],quotes:[]});
      result={supported,answersQuestion:supported,claims};
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  }catch(error){errors.push(error);throw error;}};
  // Each fixture exercises its own endpoint rate window.
  const {createAffairsAssistantHandler}=await import(new URL('../../api/affairs-assistant.ts?dtm-assignment-case='+handlerCaseNumber++,import.meta.url).href);
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>{broad++;throw Error('Broad snapshot forbidden');},publicResearch:async()=>{publicReads++;throw Error('Public lookup forbidden');}});
  const response={statusCode:200,body:null,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
  try{await handler({method:'POST',headers:{authorization:'Bearer '+account.token},body:{question:row.question,route:row.route,history:row.history}},response);assert.deepEqual(errors,[]);return {response,calls,model,evidence,broad,publicReads};}
  finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}
test('actual authenticated handler uses only exact native RPC and separately scoped fees in both orders',async()=>{
  for(const row of bank.filter(row=>row.fields&&row.mode!=='failed')){
    const r=await handlerCase(row);assert.equal(r.response.statusCode,200,row.id);assert.equal(r.response.body.verification?.status,'verified',row.id);
    assert.equal(r.broad,0,row.id);assert.equal(r.publicReads,0,row.id);assertFacts(row,r.response.body.answer);
    assert.equal(r.calls.filter(call=>call.path.includes('dtm_course_content_assignment')).length,1,row.id);
    assert.equal(r.calls.length,row.companion?3:1,row.id);assert.equal(r.model.includes('account_lookup_plan'),false);
    if(row.companion)assert.match(r.response.body.answer,/23,?000/);
    assert.ok(r.response.body.citations.some(c=>c.chunkId==='account:dtmAssignment'&&c.url===route));
  }
});
test('real endpoint stops foreign/write/ambiguous/excluded cases without any private or model calls',async()=>{
  for(const row of bank.filter(row=>row.stop||row.excluded)){
    const r=await handlerCase(row);assert.equal(r.response.statusCode,200,row.id);assert.equal(r.calls.length,0,row.id);assert.equal(r.model.length,0,row.id);assert.equal(r.broad,0,row.id);assert.equal(r.publicReads,0,row.id);
  }
});
test('independent source failures and one fresh retry never turn unavailable into empty or broaden reads',async()=>{
  const failed=await handlerCase(bank.find(row=>row.mode==='failed'));assert.equal(failed.broad,0);assertFacts(bank.find(row=>row.mode==='failed'),failed.response.body.answer);
  const mixed=await handlerCase(bank.find(row=>row.id==='mixed-fees'),{failCharges:true});assert.equal(mixed.broad,0);assert.match(mixed.response.body.answer,/unavailable|could not be read/);assert.ok(mixed.response.body.answer.includes(f.dueAt));
  const retried=await handlerCase(bank.find(row=>row.id==='detail'),{retry:true});assert.equal(retried.response.body.verification.attempts,2);assert.equal(retried.calls.length,2);assert.equal(retried.broad,0);
  assert.deepEqual(retried.model,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
});
test('actual compiled client preserves detail/edit contexts and caller identity before verified dispatch',async()=>{
  const code=ts.transpileModule(await readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={},sent=[];let user=f.ownerId;
  runInNewContext(code,{exports,require:specifier=>{
    if(specifier.endsWith('dtmAssignmentEvidenceIntent.js'))return intent;
    if(specifier.endsWith('assistantActivityBudget.js'))return {boundedAssistantText};
    if(specifier.endsWith('assistantStreamReader.js'))return {readAssistantReply};
    if(specifier.endsWith('assistantDeploymentFlags.js'))return {unifiedAssistantDiscoveryEnabled:()=>false};
    if(specifier.endsWith('/authClient'))return {affairsClient:{auth:{getUser:async()=>({data:{user:{id:user}},error:null}),getSession:async()=>({data:{session:{user:{id:user},access_token:'OFFLINE_CLIENT'}},error:null})}}};
    return new Proxy({},{get:()=>()=>false});
  },fetch:async(url,init)=>{sent.push({url,headers:init.headers,body:JSON.parse(init.body)});return Response.json({status:'answered',answer:'Verified API dispatch mock',citations:[]});}});
  for(const row of bank.filter(row=>row.fields||row.stop)){
    await exports.askSchoolAffairsAssistant(f.ownerId,row.question,row.history,undefined,[],row.route);
    assert.equal(sent.at(-1).url,'/api/affairs-assistant');assert.equal(sent.at(-1).body.question,row.question);assert.equal(sent.at(-1).body.route,row.route);assert.deepEqual(sent.at(-1).body.history,row.history);
  }
  const length=sent.length;user=f.foreignId;await assert.rejects(()=>exports.askSchoolAffairsAssistant(f.ownerId,'When is my assignment due?',[],undefined,[],route),/account changed/);assert.equal(sent.length,length);
});

test('excluded independent clauses and trailing mutation never authorize hidden broad reads',async()=>{
  const original=bank.find(row=>row.id.endsWith(':instructions'))??bank.find(row=>row.fields?.includes('details'));
  for(const question of ['Show my assignment instructions and do not show my tuition balance.','Show my assignment instructions but not my grades.']){
    const r=await handlerCase({...original,question,fields:['title','details']});assert.equal(r.broad,0);assert.equal(r.publicReads,0);assert.equal(r.calls.length,1);assert.equal(r.response.body.verification?.status,'verified');
  }
  for(const question of ['Do not show my assignment instructions and my tuition balance.','Show my assignment instructions and delete it.']){
    const r=await handlerCase({...original,question});assert.equal(r.broad,0);assert.equal(r.publicReads,0);assert.equal(r.calls.length,0);assert.equal(r.model.length,0);
  }
});

test('field exclusions and later overrides reach the actual request evidence',async()=>{
  const row=bank.find(item=>item.id==='edit-context');
  for(const [question,fields] of [
    ['Show my assignment details and due date. Do not show its instructions.',['title','dueAt']],
    ['Show my assignment title and due date. Do not show the due date.',['title']],
    ['Show my assignment title and due date. Do not show the due date. Then show the due date.',['title','dueAt']],
  ]){
    const result=await handlerCase({...row,question,fields});
    assert.equal(result.response.body.verification?.status,'verified');
    assert.equal(result.broad+result.publicReads,0);
    for(const sources of result.evidence){
      const saved=JSON.parse(sources.find(source=>source.id==='account:dtmAssignment').content);
      assert.deepEqual(Object.keys(saved.record),['sourceMode',...fields]);
    }
  }
});

test('separate Moodle deadline and grade clauses run only the two native readers in either order',async()=>{
  const row=bank.find(item=>item.id==='edit-context');
  for(const question of [
    'Show all my saved Moodle course grades and tell me when this assignment is due.',
    'Show my assignment due date and show all my saved Moodle course grades.',
  ]){
    const result=await handlerCase({...row,question},{grades:true});
    assert.equal(result.response.body.verification.status,'verified');
    assert.match(result.response.body.answer,/87\.00/u);
    assert.ok(result.response.body.answer.includes(f.dueAt));
    assert.deepEqual(result.calls.map(call=>call.path).sort(),
      ['/rest/v1/rpc/dtm_course_content_assignment','/rest/v1/rpc/dtm_grade_report_overview']);
    assert.equal(result.broad+result.publicReads,0);
    assert.deepEqual(result.model,['answer_evidence_review']);
  }
});
test('a foreign assignment clause does not erase the caller’s own saved Moodle grades',async()=>{
  const row=bank.find(item=>item.id==='edit-context');
  const result=await handlerCase({...row,question:'Show my friend’s assignment due date and show all my saved Moodle course grades.'},
    {grades:true,skipAssignment:true});
  assert.equal(result.response.body.verification.status,'verified');
  assert.match(result.response.body.answer,/only check your own assignment records/u);
  assert.match(result.response.body.answer,/87\.00/u);
  assert.deepEqual(result.calls.map(call=>call.path),['/rest/v1/rpc/dtm_grade_report_overview']);
  assert.equal(result.broad+result.publicReads,0);
});
test('compound verification rejects a grade citation supported only by provenance metadata',async()=>{
  const row=bank.find(item=>item.id==='edit-context');
  const result=await handlerCase({...row,question:'Show my assignment due date and show all my saved Moodle course grades.'},
    {grades:true,omitGradeReference:true});
  assert.equal(result.response.body.verification.status,'unverified');
  assert.equal(result.response.body.verification.attempts,3);
  assert.equal(result.calls.filter(call=>call.path==='/rest/v1/rpc/dtm_grade_report_overview').length,2);
  assert.doesNotMatch(result.response.body.answer,/87\.00/u);
  assert.deepEqual(result.response.body.views,[]);
  assert.equal(result.broad+result.publicReads,0);
});
