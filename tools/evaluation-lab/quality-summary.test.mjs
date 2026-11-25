import test from 'node:test';import assert from 'node:assert/strict';
import {questionQuality,qualityOverview,matchesQuality} from './quality-summary.mjs';
const item={id:'q',version:2};
const run=(overrides={})=>({caseId:'q',caseVersion:2,model:'a',statusCode:200,createdAt:'2026-01-02',judge:{score:80},...overrides});
test('uses AI score, not contract match, and scopes to the selected model',()=>{
 const rows=[run({matchScore:0}),run({model:'b',judge:{score:20},createdAt:'2026-01-03'})];
 assert.equal(questionQuality(item,rows,'a').score,80);assert.equal(questionQuality(item,rows).score,20);
});
test('latest failure or unreviewed attempt does not inherit an old passing score',()=>{
 assert.equal(questionQuality(item,[run(),run({createdAt:'2026-01-03',judge:null})]).status,'unreviewed');
 assert.equal(questionQuality(item,[run(),run({createdAt:'2026-01-03',error:'failed'})]).score,null);
});
test('old references, archived questions and unrun questions do not inflate the average',()=>{
 const result=qualityOverview([item,{id:'old',version:3},{id:'new',version:1},{id:'deleted',version:1,archivedAt:'date'}],[run(),run({caseId:'old',judge:{score:100}}),run({caseId:'deleted',caseVersion:1,judge:{score:100}})]);
 assert.equal(result.total,3);assert.equal(result.reviewed,1);assert.equal(result.average,80);assert.equal(result.outdated,1);assert.equal(result.unrun,1);
});
test('zero scores and inclusive range endpoints are handled correctly',()=>{
 const zero=questionQuality(item,[run({judge:{score:0}})]),target=questionQuality(item,[run({judge:{score:70}})]);
 assert.equal(zero.score,0);assert.equal(matchesQuality(zero,'below70'),true);assert.equal(matchesQuality(target,'custom',70,85),true);
 assert.equal(questionQuality(item,[run({response:{verification:{status:'unverified'}}})]).meetsTarget,false);
});
