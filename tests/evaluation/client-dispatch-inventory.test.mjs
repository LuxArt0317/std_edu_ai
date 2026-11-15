import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {discoverClientDispatchSurfaces,inspectClientDispatchSource,probeNativePredicate} from './client-dispatch-inventory.mjs';

const dispatchSource=()=>readFile(new URL('../../src/services/schoolAffairsAssistant.ts',import.meta.url),'utf8');

test('the five direct readers and verified graph dispatch remain separately visible',async()=>{
  const inventory=await discoverClientDispatchSurfaces();
  assert.equal(inventory.services.length,5);assert.equal(inventory.scopes.length,5);assert.equal(inventory.questions.length,25);
  assert.equal(inventory.graphBankIncluded,false);assert.equal(inventory.layer,'browser-client-dispatch');
  assert.deepEqual(inventory.scopes,['club-student',
    'certificate-awards','announcement-email','student-profile','venue-requests']);
  assert.equal(new Set(inventory.questions.map(row=>row.id)).size,25);
  assert.deepEqual(inventory.verifiedDispatch.map(({id,graphTool})=>({id,graphTool})),[
    {id:'dtm-assignment-list',graphTool:'dtmAssignmentList'},
    {id:'dtm-materials',graphTool:'dtmMaterials'},
    {id:'student-leave',graphTool:'leaveRecords'},
    {id:'internship',graphTool:'internshipRecords'},
    {id:'dtm-assignment-detail',graphTool:'dtmAssignment'},{id:'aid-payments',graphTool:'aidPayments'},{id:'dtm-grade-report',graphTool:'dtmGradeReport'},
    {id:'elearning-enrollments',graphTool:'elearningEnrollments'},{id:'facility-repairs',graphTool:'facilityRepairs'},
    {id:'dormitory-conduct',graphTool:'dormitoryConduct'},{id:'elearning-outline',graphTool:'elearningOutline'},
    {id:'fee-remission',graphTool:'feeRemission'},
    {id:'health-examinations',graphTool:'healthExaminations'},
    {id:'counseling-appointments',graphTool:'counselingAppointments'},
    {id:'graduation-clearance',graphTool:'graduationClearance'},
    {id:'tutor-evaluation',graphTool:'tutorEvaluation'},
    {id:'student-conduct',graphTool:'studentConduct'},
    {id:'local-service-notes',graphTool:'serviceRecords'},
    {id:'teaching-feedback',graphTool:'teachingFeedback'},
    {id:'housing-beds',graphTool:'housing'},
    {id:'housing-applications',graphTool:'housingApplications'},
  ]);
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
  assert.equal(inventory.otherDirectReaders.length,5);
});

test('native questions require the fields the reader actually supplies and disclose narrower summaries',async()=>{
  const inventory=await discoverClientDispatchSurfaces(),service=id=>inventory.services.find(row=>row.id===id),
    question=id=>inventory.questions.find(row=>row.id===id);
  assert.equal(service('aid-payments'),undefined);
  assert.equal(service('student-leave'),undefined);
  assert.deepEqual(inventory.verifiedDispatch.find(row=>row.id==='student-leave').serviceKeys,['20-1','33-1']);
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/studentLeaveEvidenceIntent.js'));
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/internshipEvidenceIntent.js'));
  assert.equal(question('client:aid-payments:multipart'),undefined);
  assert.deepEqual(service('student-profile').fields,['recordExists','confirmedAt']);
  assert.match(service('student-profile').limit,/deliberately omits address/u);
  assert.equal(service('elearning-enrollments'),undefined);
  assert.equal(service('facility-repairs'),undefined);
  assert.equal(service('elearning-outline'),undefined);
  assert.equal(service('graduation-clearance'),undefined);
  assert.equal(question('client:graduation-clearance:multipart'),undefined);
  assert.ok(inventory.verifiedDispatch.some(row=>row.id==='graduation-clearance'&&row.graphTool==='graduationClearance'));
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/clearanceEvidenceIntent.js'));
  assert.ok(inventory.verifiedDispatch.some(row=>row.id==='tutor-evaluation'&&row.graphTool==='tutorEvaluation'));
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/tutorEvaluationEvidenceIntent.js'));
  assert.deepEqual(inventory.verifiedDispatch.find(row=>row.id==='local-service-notes').serviceKeys,['27-1','30-1','30-2','31-1','31-2','32-1','35-1']);
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/serviceNoteIntent.js'));
  assert.equal(inventory.navigationOnly.some(row=>row.scopes.includes('counseling-appointments')),false);
  assert.ok(inventory.verifiedDispatch.some(row=>row.id==='counseling-appointments'&&row.graphTool==='counselingAppointments'));
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/counselingEvidenceIntent.js'));
  assert.equal(inventory.navigationOnly.some(row=>row.scopes.includes('health-examinations')),false);
  assert.ok(inventory.verifiedDispatch.some(row=>row.id==='health-examinations'&&row.graphTool==='healthExaminations'));
  assert.ok(inventory.sourceManifest.some(row=>row.path==='server/healthExaminationEvidenceIntent.js'));
});

