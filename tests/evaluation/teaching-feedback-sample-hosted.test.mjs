import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';
import {createTeachingProbe,openTeachingObservation,teachingObservationHeader,verifyTeachingObservation} from '../../server/teachingFeedbackObservation.js';
import {buildTeachingSampleFixture,expectedTeachingSampleDto} from './teaching-feedback-sample-fixture.mjs';
import {requestTeachingSampleCase,teachingOriginalProtectedCases,teachingSampleCases} from './teaching-feedback-sample-hosted.mjs';
import {buildTeachingFeedbackNativeCases} from './teaching-feedback-native-cases.mjs';
import {teachingFeedbackRunnerCases} from './teaching-feedback-runner.mjs';

const id=n=>'75060000-0000-4000-8000-'+String(n).padStart(12,'0');
const origin='https://stdedu-abcd12345-v1-d286.vercel.app',db='https://xiftudmvxphxcjtmfmib.supabase.co';
const sourceRevision='a'.repeat(40),key='sample-only-key-'.repeat(4),runId=id(80);
const owners={A:{id:id(1),email:'evaluation.student@example.invalid'},
  B:{id:id(2),email:`evaluation.other.${runId}@example.invalid`}};
const tokens={A:'synthetic-teaching-test-token-A',B:'synthetic-teaching-test-token-B'};
const catalog={termId:id(4),programId:id(5),sections:[
  ...['Campus Orientation','Digital Learning Basics','Student Services Practice'].map((course,index)=>({
    id:id(6+index),course,code:'SAMP10'+(index+1),term:'Sample Fall 2026',section:'A',
  })),
]};
const requestFor=row=>({question:row.question,route:row.route,history:[],stream:false,consentedResearchUse:false});
const metadata=()=>({VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).host,VERCEL_GIT_COMMIT_SHA:sourceRevision,
  SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'controlled-teaching-review'});
const readResponse=async response=>response.json();
const nativeRpc='/rest/v1/rpc/affairs_read_teaching_feedback';

function review(init){
  const request=JSON.parse(String(init.body));
  const packet=JSON.parse(request.input[0].content[0].text);
  assert.equal(request.text.format.name,'answer_evidence_review');
  assert.deepEqual(packet.evidence.map(source=>source.id),['account-scope','account:teachingFeedback']);
  const data=JSON.parse(packet.evidence[1].content);
  const jsonPaths=data.views.flatMap((view,index)=>{
    const base='/views/'+index;
    if(view.readState==='empty')return Object.keys(view.counts).map(key=>base+'/counts/'+key+'/returned');
    return view.feedback.flatMap((row,position)=>Object.keys(row).filter(field=>row[field]!==null).map(field=>base+'/feedback/'+position+'/'+field));
  });
  const claims=jsonPaths.map(path=>({claim:'Checked a selected saved teaching field',evidenceId:'account:teachingFeedback',
    jsonPaths:[path],quotes:[],supported:true}));
  const reply={supported:true,answersQuestion:true,claims};
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
}

