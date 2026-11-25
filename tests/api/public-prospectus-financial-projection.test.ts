import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import document from '../../server/data/ipiac115.json' with {type:'json'};
import {extractProspectusFinancialProjection,publicProspectusFinancialProjection} from '../../server/publicProspectusFinancialProjection.js';

test('financial calculations use checksum-verified fee and obligations source, retaining conflicting publication arithmetic',async()=>{
 assert.equal(createHash('sha256').update(await readFile('public'+document.pdfUrl)).digest('hex'),document.checksum);
 const result=publicProspectusFinancialProjection();
 assert.equal(result.firstSemester.tuition,53390);
 assert.equal(result.firstSemester.reducedTuition,0);
 assert.deepEqual(result.laterSemesterConditionalTuition.map(tier=>[tier.award,tier.netTuition]),[[20000,33390],[10000,43390],[3000,50390]]);
 assert.deepEqual(result.firstSemester.arithmeticChecks.map(row=>[row.result,row.published,row.discrepancy]),[[78248,78248,0],[24858,78248,53390]]);
 assert.match(result.provenance.yearLabels,/114/u);assert.match(result.provenance.yearLabels,/115/u);assert.match(result.provenance.yearLabels,/2025/u);
 assert.equal(result.dormitorySubsidy.maximum,11000);assert.equal(result.dormitorySubsidy.timing,'following semester');
 for(const tier of result.laterSemesterConditionalTuition)assert.ok(document.pages.find(page=>page.locator==='pdf:page:29')!.text.includes(tier.sourceText));
});
test('source changes drive calculation rather than a fixed expected answer',()=>{
 const pages=document.pages.map(page=>({...page,text:page.locator==='pdf:page:29'?page.text.replaceAll('53,390','54,390').replace('0 11,000','0 11,000'):page.text}));
 const result=extractProspectusFinancialProjection(pages);
 assert.equal(result.laterSemesterConditionalTuition[0].netTuition,34390);
 assert.equal(result.firstSemester.arithmeticChecks[0].discrepancy,-1000);
});
test('missing, duplicate or altered source boundaries fail closed',()=>{
 assert.throws(()=>extractProspectusFinancialProjection([]),/boundary/u);
 const annex=document.pages.find(page=>page.locator==='pdf:page:29')!;
 assert.throws(()=>extractProspectusFinancialProjection([...document.pages,annex]),/ambiguous/u);
 assert.throws(()=>extractProspectusFinancialProjection(document.pages.map(page=>({...page,text:page.text.replace('〔 notes 5 〕','notes removed')}))),/fee row/u);
 assert.throws(()=>extractProspectusFinancialProjection(document.pages.map(page=>({...page,text:page.text.replace('disbursed in the following semester','timing unspecified')}))),/timing/u);
});
