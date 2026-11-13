import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerAccountWithVerification} from '../../server/answerVerificationAccount.js';
import {answerLinksSupported} from '../../server/answerVerificationModel.js';
import {buildAccountFixture} from './fixtures.mjs';

test('one verification retry can recover an omitted record reader without replacing the action or searching private values',async()=>{
  const savedKey=process.env.OPENAI_API_KEY,original=globalThis.fetch;
  process.env.OPENAI_API_KEY='synthetic-test-key';
  const snapshot=buildAccountFixture(),events=[];let plans=0,reviews=0,repairs=0,reads=0;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses','No database value is sent to an external search URL.');
    const request=JSON.parse(init.body),payload=JSON.parse(request.input[0].content[0].text);
    let result;
    if(request.text.format.name==='account_lookup_plan'){
      plans++;
      if(plans===1)result={tools:['charges'],publicTopics:[],action:null};
      else{
        assert.deepEqual(payload.retry.previousTools,['charges']);
        result={tools:['dtm'],publicTopics:['library'],action:{kind:'publish_announcement',payload:{title:'Must never execute',body:'Do not apply'}}};
      }
    }else if(request.text.format.name==='answer_evidence_review'){
      reviews++;
      // Attempt one is rejected by the deterministic link/evidence gate: its
      // DTM draft has no DTM source in the charges-only plan. The first actual
      // provider review therefore belongs to attempt two, after correction.
      // Decide from supplied evidence, never from the provider call count.
      assert.equal(repairs,1,'The corrected draft must precede provider review.');
      const source=payload.evidence.find(row=>row.id==='account:dtm');assert.ok(source,'A provider audit must receive the newly selected reader.');
      assert.equal(JSON.parse(source.content).records.courses[0].grades[0].feedback,'Revise normalization examples.');
      result={supported:true,answersQuestion:true,claims:[{claim:'The saved feedback is Revise normalization examples.',supported:true,evidenceId:'account:dtm',quotes:['Revise normalization examples.'],jsonPaths:['/records/courses/0/grades/0/feedback']}]};
    }else{
      assert.equal(request.text.format.name,'correct_grounded_answer');repairs++;
      assert.ok(payload.evidence.some(row=>row.id==='account:dtm'));
      result={status:'answered',answer:'Your saved Quiz 1 feedback is: Revise normalization examples.',sourceIds:['account:dtm']};
      assert.equal(answerLinksSupported(result.answer,payload.evidence),true);
      assert.ok(result.sourceIds.every(id=>payload.evidence.some(row=>row.id===id)));
    }
    return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  try{
    const answer=await answerAccountWithVerification({question:'What feedback did I get on Quiz 1?',snapshot,route:'/dtm',
      loadSnapshot:async()=>{reads++;return snapshot;},onProgress:event=>events.push(event),deadline:Date.now()+55000});
    assert.equal(answer.verification.status,'verified',JSON.stringify({verification:answer.verification,plans,reviews,repairs,events}));assert.equal(answer.verification.attempts,2);
    assert.equal(plans,2);assert.equal(reviews,1);assert.equal(repairs,1);assert.equal(reads,1);
    assert.equal(answer.proposedAction,undefined);assert.equal(answer.grounding.webSearched,false);
    assert.ok(events.some(row=>row.kind==='account-read:dtm:2'&&row.status==='complete'));
    assert.ok(events.some(row=>row.kind==='account-read:assignments:2'&&row.status==='complete'));
    assert.ok(events.some(row=>row.kind==='verification-1'&&row.status==='unavailable'));
    assert.ok(events.some(row=>row.kind==='verification-2'&&row.status==='complete'));
    assert.ok(answer.activity.some(row=>row.kind==='account-replan'));
  }finally{globalThis.fetch=original;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});
