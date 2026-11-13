import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {evidenceReferenceCatalog,repairEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {fixtureForCase} from '../evaluation/fixtures.mjs';

const sourceId='account:academicAttendance';
const route='/school-affairs/services/14-1';
const question='Show my current academic attendance statistics';
const limited='Your current academic term is not explicitly designated in these local records. Specify an academic year and semester; the latest history is not assumed current.';
const evidenceFor=(text=question)=>accountEvidence(fixtureForCase('empty:academicAttendance'),['academicAttendance'],{question:text,route});
const candidate=(answer:string)=>({status:'answered',answer,citations:[]});
const review=(supported=true)=>({supported,answersQuestion:true,claims:[{claim:limited,supported,evidenceId:sourceId,jsonPaths:['/selection/reason','/records/metadata','/rules'],quotes:[]}]});
async function mocked(replies:unknown[],operation:(requests:Array<{instructions:string;input:Array<{content:Array<{text:string}>}>}>)=>Promise<void>){
  const previousFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY,warn=console.warn,requests:Array<{instructions:string;input:Array<{content:Array<{text:string}>}>}>=[];
  process.env.OPENAI_API_KEY='synthetic-empty-record-test';console.warn=()=>{};
  globalThis.fetch=async(_url,options)=>{
    assert.ok(replies.length,'Unexpected provider call; network is prohibited in this test.');
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});
  };
  try{await operation(requests);assert.equal(replies.length,0);}finally{globalThis.fetch=previousFetch;console.warn=warn;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('successful empty current-term evidence exposes precise limitation references for independent review',async()=>{
  const evidence=evidenceFor(),payload=JSON.parse(evidence.find(row=>row.id===sourceId)!.content);
  assert.equal(payload.selection.reason,'current_term_missing');assert.deepEqual(payload.records.metadata,[]);
  const paths=evidenceReferenceCatalog(evidence).sources.find(row=>row.evidenceId===sourceId)!.jsonPaths;
  for(const path of ['/selection/reason','/records/metadata','/rules','/records/coverage/0/historyCompleteness'])assert.ok(paths.includes(path),path);
  await mocked([review()],async requests=>{
    const answer=await runAnswerVerification({question,initialAnswer:candidate(limited),deadline:Date.now()+10000,loadEvidence:async()=>evidence,verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(answer.status,'answered');assert.deepEqual(answer.verification,{status:'verified',attempts:1});assert.equal(requests.length,1);
    assert.match(requests[0].instructions,/does not support zero absences or no attendance history/);
    assert.match(requests[0].instructions,/Failed reads, suppressed or excerpted rows/);
  });
});

test('correction can answer the grounded missing designation in the question language, but still needs the second review',async()=>{
  const zh='請顯示我本學期的缺曠統計',evidence=evidenceFor(zh),answer='這些本地紀錄尚未指定目前學年與學期。請提供學年及學期；不能將最新歷史紀錄視為本學期，也不能據此認定缺曠為零。';
  await mocked([review(false),{status:'answered',answer,sourceIds:[sourceId]},review()],async requests=>{
    const result=await runAnswerVerification({question:zh,initialAnswer:candidate('There are zero absences.'),deadline:Date.now()+10000,loadEvidence:async()=>evidence,verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(result.status,'answered');assert.equal(result.answer,answer);assert.deepEqual(result.verification,{status:'verified',attempts:2});assert.equal(requests.length,3);
    const correction=requests[1];assert.match(correction.instructions,/requested language, otherwise the language of their question/);
    assert.match(correction.instructions,/return answered with the precise limitation/);
    assert.match(correction.instructions,/Failed reads, suppressed\/excerpted rows, unknown completeness and unavailable sources are not proof of absence/);
    const reviewInput=JSON.parse(requests[2].input[0].content[0].text);
    assert.equal(reviewInput.answer,answer);assert.equal(reviewInput.question,zh);
  });
});

test('a correction abstention is never automatically promoted because the snapshot is empty',async()=>{
  const evidence=evidenceFor();
  await mocked([review(false),{status:'abstained',answer:'I cannot determine current attendance statistics.',sourceIds:[sourceId]}],async requests=>{
    const result=await runAnswerVerification({question,initialAnswer:candidate('There are zero absences.'),deadline:Date.now()+10000,loadEvidence:async()=>evidence,verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(result.status,'abstained');assert.equal(result.verification.status,'unverified');assert.equal(result.verification.attempts,2);assert.equal(result.verification.reason,'no_supported_answer');assert.equal(requests.length,2);
  });
});

test('a limited answer with an invented metadata reference is still withheld after correction',async()=>{
  const evidence=evidenceFor(),invalid=review();invalid.claims[0].jsonPaths=['/records/metadata/0/currentAcademicYear'];
  await mocked([invalid,{status:'answered',answer:limited,sourceIds:[sourceId]},invalid],async requests=>{
    const result=await runAnswerVerification({question,initialAnswer:candidate(limited),deadline:Date.now()+10000,loadEvidence:async()=>evidence,verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(result.status,'abstained');assert.equal(result.verification.status,'unverified');assert.equal(result.verification.attempts,2);assert.equal(requests.length,3);
  });
});

test('unread evidence remains a read failure and never becomes a verified empty-record answer',async()=>{
  await mocked([],async requests=>{
    let reads=0;
    const result=await runAnswerVerification({question,initialAnswer:candidate(limited),deadline:Date.now()+10000,loadEvidence:async()=>{reads++;throw new Error('Synthetic read failure');},verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
    assert.equal(result.status,'abstained');assert.equal(result.verification.status,'unverified');assert.equal(result.verification.reason,'evidence_unavailable');assert.equal(reads,2);assert.equal(requests.length,0);
  });
});
