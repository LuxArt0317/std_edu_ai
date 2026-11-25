import assert from 'node:assert/strict';
import test from 'node:test';
import document from '../../server/data/housingPolicy.json' with {type:'json'};
import {publicHousingContext} from '../../server/publicHousingEvidence.js';

test('housing source distinguishes continuing enrollment from resuming study',()=>{
 const context=publicHousingContext('What are the dorm fees and how do I apply?');
 assert.ok(context);
 const source=context.additionalEvidence.find(row=>JSON.parse(row.content).terminology);
 assert.ok(source);
 const data=JSON.parse(source.content);
 for(const key of ['continuingStudents','resumingStudents'])assert.ok(data.excerpt.includes(data.terminology[key].sourceLabel));
 assert.ok(data.excerpt.includes(data.terminology.waitlistHeading));
 assert.notEqual(data.terminology.continuingStudents.sourceLabel,data.terminology.resumingStudents.sourceLabel);
 assert.match(data.terminology.resumingStudents.meaning,/resuming study after an interruption/u);
 assert.equal(data.excerptTruncated,false);
});


test('housing duration remains paired to its new-student heading and literal exceptions',()=>{
 const context=publicHousingContext('What are the dorm fees and how do I apply (international students)?');assert.ok(context);
 const evidence=context.additionalEvidence.find(row=>JSON.parse(row.content).durationScope);assert.ok(evidence);
 const data=JSON.parse(evidence.content),applications=document.documents.find(row=>row.kind==='applications');assert.ok(applications);
 const {durationScope,applicationRoutes}=data;
 assert.equal(durationScope.audience,'new students');
 assert.equal(durationScope.sourceHeading.text,'新生申請');
 const headingPosition=applications.sections.findIndex(row=>row.locator===durationScope.sourceHeading.locator);
 const clausePosition=applications.sections.findIndex(row=>row.locator===durationScope.literalClause.locator);
 const nextHeading=applications.sections.findIndex((row,index)=>index>headingPosition&&row.locator.startsWith('html:heading:'));
 assert.ok(clausePosition>headingPosition&&clausePosition<nextHeading);
 assert.equal(applications.sections[clausePosition].text,durationScope.literalClause.text);
 assert.match(durationScope.literalClause.text,/不包括寒、暑假期間/u);
 assert.match(durationScope.applicability,/other applicant groups is not established/u);
 assert.deepEqual(applicationRoutes.map((route:any)=>route.heading.text),['新生申請','舊生申請','後補申請(轉學生/復學生申請)']);
 assert.match(applicationRoutes[1].paragraphs.map((row:any)=>row.text).join('\n'),/每年4月.*5月第一週/u);
 assert.match(applicationRoutes[2].paragraphs.map((row:any)=>row.text).join('\n'),/當學期空床位/u);
 assert.equal(applicationRoutes[1].paragraphs.some((row:any)=>row.locator===durationScope.literalClause.locator),false);
 assert.equal(applicationRoutes[2].paragraphs.some((row:any)=>row.locator===durationScope.literalClause.locator),false);
});