for(const family of ['sample','original'])test(`every ${family} prompt uses the actual protected assistant handler and a verified native read or zero-read receipt`,async()=>{
  const originalFamily=family==='original';
  const fixtureRunId=originalFamily?id(81):runId;
  const fixtureOwners=originalFamily?{A:{...owners.A,id:id(11)},B:{id:id(12),email:`evaluation.other.${fixtureRunId}@example.invalid`}}:owners;
  const env=metadata(),previous=Object.fromEntries(Object.keys(env).map(name=>[name,process.env[name]]));
  const original=globalThis.fetch,errors=[];
  Object.assign(process.env,env);
  let plan;
  const fail=async()=>{
    const error=new Error('A signed sample teaching question must not use a general snapshot or public research.');
    errors.push(error);throw error;
  };
  const handler=createAffairsAssistantHandler({loadSnapshot:fail,publicResearch:fail,verifyToken:async token=>{
    const owner=Object.keys(tokens).find(label=>tokens[label]===token);
    assert.ok(owner);
    return {url:db,key:'synthetic-publishable-key',token,user:{...fixtureOwners[owner],user_metadata:{assistant_evaluation_run:fixtureRunId}}};
  }});
  let sent=[];
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input));
      if(url.origin==='https://api.openai.com'){
        sent.push('review');
        return review(init);
      }
      assert.equal(url.origin,db);
      assert.equal(url.pathname,nativeRpc);
      assert.equal(init.method,'POST');
      const {p_scope,...selectors}=JSON.parse(init.body);
      assert.deepEqual(selectors,{p_term:null,p_survey:null,p_section:null});
      const authorization=new Headers(init.headers).get('authorization');
      const owner=Object.keys(tokens).find(label=>'Bearer '+tokens[label]===authorization);
      assert.ok(owner);
      sent.push(p_scope);
      return Response.json(expectedTeachingSampleDto(plan,owner,p_scope));
    }catch(error){errors.push(error);throw error;}
  };
  const fetchImpl=async(endpoint,init)=>{
    const headers=new Headers();
    let status=200,payload;
    const response={setHeader(name,value){headers.set(name,value);},status(code){status=code;return response;},json(body){payload=body;}};
    await handler({method:'POST',headers:{host:endpoint.host,authorization:init.headers.Authorization},body:init.body},response);
    return Response.json(payload,{status,headers});
  };
  try{
    const correlations=new Set();
    const failures=[];
    for(const testCase of (originalFamily?teachingOriginalProtectedCases():teachingSampleCases())){
      plan=buildTeachingSampleFixture({runId:fixtureRunId,owners:fixtureOwners},catalog,testCase.variant);
      sent=[];
      const result=await requestTeachingSampleCase({testCase,plan,origin,sourceRevision,runId:fixtureRunId,token:tokens[testCase.owner],key,
        fetchImpl,readResponse,privateMarkers:[fixtureOwners.A.id,fixtureOwners.B.id,...Object.values(tokens)],correlations});
      assert.deepEqual(sent,testCase.views,testCase.id);
      assert.equal(result.execution,'live-native',testCase.id);
      assert.equal(result.verificationMethod,testCase.views.length?'native-exact':'none',testCase.id);
      assert.equal(result.completedEvidenceReviews,0,testCase.id);
      assert.equal(result.readDigests?.length,testCase.views.length,testCase.id);
      assert.equal(result.projectionDigests?.length,testCase.views.length,testCase.id);
      if(!result.passed)failures.push({id:testCase.id,failures:result.failures});
      assert.ok(result.receiptDigest);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(failures,[]);
    if(originalFamily){
      const originalCases=teachingOriginalProtectedCases();
      const testCase=originalCases.find(row=>row.id.endsWith('empty-immediate'));
      plan=buildTeachingSampleFixture({runId:fixtureRunId,owners:fixtureOwners},catalog,'paired');
      const args={testCase,plan,origin,sourceRevision,runId:fixtureRunId,token:tokens.B,key,fetchImpl,readResponse,
        privateMarkers:[],correlations};
      sent=[];
      await assert.rejects(requestTeachingSampleCase(args),/exact caller-bound DTO/u);
      await assert.rejects(requestTeachingSampleCase({...args,testCase:{...testCase,question:'Altered prompt'}}),/Frozen teaching case changed/u);
      assert.deepEqual(sent,[]);
      return;
    }

    const [first]=teachingSampleCases(),request=requestFor(first);
    const probe=createTeachingProbe({ownerId:owners.A.id,nonce:randomUUID(),runId,origin,sourceRevision},request,key);
    const endpoint=new URL('/api/affairs-assistant',origin),post=body=>({headers:{Authorization:'Bearer '+tokens.A},body:JSON.stringify(body)});
    for(const body of [{...probe.body,question:request.question+' now'}, {...probe.body,evaluationInternshipProbe:'other-probe'},
      {...probe.body,stream:true}]){
      sent=[];
      const denied=await fetchImpl(endpoint,post(body));
      assert.equal(denied.status,404);
      assert.equal(denied.headers.has(teachingObservationHeader),false);
      assert.deepEqual(sent,[]);
    }
    const crossed=await fetchImpl(endpoint,{...post(probe.body),headers:{Authorization:'Bearer '+tokens.B}});
    assert.equal(crossed.status,404);
    assert.equal(crossed.headers.has(teachingObservationHeader),false);
    const mismatchedHost=await fetchImpl(new URL('/api/affairs-assistant','https://stu.best'),post(probe.body));
    assert.equal(mismatchedHost.status,404);
    process.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);
    assert.equal((await fetchImpl(endpoint,post(probe.body))).status,404);
    process.env.VERCEL_GIT_COMMIT_SHA=sourceRevision;
    process.env.VERCEL_ENV='production';
    const production=await fetchImpl(endpoint,post(probe.body));
    assert.equal(production.status,404);
    assert.deepEqual(sent,[]);
    process.env.VERCEL_ENV='preview';
    const accepted=await fetchImpl(endpoint,post(probe.body));
    const body=await accepted.json();
    const receipt=accepted.headers.get(teachingObservationHeader),correlationId=accepted.headers.get('x-assistant-request-id');
    assert.equal(verifyTeachingObservation({receipt,binding:probe.binding,correlationId,body},key)?.verificationMethod,'native-exact');
    assert.equal(verifyTeachingObservation({receipt,binding:probe.binding,correlationId,body:{...body,answer:'changed'}},key),null);

    const frozenPrompts=[
      'Show my immediate teaching feedback status, but do not show my comment.',
      'Show my immediate teaching feedback status, but do  not show my comment.',
      'When was my immediate teaching feedback submitted and reviewed? Use saved ISO timestamps.',
    ];
    for(const question of frozenPrompts){
      const input={...request,question};
      const exact=createTeachingProbe({ownerId:owners.A.id,nonce:randomUUID(),runId,origin,sourceRevision},input,key);
      sent=[];
      const response=await fetchImpl(endpoint,post(exact.body));
      const answer=await response.json();
      const proof=verifyTeachingObservation({receipt:response.headers.get(teachingObservationHeader),binding:exact.binding,
        correlationId:response.headers.get('x-assistant-request-id'),body:answer},key);
      assert.equal(proof?.verificationMethod,'native-exact',question);
      assert.deepEqual(sent,['immediate']);
      assert.match(answer.answer,/SAMP101[\s\S]+SAMP102/u);
      assert.doesNotMatch(answer.answer,/Sample evaluation note/u);
    }

    const pairedRequest={...request,question:'Show my teaching evaluation window status and immediate teaching feedback status separately.'};
    const paired=createTeachingProbe({ownerId:owners.A.id,nonce:randomUUID(),runId,origin,sourceRevision},pairedRequest,key);
    sent=[];
    const pairedResponse=await fetchImpl(endpoint,post(paired.body));
    const pairedAnswer=await pairedResponse.json();
    const pairedProof=verifyTeachingObservation({receipt:pairedResponse.headers.get(teachingObservationHeader),binding:paired.binding,
      correlationId:pairedResponse.headers.get('x-assistant-request-id'),body:pairedAnswer},key);
    assert.equal(pairedProof?.verificationMethod,'native-exact');
    assert.deepEqual(sent,['survey','immediate']);
    assert.deepEqual(pairedProof.attempts[0].reads.map(read=>read.view),sent);
    assert.deepEqual(pairedProof.modelOperations,[]);

    const partial=openTeachingObservation({body:paired.body,identity:{...owners.A,runMarker:runId},correlationId:randomUUID()},env);
    assert.ok(partial);
    await partial.observe(dependency=>readTeachingFeedbackEvidence({
      user:owners.A,url:db,key:'synthetic-publishable-key',token:tokens.A,
    },{views:['survey']},{...dependency,read:async()=>expectedTeachingSampleDto(plan,'A','survey')}));
    partial.nativeCheckCompleted();
    assert.equal(partial.finish(pairedAnswer,true),null);
  }finally{
    globalThis.fetch=original;
    for(const [name,value] of Object.entries(previous)){
      if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
  }
});

