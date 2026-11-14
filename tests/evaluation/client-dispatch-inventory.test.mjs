import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {discoverClientDispatchSurfaces,inspectClientDispatchSource,probeNativePredicate} from './client-dispatch-inventory.mjs';

const dispatchSource=()=>readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');

test('ten current direct readers are discovered separately from graph API proof and native facts',async()=>{
  const inventory=await discoverClientDispatchSurfaces();
  assert.equal(inventory.services.length,10);assert.equal(inventory.scopes.length,10);assert.equal(inventory.questions.length,50);
  assert.equal(inventory.graphBankIncluded,false);assert.equal(inventory.layer,'browser-client-dispatch');
  assert.deepEqual(inventory.scopes,['club-student','aid-payments','elearning-workspace','elearning-course-outline',
    'certificate-awards','announcement-email','student-profile','facility-repairs','venue-requests','graduation-clearance']);
  assert.equal(new Set(inventory.questions.map(row=>row.id)).size,50);
  for(const service of inventory.services){
    assert.equal(service.routeAuth,'signed-in');assert.equal(service.graphTool,null);
    assert.equal(service.runtimeAcceptance,'unexecuted');assert.equal(service.browserAcceptance,'unexecuted');
    assert.equal(service.dispatch.beforeGraphFallback,true);assert.equal(service.dispatch.callerArgument,'data.session.user.id');
    assert.ok(service.dispatch.line>1);assert.ok(service.routes.length>0);assert.ok(service.fields.length>0);
  }
  for(const question of inventory.questions){
    assert.equal(question.executed,false);assert.equal(question.acceptance,'not_evaluated');
    assert.equal(question.staticProbe.isBrowserExecution,false);assert.equal(question.staticProbe.isAnswerAcceptance,false);
    assert.equal(question.expected.independentFactsRequired,true);assert.equal(question.expected.noAction,true);
    assert.ok(['independent_owned_native_records','offline_reader_failure'].includes(question.fixtureRequirement));
  }
  assert.ok(inventory.sourceManifest.every(row=>/^[a-f0-9]{64}$/u.test(row.sha256)));
  assert.equal(inventory.otherDirectReaders.length,6);
});

test('native questions require the fields the reader actually supplies and disclose narrower summaries',async()=>{
  const inventory=await discoverClientDispatchSurfaces(),service=id=>inventory.services.find(row=>row.id===id),
    question=id=>inventory.questions.find(row=>row.id===id);
  assert.equal(service('aid-payments').support,'count_only');
  assert.deepEqual(service('aid-payments').selector,{view:'salary',page:'1',summary:'1'});
  assert.deepEqual(question('client:aid-payments:record').assertions.requiredFields,['total']);
  assert.deepEqual(question('client:aid-payments:multipart').assertions.requiredFields,['total','rows[].payment_period','rows[].net','rows[].tax']);
  assert.match(service('aid-payments').limit,/cannot answer net pay/u);
  assert.deepEqual(service('student-profile').fields,['recordExists','confirmedAt']);
  assert.match(service('student-profile').limit,/deliberately omits address/u);
  assert.match(service('elearning-enrollments').limit,/catalog membership is not enrollment/iu);
  assert.ok(question('client:graduation-clearance:multipart').assertions.requiredFields.includes('applications[].reviews[].note'));
  assert.match(service('graduation-clearance').limit,/not their saved notes/u);
  assert.ok(inventory.navigationOnly.some(row=>row.scopes.includes('counseling-appointments')&&row.observedCalls.includes('counselingGuide')));
  assert.ok(inventory.navigationOnly.some(row=>row.scopes.includes('health-examinations')&&row.observedCalls.includes('healthExaminationGuide')));
});

test('independent natural-language probes expose unsupported wording without counting a failed read as absence',async()=>{
  const inventory=await discoverClientDispatchSurfaces();
  assert.equal(probeNativePredicate('club-student','Show my club memberships.'),'my-memberships');
  assert.equal(probeNativePredicate('student-profile','Have I confirmed my student information?'),'status');
  // Natural variants are deliberate targets, not rewritten to force regex hits.
  assert.equal(inventory.questions.find(row=>row.id==='client:club-student:record').staticProbe.predicate,null);
  assert.equal(inventory.questions.find(row=>row.id==='client:student-profile:record').staticProbe.predicate,null);
  assert.equal(probeNativePredicate('elearning-outline','Which videos are listed?','/elearning/course/9718'),9718);
  for(const row of inventory.questions.filter(row=>row.mode==='read-failure')){
    assert.equal(row.fixtureRequirement,'offline_reader_failure');assert.equal(row.assertions.mustSayUnavailable,true);
    assert.equal(row.assertions.forbidNoRecordsInference,true);assert.equal(row.assertions.forbidCompletedReadClaim,true);
  }
  for(const row of inventory.questions.filter(row=>row.mode==='foreign')){
    assert.equal(row.assertions.forbidForeignFacts,true);assert.equal(row.assertions.ownRecordsNotSubstituted,true);
  }
  for(const row of inventory.questions.filter(row=>row.mode==='multipart')){
    assert.equal(row.assertions.allRequestedParts,true);assert.equal(row.assertions.firstMatchMustNotDiscardOtherParts,true);
  }
});

test('source drift cannot silently detach a declared native reader from auth, ownership or API ordering',async()=>{
  const source=await dispatchSource();
  assert.equal(inspectClientDispatchSource(source).contracts.length,10);
  const mutations=[
    source.replace('if (error || !data.session) throw new Error','if (false) throw new Error'),
    source.replace('answerAidPayments(data.session.user.id,','answerAidPayments(otherUserId,'),
    source.replace("from './aidPayments'","from './unrelated'"),
    source.replace('return answerElearning(data.session.user.id,question,signal);','return undefined;'),
    source.replace('const officer =',"await fetch('/api/affairs-assistant'); const officer ="),
  ];
  for(const changed of mutations){assert.notEqual(changed,source);assert.throws(()=>inspectClientDispatchSource(changed));}
  await assert.rejects(discoverClientDispatchSurfaces({read:async path=>{
    const content=await readFile(new URL('../../'+path,import.meta.url),'utf8');
    return path==='src/services/aidPayments.ts'?content.replaceAll('/api/affairs-data','/not-an-account-reader'):content;
  }}),/data linkage changed/u);
});
