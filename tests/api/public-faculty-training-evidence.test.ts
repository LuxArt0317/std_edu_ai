import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import source from '../../server/data/facultyTrainingSource.json' with {type:'json'};
import {extractFacultyTrainingSources} from '../../scripts/import-faculty-training-source.mjs';
import {isPublicFacultyTrainingQuestion,publicFacultyTrainingContext} from '../../server/publicFacultyTrainingEvidence.js';

test('faculty training projections bind to all three actual captures and omit unrelated gallery/template text',async()=>{
 const inputs:Record<string,string>={};
 for(const [role,document] of Object.entries(source.documents)){
  const bytes=await readFile('public'+document.captureFile);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),document.checksum);
  inputs[role+'Html']=bytes.toString('utf8');
 }
 const extracted=extractFacultyTrainingSources(inputs as {facultyHtml:string;exchangeHtml:string;noticeHtml:string});
 assert.deepEqual(extracted,Object.fromEntries(Object.entries(source.documents).map(([role,document])=>[role,document.sections])));
 assert.ok(extracted.faculty.serviceLinks.some(link=>link.label==='人力資源網'));
 assert.match(extracted.exchange.purpose,/兩岸師資交流/u);
 assert.ok(extracted.exchange.conditions.some(text=>/15位以上教師/u.test(text)));
 assert.ok(extracted.exchange.conditions.some(text=>/至少1週/u.test(text)));
 assert.doesNotMatch(JSON.stringify(extracted.exchange),/support@sitename.com|2019年|800 2345/u);
});
test('broad training discovery keeps exchange service and unread dated-event registration distinct',()=>{
 const context=publicFacultyTrainingContext('What training courses can teachers join, and where do I register?')!;
 assert.equal(context.additionalEvidence.length,2);
 const entry=JSON.parse(context.evidence.content),exchange=JSON.parse(context.additionalEvidence[0].content),notice=JSON.parse(context.additionalEvidence[1].content);
 assert.ok(entry.serviceLabels.includes('人力資源網'));
 assert.equal(exchange.conditions,undefined);
 assert.equal(notice.date,source.documents.notice.sections.date);
 assert.equal(notice.time,source.documents.notice.sections.time);
 assert.equal(notice.location,source.documents.notice.sections.location);
 assert.deepEqual(notice.registration.publishedButtonLabels,['【請點我報名】']);
 assert.equal(notice.registration.distinctDestinations,2);
 assert.equal(notice.registration.destinationBodiesRead,false);
 assert.equal(notice.registration.verifiedDirectRegistrationUrl,null);
 assert.equal(context.additionalEvidence[1].url,'/latestnews-single/?id=234451');
 assert.doesNotMatch(JSON.stringify([context.evidence,...context.additionalEvidence]),/GetActionDetail|HR\/hrindex|support@sitename/u);
 const focused=publicFacultyTrainingContext('What are the group conditions for teacher exchange training?')!;
 assert.equal(JSON.parse(focused.additionalEvidence[0].content).conditions.length,4);
 const schedule=publicFacultyTrainingContext('When is the tutor training workshop?')!;
 assert.equal(JSON.parse(schedule.additionalEvidence[1].content).date,'日期：115年12月1日（二）');
});
test('public faculty training discovery cannot answer personal status or execute registration',()=>{
 assert.equal(isPublicFacultyTrainingQuestion('What teacher workshops are available?'),true);
 for(const question of ['Am I registered for teacher training?','Register for teacher training for me.','Enroll me in a faculty workshop.','Show another teacher training attendance.','How do students submit an assignment?'])assert.equal(publicFacultyTrainingContext(question),null);
 assert.throws(()=>extractFacultyTrainingSources({facultyHtml:'<main>No service cards</main>',exchangeHtml:'',noticeHtml:''}),/Faculty service cards missing/u);
});

test('overview omissions do not imply the source lacks group or course-planning sections',()=>{
 const context=publicFacultyTrainingContext('What training courses can teachers join, and where do I register?')!;
 const exchange=JSON.parse(context.additionalEvidence[0].content);
 assert.equal(exchange.sourceSectionPresence.coursePlanningBullets,true);
 assert.equal(exchange.sourceSectionPresence.groupApplicationConditions,true);
 assert.equal(exchange.courseItems,undefined);
 assert.match(exchange.selectionScope,/Omission here is not absence/u);
});
