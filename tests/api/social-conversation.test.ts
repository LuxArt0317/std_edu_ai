import test from 'node:test';import assert from 'node:assert/strict';import {answerSocialConversation} from '../../server/socialConversation.js';
const base={question:'My mother is Rosa and I live in the Philippines. Ask me later.',deadline:Date.now()+60000,history:[]};
test('personal self-report gets a conversation answer with no record verification or tools',async()=>{
 const r=await answerSocialConversation(base,async(_name:any,_schema:any,prompt:any)=>{assert.match(prompt,/never account|Never treat testimony/i);return {mode:'conversation',answer:'Got it—your mother is Rosa, and you live in the Philippines. I can use that context in this conversation.'};});assert.equal(r.grounding.source,'conversation');assert.equal(r.verification,undefined);assert.deepEqual(r.activity,[]);assert.deepEqual(r.citations,[]);
});
test('recall receives actual recent conversation; record and mixed requests fall through',async()=>{
 const history=[{role:'user',content:base.question}];const r=await answerSocialConversation({...base,question:'Do you know me now?',history},async(_n:any,_s:any,_p:any,input:any)=>{assert.equal(input.history[0].content,base.question);return {mode:'conversation',answer:'You told me your mother is Rosa and you live in the Philippines.'};});assert.match(r.answer,/You told me/);
 assert.equal(await answerSocialConversation({...base,question:'My mother is Rosa. What are my grades?'},async()=>({mode:'lookup',answer:''})),null);
 assert.equal(await answerSocialConversation(base,async()=>{throw Error('offline');}),null);
});

test('public follow-ups get a standalone search query without account history', async () => {
 const previousFetch = globalThis.fetch;
 const previousKey = process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY = 'test-key';
 const calls: unknown[] = [];
 globalThis.fetch = async (_url, init) => {
  calls.push(JSON.parse(String(init?.body)));
  return new Response(null, { status: 503 });
 };
 try {
  const result = await answerSocialConversation({
   ...base,
   question: 'What about his latest speech?',
   history: [{ role: 'user', content: 'Search for Donald Trump' }],
   allowPublicWeb: true,
  }, async () => ({ mode: 'public_web', answer: 'Donald Trump latest public speech' }));
  assert.equal(result.grounding.source, 'web');
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls[0]), /Donald Trump latest public speech/);
  assert.doesNotMatch(JSON.stringify(calls[0]), /What about his latest speech|Search for Donald Trump/);
  assert.equal(await answerSocialConversation({
   ...base, question: 'What are my grades?', allowPublicWeb: true,
  }, async () => ({ mode: 'public_web', answer: 'Student grade report' })), null);
  assert.equal(calls.length, 1);
 } finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
 }
});
