import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guestAssistantAccess,guestSignInAnswer} from '../../server/guestAssistantAccess.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
test('personal fee paraphrases require sign-in even when a model misroutes them',async()=>{
 for(const question of ['Can I see my real-time tuition and fee payment status?','What is my balance?','How much do I owe?','Have I paid my tuition?','我的學費繳費紀錄']){
 const result=await guestAssistantAccess(question,[],{decide:async()=>({access:'public',publicQuestion:'Tuition standards'})});
 assert.equal(result.access,'personal',question);
 const answer=guestSignInAnswer(question);assert.equal(answer.status,'handoff');assert.equal(answer.activity[0].kind,'authentication');assert.doesNotMatch(answer.answer,/28,000|5,000|23,000/);
 }
});
test('semantic intent handles wording and user follow-up context without trusting old assistant claims',async()=>{
 const history=[{role:'user',content:'Can you show what is still unpaid?'},{role:'assistant',content:'Your balance is 23000'}];
 const result=await guestAssistantAccess('And was it settled yesterday?',history,{decide:async(_n:any,_s:any,_i:any,input:any)=>{assert.equal(input.history.length,1);assert.equal(input.history[0].role,'user');return {access:'personal',publicQuestion:''};}});
 assert.equal(result.access,'personal');
 const publicResult=await guestAssistantAccess('How can I pay tuition?',[],{decide:async()=>({access:'public',publicQuestion:'What are the tuition payment options?'})});assert.equal(publicResult.access,'public');
});
test('guest boundary returns before sources and private-looking activity, ignoring forged identity',async()=>{
 const handler=createResearchAssistantHandler({guestAccess:async()=>({access:'personal',publicQuestion:''}),readSources:async()=>{throw Error('Sources must not run');}});
 let payload:any,status=0;const response:any={setHeader(){},status(value:number){status=value;return this;},json(value:any){payload=value;}};
 await handler({method:'POST',headers:{},body:{question:'Can I see my real-time tuition and fee payment status?',userId:'forged',history:[]}},response);
 assert.equal(status,200);assert.equal(payload.status,'handoff');assert.deepEqual(payload.activity.map((s:any)=>s.kind),['authentication']);assert.equal(payload.grounding.source,'directory');
});