test('independent natural-language probes expose unsupported wording without counting a failed read as absence',async()=>{
  const inventory=await discoverClientDispatchSurfaces();
  assert.equal(probeNativePredicate('club-student','Show my club memberships.'),'my-memberships');
  assert.equal(probeNativePredicate('student-profile','Have I confirmed my student information?'),'status');
  // Natural variants are deliberate targets, not rewritten to force regex hits.
  assert.equal(inventory.questions.find(row=>row.id==='client:club-student:record').staticProbe.predicate,null);
  assert.equal(inventory.questions.find(row=>row.id==='client:student-profile:record').staticProbe.predicate,null);
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
  assert.equal(inspectClientDispatchSource(source).contracts.length,5);
  assert.doesNotMatch(source,/readGraduationClearanceAnswer/u);
  const mutations=[
    source.replace('if (error || !data.session) throw new Error','if (false) throw new Error'),
    source.replace('answerStudentClubs(data.session.user.id,','answerStudentClubs(otherUserId,'),
    source.replace("from './clubStudent'","from './unrelated'"),
    source.replace('isStudentLeaveEvidenceQuestion(question,route,history)','false'),
    source.replace('isStudentLeaveEvidenceQuestion(question,route,history)','isStudentLeaveEvidenceQuestion(question,route,[])'),
    source.replace('isHousingApplicationScopeQuestion(question,route,history)','false'),
    source.replace('isElearningEvidenceQuestion(question,route,history)','false'),
    source.replace('isFacilityRepairEvidenceQuestion(question,route,history)','true'),
    source.replace('data.session.user.id !== expectedUserId','false'),
    source.replace('isElearningOutlineEvidenceQuestion(question,route,history)','false'),
    source.replace('isDormitoryConductEvidenceQuestion(question,route,history)','false'),
    source.replace('isHealthExaminationEvidenceQuestion(question,route,history)','false'),
    source.replace('||healthExaminationQuestion(question)',''),
    source.replace('isCounselingEvidenceQuestion(question,route,history)','false'),
    source.replace('||counselingQuestion(question)',''),
    source.replace('isClearanceEvidenceQuestion(question,route,history)','false'),
    source.replace('||clearanceQuestion(question)',''),
    source.replace('isTutorEvaluationEvidenceQuestion(question,route,history)','false'),
    source.replace('||tutorEvaluationNavigation(question)',''),
    source.replace('isServiceNoteEvidenceQuestion(question,route,history)','false'),
    source.replace('const officer =',"await fetch('/api/affairs-assistant'); const officer ="),
  ];
  for(const changed of mutations){assert.notEqual(changed,source);assert.throws(()=>inspectClientDispatchSource(changed));}
  await assert.rejects(discoverClientDispatchSurfaces({read:async path=>{
    const content=await readFile(new URL('../../'+path,import.meta.url),'utf8');
    return path==='src/services/clubStudent.ts'?content.replaceAll('/api/affairs-data','/not-an-account-reader'):content;
  }}),/data linkage changed/u);
});
