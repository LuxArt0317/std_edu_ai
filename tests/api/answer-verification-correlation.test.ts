import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composeEvidenceAnswer,repairEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {runAnswerVerification} from '../../server/answerVerification.js';

const correlationId='bd1339b5-79f2-414f-8002-cf379a00b6f1';
const diagnosticContext={correlationId,attempt:1 as const};
const evidence=[{id:'account:tuition',content:JSON.stringify({value:'PRIVATE_VALUE',rules:'Local demonstration data.'})}];
const candidate={status:'answered',answer:'PRIVATE_ANSWER',citations:[]};
const context=()=>({question:'PRIVATE_QUESTION',candidate,evidence,deadline:Date.now()+10000,diagnosticContext});
const claim=(extra:Record<string,unknown>={})=>({claim:'A local sample record is unavailable.',supported:false,evidenceId:'account:tuition',quotes:[],jsonPaths:['/value'],...extra});
const review=(claims:unknown[],extra:Record<string,unknown>={})=>({supported:false,answersQuestion:false,claims,...extra});
async function mocked(replies:unknown[],operation:(logs:unknown[][],requests:Record<string,any>[])=>Promise<void>){
  const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY,savedWarn=console.warn,logs:unknown[][]=[],requests:Record<string,any>[]=[];
  process.env.OPENAI_API_KEY='synthetic-correlation-test';console.warn=(...args)=>{logs.push(args);};
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');assert.ok(replies.length,'No live provider transport is permitted.');
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});
  };
  try{await operation(logs,requests);assert.equal(replies.length,0);}finally{
    globalThis.fetch=savedFetch;console.warn=savedWarn;
    if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;
  }
}
function packet(log:unknown[]){
  assert.equal(log.length,1);assert.equal(typeof log[0],'string');assert.ok(Buffer.byteLength(log[0] as string)<6000);
  return JSON.parse(log[0] as string);
}

test('correlated review diagnostics contain only fixed categories and counts, never private text or identifiers',async()=>{
  const secret='PRIVATE_SECRET private.student@example.invalid https://private.invalid/path /PRIVATE_POINTER 976dab18-a7a3-416b-a7ac-482266381fe1';
  const rejected=review([claim({claim:'Official sample current record total was approved. '+secret,evidenceId:secret,jsonPaths:['/PRIVATE_POINTER']}),claim({supported:true})]);
  await mocked([rejected],async(logs,requests)=>{
    const output=await verifyEvidenceAnswer({...context(),diagnosticContext:{...diagnosticContext,accountId:secret} as any});
    assert.equal(output.ok,false);assert.equal(logs.length,1);
    const value=packet(logs[0]);
    assert.equal(value.correlationId,correlationId);assert.equal(value.attempt,1);assert.equal(value.stage,'review');assert.equal(value.reason,'unsupported_claims');
    assert.deepEqual(value.counts,{evidenceSources:1,claims:2,unsupportedClaims:1,unmatchedReferences:1,parts:0,rejectedParts:0});
    assert.deepEqual(value.evidenceCollections,{tuition:1});assert.deepEqual(value.unmatchedCollections,{other:1});
    assert.deepEqual(value.unsupportedTopics,{provenance:1,record_availability:1,term_selection:1,calculation:1,action_status:1});
    assert.equal(value.countsTruncated,false);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|@|https:|976dab18|jsonPaths|evidenceId|claimIndex/);
    assert.equal(JSON.stringify(requests).includes(correlationId),false,'Internal correlation must not be sent to the model.');
  });
});

test('precheck diagnostics preserve failure reasons without running a provider or accepting invalid correlation',async()=>{
  await mocked([],async logs=>{
    assert.deepEqual(await verifyEvidenceAnswer({...context(),candidate:{...candidate,status:'abstained'}}),{ok:false,reason:'no_supported_answer'});
    assert.equal(packet(logs[0]).reason,'no_supported_answer');
    for(const id of ['private@example.invalid','PRIVATE_SECRET','bd1339b5-79f2-114f-8002-cf379a00b6f1',correlationId+'\nPRIVATE_SECRET'])
      await verifyEvidenceAnswer({...context(),candidate:{...candidate,status:'abstained'},diagnosticContext:{correlationId:id,attempt:1}});
    assert.equal(logs.length,1);
  });
});

