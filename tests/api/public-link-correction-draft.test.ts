import assert from 'node:assert/strict';
import test from 'node:test';
import {composeEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {publicCommunicationContext} from '../../server/publicCommunicationEvidence.js';

test('only a well-formed public link failure supplies an unapproved correction draft',async()=>{
 const fetchBefore=globalThis.fetch,apiKeyBefore=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='unit-test';
 const context=publicCommunicationContext('Can the website provide a way to communicate with students?');assert.ok(context);
 const evidence=[context.evidence];let unknownSource=false;
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:'[Contact information](https://unapproved.example/contact)',sourceIds:[unknownSource?'public-page:invented':evidence[0].id]})}]}]});
 try{
  const input={question:'How can I contact the school?',evidence,deadline:Date.now()+30000};
  await assert.rejects(composeEvidenceAnswer(input),error=>{
   const failure=error as any;assert.equal(failure.code,'CORRECTION_UNSUPPORTED');assert.equal(failure.invalidLinks,true);
   assert.equal(failure.invalidSourceIds,false);assert.equal(failure.unverifiedCandidate.status,'answered');
   assert.equal(failure.unverifiedCandidate.verification,undefined);assert.match(failure.unverifiedCandidate.answer,/unapproved/u);return true;
  });
  unknownSource=true;
  await assert.rejects(composeEvidenceAnswer(input),error=>{assert.equal((error as any).unverifiedCandidate,undefined);return true;});
  unknownSource=false;
  await assert.rejects(composeEvidenceAnswer(input,[{dataUrl:'data:image/png;base64,dGVzdA=='}]),error=>{assert.equal((error as any).unverifiedCandidate,undefined);return true;});
 }finally{globalThis.fetch=fetchBefore;if(apiKeyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=apiKeyBefore;}
});
