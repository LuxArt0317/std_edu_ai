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