test('the separate preflight maps exactly thirteen unchanged original cases and keeps the forty-case denominator',()=>{
  const original=teachingOriginalProtectedCases();
  const frozen=buildTeachingFeedbackNativeCases();
  assert.equal(teachingFeedbackRunnerCases().length,40);
  assert.equal(teachingSampleCases().length,11);
  assert.equal(original.length,13);
  for(const {owner,variant,views,course,comment,commentRequested,...row} of original){
    assert.deepEqual(row,frozen.find(item=>item.id===row.id),row.id);
    assert.deepEqual(views,row.readExpectation.views,row.id);
    assert.deepEqual([owner,variant],row.id.endsWith('empty-immediate')?['B','second-empty']:['A','paired']);
    assert.deepEqual([course,comment,commentRequested],[null,null,false]);
  }
  assert.throws(()=>teachingOriginalProtectedCases(['account:teaching-native-survey-windows']),/Invalid frozen/u);
  assert.throws(()=>teachingOriginalProtectedCases([original[0].id,original[0].id]),/Invalid frozen/u);
  assert.throws(()=>teachingSampleCases([original[0].id]),/Invalid isolated/u);
  const command=fileURLToPath(new URL('./run-teaching-sample-preview.mjs',import.meta.url));
  const preflight=(...args)=>JSON.parse(execFileSync(process.execPath,[command,...args,'--preflight'],{encoding:'utf8'}));
  assert.deepEqual(preflight(),{originalCases:40,sampleCases:11,nativeReadCases:7,pairedOwnerVariants:['paired','second-empty']});
  assert.deepEqual(preflight('--original'),{originalCases:40,mountedOriginalCases:13,zeroReadCases:11,nativeReadCases:2,
    pairedOwnerVariants:['paired','second-empty']});
});

