import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import source from '../../server/data/academicRules115.json' with {type:'json'};
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {publicAcademicRulesContext,isPublicGraduationAttendanceQuestion,academicContinuationPolicyProjection} from '../../server/publicAcademicRulesEvidence.js';

test('graduation-attendance context uses actual linked PDF articles and preserves exception scope',async()=>{
 const pdf=await readFile('public'+source.url);
 assert.equal(createHash('sha256').update(pdf).digest('hex'),source.checksum);
 assert.equal(pdf.length,source.bytes);
 const directory=captures.find(row=>row.route===source.directory.url)!;
 assert.equal(createHash('sha256').update(await readFile('public'+directory.file)).digest('hex'),source.directory.checksum);
 assert.equal(source.pageCount,28);
 assert.match(source.part.title,/Day Division/u);
 const context=publicAcademicRulesContext('Can I graduate without attending classes?')!;
 const payload=JSON.parse(context.evidence.content);
 assert.deepEqual(payload.policyRoles.map((row:any)=>row.role),['class_attendance_and_short_absence','semester_suspension','withdrawal_from_study','degree_requirements']);
 const clauses=payload.policyRoles.flatMap((row:any)=>row.clauses);
 for(const clause of clauses){
  const original=source.articles.find(row=>row.article===clause.article)!;
  assert.ok(original.text.includes(clause.quote));
  assert.deepEqual(clause.pageNumbers,original.pageNumbers);
 }
 assert.match(clauses.find((row:any)=>row.article==='23').quote,/shall apply for leave/u);
 assert.match(clauses.find((row:any)=>row.article==='38').quote,/all required and elective credits/u);
 assert.equal(clauses.find((row:any)=>row.article==='38').applicability.degree,'bachelor_only');
 assert.match(clauses.find((row:any)=>row.article==='40').applicability.condition,/extended-study situation/u);
 assert.equal(Object.hasOwn(payload,'part'),false);
 assert.doesNotMatch(JSON.stringify(payload),/Associate Degree Programs/u);
 for(const link of payload.relatedSources)assert.ok(context.additionalEvidence.some(evidence=>evidence.id===link.evidenceId&&evidence.url===link.url));
 assert.deepEqual(payload.relatedSources.find((row:any)=>row.evidenceId==='public-document:study-option:semester_suspension').workflowRoles,['semester_suspension']);
 assert.match(clauses.find((row:any)=>row.article==='40').quote,/enroll in at least one course/u);
 assert.match(payload.scope,/cannot establish a waiver/u);
 assert.equal(context.evidence.id,'public-document:academic-rules-1150202');
 assert.equal(context.additionalEvidence[0].urls?.includes('/school-affairs/services/leave'),true);
 assert.equal(context.additionalEvidence[0].urls?.includes('/school-affairs/services/7-2'),true);
 assert.match(clauses.find((row:any)=>row.article==='25').quote,/one semester at a time/u);
 assert.match(clauses.find((row:any)=>row.article==='30').quote,/procedures and forms for withdrawal/u);
 assert.ok(Buffer.byteLength(JSON.stringify(payload))<7000);
 assert.throws(()=>academicContinuationPolicyProjection({...source,articles:source.articles.filter(row=>row.article!=='25')}),/missing or ambiguous/u);
});

test('general attendance question does not substitute for personal graduation determination',()=>{
 assert.equal(isPublicGraduationAttendanceQuestion('不去上課可以畢業嗎？'),true);
 for(const question of ['Am I eligible to graduate based on my credits?','Can you approve my graduation?','Can another student graduate without attending classes?','What is my attendance record?'])assert.equal(publicAcademicRulesContext(question),null,question);
});
