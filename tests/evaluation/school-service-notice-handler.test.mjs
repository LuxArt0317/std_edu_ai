import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {answerSchoolServiceNotice} from '../../server/schoolAffairsDirectory.js';
import {buildSchoolServiceNoticeCases} from './public-cases.mjs';
import {gradeCase} from './grading.mjs';

function responseRecorder(){
  let body, statusCode, output='';
  const res={
    setHeader(){}, flushHeaders(){},
    status(code){statusCode=code;return this;},
    json(value){body=value;},
    write(chunk){output+=chunk;},
    end(){},
  };
  return {res,result(){
    const events=[];
    for(const packet of output.trim().split('\n\n')){
      const lines=packet.split('\n');
      if(lines.length!==2||!lines[1].startsWith('data: '))continue;
      const data=JSON.parse(lines[1].slice(6));
      if(lines[0]==='event: result'||lines[0]==='event: error')body=data;
      else if(lines[0]==='event: progress')events.push(data);
    }
    return {body,statusCode,events};
  }};
}

test('both assistant HTTP handlers answer the exact notice without record, research or model calls',async t=>{
  const realFetch=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('A static UI notice does not require an external read or model.');
  t.after(()=>{globalThis.fetch=realFetch;});
  let authentications=0;
  const signedIn=createAffairsAssistantHandler({
    async verifyToken(token){
      assert.equal(token,'qa-notice-token');
      authentications++;
      return {url:'https://qa.invalid',key:'test',token,user:{id:'00000000-0000-4000-8000-000000000051'}};
    },
    async loadSnapshot(){assert.fail('A page notice does not require account data.');},
    async publicResearch(){assert.fail('The account handler can answer locally.');},
  });
  const anonymous=createResearchAssistantHandler();
  const cases=buildSchoolServiceNoticeCases();
  assert.equal(cases.length,4);
  for(const item of cases){
    for(const [handler,headers] of [[signedIn,{authorization:'Bearer qa-notice-token'}],[anonymous,{}]]){
      const response=responseRecorder();
      await handler({method:'POST',headers,body:{question:item.question,route:item.route,stream:true,consentedResearchUse:false}},
        response.res);
      const envelope=response.result();
      const grade=gradeCase(item,{...envelope,execution:'deterministic',fixtureKey:item.fixtureKey});
      assert.ok(grade.passed,JSON.stringify({caseId:item.id,failures:grade.failures}));
      assert.equal(envelope.body.citations.length,1);
      assert.ok(envelope.events.some(event=>event.kind==='service-notice'&&event.status==='complete'));
    }
  }
  assert.equal(authentications,cases.length);
});

test('notice guidance cannot substitute for account or action questions and requires the exact page',()=>{
  const route='/school-affairs/services/23-1/receipts';
  assert.equal(answerSchoolServiceNotice('What does this notice say?',route)?.citations[0].url,route);
  assert.equal(answerSchoolServiceNotice('What does this notice say?',route+'/unrelated'),null);
  for(const question of ['Did my grant get paid?', 'Print my receipt now.',
    'What does this notice say and when did my grant pay out?', 'What happens if I press Confirm for another student?']){
    assert.equal(answerSchoolServiceNotice(question,route),null,question);
  }
});
