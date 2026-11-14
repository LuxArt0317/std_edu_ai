import assert from 'node:assert/strict';
import test from 'node:test';
import {counselingGuide,counselingPath,counselingQuestion} from '../../server/counselingContract.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

test('public counseling questions route to school services before public lookup',async()=>{
  const unexpected=()=>{throw new Error('Unexpected public retrieval');};
  const handler=createResearchAssistantHandler({readSources:unexpected,loadPublicPage:unexpected});
  const prompts=[
    ['Where do I book a counseling appointment?',false],
    ['心理諮商預約在哪裡？',false],
    ['What is my counseling appointment status?',true],
    ['我的諮商預約進度如何？',true],
  ] as const;
  for(const [question,isStatus] of prompts){
    let code=0,reply:ReturnType<typeof counselingGuide>|undefined;
    const response={status(value:number){code=value;return response;},json(value:unknown){reply=value as typeof reply;},setHeader(){}};
    await handler({method:'POST',headers:{'x-real-ip':'203.0.113.19'},body:{question}},response);
    assert.equal(code,200);
    const expected=isStatus?'/school-affairs/login?next='+encodeURIComponent(counselingPath+'/appointments'):counselingPath;
    assert.equal(reply?.citations[0]?.url,expected,question);
    assert.equal(reply?.grounding.webSearched,false);
  }
});
test('signed-in guidance has no appointment details or actions',()=>{
  const question='Is my counseling appointment scheduled?';
  assert.equal(counselingQuestion(question),'status');
  const answer=counselingGuide(question,'status',true);
  assert.equal(answer.status,'handoff');
  assert.equal(answer.citations[0]?.url,counselingPath+'/appointments');
  assert.equal(Object.hasOwn(answer,'proposedAction'),false);
  assert.equal(counselingQuestion('Write code for a counseling appointment'),null);
  assert.equal(counselingQuestion('What is the password for counseling appointments?'),null);
});
