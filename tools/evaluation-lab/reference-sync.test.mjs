import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncReferenceCases,referenceFingerprint} from './reference-sync.mjs';
import {evaluationLabCases,faqDocumentHash} from './cases.mjs';
const source={id:'survey-faq-q01',question:'Updated question?',expectedAnswer:'Updated reference.',domain:'fees',route:'/fees',scope:'public',endpoint:'/api/research-assistant',referenceOrigin:'README source',version:1,enabled:true,expected:{requiredText:[]}};
const options={version:'v2',documentHash:'hash',at:'2026-11-25T00:00:00Z'};
test('source revisions preserve immutable runs, old references, custom cases and flags',()=>{
 const old={...source,question:'Old question?',expectedAnswer:'Old reference.',version:4,enabled:false,archivedAt:'saved-date',attachments:[{id:'image'}]};
 const run={id:'run-1',caseId:old.id,caseVersion:4,expectedAnswer:old.expectedAnswer,question:old.question,model:'model-a',judge:{score:65}};
 const custom={id:'custom-1',question:'Custom',expectedAnswer:'Custom answer',version:3};const state={cases:[old,custom],runs:[run]};const before=JSON.stringify(run);
 const changes=syncReferenceCases(state,[source],options);
 assert.equal(state.cases[0].version,5);assert.equal(state.cases[0].expectedAnswer,source.expectedAnswer);
 assert.equal(state.cases[0].enabled,false);assert.equal(state.cases[0].archivedAt,'saved-date');assert.deepEqual(state.cases[0].attachments,[{id:'image'}]);
 assert.deepEqual(state.cases[1],custom);assert.equal(JSON.stringify(state.runs[0]),before);assert.equal(state.referenceHistory[0].expectedAnswer,'Old reference.');assert.equal(changes.length,1);
});
test('unchanged source is idempotent and does not undo a lab CRUD edit',()=>{
 const edited={...source,expectedAnswer:'User edited reference.',version:2,referenceFingerprint:referenceFingerprint(source)};const state={cases:[edited],runs:[]};
 assert.deepEqual(syncReferenceCases(state,[source],options),[]);assert.equal(state.cases[0].expectedAnswer,'User edited reference.');assert.equal(state.cases[0].version,2);
});
test('new document questions are added without replacing existing collections',()=>{
 const state={cases:[],runs:[{id:'historic'}]};syncReferenceCases(state,[source],options);assert.equal(state.cases.length,1);assert.equal(state.runs.length,1);assert.equal(state.cases[0].version,1);
});
test('the canonical README supplies 53 unique questions, complete answers and explicit scopes/routes',()=>{
 const cases=evaluationLabCases();assert.equal(cases.length,53);assert.equal(new Set(cases.map(c=>c.id)).size,53);assert.equal(cases.filter(c=>c.scope==='account').length,12);assert.match(faqDocumentHash(),/^[a-f0-9]{64}$/);
 for(const entry of cases){assert.ok(entry.question.length>2);assert.ok(entry.expectedAnswer.length>30);assert.match(entry.route,/^\/(?!\/)[^\s#]*$/);assert.doesNotMatch(entry.expectedAnswer,/evaluation-lab-config|Maintainer notes/);assert.match(entry.referenceOrigin,/docs\/question-answer\/README.md/);}
 assert.equal(cases.find(c=>c.id==='survey-faq-q16').scope,'account');assert.equal(cases.find(c=>c.id==='survey-faq-q47').route,'/%E9%97%9C%E6%96%BC%E6%A8%B9%E5%BE%B7/');
});
