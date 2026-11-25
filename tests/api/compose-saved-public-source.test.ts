import assert from 'node:assert/strict';
import test from 'node:test';
import {composeSavedPublicSource} from '../../server/composeSavedPublicSource.js';
import type {VerificationCandidate,VerificationProgress} from '../../server/answerVerification.js';
const evidence=[{id:'public-page:one',url:'/guide/',urls:['/guide/','https://www.stu.edu.tw/guide/'],content:'Published guide'}];
const bad=():VerificationCandidate=>({status:'answered',answer:'Use [the guide](/invented/).',citations:[{chunkId:evidence[0].id,url:'/guide/'}]});
const good=():VerificationCandidate=>({...bad(),answer:'Use [the guide](/guide/).'});
const failure=(candidate:unknown=bad())=>Object.assign(Error('Invalid correction'),{code:'CORRECTION_UNSUPPORTED',invalidLinks:true,invalidSourceIds:false,unverifiedCandidate:candidate});
const context=()=>({question:'Where is the guide?',evidence,deadline:55000,responseIntent:'mixed' as const,feedback:['Existing feedback']});

test('saved public composition keeps valid results without a correction or verification promotion',async()=>{
 const candidate=good();let repairs=0;
 const result=await composeSavedPublicSource(context(),{compose:async input=>{assert.equal(input.deadline,28000);return candidate;},repair:async()=>{repairs++;return good();},now:()=>0});
 assert.equal(result,candidate);assert.equal(repairs,0);assert.equal('verification' in result,false);
});
test('one invalid-link correction reuses exact evidence and reserves review time afresh',async()=>{
 const original=context(),events:VerificationProgress[]=[];let clock=0,repairs=0;const broken=bad();
 const result=await composeSavedPublicSource(original,{now:()=>clock,onActivity:event=>events.push(event),
  compose:async input=>{assert.equal(input.evidence,evidence);assert.equal(input.deadline,28000);clock=10000;throw failure(broken);},
  repair:async input=>{repairs++;assert.equal(input.evidence,evidence);assert.equal(input.candidate,broken);assert.equal(input.deadline,33000);assert.equal(input.responseIntent,'mixed');assert.equal(input.feedback?.[0],'Existing feedback');assert.ok(input.feedback?.at(-1)?.includes(JSON.stringify(['/guide/','https://www.stu.edu.tw/guide/'])));return good();}});
 assert.equal(repairs,1);assert.equal(result.answer,good().answer);assert.equal(original.deadline,55000);assert.equal('verification' in result,false);
 assert.deepEqual(events.map(event=>event.status),['running','complete']);
 assert.equal(JSON.stringify(events).includes('/invented/'),false);
});
test('noneligible failures or unsafe error candidates never invoke repair',async()=>{
 const cases=[Object.assign(failure(),{code:'VERIFICATION_TIMEOUT'}),Object.assign(failure(),{invalidLinks:false}),Object.assign(failure(),{invalidSourceIds:true}),
  failure({...bad(),status:'abstained'}),failure({...bad(),verification:undefined}),failure({...bad(),proposedAction:{kind:'publish_announcement'}}),
  failure({...bad(),citations:[{chunkId:'account:profile',url:'/guide/'}]}),failure(good()),Object.assign(Error('No internal candidate'),{code:'CORRECTION_UNSUPPORTED',invalidLinks:true,invalidSourceIds:false})];
 for(const error of cases){let repairs=0;await assert.rejects(composeSavedPublicSource(context(),{compose:async()=>{throw error;},repair:async()=>{repairs++;return good();},now:()=>0}),value=>value===error);assert.equal(repairs,0);}
});
test('private or malformed evidence is rejected before model dependencies run',async()=>{
 for(const rows of [[{id:'account:profile',content:'private'}],[{id:'public-page:one',content:''}],[{id:'public-page:one',content:'public',urls:[7]}]]){
  let calls=0;await assert.rejects(composeSavedPublicSource({...context(),evidence:rows as any},{compose:async()=>{calls++;return good();},repair:async()=>good(),now:()=>0}),/public evidence/u);assert.equal(calls,0);
 }
});
test('a second invalid draft, stale verification or failed repair never escapes and never recurses',async()=>{
 for(const output of [bad(),{...good(),verification:{status:'verified'}},{...good(),citations:[{chunkId:'unknown',url:'/guide/'}]}]){
  let repairs=0;await assert.rejects(composeSavedPublicSource(context(),{compose:async()=>{throw failure();},repair:async()=>{repairs++;return output;},now:()=>0}),/safe draft/u);assert.equal(repairs,1);
 }
 const error=Error('Provider unavailable');let repairs=0;
 await assert.rejects(composeSavedPublicSource(context(),{compose:async()=>{throw failure();},repair:async()=>{repairs++;throw error;},now:()=>0}),value=>value===error);assert.equal(repairs,1);
});


test('expired drafting reserve cannot start a correction and progress failures cannot approve a draft',async()=>{
 let clock=0,repairs=0;const error=failure();
 await assert.rejects(composeSavedPublicSource({...context(),deadline:25000},{now:()=>clock,compose:async()=>{clock=2500;throw error;},repair:async()=>{repairs++;return good();}}),value=>value===error);
 assert.equal(repairs,0);
 const result=await composeSavedPublicSource(context(),{now:()=>0,compose:async()=>{throw failure();},repair:async()=>good(),onActivity:()=>{throw Error('Presentation unavailable');}});
 assert.equal(result.answer,good().answer);assert.equal('verification' in result,false);
});
test('repair cannot reuse the original bad object even after mutating its link',async()=>{
 const candidate=bad();let repairs=0;
 await assert.rejects(composeSavedPublicSource(context(),{now:()=>0,compose:async()=>{throw failure(candidate);},repair:async()=>{repairs++;candidate.answer=good().answer;return candidate;}}),/safe draft/u);
 assert.equal(repairs,1);
});
