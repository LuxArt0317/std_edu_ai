import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import source from '../../server/data/academicStudyOptions.json' with {type:'json'};
import {publicAcademicStudyOptionEvidence} from '../../server/publicAcademicStudyOptions.js';
import {graduationReviewQueryKind,graduationReviewPath} from '../../server/graduationReview.js';
import {curriculumPlansPath,curriculumTable,curriculumDocument} from '../../src/features/public/affairs/curriculumPlans.js';
import {publicAcademicRulesContext} from '../../server/publicAcademicRulesEvidence.js';

test('study-option procedure clauses come from the actual linked and pinned PDFs',async()=>{
 const evidence=publicAcademicStudyOptionEvidence();
 assert.equal(evidence.length,2);
 for(const document of source.documents){
  const bytes=await readFile('public'+document.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),document.checksum);
  assert.equal(bytes.length,document.bytes);
  const record=JSON.parse(evidence.find(row=>row.url===document.url)!.content);
  for(const clause of record.clauses){
   const section=document.sections.find(row=>row.article===clause.article)!;
   assert.ok(section.text.includes(clause.quote));
   assert.deepEqual(clause.pageNumbers,section.pageNumbers);
  }
  assert.equal(record.resourceType,'published_procedure_pdf');
  assert.match(record.coverage,/not a native semester-status application/u);
 }
 const suspension=JSON.parse(evidence[0].content);
 assert.match(suspension.clauses[0].quote,/教務處註冊課務組登記領取休學離校手續申請表/u);
 assert.match(suspension.clauses[0].quote,/經核准始生效/u);
 const transfer=JSON.parse(evidence[1].content);
 assert.match(transfer.clauses[0].quote,/原校修讀之成績單或證明書/u);
 assert.match(transfer.clauses[1].quote,/在校修業不得少於一年/u);
});

test('public academic context supplies real process documents separately from native forms and class leave',()=>{
 const context=publicAcademicRulesContext('Can I graduate without attending classes?')!;
 const sources=context.additionalEvidence;
 assert.equal(sources.filter(row=>row.id.startsWith('public-document:study-option:')).length,2);
 assert.ok(sources.every(row=>!row.urls?.includes('/school-affairs/services/6-4')));
 const native=JSON.parse(sources.find(row=>row.id==='published-guidance')!.content);
 assert.deepEqual(native.services.find((row:any)=>row.url==='/school-affairs/services/7-2').relatedPolicyRoles,['credit_transfer']);
 assert.deepEqual(native.services.find((row:any)=>row.url==='/school-affairs/services/leave').relatedPolicyRoles,['class_attendance_and_short_absence']);
 const metadata=JSON.parse(context.evidence.content);
 assert.equal(metadata.policyRoles.find((role:any)=>role.role==='semester_suspension').procedureEvidenceId,'public-document:study-option:semester_suspension');
});

test('programme requirements navigation is a real curriculum resource and15-1 is only the current-review alias',()=>{
 const context=publicAcademicRulesContext('Can I graduate without attending classes?')!;
 const native=context.additionalEvidence.find(source=>source.id==='published-guidance')!;
 const services=JSON.parse(native.content).services;
 const review=services.find((service:any)=>service.url===graduationReviewPath);
 assert.deepEqual(review.aliases,['/school-affairs/services/15-1']);
 const history=[{role:'user',content:'Show my legacy graduation review'}];
 assert.equal(graduationReviewQueryKind('status',review.aliases[0],history),graduationReviewQueryKind('status',graduationReviewPath,history));
 assert.equal(graduationReviewQueryKind('status','',history),'legacy');
 const plans=services.find((service:any)=>service.url===curriculumPlansPath);
 assert.ok(plans);
 assert.match(plans.capability,/programme\/document-specific/u);
 assert.match(plans.capability,/no universal activity or placement requirement/u);
 const table=curriculumTable('1')!;
 const cell=table.rows.flat().find(cell=>typeof cell!=='string');
 assert.ok(cell&&typeof cell!=='string');
 assert.ok(curriculumDocument(cell.code));
 assert.ok(native.urls?.includes(curriculumPlansPath));
 assert.ok(native.urls?.includes('/school-affairs/services/15-1'));
});
