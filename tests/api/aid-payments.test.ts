import assert from 'node:assert/strict';
import test from 'node:test';
import {aidPaymentsFields,aidPaymentsPaths,aidPaymentsQuestion,validAidPayments} from '../../server/aidPaymentsContract.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

test('salary and claims are distinct and full bank numbers fail response validation',()=>{
  assert.equal(aidPaymentsQuestion('Where can I see my student salary?'),'salary');
  assert.equal(aidPaymentsQuestion('我的助學金請款'),'claims');
  assert.equal(aidPaymentsQuestion('What is my tuition fee?'),null);
  const id='10000000-0000-4000-8000-000000000001';
  const salary={id,...Object.fromEntries(aidPaymentsFields.salary.map(([key])=>[key,null])),bank_last4:'0012'};
  const envelope={userId:id,view:'salary',total:1,rows:[salary]};
  assert.equal(validAidPayments(envelope,id,'salary'),true);
  assert.equal(validAidPayments(envelope,id,'claims'),false);
  assert.equal(validAidPayments(envelope,'another user','salary'),false);
  assert.equal(validAidPayments({...envelope,rows:[{...salary,bank_last4:'12345678'}]},id,'salary'),false);
  assert.equal(validAidPayments({...envelope,rows:[{...salary,user_id:id}]},id,'salary'),false);
});

test('guest payment questions get a direct navigation link or private-record sign-in link without retrieval',async()=>{
  const fail=()=>{throw new Error('Unexpected public retrieval');};
  const handler=createResearchAssistantHandler({readSources:fail,loadPublicPage:fail});
  for(const [question,view,navigation] of [['Where can I see my student salary?','salary',true],['Where are my student aid claims?','claims',true],
    ['What is my student salary?','salary',false],['What is the amount on my student aid claim?','claims',false]] as const){
    let status=0;
    let result:unknown;
    const response={status(value:number){status=value;return response;},json(value:unknown){result=value;},setHeader(){}};
    await handler({method:'POST',headers:{'x-real-ip':'203.0.113.27'},body:{question}},response);
    assert.equal(status,200);
    const payload=result as {status:string;citations:Array<{url:string}>;grounding:{webSearched:boolean}};
    assert.equal(payload.status,navigation?'answered':'handoff');
    assert.equal(payload.citations[0].url,navigation?aidPaymentsPaths[view]:'/school-affairs/login?next='+encodeURIComponent(aidPaymentsPaths[view]));
    assert.equal(payload.grounding.webSearched,false);
  }
});
