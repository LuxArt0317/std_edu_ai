import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccountJudgeEvidence} from '../../server/accountJudgeEvidence.js';
const id='10000000-0000-4000-8000-000000000001';
const account={user:{id},url:'https://test.supabase.co',key:'PRIVATEKEY',token:'PRIVATETOKEN'};
const row={id:'survey-faq-q03',version:2,scope:'account',question:'Can I see my real-time tuition and fee payment status?',route:'/school-affairs/services/39-1'};
const run={caseId:row.id,caseVersion:2,scope:'account',question:row.question,actor:{id},verification:{status:'verified'},views:[{amount:'invented'}]};
const snapshot={checkedAt:'2026-11-25T00:00:00.000Z',profile:{userId:id},studentRecordFound:true,charges:[]};
test('owned current charge read requires exact projection and ignores saved views and verification',async()=>{
 let reads=0;const result=await resolveAccountJudgeEvidence(account,run,row,{loadCharges:async(caller,options)=>{reads++;assert.equal(caller.user.id,id);assert.equal(options?.requireExactProjection,true);assert.ok(options!.deadline!<=Date.now()+5000);return snapshot;}});
 assert.equal(reads,1);assert.ok(result.evidence.some(item=>item.id==='account:charges'));
 assert.equal(result.summary.actorAttested,false);assert.equal(result.summary.temporalComparability,'current-reconstruction-only');
 assert.doesNotMatch(JSON.stringify(result),/invented|PRIVATEKEY|PRIVATETOKEN/u);
 assert.equal(result.summary.routeResolution,'explicit_matching_case_snapshot');
});
test('different caller, missing auth and case/route drift never read records',async()=>{
 const loadCharges=async()=>assert.fail('unauthorized read');
 for(const [caller,item,version] of [[null,run,row],[account,{...run,actor:{id:'foreign'}},row],[account,run,{...row,version:3}],[account,{...run,route:'/dtm'},row],[account,run,null]] as const){
  const result=await resolveAccountJudgeEvidence(caller,item,version,{loadCharges});assert.deepEqual(result.evidence,[]);assert.ok(result.summary.reason);
 }
});
test('failed and crossed-owner reads stay unavailable rather than empty',async()=>{
 for(const loadCharges of [async()=>{throw Error('SECRET transport');},async()=>({...snapshot,profile:{userId:'foreign'}})]){
  const result=await resolveAccountJudgeEvidence(account,run,row,{loadCharges});assert.equal(result.summary.reason,'read_unavailable');assert.deepEqual(result.evidence,[]);assert.doesNotMatch(JSON.stringify(result),/SECRET/u);
 }
});
test('actual selected amounts enter only ephemeral evidence; summary contains hashes, not account values',async()=>{
 const charges=[{id:'10000000-0000-4000-8000-000000000002',label:'Private tuition item',amountDue:12345.67,amountPaid:2345.67,currency:'TWD',sourceMode:'sample',dueOn:null,occurrenceOn:null,category:null,contactUnit:null,contactExtension:null,paymentUnit:null}];
 const result=await resolveAccountJudgeEvidence(account,{...run,route:row.route},row,{loadCharges:async()=>({...snapshot,charges})});
 assert.equal(result.summary.reason,null);
 const record=JSON.parse(result.evidence.find(item=>item.id==='account:charges')!.content);
 assert.equal(record.records[0].amountDue,12345.67);assert.equal(record.records[0].amountPaid,2345.67);
 assert.doesNotMatch(JSON.stringify(result.summary),/Private tuition|12345|2345|PRIVATEKEY|PRIVATETOKEN/u);
 assert.ok(result.summary.sources.every((item:any)=>/^[a-f0-9]{64}$/u.test(item.checksum)));
});
test('only exact current or retained case versions resolve; no silent current-version fallback',async()=>{
 const {accountJudgeCaseSnapshot}=await import('../../server/accountJudgeEvidence.js');
 assert.equal(accountJudgeCaseSnapshot({cases:[{...row,version:3}]},run),null);
 assert.equal(accountJudgeCaseSnapshot({cases:[{...row,version:3}],referenceHistory:[{...row,id:undefined,caseId:row.id}]},run)?.route,row.route);
 assert.equal(accountJudgeCaseSnapshot({cases:[row],referenceHistory:[{...row,id:undefined,caseId:row.id,route:'/dtm'}]},run),null);
});
