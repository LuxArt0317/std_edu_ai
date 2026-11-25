import assert from 'node:assert/strict';
import test from 'node:test';
import {publicProspectusContext} from '../../server/publicProspectusEvidence.js';
import {studentServiceByKey} from '../../src/features/public/affairs/studentServices.js';

test('deduction questions retain the actual financial notes and separate native record navigation',()=>{
 const context=publicProspectusContext('How is the tuition deduction for scholars calculated?','/source-documents/ipiac-115/index.html');
 assert.ok(context);
 const metadata=JSON.parse(context.evidence.content);
 assert.ok(metadata.selectedPages.includes('pdf:page:31'));
 assert.match(metadata.excerpt,/disbursed in the following semester/u);
 assert.match(metadata.coverage,/not another cohort/u);
 assert.deepEqual(metadata.financialArithmetic.laterSemesterConditionalTuition.map((row:{netTuition:number})=>row.netTuition),[33390,43390,50390]);
 assert.equal(metadata.financialArithmetic.firstSemester.arithmeticChecks[0].discrepancy,0);
 assert.equal(metadata.financialArithmetic.firstSemester.arithmeticChecks[1].discrepancy,53390);
 assert.ok(context.additionalEvidence?.length);
 const native=JSON.parse(context.additionalEvidence[0].content);
 assert.equal(context.additionalEvidence[0].id,'published-guidance');
 for(const service of native.services){assert.equal(service.requiresSignIn,true);assert.ok(studentServiceByKey(service.url.split('/').at(-1)));}
 assert.match(native.scope,/no caller records were read/u);
});

test('language eligibility does not inherit unrelated financial navigation',()=>{
 const context=publicProspectusContext('Does IPIAC require Mandarin to enroll?');
 assert.ok(context);assert.equal(context.additionalEvidence,undefined);
});
