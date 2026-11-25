import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {parseExplicitAccountAction} from '../../server/accountActionIntent.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const prompt='Save a sick leave draft for 2026-11-18 to 2026-11-19, periods "1–2", reason "Private fixture reason".';
const leave='/school-affairs/services/leave';
const owner='38475671-55d3-44b0-8a2a-e3f20d902101';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN'};
const history=[{role:'user',content:'What grades and subjects do I have?'},{role:'assistant',content:'Private history sentinel.'}];

async function ask(handler:ReturnType<typeof createAffairsAssistantHandler>|ReturnType<typeof createResearchAssistantHandler>,
  question:string,route:string,images:unknown[]=[]){
  let status=0,result:any;
  const events:string[]=[];
  const response={setHeader(){},status(code:number){status=code;return this;},json(value:unknown){result=value;},
    write(data:string){events.push(data);const packet=/^event: result\ndata: (.+)\n\n$/u.exec(data);if(packet)result=JSON.parse(packet[1]);},end(){}};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.48'},
    body:{question,route,history,images,stream:true}},response);
  return {status,result,events};
}

test('a signed-in leave proposal uses only explicit fields, verifies them, and expires in the saved chat',async t=>{
  const unexpected=()=>assert.fail('A proposal cannot read records, call a model, search, or write.');
  t.mock.method(globalThis,'fetch',unexpected);
  const signed=createAffairsAssistantHandler({verifyToken:async()=>account,
    loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected});
  for(const route of [leave+'/history','/dtm','/campus-assistant']){
    const {status,result,events}=await ask(signed,prompt,route);
    assert.equal(status,200);
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/Confirm to save them as a private draft/u);
    assert.doesNotMatch(JSON.stringify(result.activity),/private history|fixture reason/u);
    const action=result.proposedAction;
    assert.equal(action.kind,'create_student_leave_draft');
    assert.equal(action.url,leave+'/edit/'+action.requestId);
    assert.deepEqual(action.payload,{starts_on:'2026-11-18',ends_on:'2026-11-19',leave_category:'sick',
      periods:'1–2',leave_time_period:'',notes:'Private fixture reason'});
    assert.ok(events.some(event=>event.includes('Checked the fields you supplied')));
    const [restored]=sanitizeStoredConversation([{id:'answer',role:'assistant',content:result.answer,result}]);
    assert.equal(restored.actionExpired,true);
    assert.equal(Object.hasOwn(restored.result,'proposedAction'),false);
    assert.doesNotMatch(JSON.stringify(restored),/Private fixture reason/u);
  }
  const clarification=await ask(signed,'Save a leave draft for tomorrow.',leave);
  assert.equal(clarification.result.status,'clarification');
  assert.match(clarification.result.answer,/category, date or date range, and periods/u);
  assert.equal(clarification.result.proposedAction,undefined);
  const rephrased=await ask(signed,'Can you draft a sick leave request for 2026-11-18, periods "1–2"?','/dtm');
  assert.equal(rephrased.result.proposedAction.payload.periods,'1–2');
});

test('the Leave draft asks for Google sign-in and rejects unrelated, incomplete or unsafe instructions',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('These requests require no network.'));
  const {status,result}=await ask(createResearchAssistantHandler(),prompt,'/dtm');
  assert.equal(status,200);
  assert.equal(result.status,'handoff');
  assert.equal(result.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(leave));
  assert.equal(result.proposedAction,undefined);
  for(const question of ['Where can I file a leave?','Submit my leave to the university.','Save Alex’s sick leave draft.',
    'Do not '+prompt]){
    assert.notEqual(parseExplicitAccountAction(question)?.kind,'create_student_leave_draft',question);
  }
  for(const question of [
    'Save a sick leave draft for 2026-02-30, periods "1".',
    'Save a sick leave draft for 2026-11-19 to 2026-11-18, periods "1".',
    'Save a sick leave draft for 2026-11-18, periods "1" and submit it.',
    'Save a sick leave draft for 2026-11-18, periods "1" only if I confirm.',
    'Save a mental health leave draft for 2026-11-18, periods "1".',
  ]){
    const request=parseExplicitAccountAction(question);
    assert.equal(request?.kind,'create_student_leave_draft');
    assert.equal(request.ambiguous,true,question);
  }
  const chinese=parseExplicitAccountAction('請幫我儲存心理假草稿 2026-11-18，節次「第1節」，時段上午。');
  assert.deepEqual(chinese,{kind:'create_student_leave_draft',draft:{starts_on:'2026-11-18',ends_on:'2026-11-18',
    leave_category:'mental_health',periods:'第1節',leave_time_period:'am',notes:''},ambiguous:false});
});
