import assert from 'node:assert/strict';
import {test} from 'node:test';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {buildServiceCases,serviceCapabilities,serviceCapabilityGaps,serviceNoteFixture,serviceNativeFactContract} from './service-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

test('every catalog link has navigation, own-record, empty-record and action-boundary criteria',()=>{
  const cases=buildServiceCases();
  assert.equal(new Set(cases.map(item=>item.id)).size,cases.length);
  assert.equal(cases.length,schoolServiceEntries.length*4);
  assert.equal(Object.keys(serviceCapabilities).length,schoolServiceEntries.length);
  for(const service of schoolServiceEntries){
    const suite=cases.filter(item=>item.serviceId===service.id);
    assert.deepEqual(suite.map(item=>item.mode),['navigation','record','empty','action-boundary']);
    assert.equal(suite[0].expected.requiredLinks[0],service.localUrl);
    for(const item of suite){assert.ok(item.question.length>10);assert.ok(item.fixtureKey);assert.ok(item.capability.limitation);}
  }
});

test('generic tracker success cannot erase missing service workflow capability',()=>{
  const gaps=serviceCapabilityGaps();
  for(const id of ['27-1','28-1','30-1','30-2','31-1','31-2','32-1','34-2','35-1','37-1','38-1']){
    assert.equal(serviceCapabilities[id].level,'generic-tracker');
    assert.ok(gaps.some(row=>row.serviceId===id&&/No structured/.test(row.limitation)));
    const fixture=serviceNoteFixture(id,'own-account');
    assert.equal(fixture.userId,'own-account');assert.equal(fixture.serviceKey,id);
    assert.match(fixture.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(fixture.recordType,'note');assert.equal(fixture.status,'draft');
    assert.equal(fixture.startsOn,null);assert.equal(fixture.reviewStatus,null);
    assert.ok(fixture.notes.includes(`QA-${id}`));
    const record=buildServiceCases().find(row=>row.serviceId===id&&row.mode==='record');
    assert.equal(record.expected.behavior,'answer');assert.ok(record.expected.requiredText.length);
    assert.equal(record.expected.provenance,'personal');
  }
  assert.throws(()=>serviceNoteFixture('34-1'),TypeError);
  assert.equal(serviceCapabilities['36-1'].level,'partial');
  assert.ok(gaps.some(row=>row.serviceId==='36-1'&&/metadata/.test(row.limitation)));
  assert.throws(()=>serviceNoteFixture('36-1'),TypeError);
  assert.equal(serviceCapabilities['29-1'].level,'partial');
  assert.ok(gaps.some(row=>row.serviceId==='29-1'&&/appointment/.test(row.limitation)));
  assert.equal(serviceNoteFixture('29-1').recordType,'note');
});

test('native lookup criteria include literal evidence and never treat catalog as enrollment',()=>{
  for(const [serviceId,contract] of Object.entries(serviceNativeFactContract)){
    assert.ok(contract.requiredText.length>0,serviceId);
    assert.ok(buildServiceCases().find(row=>row.serviceId===serviceId&&row.mode==='record').expected.facts.length>0,serviceId);
    assert.equal(buildServiceCases().find(row=>row.serviceId===serviceId&&row.mode==='record').fixtureKey,contract.fixtureKey);
  }
  const catalog=buildServiceCases().find(row=>row.serviceId==='12-4'&&row.mode==='record');
  assert.equal(catalog.expected.behavior,'unavailable');
  assert.equal(catalog.fixtureRequirement,'published_catalog_binding');
  assert.deepEqual(catalog.expected.requiredTools,['courseCatalog']);
  assert.ok(serviceCapabilityGaps().some(row=>row.serviceId==='12-4'&&/independently bound existing published/.test(row.limitation)));
  assert.doesNotMatch(serviceCapabilities['12-4'].limitation,/no catalog read tool|not registered/);
  const officialChanges=buildServiceCases().filter(row=>row.mode==='action-boundary');
  assert.ok(officialChanges.every(row=>row.expected.behavior==='unavailable'&&(row.expected.forbiddenText.length||row.expected.noAction===true&&row.plannedFixture?.expectedNativeReadCalls===0)));
});

test('certificate coverage cannot pass using unrelated student identity fields',()=>{
  const certificate=buildServiceCases().filter(row=>row.serviceId==='17-1');
  const record=certificate.find(row=>row.mode==='record');
  assert.equal(record.domain,'enrollmentCertificate');
  assert.equal(record.expected.behavior,'answer');
  assert.deepEqual(record.expected.requiredTools,['enrollmentCertificate']);
  assert.equal(serviceNativeFactContract['17-1'].fixtureKey,'enrollmentCertificate');
  assert.equal(certificate.find(row=>row.mode==='empty').fixtureKey,'empty:enrollmentCertificate');
  assert.match(record.capability.limitation,/PDF downloads remain unsupported/);
  for(const row of certificate)assert.doesNotThrow(()=>fixtureForCase(row));
  const result=gradeCase(record,{statusCode:200,execution:'deterministic',fixtureKey:record.fixtureKey,
    body:{status:'answered',answer:'Your sample student number is EVAL-115-001. Your program is Information Studies. [Enrollment certificate](/school-affairs/services/17-1)',
      citations:[{chunkId:'account:profile',url:'/school-affairs/services/17-1'}],verification:{status:'verified',attempts:1}}});
  assert.equal(result.passed,false);
  assert.ok(result.failures.some(row=>row.id.startsWith('fact.')));
});

test('readable certificate assessment never removes official file or assistant upload capability gaps',()=>{
  const cases=buildAccountCases();
  for(const id of ['enrollment-certificate-gap','actual-file-submission-gap','action-upload-gap','tuition-summer-file-gap','tuition-extended-gap']){
    const row=cases.find(item=>item.id==='account:'+id);
    assert.ok(row,id);assert.equal(row.capability.gap,true);assert.equal(row.expected.behavior,'unavailable');
    assert.doesNotMatch(row.capability.limitation,/unmounted|no backend|UI .*pending/i);
  }
  const assessment=cases.find(row=>row.id==='account:certificate-assessment-status');
  assert.equal(assessment.expected.behavior,'answer');assert.equal(assessment.capability.gap,false);
  assert.deepEqual(assessment.expected.requiredTools,['enrollmentCertificate']);
  assert.deepEqual(assessment.expected.requiredLinks,['/school-affairs/services/17-1']);
  assert.ok(assessment.expected.facts.some(fact=>fact.label==='status'&&fact.values.includes('blocked')));
  assert.ok(assessment.expected.facts.some(fact=>fact.label==='pending'&&fact.values.includes('N')));
  const official=cases.find(row=>row.id==='account:enrollment-certificate-gap');
  assert.deepEqual(official.expected.requiredTools,['enrollmentCertificate']);
  assert.match(official.capability.limitation,/official issuance.*downloads.*unsupported/i);
});


test('counseling catalog criteria use the independent native appointment packet and remain unmounted',()=>{
  const cases=buildServiceCases().filter(row=>row.serviceId==='29-1');
  assert.equal(cases[0].expected.requiredLinks[0],'/school-affairs/services/29-1');
  for(const row of cases.slice(1)){
    assert.equal(row.fixtureRequirement,'native_counseling_appointments_planned');
    assert.equal(row.plannedFixture.mounted,false);
    assert.doesNotMatch(row.fixtureKey,/service-note:/u);
    assert.equal(row.route,'/school-affairs/services/29-1/appointments');
  }
  assert.equal(cases[3].plannedFixture.expectedNativeReadCalls,0);
  assert.equal(cases[3].expected.noAction,true);
  assert.equal(buildAccountCases().some(row=>row.domain==='counselingAppointments'),false);
  const planned=buildAccountCases({includePlannedCounselingAppointments:true}).filter(row=>row.domain==='counselingAppointments');
  assert.equal(planned.length,21);
  assert.equal(planned.filter(row=>row.plannedFixture.requiresAdditionalFixtures.includes('charges')).length,3);
});
