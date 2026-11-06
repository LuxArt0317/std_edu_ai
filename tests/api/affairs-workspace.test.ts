import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { verifyAffairsToken } from '../../server/affairsWorkspace.js';
import { answerPrivateAffairsQuestion, fallbackPrivateAnswer } from '../../server/affairsAnswer.js';

const originalFetch=globalThis.fetch;
const originalUrl=process.env.VITE_SUPABASE_URL;
const originalKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const originalAiKey=process.env.OPENAI_API_KEY;
before(()=>{
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='test-publishable-key';
  delete process.env.OPENAI_API_KEY;
});
after(()=>{
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=originalKey;
  if(originalAiKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalAiKey;
});

test('School Affairs token verification requires a Google identity',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'user-one',identities:[{provider:'email'}]}),{status:200});
  await assert.rejects(verifyAffairsToken('x'.repeat(64)),/with Google/);
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'user-one',identities:[{provider:'google'}]}),{status:200});
  const account=await verifyAffairsToken('x'.repeat(64));
  assert.equal(account.user.id,'user-one');
  assert.equal(account.url,'https://xiftudmvxphxcjtmfmib.supabase.co');
});

const snapshot={checkedAt:'2026-11-05T00:00:00Z',profile:{userId:'user-one',email:'one@example.com',displayName:'One',role:'student'},student:{studentNumber:'SAMPLE-123',program:'Sample General Studies',yearLevel:1},courses:[{code:'SAMP101',title:'Campus Orientation',term:'Sample Fall 2026',termStartsOn:'2026-09-07',termEndsOn:'2027-01-15',status:'enrolled',weekday:1,startsAt:'09:00',endsAt:'10:30',room:'Sample Room',grades:[],attendance:[]}],charges:[],announcements:[],tasks:[],requests:[]};
test('personal answer uses only the account snapshot and names sample data',async()=>{
  assert.match(fallbackPrivateAnswer('What are my current subjects?',snapshot),/SAMP101 Campus Orientation/);
  const result=await answerPrivateAffairsQuestion('What are my current subjects?',snapshot);
  assert.match(result.answer,/sample/i);
  assert.match(result.answer,/SAMP101/);
  assert.doesNotMatch(result.answer,/IM101|IM203|Nexus/);
  assert.equal(result.grounding.source,'account');
  assert.equal(result.proposedAction,undefined);
});
test('a task request is proposed without writing any data',async()=>{
  const result=await answerPrivateAffairsQuestion('Remind me to review my courses',snapshot);
  assert.equal(result.proposedAction?.kind,'create_task');
  assert.equal(result.proposedAction?.payload.title,'review my courses');
  assert.match(result.answer,/after you confirm/i);
});
test('model receives only the account snapshot and its action remains a proposal',async()=>{
  process.env.OPENAI_API_KEY='test-key';
  let calls=0;
  globalThis.fetch=async(_input,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body));
    assert.equal(body.store,false);
    assert.equal(body.input[0].role,'user');
    assert.equal(JSON.parse(body.input[0].content).accountSnapshot.profile.userId,'user-one');
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({answer:'I can add that to your sample stu.best task list after you confirm.',action_kind:'create_task',action_title:'Review orientation',action_details:'',action_id:'',request_type:''})}]}]}),{status:200});
  };
  const result=await answerPrivateAffairsQuestion('Please help me remember to review orientation',snapshot);
  assert.equal(calls,1);
  assert.equal(result.proposedAction?.kind,'create_task');
  assert.equal(result.proposedAction?.payload.title,'Review orientation');
  assert.match(result.answer,/after you confirm/);
});
