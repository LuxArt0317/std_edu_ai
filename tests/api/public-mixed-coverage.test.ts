import assert from 'node:assert/strict';
import test from 'node:test';
import {composeEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {publicCommunicationContext} from '../../server/publicCommunicationEvidence.js';

test('public mixed guidance preserves focus notes and measured missing details through review',async()=>{
 const before=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test';
 const context=publicCommunicationContext('Can the website provide a way to communicate with students?');assert.ok(context);
 const evidence=[context.evidence],needs=['Identify the intended recipient without assuming a messaging feature.'];let calls=0;
 globalThis.fetch=async(_url,options)=>{
  calls++;const body=JSON.parse(String(options?.body)),input=JSON.parse(body.input[0].content[0].text);
  assert.deepEqual(input.responseNeeds,needs);
  let output;
  if(body.text.format.name==='compose_grounded_answer'){
   assert.deepEqual(input.draftingGuidance,['Keep the clarification conversational.']);
   output={status:'answered',answer:'Who do you want to contact?',sourceIds:[]};
  }else{
   assert.equal(body.text.format.name,'answer_evidence_review');assert.ok(body.text.format.schema.required.includes('missingRequestedDetails'));
   output={supported:true,answersQuestion:true,missingRequestedDetails:['recipient details'],parts:input.answerParts.map((part:{id:number})=>({id:part.id,kind:'clarification',accepted:true,claims:[]}))};
  }
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
 };
 try{
  const args={question:'How can I contact someone?',evidence,deadline:Date.now()+30000,responseIntent:'mixed' as const,responseNeeds:needs};
  const candidate=await composeEvidenceAnswer({...args,feedback:['Keep the clarification conversational.']});
  const result=await verifyEvidenceAnswer({...args,candidate,trackPublicCoverage:true});
  assert.equal(result.ok,true);assert.deepEqual(result.missingRequestedDetails,['recipient details']);assert.equal(calls,2);
 }finally{globalThis.fetch=before;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
