import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readTutorEvaluationEvidence,tutorEvaluationEvidenceMaxBytes} from '../../server/accountTutorEvaluationEvidence.js';

const owner='28000000-0000-4000-8000-000000000001';
const foreign='28000000-0000-4000-8000-000000000002';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const account=()=>({url:origin,key:'OFFLINE_TUTOR_KEY',token:'OFFLINE_TUTOR_TOKEN',user:{id:owner}});
const route='/school-affairs/services/28-1';
const status='Did I submit my tutor evaluation questionnaire?';
const submittedAt='2026-11-13T16:15:38.100000+08:00';
const dto=()=>({userId:owner,student:{number:'PRIVATE_STUDENT_NUMBER',name:'PRIVATE_STUDENT_NAME',department:'PRIVATE_DEPARTMENT',year:3},
  evaluation:{ratings:[5,1,4,3,2,1,2,3,4,5],comment:'PRIVATE_COMMENT',submittedAt}});
const load=(question=status,response:unknown=dto())=>readTutorEvaluationEvidence(account(),{question,route},{read:async()=>response});
const payload=(result:Awaited<ReturnType<typeof load>>)=>JSON.parse(result.evidence.content);

test('status evidence exposes the literal submission time without profile, ratings or comment',async()=>{
  const result=await load(),evidence=payload(result);
  assert.equal(result.evidence.id,'account:tutorEvaluation');assert.equal(result.evidence.url,route);
  assert.equal(result.readState,'ok');assert.equal(evidence.submissionState,'submitted');
  assert.deepEqual(evidence.submission,{submittedAt});
  assert.deepEqual(evidence.capability,{write:false,identity:false,history:false});
  assert.doesNotMatch(result.evidence.content,/PRIVATE_|OFFLINE_|28000000/u);
});

test('numbered ratings and comments are independently selected, including literal blank',async()=>{
  assert.deepEqual(payload(await load('What rating did I give question 2 on my tutor evaluation?')).submission,
    {submittedAt,ratings:[{questionNumber:2,rating:1}]});
  const blank=dto();blank.evaluation.comment='';
  assert.deepEqual(payload(await load('What was my saved comment on the tutor evaluation?',blank)).submission,{submittedAt,comment:''});
  const long=dto();long.evaluation.comment='測'.repeat(4000);
  const value=await load('What was my saved comment on the tutor evaluation?',long);
  assert.equal(payload(value).submission.comment,long.evaluation.comment);
  assert.ok(Buffer.byteLength(JSON.stringify(value),'utf8')<=tutorEvaluationEvidenceMaxBytes);
});

test('empty, malformed, failed and denied are distinct without returning private DTO values',async()=>{
  const empty=await load(status,{...dto(),evaluation:null});
  assert.equal(empty.readState,'empty');assert.equal(payload(empty).submissionState,'not_saved');
  assert.equal(payload(empty).submission,null);
  const malformed=[{...dto(),userId:foreign},{...dto(),extras:true}];
  for(const input of [...malformed,
    {...dto(),evaluation:{...dto().evaluation,ratings:[1,2]}},
    {...dto(),evaluation:{...dto().evaluation,submittedAt:'2026-02-30T10:00:00Z'}},
    {...dto(),evaluation:{...dto().evaluation,comment:'bad\u0000comment'}}]){
    const result=await load(status,input);
    assert.equal(result.reason,'invalid_records');assert.equal(payload(result).submissionState,'unknown');
    assert.equal(payload(result).submission,null);assert.doesNotMatch(result.evidence.content,/PRIVATE_/u);
  }
  for(const [http,reason] of [[403,'access_denied'],[503,'read_failed']] as const){
    const result=await readTutorEvaluationEvidence(account(),{question:status,route},
      {read:async()=>{throw Object.assign(new Error('PRIVATE_INTERNAL_FAILURE'),{status:http});}});
    assert.equal(result.reason,reason);assert.equal(payload(result).submissionState,'unknown');
    assert.doesNotMatch(result.evidence.content,/PRIVATE_INTERNAL_FAILURE/u);
  }
});

test('guest, foreign, mutation and unsafe route requests stop before caller transport',async()=>{
  const denied={read:async()=>assert.fail('No tutor read for an unauthorized request')};
  for(const [question,expected]of [
    ["What did Alice submit in her tutor evaluation?",'foreign_request'],
    ['Submit my tutor evaluation questionnaire for me.','unsupported_operation'],
  ]){
    assert.equal((await readTutorEvaluationEvidence(account(),{question,route},denied)).reason,expected,question);
  }
  assert.equal((await readTutorEvaluationEvidence({...account(),token:''},{question:status,route},denied)).reason,'unauthorized');
  assert.equal((await readTutorEvaluationEvidence(account(),{question:status,route:route+'?user_id='+foreign},denied)).reason,'invalid_route');
  assert.equal((await readTutorEvaluationEvidence(account(),{question:status,route,deadline:Date.now()-1},denied)).reason,'deadline_exceeded');
});

test('native caller-only transport uses the existing read RPC and fixed account',async()=>{
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async(input,init)=>{
    requests++;
    assert.equal(String(input),origin+'/rest/v1/rpc/affairs_read_tutor_evaluation');
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(init?.body,'{}');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer OFFLINE_TUTOR_TOKEN');
    return Response.json(dto());
  };
  try{
    const caller=account(),response=readTutorEvaluationEvidence(caller,{question:status,route});
    caller.user.id=foreign;caller.token='FOREIGN';
    assert.equal((await response).readState,'ok');assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});