test('a completion marker without a native DTO and selected projection cannot create a signed native receipt',()=>{
  const [testCase]=teachingSampleCases(),request=requestFor(testCase),env=metadata();
  const probe=createTeachingProbe({ownerId:owners.A.id,nonce:randomUUID(),runId,origin,sourceRevision},request,key);
  const observation=openTeachingObservation({body:probe.body,identity:{...owners.A,runMarker:runId},correlationId:randomUUID()},env);
  assert.ok(observation);
  observation.nativeCheckCompleted();
  assert.equal(observation.finish({verification:{status:'verified',attempts:1},
    activity:[{kind:'teaching-feedback-evidence-check',status:'complete'}]},true),null);
});

test('proofs from the homepage and DTM admit only pure teaching navigation',()=>{
  const scope={ownerId:owners.A.id,nonce:randomUUID(),runId,origin,sourceRevision};
  const [surveyLink,immediateLink]=teachingOriginalProtectedCases();
  for(const row of [surveyLink,immediateLink]){
    const request=requestFor(row);
    assert.ok(createTeachingProbe(scope,request,key));
    assert.throws(()=>createTeachingProbe(scope,{...request,question:'Show my immediate teaching feedback status.'},key),/Invalid teaching/u);
    assert.throws(()=>createTeachingProbe(scope,{...request,question:row.question+' Also show my tuition balance.'},key),/Invalid teaching/u);
    assert.throws(()=>createTeachingProbe(scope,{...request,route:'/app'},key),/Invalid teaching/u);
  }
});
