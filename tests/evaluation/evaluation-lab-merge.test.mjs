import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeEvaluationLabStates,labDigest,validateLabAttachments} from '../../scripts/lib/evaluation-lab-merge.mjs';
const question={id:'q1',version:1,referenceFingerprint:'reference-a',question:'Question',expectedAnswer:'Expected'};
const judge=createdAt=>({score:70,model:'judge',createdAt});
const run={id:'r1',caseId:'q1',caseVersion:1,question:'Question',expectedAnswer:'Expected',model:'answer-model',response:{answer:'Actual'},createdAt:'2026-11-01'};
const state=(cases=[question],runs=[])=>({version:1,cases,runs,faqDocumentHash:'cloud-metadata'});
test('merge preserves newer cloud cases and reports same-ID reference/version conflicts',()=>{
 const cloud=state([{...question,version:2,referenceFingerprint:'new',expectedAnswer:'Cloud edit'}]);
 const result=mergeEvaluationLabStates(state(),cloud);
 assert.equal(result.canApply,false);assert.equal(result.conflicts[0].kind,'case');assert.deepEqual(result.state,cloud);
});
test('disjoint runs and cases append without deleting cloud records or metadata',()=>{
 const cloud=state([question],[run]),local=state([{...question,id:'q2'}],[{...run,id:'r2',caseId:'q2'}]);
 const result=mergeEvaluationLabStates(local,cloud);
 assert.equal(result.canApply,true);assert.equal(result.state.cases.length,2);assert.equal(result.state.runs.length,2);assert.equal(result.state.faqDocumentHash,'cloud-metadata');
 assert.deepEqual(cloud,state([question],[run]));
});
test('same run merges complete judge history and retains the newest cloud judge',()=>{
 const early=judge('2026-11-01'),later=judge('2026-11-20');
 const result=mergeEvaluationLabStates(state([question],[{...run,judge:early}]),state([question],[{...run,judge:later}]));
 assert.equal(result.canApply,true);assert.equal(result.state.runs[0].judgeHistory.length,2);assert.deepEqual(result.state.runs[0].judge,later);
 assert.equal(mergeEvaluationLabStates(result.state,result.state).state.runs[0].judgeHistory.length,2);
});
test('run-content collisions block apply, preserve cloud payload and expose only digests',()=>{
 const result=mergeEvaluationLabStates(state([question],[{...run,response:{answer:'Conflicting'}}]),state([question],[run]));
 assert.equal(result.canApply,false);assert.deepEqual(result.state.runs[0],run);assert.doesNotMatch(JSON.stringify(result.conflicts),/Conflicting|Actual/u);
 assert.equal(result.conflicts[0].cloudDigest,labDigest(run));
});
test('duplicate stable IDs fail and equal-version edited cases cannot silently overwrite',()=>{
 assert.throws(()=>mergeEvaluationLabStates(state([question,question]),state()),/duplicate/u);
 assert.equal(mergeEvaluationLabStates(state([{...question,question:'Edited'}]),state()).canApply,false);
});

test('new runs must bind an existing case and matching current reference',()=>{
 for(const change of [{caseId:'missing'},{expectedAnswer:'Different'},{question:'Other'},{caseVersion:0},{caseVersion:2}]){
  const result=mergeEvaluationLabStates(state([question],[{...run,...change}]),state());
  assert.equal(result.canApply,false);assert.equal(result.state.runs.length,0);
 }
});
test('older run snapshots remain historical and conflicting retained history blocks import',()=>{
 const newer={...question,version:2};
 const result=mergeEvaluationLabStates(state([newer],[run]),state([newer]));
 assert.equal(result.canApply,true);assert.equal(result.state.runs[0].caseVersion,1);assert.equal(result.warnings[0].reason,'reference_history_unavailable');
 const cloud={...state([newer]),referenceHistory:[{caseId:question.id,version:1,question:'Question',expectedAnswer:'Different'}]};
 assert.equal(mergeEvaluationLabStates(state([newer],[run]),cloud).canApply,false);
});
test('encoded attachment item and workspace limits match database RPC contract',()=>{
 assert.deepEqual(validateLabAttachments([{id:'a',content:'A'.repeat(32)}]),{items:1,encodedBytes:32});
 assert.throws(()=>validateLabAttachments([{id:'a',content:'A'.repeat(2000004)}]),/item limit/u);
 assert.throws(()=>validateLabAttachments(Array.from({length:26},(_,i)=>({id:String(i),content:'A'.repeat(2000000)}))),/workspace limit/u);
 assert.throws(()=>validateLabAttachments([{id:'a',content:'not base64!'}]),/encoding/u);
});