test('generation failures and explicit abstentions log fixed stages without changing generated behavior',async()=>{
  await mocked([{status:'answered',answer:'PRIVATE_GENERATED',sourceIds:['PRIVATE_FAKE_SOURCE']},{status:'abstained',answer:'A saved record is unavailable.',sourceIds:['account:tuition']}],async(logs,requests)=>{
    await assert.rejects(composeEvidenceAnswer(context()),{code:'CORRECTION_UNSUPPORTED'});
    const output=await repairEvidenceAnswer({...context(),diagnosticContext:{correlationId,attempt:2}});
    assert.equal(output.status,'abstained');assert.deepEqual(logs.map(packet).map(row=>[row.stage,row.reason,row.attempt]),[
      ['composition','invalid_generated_answer',1],['correction','generated_abstention',2],
    ]);
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|fake|sourceIds|previousAnswer/);
    assert.equal(JSON.stringify(requests).includes(correlationId),false);
    for(const request of requests){
      assert.match(request.instructions,/short affirmative source label/u);
      assert.match(request.instructions,/Explain a source boundary only when the question asks about official verification/u);
      assert.match(request.instructions,/Never imply authority or action the evidence does not establish/u);
    }
  });
});

test('diagnostic counts are bounded and visibly truncated without source values or dynamic collection names',async()=>{
  const claims=Array.from({length:95},(_,index)=>claim({claim:'PRIVATE_LONG_'.repeat(500),evidenceId:index%2?'account:UNKNOWN_PRIVATE':'account:tuition'}));
  await mocked([review(claims)],async logs=>{
    assert.equal((await verifyEvidenceAnswer({...context(),diagnosticContext:{correlationId,attempt:99} as any})).ok,false);
    const value=packet(logs[0]);assert.equal(value.counts.claims,80);assert.equal(value.counts.unsupportedClaims,80);assert.equal(value.countsTruncated,true);
    assert.equal(value.attempt,undefined);assert.deepEqual(value.unsupportedTopics,{other:80});assert.deepEqual(value.unmatchedCollections,{other:40});
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|UNKNOWN|index|pointer|claimText/);
  });
});

test('the approved conduct and loan collection names are fixed diagnostic categories, never record identifiers',async()=>{
  const sources=['studentConduct','studentLoan'].map(id=>({id:'account:'+id,content:'{"value":"PRIVATE_SAVED_RECORD"}'}));
  await mocked([review(sources.map(source=>claim({evidenceId:source.id,jsonPaths:['/PRIVATE_MISSING_FIELD']})))],async logs=>{
    assert.equal((await verifyEvidenceAnswer({...context(),evidence:sources})).ok,false);
    const value=packet(logs[0]);
    assert.deepEqual(value.evidenceCollections,{studentConduct:1,studentLoan:1});
    assert.deepEqual(value.unmatchedCollections,{studentConduct:1,studentLoan:1});
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|jsonPaths|sourceId/);
  });
});

test('guidance parts are counted without logging their contents or treating classification as approval',async()=>{
  await mocked([{supported:true,answersQuestion:true,parts:[{id:1,kind:'suggestion',accepted:false,claims:[]}]}],async logs=>{
    const output=await verifyEvidenceAnswer({...context(),responseIntent:'coaching',evidence:[],candidate:{...candidate,answer:'Choose one example you can truthfully explain.'}});
    assert.equal(output.ok,false);
    const value=packet(logs[0]);assert.equal(value.counts.parts,1);assert.equal(value.counts.rejectedParts,1);assert.equal(value.counts.claims,0);
    assert.doesNotMatch(JSON.stringify(logs),/Choose|example|suggestion/);
  });
});

test('correlation does not change schemas, call budgets, successful verification or the two-review failure gate',async()=>{
  await mocked([review([claim({supported:true})],{supported:true,answersQuestion:true})],async logs=>{
    assert.equal((await verifyEvidenceAnswer(context())).ok,true);assert.equal(logs.length,0);
  });
  await mocked([review([claim()]),{status:'answered',answer:'A local sample record is unavailable.',sourceIds:['account:tuition']},review([claim()])],async(logs,requests)=>{
    let attempt=0;
    const output=await runAnswerVerification({question:'PRIVATE_QUESTION',initialAnswer:candidate,deadline:Date.now()+10000,
      loadEvidence:async()=>evidence,verify:ctx=>verifyEvidenceAnswer({...ctx,diagnosticContext:{correlationId,attempt:++attempt as 1|2}}),
      repair:ctx=>repairEvidenceAnswer({...ctx,diagnosticContext:{correlationId,attempt:2}})});
    assert.equal(output.status,'abstained');assert.deepEqual(output.verification,{status:'unverified',attempts:2,reason:'unsupported_claims'});
    assert.deepEqual(requests.map(row=>row.text.format.name),['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
    assert.deepEqual(requests.map(row=>row.max_output_tokens),[8192,2400,8192]);assert.ok(requests.every(row=>row.store===false));
    assert.deepEqual(logs.map(packet).map(row=>row.attempt),[1,2]);
  });
});
