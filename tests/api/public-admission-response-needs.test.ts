import assert from 'node:assert/strict';
import test from 'node:test';
import {publicAdmissionResponseNeeds} from '../../server/publicAdmissionResponseNeeds.js';
import {publicProspectusContext} from '../../server/publicProspectusEvidence.js';
import {publicEnrollmentContext} from '../../server/publicEnrollmentEvidence.js';

test('language guidance covers only source-present admission requirements and preserves cohort',()=>{
 const q='Do international students need Mandarin to enroll?';
 const context=publicProspectusContext(q)!;
 const notes=publicAdmissionResponseNeeds(q,[context.evidence]);
 assert.match(notes.join('\n'),/teaching language/u);
 assert.match(notes.join('\n'),/exemptions and alternative supporting evidence/u);
 assert.match(notes.join('\n'),/earlier cohorts/u);
 assert.doesNotMatch(notes.join('\n'),/B1|A2|2026|115-entry/u);
 const data=JSON.parse(context.evidence.content);data.excerpt='A source without language requirements';delete data.coverage;
 assert.deepEqual(publicAdmissionResponseNeeds(q,[{...context.evidence,content:JSON.stringify(data)}]),[]);
});

test('milestone guidance asks unresolved selectors and keeps paired deadlines and event roles',()=>{
 const q='When does enrollment start?';
 const context=publicEnrollmentContext(q)!;
 const notes=publicAdmissionResponseNeeds(q,[context.evidence]);
 assert.equal(notes.length,3);
 assert.match(notes.join('\n'),/historical example/u);
 assert.match(notes.join('\n'),/paired document-submission deadline/u);
 assert.match(notes.join('\n'),/not an application or registration opening/u);
 assert.doesNotMatch(notes.join('\n'),/2026|115|August|September/u);
 const scoped=publicEnrollmentContext('When do IPIAC admissions open in 2026?')!;
 assert.doesNotMatch(publicAdmissionResponseNeeds('When do IPIAC admissions open in 2026?',[scoped.evidence]).join('\n'),/Ask for the unresolved/u);
});

test('unknown or omitted milestone rows never receive fabricated timelines',()=>{
 const q='When does enrollment start in 2025?';
 const context=publicEnrollmentContext(q)!;
 assert.ok(publicAdmissionResponseNeeds(q,[context.evidence]).every(note=>!note.includes('paired document-submission')));
 assert.deepEqual(publicAdmissionResponseNeeds(q,[{...context.evidence,id:'untrusted'}]),[]);
 assert.deepEqual(publicAdmissionResponseNeeds(q,[{...context.evidence,content:'invalid'}]),[]);
 assert.deepEqual(publicAdmissionResponseNeeds('What clubs exist?',[context.evidence]),[]);
});

test('language source projection includes literal bounded graduation and scholarship clauses',()=>{
 const q='Do international students need Mandarin to enroll?';
 const context=publicProspectusContext(q)!;
 const data=JSON.parse(context.evidence.content);
 assert.ok(data.selectedPages.includes('pdf:page:31'));
 const graduation=data.excerpt.slice(data.excerpt.indexOf('pdf:page:31'));
 assert.match(graduation,/6\. 依照教育部規定/u);
 assert.match(graduation,/before graduation/u);
 assert.match(graduation,/Failure to obtain A2 before the third semester/u);
 assert.doesNotMatch(graduation,/8\. 校外實習課程|53,390/u);
 assert.match(data.languageSectionRoles['pdf:page:31'],/scope/u);
 const notes=publicAdmissionResponseNeeds(q,[context.evidence]);
 assert.match(notes.join('\n'),/never infer a global absence/u);
 assert.match(notes.join('\n'),/positive obligations/u);
 assert.ok(notes.every(note=>note.length<=650));
});


test('program approval year stays attached to literal language obligation instead of entry cohort',()=>{
 const question='Do international students need Mandarin to enroll?';
 const context=publicProspectusContext(question)!;const data=JSON.parse(context.evidence.content);
 assert.equal(data.languageObligationClauses.length,2);
 assert.deepEqual(data.languageObligationClauses.map((clause:any)=>clause.paragraph),['6','7']);
 assert.match(data.languageObligationClauses[0].text,/newly approved Degree Program starting from 2023 academic year/u);
 assert.match(data.languageObligationClauses[0].text,/before graduation/u);
 assert.doesNotMatch(data.languageObligationClauses[0].text,/Failure to obtain/u);
 assert.match(data.languageObligationClauses[1].text,/Failure to obtain A2 before the third semester/u);
 assert.ok(data.languageObligationClauses.every((clause:any)=>clause.locator==='pdf:page:31'&&data.excerpt.includes(clause.text)));
 const notes=publicAdmissionResponseNeeds(question,[context.evidence]);
 assert.ok(notes.some(note=>/entry cohort is not evidence of when a program was approved/u.test(note)));
 assert.doesNotMatch(notes.join('\n'),/2023|112|A2|B1/u);
 const other=JSON.parse(publicProspectusContext('How much are IPIAC tuition fees?')!.evidence.content);
 assert.equal(other.languageObligationClauses,undefined);
});
