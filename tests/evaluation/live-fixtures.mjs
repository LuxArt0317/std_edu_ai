/**
 * Disposable, account-private evaluation fixtures for the exact client project.
 * Importing this module performs no I/O and reads no credentials. prepare() is
 * the explicit mutation boundary; callers must hold the project DB lease.
 * Never use a real account or alter shared catalog/notices. The dedicated
 * confirmed-task operator verifies writes only for these disposable owners.
 */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,mkdir,open,rename,rm,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {fixtureForCase,evaluationDates,EVAL_OTHER_USER_ID,supplementalFixtureRecords} from './fixtures.mjs';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';
import {loadOwnAffairsCharges} from '../../server/affairsWorkspace.js';
import {mapScholarshipRecords} from '../../server/scholarshipRecords.js';
import {mapHousingRecords} from '../../server/housingRecords.js';
import {validateEnrollmentCertificatePayload} from '../../server/enrollmentCertificate.js';
import {validateTuitionDocumentPayload} from '../../server/tuitionDocuments.js';
import {validateStudentConductPayload} from '../../server/studentConduct.js';
import {parseStudentLoanSnapshot,validateStudentLoanPayload} from '../../server/studentLoan.js';
import {catalogTextFields,catalogNumberFields,catalogBooleanFields,catalogPeriods} from '../../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {bindPublishedSampleEnrollments,sampleEnrollmentManifest} from './published-sample-enrollments.mjs';
import {assertPublishedNextClassClock} from './published-next-class.mjs';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';
import {assertDtmMaterialPreviewRows,buildDtmMaterialPreviewPlan,dtmMaterialCaseScope,
  dtmMaterialPreviewCases,dtmMaterialPreviewGaps,dtmMaterialPreviewMode,dtmMaterialPreviewRequest,dtmMaterialPreviewRows,
  gradeDtmMaterialPreviewCase,readDtmMaterialPreviewCallers,readDtmMaterialPreviewRows} from './dtm-material-preview.mjs';
import {assertElearningFixtureCatalog,assertElearningFixtureRows,elearningFixtureManifest,elearningFixturePlan,verifyElearningFixtureWorkspace} from './elearning-fixtures.mjs';
import {assertOutlineFixtureRows,assertPublishedOutlineRead,isOutlineFixtureKey,planPublishedOutlineAccess} from './elearning-outline-fixtures.mjs';
import {assertDormitoryConductFixtureIdentities,assertDormitoryConductFixtureRows,buildDormitoryConductFixturePlan,dormitoryConductFixtureReadContract,dormitoryConductLiveFixtureKey,reconcileDormitoryConductFixturePlans,verifyDormitoryConductFixtureReadback} from './dormitory-conduct-cases.mjs';
import {buildFacilityRepairFixturePlan,changeFacilityRepairFixtureRows,facilityRepairLiveFixtureKey,verifyFacilityRepairFixtureDatabase,verifyFacilityRepairFixtureReadback} from './facility-repair-fixtures.mjs';
import {buildFacilityRepairCancellationPlan,deleteFacilityRepairCancellation,FacilityRepairCancellationAssertion,facilityRepairCancellationMode,
  hasFacilityRepairCancellationProof,observeFacilityRepairCancellation,requestFacilityRepairCancellation,seedFacilityRepairCancellation,
  verifyFacilityRepairCancellation,verifyFacilityRepairCancellationAbsent} from './facility-repair-cancellation-preview.mjs';
import {learningSupportNativeCaseIds,LearningSupportPacketError,readLearningSupportNativeRows,verifyLearningSupportNativePacket}
  from './learning-support-native-packet.mjs';
import {assertLearningSupportPreviewSchema,bindLearningSupportPreview,cleanupLearningSupportPreview,LearningSupportPreviewError,
  learningSupportPreviewHttp,learningSupportPreviewMode,seedLearningSupportPreview,verifyLearningSupportPreviewAbsent}
  from './learning-support-preview.mjs';
import {assertClearanceStatusSchema,assertClearanceStatusTermIds,bindClearanceStatusPreview,cleanupClearanceStatusPreview,
  clearanceStatusDigest,clearanceStatusPreviewCaseIds,clearanceStatusPreviewDeferred,ClearanceStatusPreviewError,
  clearanceStatusPreviewMode,readClearanceOwnedRows,readClearanceStatusShared,seedClearanceStatusPreview,verifyClearanceStatusPreview,
  verifyClearanceStatusPreviewAbsent} from './clearance-status-preview.mjs';
import {academicGradesPreviewActor,academicGradesPreviewCases,academicGradesPreviewMode,academicGradesPreviewRequest,
  assertAcademicGradesPreviewSchema,buildAcademicGradesPreviewPlan,gradeAcademicGradesPreview,readAcademicGradesPreviewCallers,
  seedAcademicGradesPreviewRows,verifyAcademicGradesPreviewRows} from './academic-grades-preview.mjs';
import {dtmStudyPreviewMode,dtmStudyPreviewCases,buildDtmStudyPreviewPlan,assertDtmStudyPreviewSchema,assertDtmStudyClock,
  verifyDtmStudyPreviewRows,seedDtmStudyPreviewRows,readDtmStudyPreviewCallers,dtmStudyPreviewRequest,gradeDtmStudyPreview} from './dtm-study-preview.mjs';
import {buildVenueProtectedPlan,deleteVenueProtectedFixture,observeVenueProtectedFixture,seedVenueProtectedFixture,
  venueProtectedCases,venueProtectedFixtureMode,venueProtectedGaps,verifyVenueProtectedFixtureAbsent} from './venue-protected-fixture.mjs';
import {hasVenueProtectedProof,observeVenueProtectedCallers,requestVenueProtectedCase} from './venue-protected-preview.mjs';
import {bindCertificateAwardPreviewCases,buildCertificateAwardPreviewPlan,certificateAwardPreviewHash,certificateAwardPreviewManifest,
  certificateAwardPreviewMode,deleteCertificateAwardPreview,observeCertificateAwardPreview,observeCertificateAwardPreviewCallers,
  readCertificateAwardPreviewCatalog,requestCertificateAwardPreviewCase,seedCertificateAwardPreview,verifyCertificateAwardPreviewAbsent} from './certificate-award-preview.mjs';
import {aidPaymentFixtureManifest,aidPaymentFixtureReadContract,assertAidPaymentFixtureEmpty,assertAidPaymentFixtureIdentities,assertAidPaymentFixtureRowTargets,buildAidPaymentFixturePlan,verifyAidPaymentFixtureReadback} from './aid-payment-fixture-plan.mjs';
import {dtmGradeReportFixtureManifest,dtmGradeReportFixtureReadContract,assertDtmGradeReportFixtureEmpty,assertDtmGradeReportFixtureIdentities,assertDtmGradeReportFixtureCourseBindings,assertDtmGradeReportFixtureRowTargets,buildDtmGradeReportFixturePlan,verifyDtmGradeReportFixtureReadback} from './dtm-grade-report-fixture-plan.mjs';
import {buildFeeRemissionFixturePlan,feeRemissionLiveFamilyForCase,feeRemissionLivePlanManifest} from './fee-remission-live-plan.mjs';
import {createFeeRemissionFixtureLifecycle} from './fee-remission-fixture-lifecycle.mjs';
import {readRows as readFeeRows,deleteRows as deleteFeeRows,insertRows as insertFeeRows} from './fee-remission-fixture-sql.mjs';
import {createTranscriptConversationFixture} from './transcript-conversation-fixture.mjs';
import {isDeepStrictEqual} from 'node:util';
import {createTutorEvaluationFixture,gradeHostedTutorEvaluation,observeTutorEvaluationCallers,requestTutorEvaluation,
  tutorEvaluationFamily,tutorEvaluationFixtureMode,tutorEvaluationHostedCases,tutorEvaluationHostedGaps,
  validateTutorEvaluationHostedCases} from './tutor-evaluation-hosted.mjs';
import {buildClubEquipmentHostedPlan,clubEquipmentFamily,clubEquipmentFixtureMode,clubEquipmentHostedCases,clubEquipmentHostedRouteCases,clubEquipmentRequirement,
  createClubEquipmentFixture,gradeClubEquipmentHosted,observeClubEquipmentCallers,requestClubEquipment,
  validateClubEquipmentHostedCases} from './club-equipment-hosted.mjs';
import {requestClubEquipmentCancellation,verifyClubEquipmentCancellation} from './club-equipment-cancellation-preview.mjs';
import {assertHealthMetadataLiveCases,bindHealthMetadataReadback,healthMetadataCase,healthMetadataFamily,
  healthMetadataFixtureMode,healthMetadataRequirement,readHealthMetadataPages} from './health-examination-live.mjs';
import {createHealthMetadataFixture} from './health-examination-live-fixture.mjs';
import {assertDtmAssignmentListClock,assertDtmAssignmentListLiveCases,bindDtmAssignmentListReadback,buildDtmAssignmentListFixture,dtmAssignmentListFamilies,
  dtmAssignmentListFixtureMode,dtmAssignmentListRequirement,initializeDtmAssignmentListStudent,readDtmAssignmentListFixture} from './dtm-assignment-list-live.mjs';
import {counselingCompoundFixtureMode,counselingFixtureMode,counselingHostedCases,gradeHostedCounseling,gradeHostedCounselingCompound,observeCounselingFixture,
  requestCounselingHostedCase,cleanupCounselingCancellation,transitionCounselingFixtures,validateCounselingHostedCases,
  verifyCounselingCancellationAbsent,verifyCounselingFixtureAbsent,buildCounselingCompoundFixture,cleanupCounselingCompoundRows,
  stageCounselingCompoundRows} from './counseling-appointment-hosted.mjs';
import {counselingCancellationCaseIds,requestCounselingCancellation,verifyCounselingCancellation} from './counseling-cancellation-preview.mjs';
import {buildCounselingAppointmentFixturePlan,counselingAppointmentFixtureCaseBinding} from './counseling-appointment-fixture-plan.mjs';
import {nativeVenueSetupRequired} from './venue-native-runner.mjs';
import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {buildInternshipFixturePlan,createInternshipFixture,internshipFixtureMode,observeInternshipCallerRows} from './internship-native-fixture.mjs';
import {internshipObservationDigest} from '../../server/internshipObservation.js';
import {internshipFixtureKindForCase,internshipHostedCases,internshipPublishedTimetableCase,internshipPublishedTimetableCaseIds,requestInternshipHostedCase} from './internship-native-hosted.mjs';
import {buildInternshipTimetableFixture,cleanupInternshipTimetable,observeInternshipTimetableCallers,observeInternshipTimetableRows,
  readInternshipNextMeeting,stageInternshipTimetable,verifyInternshipTimetableAbsent} from './internship-timetable-fixture.mjs';
import {buildInternshipChargeFixture,cleanupInternshipCharges,observeInternshipChargeCallers,observeInternshipChargeRows,
  stageInternshipCharges,verifyInternshipChargesAbsent,observeOwnedChargeCallers,observeOwnedChargeRows,
  verifyOwnedChargeRowsAbsent} from './internship-charge-fixture.mjs';
import {buildTeachingSampleFixture,createTeachingSampleFixture,observeTeachingSampleCallers,readTeachingSampleCatalog} from './teaching-feedback-sample-fixture.mjs';
import {requestTeachingSampleCase,teachingOriginalProtectedCases,teachingSampleCases} from './teaching-feedback-sample-hosted.mjs';
import {requestObservedStudentLeave,studentLeaveHostedSelection} from './student-leave-hosted-observation.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {assertElearningCatalogCaseReady,isElearningMetadataCase,isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import {bindMetadataObservation,readMetadataObservations} from './elearning-metadata-live.mjs';
import {bindCatalogObservation,readCatalogObservations} from './elearning-catalog-live.mjs';
import {createStudentLeaveDatabaseFixture} from './student-leave-database-fixture.mjs';
import {openStudentLeaveFixtureJournal} from './student-leave-fixture-journal.mjs';
import {studentLeaveJournalBinding} from './student-leave-fixture-lifecycle.mjs';
import {buildStudentLeaveFixturePlan,leaveFixtureFamilies,studentLeaveFixtureManifest} from './student-leave-fixture-plan.mjs';
import {createTrustedPreviewFetch,isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';
import {checkConfirmedTaskRoundTrip,readConfirmedTaskRows} from './confirmed-task-preview.mjs';
import {ConfirmedAssignmentTrackerAssertion,assertConfirmedAssignmentTrackerSchema,checkConfirmedAssignmentTrackerRoundTrip,confirmedAssignmentTrackerContract,confirmedAssignmentTrackerDigest,
  confirmedAssignmentTrackerMode,confirmedAssignmentTrackerPlan,deleteConfirmedAssignmentTrackerRows,observeConfirmedAssignmentTrackerCallers,
  readConfirmedAssignmentTrackerRows,seedConfirmedAssignmentTrackerRows,verifyConfirmedAssignmentTrackerAbsent} from './confirmed-assignment-tracker-preview.mjs';
import {checkTuitionLedgerPreview,deleteTuitionLedgerPreviewState,isEmptyTuitionLedgerPreviewState,readTuitionLedgerAccountScopes,readTuitionLedgerPreviewState,
  seedTuitionLedgerPreviewState,tuitionLedgerFixtureMode,tuitionLedgerHistoryPath,tuitionLedgerPlan,tuitionLedgerPreviewDates,
  TuitionLedgerPreviewAssertion} from './tuition-ledger-preview.mjs';
import {buildDtmTimingPlan,deleteDtmTimingRows,dtmTimingFixtureMode,dtmTimingPreviewCases,dtmTimingRequest,emptyDtmTimingState,
  gradeDtmTimingCase,observeDtmTimingCallers,observeDtmTimingRows,readDtmTimingState,seedDtmTimingRows} from './dtm-submission-timing-preview.mjs';
import {assertStudentLeaveGradePairSchema,buildDtmGradeOverviewPreview,buildDtmGradePreview,buildStudentLeaveGradePairFixture,deleteDtmGradeOverviewRows,deleteDtmGradePreview,dtmGradeOverviewPreviewCases,
  dtmGradePreviewCases,dtmGradePreviewDigest,dtmGradePreviewMode,gradeDtmGradePreview,observeDtmGradeOverviewRows,observeDtmGradePreviewRows,
  readDtmGradeOverviewScopes,seedDtmGradeOverviewRows,seedDtmGradePreviewCompanion,unmountedDtmNativeGradeCases,verifyDtmGradePreviewAbsent} from './dtm-grade-report-preview.mjs';
import {clubAttendanceOracle} from './club-attendance-cases.mjs';
import {serviceNoteRunnerOracle,serviceNoteSetupRequired} from './service-note-runner.mjs';
import {buildServiceNotePlan,changeServiceNoteRows,observeServiceNoteRows} from './service-note-live-fixture.mjs';
import {observeNoteCompanion,serviceNoteCompanionPlan} from './service-note-companion-fixture.mjs';
import {buildClubAttendancePlan,changeClubAttendanceFixture,observeClubAttendanceFixture} from './club-attendance-fixtures.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const PROJECT='xiftudmvxphxcjtmfmib';
const PRIVATE_DIR=resolve(ROOT,'artifacts/assistant-evaluation');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRIVATE_NATIVE_DOMAINS=['studentAid','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
const CONDITIONAL_NATIVE_DOMAINS=['courses','scholarship','housing'];
const SUPPLEMENTAL_SCOPES=Object.freeze({enrollmentCertificate:'enrollment-certificate',tuition:'tuition-documents',studentConduct:'student-conduct',studentLoan:'student-loan'});
const SUPPLEMENTAL_TABLES=Object.freeze({enrollmentCertificate:'affairs_enrollment_certificate_assessments',tuition:'affairs_tuition_settlements',studentConduct:'affairs_student_conduct',studentLoan:'affairs_student_loan'});
const SUPPORTED_TOOLS=new Set(['profile','charges','tasks','requests','serviceRecords','dtm','assignments','aidPayments','dtmGradeReport','elearningEnrollments','elearningOutline','facilityRepairs','dormitoryConduct','housingApplications',...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS,...Object.keys(SUPPLEMENTAL_SCOPES)]);
const FOREIGN_MARKER='FOREIGN PRIVATE SENTINEL';
const FEE_FIXTURE_MODE='fee-remission-only';
export const fixtureModes=Object.freeze([FEE_FIXTURE_MODE,dtmAssignmentListFixtureMode,healthMetadataFixtureMode]);
export const clubAttendanceFixtureVersion=1;
export const protectedPreviewReadbackVersion=1;
export const dtmAssignmentListFixtureVersion=1;
export const healthMetadataFixtureVersion=1;
export const elearningMetadataFixtureVersion=1;
export const elearningCatalogFixtureVersion=1;
export const serviceNoteFixtureVersion=1;
export const serviceNoteCompanionFixtureVersion=1;
export const catalogFixtureSetupReasons=Object.freeze(['catalog_read_unavailable','published_payload_invalid','public_scope_mismatch','no_suitable_published_offering','no_null_weight_offering','absent_probe_not_empty']);
const catalogKinds=Object.freeze({'account:catalog-known-fields':'known-fields','account:catalog-null-weight':'null-weight','account:catalog-unfound':'unfound','account:catalog-enrollment-distinction':'enrollment-distinction','account:catalog-mixed-dtm':'mixed-dtm','service:12-4:record':'known-fields','service:12-4:empty':'unfound'});
let state;

export class LiveFixtureError extends Error {
  constructor(kind,message){super(`[${kind}] ${message}`);this.name='LiveFixtureError';this.code=kind;}
}
const fail=(kind,message)=>{throw new LiveFixtureError(kind,message);};
// Object insertion order can depend on concurrent read completion. Normalize
// keys at every depth; retain array order and JSON's literal/date semantics.
function digestObjectKeys(_key,value){
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value,digestObjectKeys)).digest('hex');
const timestamp=value=>value==null?null:new Date(value).toISOString();
const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]));
const sort=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
function signals(signal,ms=15000){return signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);}
function ready(){if(!state?.prepared||state.closing)fail('fixture-state','prepare() must complete before fixture access.');return state;}
const transcriptFixtureCases=Object.freeze([
  ['account:reproduction-record-overview','what do you know about my records',['profile','courses','dtm','assignments','charges','tasks','requests']],
  ['account:reproduction-current-courses-year','what courses i have for this semester and what year i am currently at',['profile','courses']],
  ['account:reproduction-remaining-balance','how much is my remaining balance in school',['charges']],
  ['account:reproduction-interview-help','i am asked what makes me qualified to be a software engineer i dont know what cna you help me?',[]],
]);
function assertTranscriptFixtureCase(testCase,index=transcriptFixtureCases.findIndex(row=>row[0]===testCase?.id)){
  const expected=transcriptFixtureCases[index];
  if(!expected||testCase?.id!==expected[0]||testCase.question!==expected[1]||testCase.route!=='/'||testCase.fixtureKey!=='published-sample:records'
    ||testCase.fixtureRequirement!==undefined||JSON.stringify(testCase.expected?.requiredTools)!==JSON.stringify(expected[2]))
    fail('fixture-config','The injected application transport supports only the exact four-turn published-sample packet.');
  return expected[0];
}
/** Only release metadata and a complete own snapshot may use this opt-in
 * application transport. Auth/admin/refresh credentials never use this hook.
 * The dependency owns any authorized Preview session; no cookie is discovered. */
export function createTranscriptFixtureApplicationFetch({origin,fetchImpl,signal,timeoutMs=45000}={}){
  let target;try{target=new URL(origin);}catch{fail('fixture-target','Invalid fixture application target.');}
  if(origin!==target.origin||target.protocol!=='https:'||target.username||target.password||target.port
    ||!(origin==='https://stu.best'||/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(target.hostname))
    ||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000
    ||signal!==undefined&&!(signal instanceof AbortSignal))fail('fixture-config','Invalid fixture application transport.');
  return async(input,init={})=>{
    let url,headers;try{url=new URL(String(input));headers=new Headers(init.headers);}catch{fail('fixture-target','Invalid fixture application request.');}
    const manifest=url.pathname==='/release.json';
    if(url.origin!==origin||url.username||url.password||url.search||url.hash||!['/release.json','/api/affairs-data'].includes(url.pathname)
      ||(init.method??'GET')!=='GET'||init.body!==undefined||[...headers.keys()].some(key=>!['accept','authorization'].includes(key))
      ||manifest&&headers.has('authorization')||!manifest&&!/^Bearer [^\s\p{Cc}]+$/u.test(headers.get('authorization')||'')
      ||init.signal!==undefined&&!(init.signal instanceof AbortSignal))fail('fixture-target','The fixture application request is outside its read-only scope.');
    const controller=new AbortController(),active=AbortSignal.any([controller.signal,...[signal,init.signal].filter(Boolean)]),duration=Math.min(timeoutMs,manifest?8000:45000),expiresAt=Date.now()+duration;
    let timer,response,reader,onAbort;
    const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
    try{
      const work=async()=>{
        if(active.aborted||Date.now()>=expiresAt)throw Error();
        response=await fetchImpl(url.href,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers,signal:active});
        if(active.aborted||Date.now()>=expiresAt){cancel();throw Error();}
        if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))throw Error();
        reader=response.body?.getReader();if(!reader)throw Error();
        const chunks=[];let bytes=0,iterations=0;const maximum=manifest?4096:8_000_000;
        for(;;){if(active.aborted||Date.now()>=expiresAt)throw Error();const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maximum||++iterations>4096)throw Error();if(value.byteLength)chunks.push(value);}
        const body=Buffer.concat(chunks);JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
        if(active.aborted||Date.now()>=expiresAt)throw Error();
        const result=new Response(body,{status:200,headers:{'content-type':'application/json'}});
        Object.defineProperty(result,'url',{value:url.href});return result;
      };
      return await Promise.race([work(),new Promise((_,reject)=>{
        onAbort=()=>{cancel();reject(Error());};active.addEventListener('abort',onAbort,{once:true});
        timer=setTimeout(()=>controller.abort(),duration);
      })]);
    }catch{fail('fixture-readback','The scoped fixture application response could not be verified.');}
    finally{
      clearTimeout(timer);if(onAbort)active.removeEventListener('abort',onAbort);controller.abort();cancel();
      if(reader)try{reader.releaseLock();}catch{/* Cancelled read may still settle. */}
    }
  };
}
/** Synthetic sessions stay in memory; no session or refresh token is serializable. */
export function attachFixtureSession(user,session,{url,publishable,signal,fetchImpl=fetch,clock=Date.now,timeoutMs=15000}={}){
  if(!UUID.test(user?.id||'')||url!=='https://'+PROJECT+'.supabase.co'||typeof publishable!=='string'||!publishable||typeof fetchImpl!=='function'||typeof clock!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)
    fail('fixture-session','Synthetic session configuration is invalid.');
  const ownerId=user.id,marginMs=180000,endpoint=url+'/auth/v1/token?grant_type=refresh_token';
  let accessToken=null,refreshToken=null,expiresAt=0,sessionId=null,pending=null,controller=null,closed=false;
  const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/\s/.test(value);
  const accept=(value,initial=false)=>{
    let claims;
    try{
      if(!value||value.user?.id!==ownerId||!validToken(value.access_token)||!validToken(value.refresh_token)||value.token_type!=='bearer')throw new Error();
      const parts=value.access_token.split('.');
      if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw new Error();
      claims=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(parts[1],'base64url')));
      if(claims?.sub!==ownerId||claims.iss!==url+'/auth/v1'||claims.role!=='authenticated'||claims.aud!=='authenticated'||!UUID.test(claims.session_id||'')||
        !Number.isSafeInteger(claims.exp)||claims.exp*1000<=clock()+(initial?0:marginMs)||claims.exp*1000>clock()+86400000||
        !initial&&claims.session_id!==sessionId||value.expires_at!==undefined&&(!Number.isSafeInteger(value.expires_at)||Math.abs(value.expires_at-claims.exp)>30))throw new Error();
    }catch{fail('fixture-session','Synthetic session identity, lineage or expiry could not be verified.');}
    accessToken=value.access_token;refreshToken=value.refresh_token;expiresAt=claims.exp*1000;sessionId=claims.session_id;
  };
  const clear=()=>{closed=true;accessToken=null;refreshToken=null;expiresAt=0;sessionId=null;controller?.abort();};
  accept(session,true);session=null;
  Object.defineProperty(user,'id',{value:ownerId,writable:false,configurable:false,enumerable:true});
  Object.defineProperty(user,'token',{enumerable:false,configurable:false,get:()=>accessToken,set:value=>{
    if(value!==null)fail('fixture-session','Synthetic session credentials cannot be replaced externally.');
    clear();
  }});
  const renew=async({signal:callerSignal}={})=>{
    const requestSignal=signal&&callerSignal?AbortSignal.any([signal,callerSignal]):signal||callerSignal;
    if(closed||user.id!==ownerId||!accessToken||!refreshToken)fail('fixture-session','Synthetic session is closed or unavailable.');
    if(requestSignal?.aborted)fail('fixture-aborted','Evaluation was interrupted before session renewal.');
    if(expiresAt-clock()>marginMs)return;
    if(pending){
      // A joining caller can cancel its own wait, but does not own the shared
      // operation. The attached run signal still aborts the operation itself.
      if(!requestSignal)return pending;
      return new Promise((resolve,reject)=>{
        const finish=(callback,value)=>{requestSignal.removeEventListener('abort',aborted);callback(value);};
        const aborted=()=>finish(reject,new LiveFixtureError('fixture-aborted','Evaluation was interrupted while awaiting session renewal.'));
        requestSignal.addEventListener('abort',aborted,{once:true});
        pending.then(value=>finish(resolve,value),error=>finish(reject,error));
      });
    }
    controller=new AbortController();
    const activeController=controller;
    pending=(async()=>{
      let timer,reader,response;
      const aborted=()=>activeController.abort();
      requestSignal?.addEventListener('abort',aborted,{once:true});
      try{
        // Exactly one Auth refresh attempt. A timeout may have rotated the
        // refresh token, so it is never silently retried or used for sign-in.
        const interrupted=new Promise((_,reject)=>{
          activeController.signal.addEventListener('abort',()=>reject(new LiveFixtureError('fixture-session','Synthetic session renewal did not complete.')),{once:true});
          timer=setTimeout(()=>activeController.abort(),timeoutMs);
        });
        const operation=(async()=>{
          response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{apikey:publishable,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken}),signal:activeController.signal});
          if(activeController.signal.aborted){void response.body?.cancel().catch(()=>{});fail('fixture-session','Synthetic session renewal did not complete.');}
          if(response.redirected||response.url&&response.url!==endpoint||response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))
            fail('fixture-session','Synthetic session renewal was rejected.');
          const length=response.headers.get('content-length');
          if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))fail('fixture-session','Synthetic session response exceeded its bound.');
          reader=response.body?.getReader();if(!reader)fail('fixture-session','Synthetic session response is unavailable.');
          const chunks=[];let size=0;
          for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)fail('fixture-session','Synthetic session response exceeded its bound.');chunks.push(part.value);}
          const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
          if(closed||activeController.signal.aborted)fail('fixture-session','Synthetic session was closed during renewal.');
          accept(value);
        })();
        await Promise.race([operation,interrupted]);
      }catch{clear();fail('fixture-session','Synthetic session renewal failed; no model request was retried.');}
      finally{clearTimeout(timer);requestSignal?.removeEventListener('abort',aborted);activeController.abort();if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});controller=null;}
    })();
    try{await pending;}finally{pending=null;}
  };
  Object.defineProperties(user,{renewSession:{value:renew},clearSession:{value:clear}});
  return user;
}
/** Metadata only: never forward PostgreSQL message/detail/query or row values. */
export function safeDatabaseDiagnostic(error){
  const fields=[];
  if(/^[A-Z0-9_]{2,35}$/.test(String(error?.code)))fields.push('code '+error.code);
  const identifier=value=>typeof value==='string'&&value.length<=63&&/^(?:affairs_|dtm_)[a-z0-9_]+$/.test(value);
  if(identifier(error?.table_name)||['identities','users'].includes(error?.table_name))fields.push('table '+error.table_name);
  if(identifier(error?.constraint_name))fields.push('constraint '+error.constraint_name);
  return fields.length?' ('+fields.join('; ')+')':'';
}
const diagnostic=safeDatabaseDiagnostic;
async function query(work,label){try{return await work();}catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-database',label+diagnostic(error));}}
function checkedProtectedOwnerFingerprint(value){
  const keys=['id','auth_hash','profile_hash','identities_hash'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||
    !UUID.test(value.id||'')||!keys.slice(1).every(key=>typeof value[key]==='string'&&/^[a-f0-9]{32}$/.test(value[key])))
    fail('fixture-protected-owner','The protected owner identity and profile baseline could not be verified.');
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,value[key]])));
}
/** Read only the exact configured administrator; never authenticate as that account. */
export async function readProtectedOwnerFingerprint(sql,ownerEmail){
  if(typeof sql!=='function'||typeof ownerEmail!=='string'||ownerEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
    fail('fixture-protected-owner','The fixed protected owner configuration is invalid.');
  let rows;
  try{
    rows=await sql`select u.id,
      md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
      md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text)
       from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id
      where lower(u.email)=lower(${ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
        and exists(select 1 from auth.identities g where g.user_id=u.id and g.provider='google') limit 2`;
  }catch{fail('fixture-protected-owner','The protected owner identity and profile fingerprint could not be read.');}
  if(!Array.isArray(rows)||rows.length!==1)fail('fixture-protected-owner','Exactly one existing confirmed Google administrator must match the protected owner.');
  return checkedProtectedOwnerFingerprint(rows[0]);
}
export function assertProtectedOwnerUnchanged(before,after){
  const baseline=checkedProtectedOwnerFingerprint(before),current=checkedProtectedOwnerFingerprint(after);
  if(Object.keys(baseline).some(key=>baseline[key]!==current[key]))
    fail('fixture-protected-owner','The protected owner identity or profile changed; the recovery ledger is retained for independent review.');
  return true;
}
export function protectedOwnerFingerprintDigest(value){return hash(checkedProtectedOwnerFingerprint(value));}
async function assertNoPendingRecoveryLedgers(){
  if(!state?.locked)fail('fixture-lease','The fixture lock must be held before inspecting recovery ledgers.');
  let names;
  try{names=await readdir(PRIVATE_DIR);}
  catch{fail('fixture-ledger','Recovery ledgers could not be checked; no fixture account will be created.');}
  if(names.some(name=>{
    const match=/^active-fixtures-(.+)\.json(?:\.tmp)?$/.exec(name);
    return match&&UUID.test(match[1]);
  }))fail('fixture-ledger','An existing fixture recovery ledger requires explicit manual recovery before another fixture run; no ledger or account was changed.');
}
async function reserveLedger(){
  const s=state;
  if(!s?.ledger||s.ledgerOwned)fail('fixture-ledger','A fresh private cleanup ledger must be reserved once.');
  let handle;
  try{handle=await open(s.ledger,'wx',0o600);s.ledgerOwned=true;}
  catch{fail('fixture-ledger','The cleanup ledger already exists or could not be reserved; existing recovery records will not be modified.');}
  finally{await handle?.close();}
}
async function saveLedger(){
  const s=state;if(!s?.ledger)return;
  if(!s.ledgerOwned||s.closed)fail('fixture-ledger','This lifecycle does not own an open cleanup ledger.');
  const protectedOwner={version:1,fingerprint:protectedOwnerFingerprintDigest(s.protectedOwnerBefore)};
  const tmp=s.ledger+'.tmp';
  let handle;
  try{
    // A foreign stale temporary ledger is not ours to overwrite or remove.
    handle=await open(tmp,s.ledgerTempOwned?'w':'wx',0o600);s.ledgerTempOwned=true;
    await handle.writeFile(JSON.stringify({version:1,projectRef:PROJECT,runId:s.runId,origin:s.origin,createdAt:s.startedAt,
      protectedOwner,fixtureUserIds:s.users.map(user=>user.id),identityRequests:s.identityRequests,ownedRecordIds:[...s.recordIds].sort(),supplementalTables:[...(s.supplementalTables||[])].sort(),activeCaseId:s.current?.caseId??null,
      ...(s.assignmentTrackerPlan?{confirmedAssignmentTrackerFixture:s.assignmentTrackerPlan,confirmedAssignmentTrackerJournal:s.assignmentTrackerJournal}:{}),
      ...(s.taskActionJournal?{confirmedTaskJournal:s.taskActionJournal}:{}),
      ...(s.tuitionLedgerPlan?{tuitionLedgerFixture:s.tuitionLedgerPlan}:{}),
      ...(s.dtmTimingPlan?{dtmSubmissionTimingFixture:s.dtmTimingPlan}:{}),
      ...(s.dtmGradePreview?{dtmGradePreview:{courses:s.dtmGradePreview.courses,trackers:s.dtmGradePreview.trackers,
        ...(s.dtmGradeOverview?{profiles:s.dtmGradePreview.profiles,reports:s.dtmGradePreview.reports}:{})}}:{}),
      ...(s.venueProtectedPlan?{venueProtectedPlan:s.venueProtectedPlan}:{}),
      ...(s.certificateAwardPreviewPlan?{certificateAwardPreviewPlan:s.certificateAwardPreviewPlan}:{}),
      ...(s.facilityRepairCancellation?{facilityRepairCancellation:s.facilityRepairCancellation}:{}),
      ...(s.learningSupportPreview?{learningSupportPreview:s.learningSupportPreview}:{}),
      ...(s.clearanceStatusPreview?{clearanceStatusPreview:s.clearanceStatusPreview}:{}),
      ...(s.academicGradesPreview?{academicGradesPreview:s.academicGradesPreview}:{}),
      ...(s.dtmStudyPreview?{dtmStudyPreview:s.dtmStudyPreview}:{}),
      ...(s.feeFixture?{feeRemissionFixture:{students:s.feeFixture.students,journal:s.feeFixture.journal}}:{}),
      ...(s.studentLeaveData?{studentLeaveDataFixture:studentLeaveJournalBinding(s.studentLeaveData.binding)}:{}),
      ...(s.internshipJournal?{internshipFixture:s.internshipJournal}:{}),
      ...(s.internshipChargePlan?{internshipChargeFixture:s.internshipChargePlan}:{}),
      ...(s.internshipTimetablePlan?{internshipTimetableFixture:{plan:s.internshipTimetablePlan,state:s.internshipTimetableState??null}}:{}),
      ...(s.teachingJournal?{teachingSampleFixture:s.teachingJournal}:{}),
      ...(s.counselingFixture||s.pendingCounselingFixture?{counselingAppointments:{
        activeFamily:s.counselingFixture?.fixtureKey??null,pendingFamily:s.pendingCounselingFixture?.fixtureKey??null,
        ...(s.counselingCancellation?{cancellation:s.counselingCancellation.command}:{}),
      }}:{}),
      ...(s.counselingCompound?{counselingCompound:s.counselingCompound}:{}),
      ...(s.transcriptConversationRecovery?{transcriptConversation:s.transcriptConversationRecovery}:{}),
      ...(s.healthMetadataJournal?{healthMetadataFixture:s.healthMetadataJournal}:{}),
      ...(s.dtmMaterialPreview?{dtmMaterialPreview:{plan:s.dtmMaterialPreview.plan,
        previous:s.dtmMaterialPreview.variant,pending:s.dtmMaterialPreview.pending}}:{}),
      ...(s.tutorEvaluationJournal?{tutorEvaluationFixture:s.tutorEvaluationJournal}:{}),
      ...(s.clubEquipmentJournal?{clubEquipmentFixture:s.clubEquipmentJournal}:{}),
      ...(s.clubAttendancePlan?{clubAttendanceFixture:{plan:s.clubAttendancePlan,setupPending:!!s.clubAttendancePending}}:{}),
      ...(s.serviceNotePlan||s.pendingServiceNotePlan?{serviceNoteFixture:{
        caseId:s.serviceNotePlan?.caseId??null,pendingCaseId:s.pendingServiceNotePlan?.caseId??null,
        companionChargeIds:[s.serviceNotePlan,s.pendingServiceNotePlan].flatMap(plan=>plan?.companion?.rows.map(row=>row.id)??[]).sort(),
        transitionPending:Boolean(s.serviceNotePending),
      }}:{}),
      ...(s.dtmReportPlan||s.dtmReportTransitionPending?{dtmReportFixture:{
        previous:dtmReportRecoveryBinding(s.dtmReportPlan),pending:dtmReportRecoveryBinding(s.pendingDtmReportPlan),transitionPending:Boolean(s.dtmReportTransitionPending),
      }}:{}),...(s.elearningPlan||s.elearningTransitionPending?{elearningFixture:{
        previous:s.elearningPlan?.rows??null,pending:s.pendingElearningPlan?.rows??null,transitionPending:Boolean(s.elearningTransitionPending),
      }}:{}),...(s.outlinePlan||s.outlineTransitionPending?{elearningOutlineFixture:{
        previous:s.outlinePlan??null,pending:s.pendingOutlinePlan??null,transitionPending:Boolean(s.outlineTransitionPending),
      }}:{}),...(s.dormitoryPlan||s.dormitoryTransitionPending?{dormitoryConductFixture:{
        previous:s.dormitoryPlan??null,pending:s.pendingDormitoryPlan??null,transitionPending:Boolean(s.dormitoryTransitionPending),
      }}:{}),...(s.facilityRepairPlan||s.facilityRepairTransitionPending?{facilityRepairFixture:{
        previous:s.facilityRepairPlan??null,pending:s.pendingFacilityRepairPlan??null,transitionPending:Boolean(s.facilityRepairTransitionPending),
      }}:{})},null,2));
    await handle.sync();
  }finally{await handle?.close();}
  await rename(tmp,s.ledger);s.ledgerTempOwned=false;await chmod(s.ledger,0o600);
}
async function readSnapshot(user,{signal=state?.signal,cleanup=false}={}){
  const s=state;let response;
  await user.renewSession?.({signal:cleanup?undefined:signal});
  try{response=await (s.applicationFetch??s.previewReadbackFetch??fetch)(new URL('/api/affairs-data',s.origin),{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(cleanup?undefined:signal,45000)});}catch{fail('fixture-readback','Authenticated /api/affairs-data request did not complete.');}
  if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))fail('fixture-readback',`Authenticated /api/affairs-data returned ${response.status}; no model request may run.`);
  const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Snapshot response has no body.');
  const chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();fail('fixture-readback','Snapshot exceeded the bounded fixture readback size.');}chunks.push(value);}}
  catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Snapshot body did not complete.');}
  let snapshot;try{snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('fixture-readback','Snapshot response was not JSON.');}
  if(snapshot?.profile?.userId!==user.id)fail('fixture-isolation','Snapshot did not belong to the newly created fixture user.');
  if(user===s.users[0]&&JSON.stringify(snapshot).includes(FOREIGN_MARKER))fail('fixture-isolation','The second fixture account leaked into the first account snapshot.');
  return snapshot;
}
async function createFixtureUser(index){
  const s=state;
  // A fixed .invalid address preserves independently authored golden email facts.
  // Creation fails if a previous run still owns it; no existing account is reused.
  const email=index===0?'evaluation.student@example.invalid':`evaluation.other.${s.runId}@example.invalid`;
  const existing=await query(()=>s.sql`select id from auth.users where lower(email)=lower(${email}) limit 2`,'Could not check the reserved fixture identity.');
  if(existing.length)fail('fixture-create','The reserved synthetic address already exists; existing accounts are never reused or deleted.');
  const identityRequest={email,runId:s.runId,state:'pending'};
  s.identityRequests.push(identityRequest);
  // Record intent before the remote mutation. A timeout is not proof that Auth
  // did not commit; cleanup must reconcile the exact email AND run marker.
  await saveLedger();
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  let created;try{created=await s.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:index===0?'Evaluation Student':'Evaluation Other',assistant_evaluation_run:s.runId}});}catch{identityRequest.state='uncertain';await saveLedger();fail('fixture-create','Disposable account creation did not complete; its pending identity requires cleanup reconciliation.');}
  if(created.error||!UUID.test(created.data?.user?.id||'')||created.data.user.id===s.protectedOwnerBefore.id||created.data.user.email?.toLowerCase()!==email.toLowerCase()){
    // A network/5xx response can follow a committed write. Only a definite
    // client rejection establishes a terminal non-create response.
    const status=created.error?.status;
    identityRequest.state=Number.isInteger(status)&&status>=400&&status<500&&![408,409,425,429].includes(status)?'rejected':'uncertain';
    await saveLedger();fail('fixture-create','Could not create a fresh synthetic account; existing accounts are never reused.');
  }
  identityRequest.state='created';identityRequest.id=created.data.user.id;
  const user={id:created.data.user.id,token:null};s.users.push(user);
  // Durable cleanup identity is written immediately, before any additional write.
  await saveLedger();
  await query(()=>s.sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
    values(${user.id},${user.id},${s.sql.json({sub:user.id,email,email_verified:true})},'google',now(),now())`,'Could not link the disposable Google fixture identity.');
  const auth=createClient(s.url,s.publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:s.boundedFetch}});
  let signed;try{signed=await auth.auth.signInWithPassword({email,password});}catch{fail('fixture-signin','Synthetic account sign-in did not complete.');}
  if(signed.error||signed.data?.session?.user?.id!==user.id)fail('fixture-signin','Synthetic account session could not be verified.');
  attachFixtureSession(user,signed.data.session,{url:s.url,publishable:s.publishable,signal:s.signal,fetchImpl:s.boundedFetch});
  if(s.fixtureMode===FEE_FIXTURE_MODE||s.counselingOnly||s.clubOnly||s.elearningPublishedReadbackOnly||s.healthMetadataOnly||s.tutorEvaluationOnly||s.clubEquipmentOnly||s.dtmGradeOverview||s.studentLeaveGradePair||s.internshipNativeOnly||s.facilityRepairCancellationOnly||s.learningSupportPreviewOnly||s.clearanceStatusPreviewOnly||s.academicGradesPreviewOnly||s.dtmStudyPreviewOnly||s.teachingSampleOnly||s.venueProtectedOnly||s.certificateAwardPreviewOnly||s.assignmentTrackerOnly)return user;
  if(s.fixtureMode===dtmAssignmentListFixtureMode){
    await s.previewGate.assertCurrent();
    user.studentId=await initializeDtmAssignmentListStudent(user,{publishable:s.publishable,fetchImpl:s.boundedFetch,
      readResponse:readBoundedFixtureResponse,signal:s.signal});
    return user;
  }
  const initial=await readSnapshot(user);user.studentId=initial.student?.id;
  if(!UUID.test(user.studentId||''))fail('fixture-readback','Synthetic School Affairs student initialization failed.');
  return user;
}

/** No mutation occurs until this explicit lifecycle entry point is invoked. */
export async function prepare({runId,cases,now,origin,approvedPreviewOrigin,expectedReleaseRevision,signal,fixtureMode,caseFamily,applicationFetch,previewReadbackFetch,dtmGradeOverview=false,clearanceStatusTerms,studentLeaveGradePair=false}={}){
  if(state)fail('fixture-state','This fixture adapter cannot run overlapping lifecycles.');
  const leaveDataOnly=fixtureMode===runStudentLeaveDataPreflight;
  if(typeof studentLeaveGradePair!=='boolean'||studentLeaveGradePair&&!leaveDataOnly)
    fail('fixture-config','Moodle grade pairing requires the dedicated Student Leave fixture mode.');
  const counselingOnly=caseFamily==='counseling-appointments';
  const counselingCompound=counselingOnly&&fixtureMode===counselingCompoundFixtureMode;
  const taskActionOnly=fixtureMode==='confirmed-task-actions';
  const assignmentTrackerOnly=fixtureMode===confirmedAssignmentTrackerMode;
  const tuitionLedgerOnly=fixtureMode===tuitionLedgerFixtureMode;
  const dtmTimingOnly=fixtureMode===dtmTimingFixtureMode;
  const dtmMaterialPreviewOnly=fixtureMode===dtmMaterialPreviewMode;
  const dtmGradePreviewOnly=fixtureMode===dtmGradePreviewMode;
  const internshipNativeOnly=fixtureMode===internshipFixtureMode;
  const teachingSampleOnly=fixtureMode==='teaching-sample-only';
  const facilityRepairCancellationOnly=fixtureMode===facilityRepairCancellationMode;
  const learningSupportPreviewOnly=fixtureMode===learningSupportPreviewMode;
  const clearanceStatusPreviewOnly=fixtureMode===clearanceStatusPreviewMode;
  const academicGradesPreviewOnly=fixtureMode===academicGradesPreviewMode;
  const dtmStudyPreviewOnly=fixtureMode===dtmStudyPreviewMode;
  if(clearanceStatusPreviewOnly)assertClearanceStatusTermIds(clearanceStatusTerms);
  else if(clearanceStatusTerms!==undefined)fail('fixture-config','Graduation clearance term bindings require their protected fixture mode.');
  const venueProtectedOnly=fixtureMode===venueProtectedFixtureMode;
  const certificateAwardPreviewOnly=fixtureMode===certificateAwardPreviewMode;
  if(typeof dtmGradeOverview!=='boolean'||dtmGradeOverview&&!dtmGradePreviewOnly)
    fail('fixture-config','Moodle grade overview requires its isolated fixture.');
  if(!UUID.test(runId||'')||!Array.isArray(cases)||(!cases.length&&!leaveDataOnly&&!taskActionOnly&&!assignmentTrackerOnly&&!tuitionLedgerOnly&&!dtmTimingOnly&&!dtmMaterialPreviewOnly&&!dtmGradePreviewOnly&&!internshipNativeOnly&&!facilityRepairCancellationOnly&&!learningSupportPreviewOnly&&!clearanceStatusPreviewOnly&&!academicGradesPreviewOnly&&!dtmStudyPreviewOnly&&!teachingSampleOnly&&!venueProtectedOnly&&!certificateAwardPreviewOnly)||!Number.isFinite(Date.parse(now)))fail('fixture-config','A unique run ID, selected case list and valid evaluation clock are required.');
  if(taskActionOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Confirmed task checks require the exact protected Preview and isolated disposable owners.');
  if(assignmentTrackerOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Confirmed assignment tracker checks require the exact protected Preview and isolated disposable owners.');
  if(tuitionLedgerOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Tuition ledger checks require the exact protected Preview and isolated disposable owners.');
  if(dtmTimingOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Moodle timing checks require the exact protected Preview and isolated disposable owners.');
  if(dtmMaterialPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Moodle materials require the exact protected Preview and isolated disposable owners.');
  if(dtmGradePreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Moodle grade checks require the exact protected Preview and isolated disposable owners.');
  if(internshipNativeOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Internship checks require the exact protected Preview and isolated disposable owners.');
  if(venueProtectedOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Venue reads require the exact protected Preview and isolated disposable owners.');
  if(certificateAwardPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Certificate awards require the exact protected Preview and isolated disposable owners.');
  if(facilityRepairCancellationOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Facility repair cancellation requires the exact protected Preview and isolated disposable owners.');
  if(learningSupportPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Learning support checks require the exact protected Preview and isolated disposable owners.');
  if(clearanceStatusPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Graduation clearance status requires an exact protected Preview and two reviewed existing terms.');
  if(academicGradesPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Academic grades require an exact protected Preview and isolated disposable owners.');
  if(dtmStudyPreviewOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Moodle study records require an exact protected Preview and disposable owners.');
  if(teachingSampleOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Teaching feedback checks require the exact protected Preview and isolated disposable owners.');
  if(leaveDataOnly&&(cases.length||caseFamily!==undefined||applicationFetch!==undefined||origin!==approvedPreviewOrigin
    ||!isEvaluationPreviewOrigin(origin)||typeof previewReadbackFetch!=='function'))
    fail('fixture-config','Student Leave data preflight requires an exact protected Preview and no assistant cases.');
  if(counselingOnly){
    if(![counselingFixtureMode,counselingCompoundFixtureMode].includes(fixtureMode)||origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
      ||typeof previewReadbackFetch!=='function'||applicationFetch!==undefined)
      fail('fixture-target','Counseling fixtures require the exact protected Preview.');
    validateCounselingHostedCases(cases,{compound:counselingCompound});
  }else if(cases.some(row=>['counseling_appointments_disposable','counseling_tuition_disposable'].includes(row?.fixtureRequirement)))
    fail('fixture-target','Counseling fixture cases must run in the isolated evaluator.');
  const clubEquipmentOnly=caseFamily===clubEquipmentFamily;
  if(clubEquipmentOnly){
    if(fixtureMode!==clubEquipmentFixtureMode||origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
      ||typeof previewReadbackFetch!=='function'||applicationFetch!==undefined)
      fail('fixture-target','Club equipment requires the exact protected Preview and its isolated fixture.');
    validateClubEquipmentHostedCases(cases);
  }else if(cases.some(row=>row?.fixtureRequirement===clubEquipmentRequirement||typeof row?.id==='string'&&row.id.startsWith('account:club-equipment-')))
    fail('fixture-target','Club equipment cases require their isolated evaluator.');
  const tutorEvaluationOnly=caseFamily===tutorEvaluationFamily;
  if(tutorEvaluationOnly){
    if(fixtureMode!==tutorEvaluationFixtureMode||origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
      ||typeof previewReadbackFetch!=='function'||applicationFetch!==undefined)
      fail('fixture-target','Tutor evaluation requires the exact protected Preview and its isolated fixture.');
    validateTutorEvaluationHostedCases(cases);
  }else if(cases.some(row=>row?.fixtureRequirement==='tutor_evaluation_disposable'))
    fail('fixture-target','Tutor evaluation cases must run in their isolated evaluator.');
  const assignmentListOnly=fixtureMode===dtmAssignmentListFixtureMode;
  const healthMetadataOnly=fixtureMode===healthMetadataFixtureMode;
  if(healthMetadataOnly){
    if(caseFamily!==healthMetadataFamily||origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
      ||typeof previewReadbackFetch!=='function'||applicationFetch!==undefined)
      fail('fixture-target','Health metadata requires the exact protected Preview and read-only fixture transport.');
    assertHealthMetadataLiveCases(cases);
  }else if(cases.some(row=>row?.fixtureRequirement===healthMetadataRequirement))
    fail('fixture-unsupported','Health metadata requires its complete isolated fixture mode.');
  if(assignmentListOnly){
    if(!dtmAssignmentListFamilies.includes(caseFamily)||origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
      ||typeof previewReadbackFetch!=='function'||applicationFetch!==undefined)
      fail('fixture-target','Moodle assignment-list fixtures require the exact protected Preview and isolated case packet.');
    assertDtmAssignmentListLiveCases(cases,caseFamily,{now});
    assertDtmAssignmentListClock(cases[0],new Date().toISOString(),{reserveMs:65_000});
  }else if(cases.some(row=>row?.fixtureRequirement===dtmAssignmentListRequirement))
    fail('fixture-unsupported','Moodle assignment-list fixtures must use their isolated case packet.');
  if(!assignmentListOnly&&cases.some(row=>row?.fixtureRequirement==='offline_dtm_native_fixture'||row?.fixtureRequirement==='legacy_dtm_assignment_list_rebind'||typeof row?.id==='string'
    &&(row.id.startsWith('account:dtm-native-route-')||row.id.startsWith('account:dtm-assignment-native-')||row.id.startsWith('account:dtm-assignment-list-'))))
    fail('fixture-unsupported','Native DTM route cases require the isolated fixture and observation adapter.');
  if(cases.some(row=>row?.fixtureRequirement==='offline_native_teaching_feedback'||typeof row?.id==='string'&&row.id.startsWith('account:teaching-native-')))
    fail('fixture-unsupported','Teaching feedback requires an isolated fixture and trusted request observation; the legacy adapter cannot prepare this offline packet.');
  if(cases.some(nativeStudentLeaveSetupRequired))
    fail('fixture-unsupported','Native Student Leave requires an isolated fixture and trusted request observations.');
  if(cases.some(nativeInternshipSetupRequired))
    fail('fixture-unsupported','Native internship requires isolated caller fixtures and independent request observations.');
  const clubCases=cases.filter(row=>row?.clubAttendanceOracle!==undefined||row?.fixtureRequirement==='club_attendance_disposable');
  for(const testCase of clubCases)clubAttendanceOracle(testCase);
  if(clubCases.some(testCase=>testCase.fixtureKey!=='anonymous')&&(!approvedPreviewOrigin||origin!==approvedPreviewOrigin
    ||!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(origin)))
    fail('fixture-target','Club attendance fixtures require the exact approved project Preview.');
  const clubOnly=cases.length>0&&clubCases.length===cases.length;
  const noteCases=cases.filter(row=>row?.fixtureRequirement==='service_notes_disposable'||row?.fixtureRequirement==='service_notes_unbound'
    ||typeof row?.id==='string'&&row.id.startsWith('account:service-notes-'));
  for(const testCase of noteCases){
    serviceNoteRunnerOracle(testCase);
    if(serviceNoteSetupRequired(testCase))fail('fixture-unsupported','This service-note case has no independent hosted fixture.');
  }
  if(noteCases.some(testCase=>testCase.fixtureKey!=='anonymous')&&(!approvedPreviewOrigin||origin!==approvedPreviewOrigin
    ||!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(origin)))
    fail('fixture-target','Service-note fixtures require the exact approved project Preview.');
  const noteOnly=cases.length>0&&noteCases.length===cases.length;
  const elearningCases=cases.filter(isElearningPublishedReadbackCase);
  for(const testCase of elearningCases)assertElearningCatalogCaseReady(testCase);
  const elearningPublishedReadbackOnly=elearningCases.length>0&&elearningCases.length===cases.length;
  if(elearningCases.length&&(origin!==approvedPreviewOrigin||!isEvaluationPreviewOrigin(origin)
    ||typeof previewReadbackFetch!=='function'))
    fail('fixture-target','Digital Academy published readbacks require the exact protected Preview.');
  if(cases.some(nativeVenueSetupRequired))
    fail('fixture-unsupported','Native venue requests require exact caller fixtures and independent request observations.');
  let transcriptCaseIds;
  if(applicationFetch!==undefined){
    if(typeof applicationFetch!=='function'||cases.length!==transcriptFixtureCases.length||fixtureMode!==undefined||caseFamily!==undefined
      ||!approvedPreviewOrigin||origin!==approvedPreviewOrigin)fail('fixture-config','The injected transport requires the exact approved Preview four-turn packet.');
    transcriptCaseIds=cases.map((testCase,index)=>assertTranscriptFixtureCase(testCase,index));
  }
  if(!leaveDataOnly&&!assignmentListOnly&&!taskActionOnly&&!assignmentTrackerOnly&&!tuitionLedgerOnly&&!dtmTimingOnly&&!dtmMaterialPreviewOnly&&!dtmGradePreviewOnly&&!healthMetadataOnly&&!counselingOnly&&!tutorEvaluationOnly&&!clubEquipmentOnly&&!internshipNativeOnly&&!facilityRepairCancellationOnly&&!learningSupportPreviewOnly&&!clearanceStatusPreviewOnly&&!academicGradesPreviewOnly&&!dtmStudyPreviewOnly&&!teachingSampleOnly&&!venueProtectedOnly&&!certificateAwardPreviewOnly&&(fixtureMode!==undefined||caseFamily!==undefined)){
    const expected=feeRemissionLivePlanManifest.eligibleCaseIds;
    if(fixtureMode!==FEE_FIXTURE_MODE||caseFamily!=='fee-remission'||!approvedPreviewOrigin||cases.length!==expected.length
      ||new Set(cases.map(row=>row?.id)).size!==expected.length||!expected.every(id=>cases.some(row=>row?.id===id)))
      fail('fixture-config','The fee-only adapter requires the complete approved Preview packet.');
  }
  if(resolve(process.cwd())!==resolve(ROOT))fail('fixture-target','Run this adapter from the exact client checkout root.');
  const config=JSON.parse(await readFile(resolve(ROOT,'deployment.json'),'utf8'));
  if(config.repository!=='LuxArt0317/std_edu_ai'||config.supabase?.projectRef!==PROJECT)fail('fixture-target','Deployment configuration is not the authorized client project.');
  let target;
  try{target=new URL(origin||config.vercel.productionUrl);}catch{fail('fixture-config','Invalid configured application origin.');}
  if(target.username||target.password||target.pathname!=='/'||target.search||target.hash
    ||!(target.origin===config.vercel.productionUrl||target.origin===approvedPreviewOrigin
      ||['127.0.0.1','localhost'].includes(target.hostname)&&['http:','https:'].includes(target.protocol)))
    fail('fixture-target','Only the configured production origin, exact approved preview or explicit loopback is allowed.');
  const scopedApplicationFetch=applicationFetch===undefined?undefined:createTranscriptFixtureApplicationFetch({origin:target.origin,fetchImpl:applicationFetch,signal});
  if(previewReadbackFetch!==undefined&&(typeof previewReadbackFetch!=='function'||applicationFetch!==undefined
    ||!approvedPreviewOrigin||origin!==approvedPreviewOrigin||target.origin===config.vercel.productionUrl))
    fail('fixture-target','Protected fixture readbacks require the exact approved Preview.');
  let previewGate;
  if(approvedPreviewOrigin!==undefined){
    if(target.origin!==approvedPreviewOrigin||target.origin===config.vercel.productionUrl)
      fail('fixture-target','Preview approval must match the exact non-production origin.');
    const pinFetch=scopedApplicationFetch??previewReadbackFetch;
    try{
      previewGate=createPinnedDeploymentVerifier({origin:target.origin,approvedPreviewOrigin,expectedRevision:expectedReleaseRevision,signal,...(pinFetch?{fetchImpl:pinFetch}:{})});
      await previewGate.pin();
    }
    catch{fail('fixture-target','The approved Preview could not prove the exact release before fixture setup.');}
  }
  const env=deploymentEnvironment(); // Secrets are resolved only at explicit prepare().
  const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
  const publishable=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!url||!connection||!publishable||!serviceKey)fail('fixture-config','Exact-client database and Auth credentials are required.');
  let db,base;try{db=new URL(connection);base=new URL(url);}catch{fail('fixture-config','Invalid configured project URL.');}
  if(base.protocol!=='https:'||base.hostname!==PROJECT+'.supabase.co'||base.username||base.password)fail('fixture-target','Supabase URL does not match the exact client project.');
  if(!(db.hostname==='db.'+PROJECT+'.supabase.co'||db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username).endsWith('.'+PROJECT)))fail('fixture-target','Database connection does not match the exact client project.');
  const ignore=await readFile(resolve(ROOT,'.gitignore'),'utf8');if(!/^\/?artifacts\/$/m.test(ignore))fail('fixture-ledger','Private fixture ledger directory must be ignored by Git.');
  await mkdir(PRIVATE_DIR,{recursive:true,mode:0o700});await chmod(PRIVATE_DIR,0o700);
  const boundedFetch=(input,init={})=>fetch(input,{...init,signal:signals(init.signal,15000)});
  state={runId,now,origin:target.origin,url,publishable,signal,boundedFetch,previewReadbackFetch,...(scopedApplicationFetch?{applicationFetch:scopedApplicationFetch}:{}),startedAt:new Date().toISOString(),users:[],identityRequests:[],recordIds:new Set(),supplementalTables:new Set(),caseIds:new Set(transcriptCaseIds??cases.map(row=>row.id)),prepared:false,closing:false,closed:false,current:null,ledgerOwned:false,ledgerTempOwned:false,fixtureMode,counselingOnly,clubOnly,healthMetadataOnly,tutorEvaluationOnly,clubEquipmentOnly,elearningPublishedReadbackOnly,previewGate,dtmGradeOverview,studentLeaveGradePair,internshipNativeOnly,
    facilityRepairCancellationOnly,learningSupportPreviewOnly,clearanceStatusPreviewOnly,academicGradesPreviewOnly,dtmStudyPreviewOnly,teachingSampleOnly,venueProtectedOnly,certificateAwardPreviewOnly,assignmentTrackerOnly,ledger:resolve(PRIVATE_DIR,'active-fixtures-'+runId+'.json'),
    admin:createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}})};
  try{
    state.sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:10,max_lifetime:0,
      ssl:{rejectUnauthorized:true,ca:await readFile(resolve(ROOT,'supabase/certs/prod-ca-2021.crt'),'utf8')},onnotice:()=>{},
      connection:{application_name:'stu-assistant-evaluation',statement_timeout:15000,lock_timeout:3000,idle_in_transaction_session_timeout:15000}});
    // Reserve one physical connection: the advisory lock must cover every case.
    state.db=state.sql;state.sql=await query(()=>state.db.reserve(),'Could not reserve the bounded fixture connection.');
    const locked=await query(()=>state.sql`select pg_try_advisory_lock(23101314,115100) as held`,'Could not acquire the fixture exclusivity lock.');
    if(locked[0]?.held!==true)fail('fixture-lease','Another evaluation fixture lifecycle owns the database lock.');state.locked=true;
    await assertNoPendingRecoveryLedgers();
    if(teachingSampleOnly)state.teachingCatalog=await readTeachingSampleCatalog(state.sql);
    if(studentLeaveGradePair){
      await previewGate.assertCurrent();
      try{await assertStudentLeaveGradePairSchema(state.sql);}
      catch{fail('fixture-schema','The paired Moodle grade schema and caller permissions are required before fixture identities are created.');}
    }
    if(learningSupportPreviewOnly){
      await previewGate.assertCurrent();
      try{await assertLearningSupportPreviewSchema(state.sql);}
      catch{fail('fixture-schema','The exact learning support migration and caller permissions are required before fixture identities are created.');}
    }
    if(clearanceStatusPreviewOnly){
      await previewGate.assertCurrent();
      await assertClearanceStatusSchema(state.sql);
      state.clearanceStatusShared=await readClearanceStatusShared(state.sql,clearanceStatusTerms);
    }
    if(academicGradesPreviewOnly){
      await previewGate.assertCurrent();
      await query(()=>assertAcademicGradesPreviewSchema(state.sql),'The four protected Academic Services tables are required before fixture account creation.');
    }
    if(dtmStudyPreviewOnly){
      await previewGate.assertCurrent();
      await query(()=>assertDtmStudyPreviewSchema(state.sql),'Both protected Moodle tables are required before fixture account creation.');
    }
    if(certificateAwardPreviewOnly){
      await previewGate.assertCurrent();
      state.certificateAwardCatalogDigest=await query(()=>readCertificateAwardPreviewCatalog(state.sql),
        'The existing certificate migration, authenticated RPC and catalog are required before fixture account creation.');
    }
    if(assignmentTrackerOnly){
      await previewGate.assertCurrent();
      try{await assertConfirmedAssignmentTrackerSchema(state.sql);}
      catch{fail('fixture-schema','The reviewed action and Moodle file and grade scopes are required before fixture identities are created.');}
    }
    state.protectedOwnerEmail=config.supabase.ownerEmail;
    state.protectedOwnerBefore=await readProtectedOwnerFingerprint(state.sql,state.protectedOwnerEmail);
    await reserveLedger();
    await saveLedger();
    await createFixtureUser(0);await createFixtureUser(1);
    if(assignmentTrackerOnly){
      state.assignmentTrackerJournal=[];
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['personalAssignmentTracker']};
    }
    if(taskActionOnly){
      state.taskActionJournal=[];
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['tasks']};
    }
    if(tuitionLedgerOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['paymentHistory']};
    }
    if(dtmTimingOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['dtmSubmissionTiming']};
    }
    if(dtmMaterialPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['dtmMaterials']};
    }
    if(dtmGradePreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['dtmGradeReport']};
    }
    if(internshipNativeOnly){
      state.internshipObservationKey=serviceKey;
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['internshipRecords']};
    }
    if(venueProtectedOnly){
      state.venueObservationKey=serviceKey;
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['venueRequests']};
    }
    if(certificateAwardPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['certificate-awards']};
    }
    if(facilityRepairCancellationOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['facilityRepairs']};
    }
    if(learningSupportPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['learningSupport']};
    }
    if(clearanceStatusPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['graduationClearance']};
    }
    if(academicGradesPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['academicGrades']};
    }
    if(dtmStudyPreviewOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['dtm']};
    }
    if(teachingSampleOnly){
      state.teachingObservationKey=serviceKey;
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['teachingFeedback']};
    }
    if(leaveDataOnly){
      await prepareStudentLeaveDataFixture(state,expectedReleaseRevision,previewGate,serviceKey);
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['leaveRecords']};
    }
    if(fixtureMode!==undefined&&fixtureMode===FEE_FIXTURE_MODE){
      await prepareFeeFixture(state);
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['feeRemission','charges']};
    }
    if(healthMetadataOnly){
      prepareHealthMetadataFixture(state);
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['healthExaminations']};
    }
    if(counselingOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:counselingCompound?['counselingAppointments','charges']:['counselingAppointments']};
    }
    if(clubEquipmentOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['clubEquipment']};
    }
    if(tutorEvaluationOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['tutorEvaluation']};
    }
    if(assignmentListOnly){
      await prepareDtmAssignmentListFixture(state,cases,caseFamily);
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['dtmAssignmentList']};
    }
    if(elearningPublishedReadbackOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:[...new Set(elearningCases.map(testCase=>testCase.domain))]};
    }
    if(clubOnly){
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['clubAttendance']};
    }
    if(noteOnly){
      state.noteOnly=true;
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['serviceRecords']};
    }
    const foreignId=randomUUID();state.recordIds.add(foreignId);await saveLedger();
    await query(()=>state.sql`insert into public.dtm_courses(id,user_id,code,title,term,role,source_mode)
      values(${foreignId},${state.users[1].id},'FOREIGN-EVAL',${FOREIGN_MARKER},'Synthetic private term','student','personal')`,'Could not create the isolated second-account sentinel.');
    state.foreignDtmCourseId=foreignId;
    await readSnapshot(state.users[0]);
    state.prepared=true;
    return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:[...SUPPORTED_TOOLS,...(clubCases.length?['clubAttendance']:[])]};
  }catch(error){
    // Limit orphan lifetime when prepare itself fails. A failed cleanup closes
    // the connection and retains its ledger; the runner's later cleanup call
    // reports explicit recovery instead of attempting an invalid closed retry.
    if(tuitionLedgerOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Tuition ledger fixture preparation failed.');
      reason.tuitionLedgerCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(dtmTimingOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Moodle timing fixture preparation failed.');
      reason.dtmTimingCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(dtmMaterialPreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Moodle material fixture preparation failed.');
      reason.dtmMaterialPreviewCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(dtmGradePreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Moodle grade fixture preparation failed.');
      reason.dtmGradePreviewCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(venueProtectedOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Venue fixture preparation failed.');
      reason.venueCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(assignmentTrackerOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Confirmed assignment tracker preparation failed.');
      reason.assignmentTrackerCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(certificateAwardPreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Certificate award fixture preparation failed.');
      reason.certificateAwardCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(facilityRepairCancellationOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Facility repair cancellation fixture preparation failed.');
      reason.facilityRepairCancellationCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(learningSupportPreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Learning support fixture preparation failed.');
      reason.learningSupportPreviewCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(clearanceStatusPreviewOnly){
      const proof=await captureFixtureCleanup();
      const reason=error instanceof LiveFixtureError||error instanceof ClearanceStatusPreviewError?error:
        new LiveFixtureError('fixture-prepare','Graduation clearance fixture preparation failed.');
      reason.clearanceStatusPreviewCleanupProof=proof;
      throw reason;
    }
    if(academicGradesPreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Academic grades fixture preparation failed.');
      reason.academicGradesPreviewCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(dtmStudyPreviewOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Moodle study fixture preparation failed.');
      reason.dtmStudyPreviewCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    if(teachingSampleOnly){
      const reason=error instanceof LiveFixtureError?error:new LiveFixtureError('fixture-prepare','Teaching feedback fixture preparation failed.');
      reason.teachingSampleCleanupProof=await captureFixtureCleanup();
      throw reason;
    }
    try{await cleanup();}catch{/* The original error is safe; ledger remains. */}
    if(error instanceof LiveFixtureError)throw error;fail('fixture-prepare','Fixture preparation failed'+diagnostic(error)+'.');
  }
}

async function prepareStudentLeaveDataFixture(s,sourceRevision,previewGate,key){
  const [first,second]=s.identityRequests;
  const owner=request=>({id:request.id,email:request.email,runMarker:request.runId});
  const owners={A:owner(first),B:owner(second)};
  const binding={runId:s.runId,projectRef:PROJECT,origin:s.origin,sourceRevision,owners,
    suiteHash:hash({kind:'student-leave-data-preflight',manifest:studentLeaveFixtureManifest,...(s.studentLeaveGradePair?{companion:'dtmGradeReport'}:{})})};
  if(s.studentLeaveGradePair){
    await assertRecordedFixtureLease(s,'Student Leave/Moodle grade setup');
    await previewGate.assertCurrent();
    s.dtmGradeOverview=true; // Existing exact grade cleanup and journal.
    s.dtmGradePreview=buildStudentLeaveGradePairFixture(s.runId,owners);
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedDtmGradeOverviewRows(s.sql,s.dtmGradePreview)),
      'Could not seed the paired disposable Moodle grade rows.');
  }
  const lifecycle=createStudentLeaveDatabaseFixture({binding,sql:s.sql,publishableKey:s.publishable,
    journal:await openStudentLeaveFixtureJournal({directory:PRIVATE_DIR,binding:studentLeaveJournalBinding(binding)}),
    async assertLease(){await assertRecordedFixtureLease(s,'Student Leave');return true;},
    async assertCurrentRelease(){await previewGate.assertCurrent();return true;},
    async assertProtectedOwner(){assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));return true;},
    async getCaller(id,{signal}){
      const user=s.users.find(candidate=>candidate.id===id);
      if(!user||s.closing)fail('fixture-case','Student Leave data preflight requires its exact disposable caller.');
      await user.renewSession({signal});return {id:user.id,token:user.token};
    },fetchImpl:s.boundedFetch});
  s.studentLeaveData={binding,lifecycle,previewGate,async observeGradeReadbacks(){
    if(!s.studentLeaveGradePair)fail('fixture-case','No paired Moodle grade fixture was prepared.');
    await assertRecordedFixtureLease(s,'Student Leave/Moodle grade readback');
    await previewGate.assertCurrent();
    const fixture=s.dtmGradePreview;
    const rows=await query(()=>observeDtmGradeOverviewRows(s.sql,fixture),'Could not verify the exact paired Moodle rows.');
    const fetchImpl=async(...args)=>{
      const ticket=await previewGate.beforeRequest();
      try{return await s.previewReadbackFetch(...args);}
      finally{await previewGate.afterRequest(ticket);}
    };
    const callers=await readDtmGradeOverviewScopes(fixture,s.users,{origin:s.origin,signal:s.signal,
      fetchImpl,readResponse:readBoundedFixtureResponse});
    return {rows,callers};
  },async observe(plan,testCase,seenCorrelations){
    await assertRecordedFixtureLease(s,'Student Leave');
    const caller=s.users[0];
    const signal=signals(s.signal,65000);
    await caller.renewSession({signal});
    return requestObservedStudentLeave({plan,testCase,key,token:caller.token,fetchImpl:s.previewReadbackFetch,signal,seenCorrelations,
      ...(s.studentLeaveGradePair?{gradeOverview:s.dtmGradePreview.overviews.A}:{})});
  }};
  await saveLedger();
}

/** Independently verify all eight disposable families without assistant/model I/O. */
export function runStudentLeaveDataPreflight(options){
  return runPreparedStudentLeave(options,async({binding,lifecycle})=>{
    const families=[];
    for(const family of leaveFixtureFamilies){
      const firstProof=await lifecycle.transition(buildStudentLeaveFixturePlan({binding,family}));
      const secondProof=await lifecycle.verifyUnchanged();
      assert.deepEqual(secondProof,firstProof);
      families.push({family,rowDigest:firstProof.rowDigest,ownerAndCrossedReads:firstProof.ownerAndCrossedReads+secondProof.ownerAndCrossedReads});
    }
    return {families,modelRequests:0,requestObservationsMounted:false,liveAcceptance:false};
  });
}

/** Exact caller-owned native cases with hosted request, reader and check proof. */
export function runStudentLeaveHostedEvaluation({caseIds,...options}={}){
  const selection=studentLeaveHostedSelection(caseIds);
  const studentLeaveGradePair=selection.every(row=>row.companion==='dtmGradeReport');
  return runPreparedStudentLeave({...options,studentLeaveGradePair},async({binding,lifecycle,previewGate,observe,observeGradeReadbacks})=>{
    const results=[],seenCorrelations=new Set();
    const families=new Set(selection.map(row=>row.family));
    for(const family of families){
      const plan=buildStudentLeaveFixturePlan({binding,family});
      const firstProof=await lifecycle.transition(plan);
      for(const {testCase} of selection.filter(row=>row.family===family)){
        const gradeBefore=studentLeaveGradePair?await observeGradeReadbacks():null;
        const ticket=await previewGate.beforeRequest();
        let result;
        try{result=await observe(plan,testCase,seenCorrelations);}
        finally{await previewGate.afterRequest(ticket);}
        const secondProof=await lifecycle.verifyUnchanged();
        assert.deepEqual(secondProof,firstProof);
        if(gradeBefore)assert.deepEqual(await observeGradeReadbacks(),gradeBefore);
        results.push({...result,fixtureDigest:firstProof.rowDigest,...(gradeBefore?{gradeFixtureReadback:gradeBefore}:{})});
      }
    }
    return {results,requestObservationsMounted:true,hostedCases:selection.length,
      completedNativeChecks:results.filter(row=>row.completedNativeCheck).length,
      completedBoundaryChecks:results.filter(row=>row.completedBoundaryCheck).length,
      completedModelCalls:results.reduce((count,row)=>count+row.completedModelCalls,0),
      liveAcceptance:results.every(result=>result.passed)};
  });
}

async function runPreparedStudentLeave({origin,sourceRevision,previewToken,signal,studentLeaveGradePair=false}={},perform){
  if(!isEvaluationPreviewOrigin(origin)||typeof sourceRevision!=='string'||!/^[a-f0-9]{40}$/u.test(sourceRevision))
    fail('fixture-config','Student Leave data preflight requires an exact protected Preview and source revision.');
  const {sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Student Leave requires the exact clean deployed source.');
  const previewReadbackFetch=createTrustedPreviewFetch({origin,token:previewToken});
  const runId=randomUUID();
  await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:runStudentLeaveDataPreflight,previewReadbackFetch,studentLeaveGradePair});
  const prepared=state.studentLeaveData,{previewGate}=prepared;
  let result,cleanupProof;
  try{
    result=await perform(prepared);
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','The Student Leave source changed during verification.');
    await previewGate.finish();
  }finally{cleanupProof=await cleanup();}
  return {runId,sourceRevision,origin,...result,...(studentLeaveGradePair?{liveAcceptance:result.liveAcceptance
    &&cleanupProof.verified&&cleanupProof.dtmGradePreviewCleanup===true&&cleanupProof.studentLeaveDataCleanup?.cleaned===true}:{}),
    deployment:previewGate.status(),cleanup:cleanupProof};
}

export async function runInternshipPreview({origin,sourceRevision,previewToken,signal,caseIds,publishedTimetable=false,onCheckpoint}={}){
  if(typeof publishedTimetable!=='boolean'||publishedTimetable&&caseIds!==undefined)fail('fixture-config','Select either the independent published timetable packet or the original Internship cases.');
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Internship requires the exact protected Preview and source revision.');
  const cases=publishedTimetable?[]:internshipHostedCases(caseIds),runId=randomUUID(),results=[],correlations=new Set();
  const selectedCases=publishedTimetable?internshipPublishedTimetableCaseIds:cases.map(row=>row.id);
  const requiresCharges=cases.some(row=>row.observationExpectation.companion==='charges');
  let phase='preflight',prepared=false,previewGate,failure;
  let cleanupProof={verified:false,status:'not-started'};
  const report=()=>({runId,origin,sourceRevision,selectedCases,results,
    ...(publishedTimetable?{caseFamily:'independent-published-timetable'}:{}),
    ...(failure?{failure}:{}),deployment:previewGate?.status()??null,cleanup:cleanupProof,
    liveAcceptance:!failure&&results.length===selectedCases.length&&results.every(row=>row.passed)
      &&previewGate?.status().status==='finished'&&cleanupProof.verified&&cleanupProof.internshipCleanup===true
      &&(!requiresCharges||cleanupProof.internshipChargeCleanup===true)
      &&(!publishedTimetable||cleanupProof.internshipTimetableCleanup===true)});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Internship requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:internshipFixtureMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='bind';
    if(s.users.length!==2||s.users.some(user=>user.id===s.protectedOwnerBefore.id
      ||!s.identityRequests.some(row=>row.id===user.id&&row.runId===runId&&row.state==='created')))
      fail('fixture-isolation','Internship callers are outside the disposable lease.');
    const binding={runId,owners:{A:s.users[0].id,B:s.users[1].id}};
    const reserved=buildInternshipFixturePlan(binding).ids;
    s.internshipFixture=createInternshipFixture({sql:s.sql,binding,
      assertLease:async({cleanup=false}={})=>{
        await assertRecordedFixtureLease(s,'Internship');
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        if(!cleanup)await previewGate.assertCurrent();
      },
      persist:async journal=>{
        s.internshipJournal={...journal,binding};
        for(const value of Object.values(reserved).flat())s.recordIds.add(value);
        await saveLedger();
      },
      transaction:work=>feeTransaction(s,work),
    });
    await assertRecordedFixtureLease(s,'Internship profiles');
    await previewGate.assertCurrent();
    await feeTransaction(s,async()=>{
      for(const request of s.identityRequests)
        await s.sql`insert into public.affairs_profiles(user_id,email,display_name,role)
          select id,email,'Evaluation Internship Student','student' from auth.users
          where id=${request.id} and email=${request.email} and raw_user_meta_data->>'assistant_evaluation_run'=${s.runId}`;
      const verified=await s.sql`select user_id from public.affairs_profiles where user_id in ${s.sql(s.users.map(user=>user.id))} and role='student'`;
      if(verified.length!==2)fail('fixture-isolation','Internship disposable roles could not be verified.');
    });
    if(requiresCharges){
      phase='seed-charges';
      await assertRecordedFixtureLease(s,'Internship charges');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await previewGate.assertCurrent();
      const programs=await s.sql`select id from public.affairs_programs where code='SAMPLE-GEN' and source_mode='sample'`;
      if(programs.length!==1)fail('fixture-create','The existing sample program could not be bound.');
      s.internshipChargePlan=buildInternshipChargeFixture({...binding,programId:programs[0].id});
      for(const id of s.internshipChargePlan.recordIds)s.recordIds.add(id);
      await saveLedger();
      await feeTransaction(s,()=>stageInternshipCharges(s.sql,s.internshipChargePlan));
    }
    const timetablePlan=async()=>buildInternshipTimetableFixture({...binding,read:await readPublishedSampleInitializerRows(s.sql),now:new Date().toISOString()});
    if(publishedTimetable){
      phase='seed-published-timetable';
      await assertRecordedFixtureLease(s,'Internship timetable');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await previewGate.assertCurrent();
      s.internshipTimetablePlan=await timetablePlan();
      for(const {id}of s.internshipTimetablePlan.students)s.recordIds.add(id);
      await saveLedger();
      await feeTransaction(s,async()=>{
        s.internshipTimetableState=await stageInternshipTimetable(s.sql,s.internshipTimetablePlan);
        for(const {id}of s.internshipTimetableState.enrollments)s.recordIds.add(id);
        await saveLedger();
      });
      // Fixed source facts; the date is freshly bound at every case below.
      const next=await readInternshipNextMeeting(s.sql,s.internshipTimetablePlan.students[0].id,new Date().toISOString());
      cases.push(...selectedCases.map(id=>internshipPublishedTimetableCase(id,next)));
    }
    const observe=async(plan,companion)=>{
      const rowsDigest=await s.internshipFixture.observe();
      const bounded=signals(signal);
      await Promise.all(s.users.map(user=>user.renewSession({signal:bounded})));
      const callerOptions={callers:s.users,publishableKey:s.publishable,fetchImpl:s.boundedFetch,
        readResponse:readBoundedFixtureResponse,signal:bounded};
      const callers=await observeInternshipCallerRows(plan,callerOptions);
      const charges=companion==='charges'?{
        rowsDigest:await observeInternshipChargeRows(s.sql,s.internshipChargePlan),
        ...await observeInternshipChargeCallers(s.internshipChargePlan,callerOptions),
      }:null;
      const proof={rowsDigest,callerDigest:callers.digest,callerChecks:callers.checks,...(charges?{charges}:{})};
      if(companion!=='courses')return {proof};
      const timetable=await timetablePlan();
      if(!isDeepStrictEqual(timetable,s.internshipTimetablePlan))fail('fixture-unsupported','The shared published timetable changed.');
      const current=await observeInternshipTimetableRows(s.sql,timetable);
      if(!isDeepStrictEqual(current,s.internshipTimetableState))
        fail('fixture-unapproved-write','The exact disposable enrollment IDs or fields changed.');
      const paired=await observeInternshipTimetableCallers(timetable,current,callerOptions);
      const next=await readInternshipNextMeeting(s.sql,timetable.students[0].id,new Date().toISOString());
      return {proof:{...proof,timetable:{...paired,next,sharedDigest:timetable.sharedDigest,rowsDigest:internshipObservationDigest(current)}},
        timetable:{plan:timetable,state:current,next}};
    };
    // Group equal row states while retaining exact question order within each state.
    for(const kind of new Set(cases.map(internshipFixtureKindForCase))){
      phase='seed-'+kind;
      await s.internshipFixture.transition(kind);
      const plan=s.internshipFixture.current();
      for(const plannedCase of cases.filter(row=>internshipFixtureKindForCase(row)===kind)){
        phase=plannedCase.id;
        const companion=plannedCase.observationExpectation.companion;
        const {proof:before,timetable}=await observe(plan,companion);
        const testCase=timetable?internshipPublishedTimetableCase(plannedCase.id,timetable.next):plannedCase;
        const privateMarkers=[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),
          ...Object.values(plan.ids).flat(),...(s.internshipChargePlan?[...s.internshipChargePlan.recordIds,s.internshipChargePlan.charges[1].label]:[]),
          ...(timetable?[...timetable.state.students.map(row=>row.id),...timetable.state.enrollments.map(row=>row.id)]:[])];
        let ticket,result;
        try{
          result=await pace(()=>requestInternshipHostedCase({testCase,plan,chargePlan:s.internshipChargePlan,timetable,origin,sourceRevision,runId,token:s.users[0].token,
            key:s.internshipObservationKey,signal:signals(signal,65000),fetchImpl:readback,readResponse:readBoundedFixtureResponse,
            privateMarkers,correlations}),signal,async()=>{ticket=await previewGate.beforeRequest();});
        }finally{if(ticket)await previewGate.afterRequest(ticket);}
        const {proof:after}=await observe(plan,companion);
        if(companion==='courses'&&!isDeepStrictEqual(before.timetable.next,after.timetable.next))
          fail('fixture-unsupported','The next meeting changed while the paced request was in flight.');
        if(!isDeepStrictEqual(before,after))fail('fixture-unapproved-write','Internship fixtures changed during a read-only case.');
        results.push({...result,before,after,requestIndex:ticket.requestIndex});
        await onCheckpoint?.(report());
      }
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Internship source changed during verification.');
  }catch(error){failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};}
  finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    if(previewGate)try{await previewGate.finish();}catch{failure??={phase:'release-verification',code:'fixture-target'};}
    await onCheckpoint?.(report());
  }
  return report();
}

export async function runTeachingSamplePreview({origin,sourceRevision,previewToken,signal,caseIds,onCheckpoint,original=false}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Teaching feedback requires the exact protected Preview and source revision.');
  const cases=(original?teachingOriginalProtectedCases:teachingSampleCases)(caseIds),runId=randomUUID(),results=[],correlations=new Set();
  let phase='preflight',prepared=false,previewGate,failure,suiteDigest=null;
  let cleanupProof={verified:false,status:'not-started'};
  const report=()=>({runId,origin,sourceRevision,selectedCases:cases.map(row=>row.id),results,
    coverage:original?'frozen-teaching-boundaries-and-empty':'additional-sample-teaching-feedback',
    suiteDigest,...(failure?{failure}:{}),deployment:previewGate?.status()??null,cleanup:cleanupProof,
    liveAcceptance:!failure&&suiteDigest!==null&&results.length===cases.length&&results.every(row=>row.passed)
      &&previewGate?.status().status==='finished'&&cleanupProof.verified&&cleanupProof.teachingSampleCleanup===true});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Teaching feedback requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,
      expectedReleaseRevision:sourceRevision,signal,fixtureMode:'teaching-sample-only',previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='bind';
    if(s.users.length!==2)fail('fixture-isolation','Teaching feedback requires exactly two disposable owners.');
    const owners=Object.fromEntries(s.users.map((user,index)=>{
      const request=s.identityRequests.find(item=>item.id===user.id&&item.runId===runId&&item.state==='created');
      if(!request||user.id===s.protectedOwnerBefore.id)fail('fixture-isolation','Teaching feedback needs two fresh caller identities.');
      return [index===0?'A':'B',{id:user.id,email:request.email}];
    }));
    const binding={runId,owners},catalog=s.teachingCatalog;
    suiteDigest=hash({version:1,sourceRevision,cases,catalog});
    const reserved=Object.values(buildTeachingSampleFixture(binding,catalog).ids).flat();
    s.teachingSampleFixture=createTeachingSampleFixture({sql:s.sql,binding,catalog,
      assertLease:async({cleanup=false}={})=>{
        await assertRecordedFixtureLease(s,'Teaching feedback');
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        if(cleanup)return;
        for(const owner of Object.values(owners)){
          const identities=await s.sql`select u.id from auth.users u where u.id=${owner.id} and u.email=${owner.email}
            and u.email_confirmed_at is not null and u.raw_user_meta_data->>'assistant_evaluation_run'=${runId}
            and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
          if(identities.length!==1)fail('fixture-isolation','Teaching feedback lost a verified disposable owner.');
        }
        await previewGate.assertCurrent();
      },
      persist:async journal=>{
        s.teachingJournal={binding,catalog,suiteDigest,journal};
        for(const id of reserved)s.recordIds.add(id);
        await saveLedger();
      },
      transaction:work=>feeTransaction(s,work),
    });
    const observe=async plan=>{
      const rowsDigest=await s.teachingSampleFixture.observe(),bounded=signals(signal);
      await Promise.all(s.users.map(user=>user.renewSession({signal:bounded})));
      const callerProof=await observeTeachingSampleCallers(plan,{callers:s.users,publishableKey:s.publishable,
        fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:bounded});
      return {rowsDigest,callerDigest:callerProof.digest,callerChecks:callerProof.checks};
    };
    for(const variant of new Set(cases.map(row=>row.variant))){
      phase='seed-'+variant;
      await s.teachingSampleFixture.transition(variant);
      const plan=s.teachingSampleFixture.current();
      for(const testCase of cases.filter(row=>row.variant===variant)){
        phase=testCase.id;
        const before=await observe(plan),caller=s.users[testCase.owner==='A'?0:1];
        const privateMarkers=[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),
          ...reserved,...catalog.sections.map(row=>row.id),catalog.termId,catalog.programId];
        let ticket,result;
        try{
          result=await pace(()=>requestTeachingSampleCase({testCase,plan,origin,sourceRevision,runId,token:caller.token,
            key:s.teachingObservationKey,signal:signals(signal,65000),fetchImpl:readback,readResponse:readBoundedFixtureResponse,
            privateMarkers,correlations}),signal,async()=>{ticket=await previewGate.beforeRequest();});
        }finally{if(ticket)await previewGate.afterRequest(ticket);}
        const after=await observe(plan);
        if(!isDeepStrictEqual(before,after))fail('fixture-unapproved-write','Teaching feedback fixture state changed during an answer.');
        results.push({...result,before,after,requestIndex:ticket.requestIndex});
        await onCheckpoint?.(report());
      }
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Teaching feedback source changed during verification.');
  }catch(error){
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
    if(error?.teachingSampleCleanupProof)cleanupProof=error.teachingSampleCleanupProof;
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    if(previewGate)try{await previewGate.finish();}catch{failure??={phase:'release-verification',code:'fixture-target'};}
    await onCheckpoint?.(report());
  }
  return report();
}

async function confirmedPreviewRequest(s,{side,path,body,stage,origin,signal,label,previewReadbackFetch,journal,payloadDigest,actionFetch}){
  await assertRecordedFixtureLease(s,label);
  const user=s.users[side==='A'?0:1];
  await user.renewSession?.({signal});
  const ticket=await s.previewGate.beforeRequest();
  try{
    const target=new URL(path,origin);
    const transport=stage===undefined?previewReadbackFetch:actionFetch(user,body);
    let intent;
    if(stage!==undefined){
      intent={stage,userId:user.id,requestId:body.requestId,kind:body.kind,payloadDigest:payloadDigest(body.payload),status:'pending'};
      journal.push(intent);
      await saveLedger();
    }
    const response=await transport(target,{method:'POST',signal:signals(signal,25000),
      headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(intent){intent.status=response.status;await saveLedger();}
    const value=await readBoundedFixtureResponse(response,target,48000,response.status);
    return {status:response.status,body:value,...(stage===undefined?{correlationId:response.headers.get('x-assistant-request-id')}:{})};
  }finally{await s.previewGate.afterRequest(ticket);}
}

export async function runConfirmedTaskPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
    fail('fixture-config','Confirmed task checks require an exact protected Preview and source revision.');
  const {sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)
    fail('fixture-target','Confirmed task checks require the exact clean deployed source.');
  const previewReadbackFetch=createTrustedPreviewFetch({origin,token:previewToken});
  const runId=randomUUID();
  await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:'confirmed-task-actions',previewReadbackFetch});
  const s=ready(),{previewGate}=s;
  let result,cleanupProof;
  try{
    const owners=s.users.map(user=>user.id);
    if(owners.length!==2||owners.some(id=>!s.identityRequests.some(row=>row.id===id&&row.runId===runId&&row.state==='created')))
      fail('fixture-state','Confirmed task owners do not match the disposable identity ledger.');
    const request=(side,path,body,stage)=>confirmedPreviewRequest(s,{
      side,path,body,stage,origin,signal,label:'Confirmed task',previewReadbackFetch,journal:s.taskActionJournal,payloadDigest:hash,
      actionFetch:(user,command)=>createTrustedPreviewFetch({origin,token:previewToken,confirmedTaskCommand:{callerToken:user.token,body:command}}),
    });
    result=await checkConfirmedTaskRoundTrip({owners,title:'QA assistant task '+runId.replaceAll('-','').slice(0,12),
      read:async()=>{
        await assertRecordedFixtureLease(s,'Confirmed task readback');
        return query(()=>readConfirmedTaskRows(s.sql,owners),'Could not read independent disposable task state.');
      },
      propose:(side,question)=>request(side,'/api/affairs-assistant',{question,route:'/school-affairs/records',stream:false,consentedResearchUse:false}),
      submit:(side,body,stage)=>request(side,'/api/affairs-action',body,stage),
    });
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','The confirmed task evaluation source changed during verification.');
    await previewGate.finish();
  }finally{cleanupProof=await cleanup();}
  return {runId,sourceRevision,origin,...result,deployment:previewGate.status(),cleanup:cleanupProof};
}

export async function runConfirmedAssignmentTrackerPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Confirmed assignment tracker checks require an exact protected Preview and source revision.');
  const runId=randomUUID();
  let previewGate,prepared=false,finished=false,result,failure,phase='preflight';
  let cleanupProof={verified:false,status:'not-started'};
  const report=()=>({version:1,runId,sourceRevision,origin,terminal:true,execution:'live-native',contract:confirmedAssignmentTrackerContract,result:result??null,
    deployment:previewGate?.status()??null,cleanup:cleanupProof,...(failure?{failure}:{}),
    modelAcceptance:false,browserDispatchAcceptance:false,
    liveAcceptance:finished&&!failure&&result?.passed===true&&cleanupProof.verified&&cleanupProof.protectedOwnerUnchanged
      &&cleanupProof.assignmentTrackerCleanup===true});
  try{
    const {sourceIdentity}=await import('./run.mjs');
    const initial=await sourceIdentity();
    if(initial.dirty||initial.sourceRevision!==sourceRevision)
      fail('fixture-target','Confirmed assignment tracker checks require the exact clean deployed source.');
    const previewReadbackFetch=createTrustedPreviewFetch({origin,token:previewToken});
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:confirmedAssignmentTrackerMode,previewReadbackFetch});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    const assertScoped=async()=>{
      await assertRecordedFixtureLease(s,'Confirmed assignment tracker');
      await previewGate.assertCurrent();
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    };
    phase='seed';
    await assertScoped();
    if(s.users.length!==2)fail('fixture-isolation','Confirmed assignment tracker requires two disposable callers.');
    const owners={},students={};
    for(const [index,user] of s.users.entries()){
      const role=index===0?'A':'B';
      const matches=s.identityRequests.filter(row=>row.id===user.id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||user.id===s.protectedOwnerBefore.id)
        fail('fixture-isolation','Confirmed assignment tracker caller is outside the reserved lease.');
      owners[role]={id:user.id,email:matches[0].email,runMarker:runId};
      await assertScoped();
      await user.renewSession({signal});
      students[role]=await initializeDtmAssignmentListStudent(user,{publishable:s.publishable,fetchImpl:s.boundedFetch,
        readResponse:readBoundedFixtureResponse,signal:signals(signal)});
    }
    await assertScoped();
    const plan=confirmedAssignmentTrackerPlan(runId,owners,students);
    s.assignmentTrackerPlan=plan;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedConfirmedAssignmentTrackerRows(s.sql,plan)),'Could not stage exact disposable tracker rows.');
    const allowedTargets=[plan.targets.own,plan.targets.sample,plan.targets.graded];
    const request=(side,path,body,stage)=>confirmedPreviewRequest(s,{
      side,path,body,stage,origin,signal,label:'Confirmed assignment tracker',previewReadbackFetch,journal:s.assignmentTrackerJournal,
      payloadDigest:confirmedAssignmentTrackerDigest,
      actionFetch(user,command){
        const assignmentId=command.payload.id;
        if(!allowedTargets.includes(assignmentId))fail('fixture-isolation','Confirmed assignment tracker target is outside the reserved fixtures.');
        return createTrustedPreviewFetch({origin,token:previewToken,confirmedAssignmentTrackerCommand:{callerToken:user.token,assignmentId,body:command}});
      },
    });
    phase='verification';
    result=await checkConfirmedAssignmentTrackerRoundTrip({plan,
      read:async()=>{
        await assertScoped();
        const state=await query(()=>readConfirmedAssignmentTrackerRows(s.sql,plan),'Could not read independent disposable tracker state.');
        for(const user of s.users)await user.renewSession({signal});
        const callers=await observeConfirmedAssignmentTrackerCallers(plan,s.users,state,{origin:s.url,publishable:s.publishable,
          fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal)});
        return {state,callers};
      },
      propose:(side,question)=>request(side,'/api/affairs-assistant',{question,route:confirmedAssignmentTrackerContract.route,stream:false,consentedResearchUse:false}),
      submit:(side,body,stage)=>request(side,'/api/affairs-action',body,stage),
    });
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==initial.workingTreeHash)
      fail('fixture-target','Confirmed assignment tracker source changed during verification.');
    await previewGate.finish();
    finished=true;
  }catch(error){
    if(error instanceof LiveFixtureError&&error.assignmentTrackerCleanupProof)cleanupProof=error.assignmentTrackerCleanupProof;
    failure=error instanceof ConfirmedAssignmentTrackerAssertion
      ?{phase,code:'assertion',step:error.step}
      :{phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report());
  }
  return report();
}

async function captureFixtureCleanup(){
  try{return {...await cleanup(),status:'verified'};}
  catch(error){return {verified:false,status:'unverified',code:error instanceof LiveFixtureError?error.code:'unexpected'};}
}

export async function runTuitionLedgerPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
    fail('fixture-config','Tuition ledger checks require an exact protected Preview and source revision.');
  const runId=randomUUID();
  let result,failure,previewGate,prepared=false,phase='preflight';
  let cleanupProof={verified:false,status:'not-started'};
  try{
    const {sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Tuition ledger checks require the exact clean deployed source.');
    const previewReadbackFetch=createTrustedPreviewFetch({origin,token:previewToken});
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:tuitionLedgerFixtureMode,previewReadbackFetch});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    const owners=s.users.map(user=>({userId:user.id,studentId:user.studentId}));
    if(owners.length!==2||owners.some(owner=>owner.userId===s.protectedOwnerBefore.id
      ||!s.identityRequests.some(row=>row.id===owner.userId&&row.runId===runId&&row.state==='created')))
      fail('fixture-state','Tuition ledger owners do not match the disposable identity ledger.');
    await assertRecordedFixtureLease(s,'Tuition ledger seed');
    await previewGate.assertCurrent();
    const plan=tuitionLedgerPlan({runId,owners});
    s.tuitionLedgerPlan=plan;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedTuitionLedgerPreviewState(s.sql,plan)),'Could not seed the exact disposable tuition ledger.');

    async function request(side,path,body){
      await assertRecordedFixtureLease(s,'Tuition ledger request');
      const user=side==='guest'?null:s.users[side==='A'?0:1];
      if(user)await user.renewSession?.({signal});
      const ticket=await previewGate.beforeRequest();
      const target=new URL(path,origin);
      const response=await previewReadbackFetch(target,{method:body?'POST':'GET',signal:signals(signal,25000),
        headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const parsed=await readBoundedFixtureResponse(response,target,65536,response.status);
      await previewGate.afterRequest(ticket);
      return {status:response.status,body:parsed,correlationId:response.headers.get('x-assistant-request-id')};
    }
    phase='verification';
    result=await checkTuitionLedgerPreview({plan,
      observe:async()=>{
        await assertRecordedFixtureLease(s,'Tuition ledger readback');
        return query(()=>readTuitionLedgerPreviewState(s.sql,plan),'Could not read independent disposable tuition ledger state.');
      },
      observeAccountScopes:async()=>{
        await assertRecordedFixtureLease(s,'Tuition ledger account readback');
        return query(()=>readTuitionLedgerAccountScopes(s.sql,plan),'Could not read independent disposable account scopes.');
      },
      history:(side,chargeId)=>request(side,'/api/affairs-data?'+new URLSearchParams({
        scope:'fee-payment-history',charge_id:chargeId,...tuitionLedgerPreviewDates,
      })),
      ask:(side,question)=>request(side,'/api/affairs-assistant',{
        question,route:tuitionLedgerHistoryPath,stream:false,consentedResearchUse:false,
      }),
    });
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','The tuition ledger verification source changed during the run.');
    await previewGate.finish();
  }catch(error){
    if(error instanceof LiveFixtureError&&error.tuitionLedgerCleanupProof)cleanupProof=error.tuitionLedgerCleanupProof;
    failure=error instanceof TuitionLedgerPreviewAssertion
      ?{phase,code:'fixture-assertion',assertion:error.stage,failedFields:error.failedFields}
      :{phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  return {runId,sourceRevision,origin,staffHttpVerified:false,...result,...(failure?{failure}:{}),
    deployment:previewGate?.status()??null,cleanup:cleanupProof,
    liveAcceptance:!failure&&result?.passed===true&&cleanupProof.verified&&cleanupProof.tuitionLedgerCleanup===true};
}

export async function runDtmTimingPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!(/^[a-f0-9]{40}$/u.test(sourceRevision??'')))
    fail('fixture-config','Moodle timing checks require an exact protected Preview and source revision.');
  const runId=randomUUID(),results=[],correlationIds=new Set();
  let previewGate,prepared=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  let expectedCount=0;
  try{
    const {readReply,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Moodle timing checks require the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken});
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:dtmTimingFixtureMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    if(s.users.some(user=>user.id===s.protectedOwnerBefore.id
      ||!s.identityRequests.some(row=>row.id===user.id&&row.runId===runId&&row.state==='created')))
      fail('fixture-isolation','Moodle timing callers are outside the disposable lease.');
    const plan=buildDtmTimingPlan(runId,s.users),cases=dtmTimingPreviewCases(plan);
    expectedCount=cases.length;
    await assertRecordedFixtureLease(s,'Moodle timing seed');
    await previewGate.assertCurrent();
    s.dtmTimingPlan=plan;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedDtmTimingRows(s.sql,plan)),'Could not save exact disposable Moodle timing records.');
    async function observe(){
      await assertRecordedFixtureLease(s,'Moodle timing readback');
      await previewGate.assertCurrent();
      const rows=await query(()=>observeDtmTimingRows(s.sql,plan),'Could not verify the exact Moodle timing records.');
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await observeDtmTimingCallers(plan,{users:s.users,origin,fetchImpl:readback,
        readResponse:readBoundedFixtureResponse,signal:signals(signal,15000)});
      return {rows,callers};
    }
    for(const testCase of cases){
      phase=testCase.id;
      const before=await observe();
      const ticket=await previewGate.beforeRequest();
      const user=testCase.actor==='guest'?null:s.users[testCase.actor==='A'?0:1];
      const request=dtmTimingRequest(testCase);
      const response=await readback(new URL(request.path,origin),{method:'POST',body:request.body,
        headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.token}:{})},signal:signals(signal,65000)});
      const correlationId=response.headers.get('x-assistant-request-id');
      const parsed=await readReply(response);
      await previewGate.afterRequest(ticket);
      const after=await observe();
      const graded=gradeDtmTimingCase(plan,testCase,{...parsed,status:response.status,correlationId},before,after);
      if(user&&(correlationIds.has(correlationId)||!correlationId)){
        graded.passed=false;
        if(!graded.failedFields.includes('correlation'))graded.failedFields.push('correlation');
      }
      if(correlationId)correlationIds.add(correlationId);
      results.push({...graded,requestIndex:ticket.requestIndex,before,after});
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Moodle timing source changed during verification.');
    await previewGate.finish();
  }catch(error){
    if(error instanceof LiveFixtureError&&error.dtmTimingCleanupProof)cleanupProof=error.dtmTimingCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  return {runId,sourceRevision,origin,results,...(failure?{failure}:{}),deployment:previewGate?.status()??null,
    cleanup:cleanupProof,storageObjectWrites:false,liveAcceptance:!failure&&expectedCount>0&&results.length===expectedCount
      &&results.every(row=>row.passed)&&cleanupProof.verified&&cleanupProof.dtmTimingCleanup===true};
}

async function checkDtmMaterialPreviewLease(s){
  await assertRecordedFixtureLease(s,'Moodle material preview');
  assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
  await s.previewGate.assertCurrent();
}

async function setDtmMaterialPreviewVariant(s,variant){
  await checkDtmMaterialPreviewLease(s);
  const fixture=s.dtmMaterialPreview;
  const {plan,variant:previous}=fixture;
  if(previous===variant)return;
  const next=dtmMaterialPreviewRows(plan,variant);
  fixture.pending=variant;
  await saveLedger();
  await query(()=>feeTransaction(s,async()=>{
    const persisted=await readDtmMaterialPreviewRows(s.sql,plan);
    if(previous===null){
      if(persisted.courses.length||persisted.materials.length)fail('fixture-state','A reserved Moodle fixture row already exists.');
      await s.sql`insert into public.dtm_courses ${s.sql(next.courses)}`;
    }else{
      assertDtmMaterialPreviewRows(plan,previous,persisted);
      const owned=plan.courseIds[0],present=persisted.materials.filter(row=>row.course_id===owned);
      if(present.length){
        const removed=await s.sql`delete from public.dtm_materials
          where course_id=${owned} and id in ${s.sql(present.map(row=>row.id))}
          and exists(select 1 from public.dtm_courses where id=${owned} and user_id=${plan.ownerIds[0]})
          returning id`;
        if(removed.length!==present.length)fail('fixture-state','The selected Moodle fixture material changed.');
      }
    }
    const rows=previous===null?next.materials:next.materials.filter(row=>row.course_id===plan.courseIds[0]);
    if(rows.length)await s.sql`insert into public.dtm_materials ${s.sql(rows)}`;
    assertDtmMaterialPreviewRows(plan,variant,await readDtmMaterialPreviewRows(s.sql,plan));
  }),'Could not safely stage the disposable Moodle materials.');
  fixture.variant=variant;
  fixture.pending=null;
  await saveLedger();
}

export async function runDtmMaterialPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Moodle materials require the exact protected Preview and source revision.');
  const runId=randomUUID(),cases=dtmMaterialPreviewCases(),results=[],seen=new Set();
  let previewGate,prepared=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  try{
    const {createLiveRequestPacer,readReply,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Moodle materials require the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken});
    const pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:dtmMaterialPreviewMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    if(s.users.some(user=>user.id===s.protectedOwnerBefore.id
      ||!s.identityRequests.some(row=>row.id===user.id&&row.runId===runId&&row.state==='created')))
      fail('fixture-isolation','Moodle material callers are outside the disposable lease.');
    const plan=buildDtmMaterialPreviewPlan(s.users);
    await checkDtmMaterialPreviewLease(s);
    const reserved=await readDtmMaterialPreviewRows(s.sql,plan);
    if(reserved.courses.length||reserved.materials.length)fail('fixture-state','A reserved Moodle fixture row already exists.');
    s.dtmMaterialPreview={plan,variant:null,pending:null};
    for(const id of [...plan.courseIds,...plan.materialIds])s.recordIds.add(id);
    await saveLedger();
    async function observe(scope){
      await checkDtmMaterialPreviewLease(s);
      const sqlSha256=assertDtmMaterialPreviewRows(plan,scope.variant,await readDtmMaterialPreviewRows(s.sql,plan));
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await readDtmMaterialPreviewCallers(plan,scope,s.users,{origin,previewFetch:readback,
        projectFetch:s.boundedFetch,projectUrl:new URL(s.url).origin,publishable:s.publishable,
        readResponse:readBoundedFixtureResponse,signal:signals(signal,15000)});
      await previewGate.assertCurrent();
      return {sqlSha256,callers};
    }
    for(const testCase of cases){
      phase=testCase.id;
      const scope=dtmMaterialCaseScope(testCase);
      await setDtmMaterialPreviewVariant(s,scope.variant);
      const before=await observe(scope);
      const request=dtmMaterialPreviewRequest(testCase);
      let ticket,parsed,response,correlationId,pinned;
      await pace(async()=>{
        response=await readback(new URL(request.path,origin),{method:'POST',body:request.body,
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.users[0].token},signal:signals(signal,65000)});
        correlationId=response.headers.get('x-assistant-request-id');
        parsed=await readReply(response);
        pinned=await previewGate.afterRequest(ticket);
      },signal,async()=>{ticket=await previewGate.beforeRequest();});
      const after=await observe(scope);
      const deniedMarkers=[...s.users.flatMap(user=>[user.id,user.studentId,user.token]),...s.identityRequests.map(row=>row.email)].filter(Boolean);
      const graded=gradeDtmMaterialPreviewCase(testCase,{...parsed,statusCode:response.status,correlationId,
        execution:'live-native',fixtureKey:testCase.fixtureKey,sourceRevision,
        deploymentCheck:{verified:true,sourceRevision:pinned.sourceRevision,requestIndex:ticket.requestIndex},
        materialDispatch:{endpoint:request.path,bodySha256:request.bodySha256}},{before,after,deniedMarkers});
      if(seen.has(correlationId)){graded.failedChecks.push('dtm-material.duplicate-request');graded.passed=false;}
      seen.add(correlationId);
      results.push({...graded,requestIndex:ticket.requestIndex});
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Moodle material source changed during verification.');
    await previewGate.finish();
  }catch(error){
    if(error instanceof LiveFixtureError&&error.dtmMaterialPreviewCleanupProof)cleanupProof=error.dtmMaterialPreviewCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  return {runId,sourceRevision,origin,results,gaps:dtmMaterialPreviewGaps,...(failure?{failure}:{}),
    deployment:previewGate?.status()??null,cleanup:cleanupProof,storageObjectWrites:false,
    liveAcceptance:!failure&&results.length===cases.length&&results.every(row=>row.passed)
      &&cleanupProof.verified&&cleanupProof.dtmMaterialPreviewCleanup===true};
}

export async function runAcademicGradesPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Academic grades require the exact protected Preview and source revision.');
  const runId=randomUUID(),cases=academicGradesPreviewCases(),results=[],seen=new Set();
  let gate,prepared=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  try{
    const {createLiveRequestPacer,readReply,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Academic grades require the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:academicGradesPreviewMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();gate=s.previewGate;
    const identities=s.users.map(user=>s.identityRequests.find(row=>row.id===user.id&&row.runId===runId&&row.state==='created'));
    if(identities.length!==2||identities.some(row=>!row||row.id===s.protectedOwnerBefore.id))
      fail('fixture-isolation','Academic grades require two recorded disposable owners.');
    const plan=buildAcademicGradesPreviewPlan(identities);
    phase='seed';
    await assertRecordedFixtureLease(s,'Academic grades seed');
    await gate.assertCurrent();
    await query(()=>verifyAcademicGradesPreviewRows(s.sql,plan,{expectEmpty:true}),'Reserved academic grades fixture rows already exist.');
    s.academicGradesPreview=plan;
    for(const id of plan.recordIds)s.recordIds.add(id);
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedAcademicGradesPreviewRows(s.sql,plan)),'Could not persist the exact isolated academic grades.');
    async function observe(){
      await assertRecordedFixtureLease(s,'Academic grades readback');
      await gate.assertCurrent();
      const rows=await query(()=>verifyAcademicGradesPreviewRows(s.sql,plan),'Could not verify persisted academic grade rows.');
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await readAcademicGradesPreviewCallers(plan,s.users,{projectOrigin:new URL(s.url).origin,publishable:s.publishable,
        fetchImpl:s.boundedFetch,readResponse:(response,target)=>readBoundedFixtureResponse(response,target,64_000),signal:signals(signal,15000)});
      return {rows,callers};
    }
    for(const testCase of cases){
      phase=testCase.id;
      const before=await observe(),request=academicGradesPreviewRequest(testCase);
      let ticket,response,parsed;
      await pace(async()=>{
        response=await readback(new URL(request.path,origin),{method:'POST',body:request.body,
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.users[academicGradesPreviewActor(testCase)].token},signal:signals(signal,65000)});
        parsed=await readReply(response);
        await gate.afterRequest(ticket);
      },signal,async()=>{ticket=await gate.beforeRequest();});
      const correlationId=response.headers.get('x-assistant-request-id');
      const after=await observe();
      const deniedMarkers=[...plan.ownerIds,...plan.profiles.map(row=>row.email),...s.users.map(user=>user.token)];
      const graded=gradeAcademicGradesPreview(testCase,{...parsed,statusCode:response.status,execution:'live-native',fixtureKey:testCase.fixtureKey,
        correlationId,requestIndex:ticket.requestIndex,requestSha256:request.sha256},{before,after,deniedMarkers});
      if(seen.has(correlationId)){graded.passed=false;graded.failedChecks.push('academic-preview.duplicate-request');}
      seen.add(correlationId);results.push({...graded,requestIndex:ticket.requestIndex});
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Academic grades source changed during verification.');
    await gate.finish();
  }catch(error){
    if(error?.academicGradesPreviewCleanupProof)cleanupProof=error.academicGradesPreviewCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  return {runId,origin,sourceRevision,results,...(failure?{failure}:{}),deployment:gate?.status()??null,cleanup:cleanupProof,
    liveAcceptance:!failure&&results.length===cases.length&&results.every(row=>row.passed)
      &&cleanupProof.verified&&cleanupProof.protectedOwnerUnchanged&&cleanupProof.academicGradesPreviewCleanup===true};
}

export async function runDtmStudyPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Moodle study records require the exact protected Preview and source revision.');
  const runId=randomUUID(),results=[],seen=new Set(),now=new Date().toISOString();
  let cases=[];
  let gate,prepared=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  try{
    const {createLiveRequestPacer,readReply,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Moodle study records require the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now,origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:dtmStudyPreviewMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();gate=s.previewGate;
    const identities=s.users.map(user=>s.identityRequests.find(row=>row.id===user.id&&row.runId===runId&&row.state==='created'));
    if(identities.length!==2||identities.some(row=>!row||row.id===s.protectedOwnerBefore.id))
      fail('fixture-isolation','Moodle study records require two recorded disposable owners.');
    const plan=buildDtmStudyPreviewPlan(identities,now);
    cases=dtmStudyPreviewCases(plan);
    phase='seed';
    await assertRecordedFixtureLease(s,'Moodle study records seed');
    await gate.assertCurrent();
    await query(()=>verifyDtmStudyPreviewRows(s.sql,plan,{expectEmpty:true}),'Reserved Moodle study records fixture rows already exist.');
    s.dtmStudyPreview=plan;
    for(const id of [...plan.courseIds,...plan.meetingIds])s.recordIds.add(id);
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedDtmStudyPreviewRows(s.sql,plan)),'Could not persist the exact isolated Moodle study records.');
    async function observe(){
      await assertRecordedFixtureLease(s,'Moodle study records readback');
      await gate.assertCurrent();
      const rows=await query(()=>verifyDtmStudyPreviewRows(s.sql,plan),'Could not verify persisted Moodle study rows.');
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await readDtmStudyPreviewCallers(plan,s.users,{projectOrigin:new URL(s.url).origin,publishable:s.publishable,
        fetchImpl:s.boundedFetch,readResponse:(response,target)=>readBoundedFixtureResponse(response,target,64_000),signal:signals(signal,15000)});
      return {rows,callers};
    }
    for(const testCase of cases){
      phase=testCase.id;
      assertDtmStudyClock(now);
      const before=await observe(),request=dtmStudyPreviewRequest(plan,testCase);
      let ticket,response,parsed;
      await pace(async()=>{
        response=await readback(new URL(request.path,origin),{method:'POST',body:request.body,
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.users[0].token},signal:signals(signal,65000)});
        parsed=await readReply(response);
        await gate.afterRequest(ticket);
      },signal,async()=>{ticket=await gate.beforeRequest();});
      const correlationId=response.headers.get('x-assistant-request-id');
      const after=await observe();
      assertDtmStudyClock(now);
      const deniedMarkers=[...plan.ownerIds,...identities.map(row=>row.email),...s.users.map(user=>user.token)];
      const graded=gradeDtmStudyPreview(plan,testCase,{...parsed,statusCode:response.status,execution:'live-native',fixtureKey:testCase.fixtureKey,
        correlationId,requestIndex:ticket.requestIndex,requestSha256:request.sha256},{before,after,privateMarkers:deniedMarkers});
      if(seen.has(correlationId)){graded.passed=false;graded.failedChecks.push('dtm-study.duplicate-request');}
      seen.add(correlationId);results.push({...graded,requestIndex:ticket.requestIndex});
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Moodle study records source changed during verification.');
    await gate.finish();
  }catch(error){
    if(error?.dtmStudyPreviewCleanupProof)cleanupProof=error.dtmStudyPreviewCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  return {runId,origin,sourceRevision,results,...(failure?{failure}:{}),deployment:gate?.status()??null,cleanup:cleanupProof,
    liveAcceptance:!failure&&results.length===cases.length&&results.every(row=>row.passed)
      &&cleanupProof.verified&&cleanupProof.protectedOwnerUnchanged&&cleanupProof.dtmStudyPreviewCleanup===true};
}

export async function runDtmGradeReportPreview({origin,sourceRevision,previewToken,signal,suite='report'}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||!['report','overview'].includes(suite))
    fail('fixture-config','Moodle grade checks require an exact protected Preview and source revision.');
  const overview=suite==='overview';
  const runId=randomUUID(),results=[],correlationIds=new Set();
  let previewGate,prepared=false,failure,phase='preflight',expectedCount=0;
  let cleanupProof={verified:false,status:'not-started'};
  try{
    const {createLiveRequestPacer,readReply,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Moodle grade checks require the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:dtmGradePreviewMode,previewReadbackFetch:readback,dtmGradeOverview:overview});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    if(s.users.length!==2||s.users.some(user=>user.id===s.protectedOwnerBefore.id
      ||!s.identityRequests.some(row=>row.id===user.id&&row.runId===runId&&row.state==='created')))
      fail('fixture-isolation','Moodle grade callers are outside the disposable lease.');
    const owners=Object.fromEntries(s.users.map(({id},index)=>{
      const recorded=s.identityRequests.find(row=>row.id===id&&row.runId===runId&&row.state==='created');
      return [index===0?'A':'B',{id,email:recorded.email,runMarker:runId}];
    }));
    const fixture=overview?buildDtmGradeOverviewPreview(runId,owners):buildDtmGradePreview(runId,owners);
    const cases=overview?dtmGradeOverviewPreviewCases(fixture):dtmGradePreviewCases(fixture);
    expectedCount=cases.length;
    await assertRecordedFixtureLease(s,'Moodle grade seed');
    await previewGate.assertCurrent();
    s.dtmGradePreview=fixture;
    await saveLedger();
    const seed=overview?seedDtmGradeOverviewRows:seedDtmGradePreviewCompanion;
    await query(()=>feeTransaction(s,()=>seed(s.sql,fixture)),'Could not seed the disposable Moodle grade course rows.');

    async function observe(plan){
      await assertRecordedFixtureLease(s,'Moodle grade readback');
      await previewGate.assertCurrent();
      const observeRows=overview?()=>observeDtmGradeOverviewRows(s.sql,fixture):()=>observeDtmGradePreviewRows(s.sql,fixture,plan);
      const rows=await query(observeRows,'Could not verify the exact Moodle grade report and tracker rows.');
      let callers;
      try{callers=overview?await readDtmGradeOverviewScopes(fixture,s.users,{origin,signal,fetchImpl:readback,readResponse:readBoundedFixtureResponse})
        :dtmGradePreviewDigest(await readDtmReportFixtureScopes(plan,s.users,{origin,signal,fetchImpl:readback}));}
      catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Could not verify the paired Moodle grade endpoint readback.');}
      return {rows,callers};
    }

    for(const testCase of cases){
      const plan=fixture.plans?.[testCase.fixtureKey];
      phase=testCase.id;
      if(!overview&&!plan)fail('fixture-state','The Moodle grade case has no leased report plan.');
      if(plan&&s.dtmReportPlan!==plan){
        await assertRecordedFixtureLease(s,'Moodle grade report transition');
        await previewGate.assertCurrent();
        s.pendingDtmReportPlan=plan;
        s.dtmReportTransitionPending=true;
        await saveLedger();
        await query(()=>feeTransaction(s,async()=>{
          await observeDtmGradePreviewRows(s.sql,fixture,s.dtmReportPlan??null);
          await changeDtmReportFixtureRows(s.sql,s.dtmReportPlan,'remove');
          await changeDtmReportFixtureRows(s.sql,plan,'insert');
          await observeDtmGradePreviewRows(s.sql,fixture,plan);
        }),'Could not transition the exact disposable Moodle grade reports.');
        s.dtmReportPlan=plan;
        s.pendingDtmReportPlan=null;
        s.dtmReportTransitionPending=false;
        await saveLedger();
      }

      const before=await observe(plan);
      const user=s.users[testCase.role==='A'?0:1];
      let ticket,response,parsed;
      try{
        response=await pace(()=>readback(new URL('/api/affairs-assistant',origin),{
          method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.token},
          body:JSON.stringify({question:testCase.question,route:testCase.route,history:testCase.history,stream:true,consentedResearchUse:false}),
          signal:signals(signal,65000),
        }),signal,async()=>{ticket=await previewGate.beforeRequest();});
        parsed=await readReply(response);
      }finally{if(ticket)await previewGate.afterRequest(ticket);}
      const after=await observe(plan);
      const graded=gradeDtmGradePreview(testCase,{...parsed,statusCode:response.status,fixtureKey:testCase.fixtureKey,execution:'live-native'},before,after);
      const correlationId=response.headers.get('x-assistant-request-id');
      if(!UUID.test(correlationId??'')||correlationIds.has(correlationId)){
        graded.passed=false;
        graded.failedFields.push('correlation');
      }
      if(correlationId)correlationIds.add(correlationId);
      results.push({...graded,requestIndex:ticket.requestIndex,before,after});
    }

    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==identity.sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Moodle grade source changed during verification.');
    await previewGate.finish();
  }catch(error){
    if(error instanceof LiveFixtureError&&error.dtmGradePreviewCleanupProof)cleanupProof=error.dtmGradePreviewCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{if(prepared)cleanupProof=await captureFixtureCleanup();}
  const unmounted=overview?unmountedDtmNativeGradeCases.filter(row=>row.id.endsWith('-failed')):unmountedDtmNativeGradeCases;
  return {runId,sourceRevision,origin,suite,results,unmounted,...(failure?{failure}:{}),
    deployment:previewGate?.status()??null,cleanup:cleanupProof,liveAcceptance:!failure&&expectedCount>0&&results.length===expectedCount
      &&results.every(row=>row.passed)&&cleanupProof.verified&&cleanupProof.dtmGradePreviewCleanup===true};
}

function counselingFixtureOwners(s){
  return Object.fromEntries(s.users.map((user,index)=>{
    const requests=s.identityRequests.filter(row=>row.id===user.id&&row.runId===s.runId&&row.state==='created');
    if(requests.length!==1||user.id===s.protectedOwnerBefore.id)fail('fixture-isolation','The counseling callers are outside the fixture lease.');
    return [index===0?'A':'B',{id:user.id,email:requests[0].email,runMarker:s.runId}];
  }));
}

async function stageCounselingFixture(s,owners,fixtureKey){
  await assertRecordedFixtureLease(s,'Counseling evaluation');
  await s.previewGate.assertCurrent();
  if(s.counselingFixture?.fixtureKey===fixtureKey)return s.counselingFixture;
  const plan=buildCounselingAppointmentFixturePlan({runId:s.runId,owners,fixtureKey});
  for(const id of plan.recordIds)s.recordIds.add(id);
  s.pendingCounselingFixture=plan;
  await saveLedger();
  await query(()=>feeTransaction(s,()=>transitionCounselingFixtures(s.sql,{
    previous:s.counselingFixture,next:plan,knownIds:[...s.recordIds],
  })),'Could not stage the exact disposable counseling rows.');
  s.counselingFixture=plan;s.pendingCounselingFixture=null;
  await saveLedger();
  return plan;
}

async function stageCounselingCompound(s,owners){
  await assertRecordedFixtureLease(s,'Counseling tuition fixtures');
  assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
  await s.previewGate.assertCurrent();
  const programs=await s.sql`select id from public.affairs_programs where code='SAMPLE-GEN' and source_mode='sample'`;
  if(programs.length!==1)fail('fixture-create','The existing sample program could not be bound.');
  s.counselingCompound=buildCounselingCompoundFixture({runId:s.runId,owners,programId:programs[0].id});
  const {chargePlan,appointmentPlan}=s.counselingCompound;
  for(const id of [...chargePlan.recordIds,...appointmentPlan.recordIds])s.recordIds.add(id);
  // The complete two-source intent precedes every disposable record write.
  await saveLedger();
  await query(()=>feeTransaction(s,()=>stageCounselingCompoundRows(s.sql,s.counselingCompound)),
    'Could not stage exact disposable Counseling and tuition evidence.');
  return s.counselingCompound;
}

export async function runCounselingHostedEvaluation({origin,sourceRevision,previewToken,signal,onCheckpoint,compound=false}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Counseling requires an exact protected Preview and source revision.');
  if(typeof compound!=='boolean')fail('fixture-config','Invalid counseling evaluation mode.');
  const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Counseling requires the exact clean deployed source.');
  const readback=createTrustedPreviewFetch({origin,token:previewToken}),runId=randomUUID(),cases=counselingHostedCases({compound});
  await prepare({runId,cases,now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:compound?counselingCompoundFixtureMode:counselingFixtureMode,caseFamily:'counseling-appointments',previewReadbackFetch:readback});
  const s=ready(),pace=createLiveRequestPacer(),results=[],correlationIds=new Set();
  let cleanupProof=null,completed=false;
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,deployment:s.previewGate.status(),cleanup:cleanupProof,
    noFileActivityObserved:results.every(row=>!row.failures.some(id=>id.endsWith('.file_activity'))),
    egressObservation:false,liveAcceptance:terminal&&completed&&results.length===cases.length&&results.every(row=>row.passed)&&cleanupProof?.verified===true
      &&(!compound||cleanupProof.counselingCompoundCleanup===true&&cleanupProof.protectedOwnerUnchanged===true)});
  try{
    const owners=counselingFixtureOwners(s);
    const paired=compound?await stageCounselingCompound(s,owners):null;
    for(const testCase of cases){
      const {fixtureKey}=counselingAppointmentFixtureCaseBinding(testCase);
      const appointmentPlan=paired?.appointmentPlan??await stageCounselingFixture(s,owners,fixtureKey);
      const observe=async()=>{
        await assertRecordedFixtureLease(s,'Counseling evaluation');
        if(paired){
          await s.previewGate.assertCurrent();
          assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        }
        for(const user of s.users)await user.renewSession({signal});
        const appointments=await observeCounselingFixture(appointmentPlan,{sql:s.sql,users:s.users,origin,
          fetchImpl:readback,readResponse:readBoundedFixtureResponse,signal:signals(signal),knownIds:[...s.recordIds]});
        if(!paired)return appointments;
        const charges={rowsDigest:await observeOwnedChargeRows(s.sql,paired.chargePlan),
          ...await observeOwnedChargeCallers(paired.chargePlan,{callers:s.users,publishableKey:s.publishable,
            fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal)})};
        return {appointments,charges};
      };
      const before=await observe();
      const markers=[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),...s.recordIds,
        ...(paired?[paired.chargePlan.charges[1].label]:[])];
      let ticket,request;
      try{
        request=await pace(()=>requestCounselingHostedCase({testCase,origin,token:s.users[0].token,signal:signals(signal,65000),
          fetchImpl:readback,privateMarkers:markers,correlationIds}),signal,async()=>{ticket=await s.previewGate.beforeRequest();});
      }finally{if(ticket)await s.previewGate.afterRequest(ticket);}
      const after=await observe();
      const {envelope,...requestProof}=request;
      const grade=paired?gradeHostedCounselingCompound:gradeHostedCounseling;
      results.push({...grade(testCase,envelope,before,after),...requestProof,requestIndex:ticket.requestIndex});
      await onCheckpoint?.(report(false));
    }
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Counseling source changed during evaluation.');
    await s.previewGate.finish();
    completed=true;
  }finally{
    try{cleanupProof=await cleanup();}
    finally{await onCheckpoint?.(report(true));}
  }
  return report(true);
}

export async function runCounselingCancellationPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Counseling cancellation requires an exact protected Preview and source revision.');
  const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Counseling cancellation requires the exact clean deployed source.');
  const readback=createTrustedPreviewFetch({origin,token:previewToken}),runId=randomUUID(),cases=counselingHostedCases();
  await prepare({runId,cases,now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:counselingFixtureMode,caseFamily:'counseling-appointments',previewReadbackFetch:readback});
  const s=ready(),pace=createLiveRequestPacer(),results=[],correlationIds=new Set();
  let cleanupProof=null,completed=false;
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,deployment:s.previewGate.status(),cleanup:cleanupProof,
    liveAcceptance:terminal&&completed&&results.length===counselingCancellationCaseIds().length
      &&results.every(row=>row.passed)&&cleanupProof?.verified===true&&cleanupProof.counselingCancellationCleanup===true});
  try{
    assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    const plan=await stageCounselingFixture(s,counselingFixtureOwners(s),'scheduled:counselingAppointments');
    await verifyCounselingCancellation({
      plan,
      markCancellation:async command=>{
        await assertRecordedFixtureLease(s,'Counseling cancellation');
        await s.previewGate.assertCurrent();
        s.counselingCancellation={plan,command,knownIds:[...s.recordIds]};
        await saveLedger();
      },
      observe:async expectedState=>{
        await assertRecordedFixtureLease(s,'Counseling cancellation');
        for(const user of s.users)await user.renewSession({signal});
        return observeCounselingFixture(plan,{sql:s.sql,users:s.users,origin,fetchImpl:readback,
          readResponse:readBoundedFixtureResponse,signal:signals(signal),knownIds:[...s.recordIds],
          command:s.counselingCancellation?.command,expectedState});
      },
      request:async command=>{
        const caller=command.actor==='guest'?null:s.users[command.actor==='A'?0:1];
        const actionFetch=command.action?createTrustedPreviewFetch({origin,token:previewToken,
          confirmedCounselingCommand:{callerToken:caller.token,body:command.action}}):undefined;
        let ticket,value;
        try{
          value=await pace(()=>requestCounselingCancellation({origin,command,token:caller?.token,previewFetch:readback,
            actionFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal,65000),correlationIds,
            privateMarkers:[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),...s.recordIds]}),
            signal,async()=>{ticket=await s.previewGate.beforeRequest();});
        }finally{if(ticket)await s.previewGate.afterRequest(ticket);}
        return {...value,requestIndex:ticket.requestIndex};
      },
      onResult:async result=>{results.push(result);await onCheckpoint?.(report(false));},
    });
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Counseling cancellation source changed during evaluation.');
    await s.previewGate.finish();
    completed=true;
  }finally{
    try{cleanupProof=await cleanup();}
    finally{await onCheckpoint?.(report(true));}
  }
  return report(true);
}

export async function runVenueProtectedPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Venue reads require an exact protected Preview and source revision.');
  const runId=randomUUID(),cases=venueProtectedCases(),results=[],correlations=new Set();
  let previewGate,prepared=false,finished=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,gaps:venueProtectedGaps(),
    deployment:previewGate?.status()??null,cleanup:cleanupProof,...(failure?{failure}:{}),
    liveAcceptance:terminal&&finished&&!failure&&hasVenueProtectedProof(results)&&cleanupProof.verified===true
      &&cleanupProof.venueProtectedCleanup===true&&cleanupProof.protectedOwnerUnchanged===true});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Venue requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,
      expectedReleaseRevision:sourceRevision,signal,fixtureMode:venueProtectedFixtureMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    await assertRecordedFixtureLease(s,'Venue setup');
    await previewGate.assertCurrent();
    assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    if(s.users.length!==2)fail('fixture-isolation','Venue requires two separate disposable owners.');
    const owners=Object.fromEntries(s.users.map(({id},i)=>{
      const matches=s.identityRequests.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||id===s.protectedOwnerBefore.id)fail('fixture-isolation','Venue caller is outside the disposable lease.');
      return [i===0?'A':'B',{id,email:matches[0].email,runMarker:runId}];
    }));
    const plan=buildVenueProtectedPlan(runId,owners);
    s.venueProtectedPlan=plan;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedVenueProtectedFixture(s.sql,plan)), 'Could not stage exact pending venue records.');
    const observe=async()=>{
      await assertRecordedFixtureLease(s,'Venue account readback');
      await previewGate.assertCurrent();
      const rowsDigest=await observeVenueProtectedFixture(s.sql,plan);
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await observeVenueProtectedCallers(plan,{users:s.users,publishable:s.publishable,origin,previewFetch:readback,
        directFetch:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal,15000)});
      return {rowsDigest,callers};
    };
    for(const boundCase of cases){
      phase=boundCase.testCase.id;
      const before=await observe(),caller=boundCase.role==='guest'?null:s.users[boundCase.role==='A'?0:1];
      let ticket,result;
      try{
        result=await pace(async()=>{
          await assertRecordedFixtureLease(s,'Venue assistant request');
          await caller?.renewSession({signal});
          const privateMarkers=[runId,...s.users.flatMap(user=>[user.id,user.token]),...Object.values(owners).map(owner=>owner.email),
            ...plan.rows.flatMap(row=>[row.id,row.purpose,row.review_note])];
          return requestVenueProtectedCase({boundCase,plan,origin,sourceRevision,token:caller?.token,key:s.venueObservationKey,
            signal:signals(signal,65000),fetchImpl:readback,readResponse:readBoundedFixtureResponse,correlations,privateMarkers});
        },signal,async()=>{ticket=await previewGate.beforeRequest();});
      }finally{if(ticket)await previewGate.afterRequest(ticket);}
      const after=await observe();
      if(JSON.stringify(before)!==JSON.stringify(after)){result.passed=false;result.failures.push('venue.persisted_state_changed');}
      results.push({...result,requestIndex:ticket.requestIndex,before,after});
      await onCheckpoint?.(report(false));
    }
    phase='release-verification';
    await previewGate.finish();
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Venue source changed during evaluation.');
    finished=true;
  }catch(error){
    if(error instanceof LiveFixtureError&&error.venueCleanupProof)cleanupProof=error.venueCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report(true));
  }
  return report(true);
}

export async function runCertificateAwardPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Certificate status requires an exact protected Preview and source revision.');
  const runId=randomUUID(),manifest=certificateAwardPreviewManifest(),results=[];
  let previewGate,prepared=false,finished=false,failure,phase='preflight',boundSuiteDigest;
  let cleanupProof={verified:false,status:'not-started'};
  const report=terminal=>structuredClone({version:1,runId,sourceRevision,origin,terminal,execution:'live-native',
    caseIds:manifest.map(row=>row.id),suiteDigest:certificateAwardPreviewHash(manifest),boundSuiteDigest,
    results,deployment:previewGate?.status()??null,cleanup:cleanupProof,...(failure?{failure}:{}),
    modelAcceptance:false,browserDispatchAcceptance:false,
    liveAcceptance:terminal&&finished&&!failure&&results.length===manifest.length&&results.every(row=>row.passed)
      &&cleanupProof.verified&&cleanupProof.protectedOwnerUnchanged&&cleanupProof.certificateAwardPreviewCleanup&&cleanupProof.certificateAwardCatalogUnchanged});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const initial=await sourceIdentity();
    if(initial.dirty||initial.sourceRevision!==sourceRevision)fail('fixture-target','Certificate status requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:certificateAwardPreviewMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    const assertScoped=async()=>{
      await assertRecordedFixtureLease(s,'Certificate award fixture');
      await previewGate.assertCurrent();
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    };
    phase='seed';
    await assertScoped();
    if(s.users.length!==2)fail('fixture-isolation','Certificate status requires two disposable callers.');
    const owners=Object.fromEntries(s.users.map(({id},index)=>{
      const matches=s.identityRequests.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||id===s.protectedOwnerBefore.id)fail('fixture-isolation','Certificate caller is outside the reserved lease.');
      return [index===0?'A':'B',{id,email:matches[0].email,runMarker:runId}];
    }));
    const plan=buildCertificateAwardPreviewPlan(runId,owners,s.certificateAwardCatalogDigest),cases=bindCertificateAwardPreviewCases(plan);
    boundSuiteDigest=certificateAwardPreviewHash(cases);
    s.certificateAwardPreviewPlan=plan;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedCertificateAwardPreview(s.sql,plan)),'Could not stage exact disposable certificate applications.');
    const observe=async()=>{
      await assertScoped();
      const {stateDigest,catalogDigest}=await observeCertificateAwardPreview(s.sql,plan);
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await observeCertificateAwardPreviewCallers(plan,{users:s.users,origin:s.url,publishable:s.publishable,
        fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal)});
      return {stateDigest,catalogDigest,callers};
    };
    for(const bound of cases){
      phase=bound.testCase.id;
      const before=await observe(),caller=s.users.find(user=>user.id===owners[bound.role].id);
      let ticket,result;
      try{
        result=await pace(async()=>{
          await assertRecordedFixtureLease(s,'Certificate status request');
          await caller.renewSession({signal});
          return requestCertificateAwardPreviewCase({bound,token:caller.token,origin,fetchImpl:readback,
            readResponse:readBoundedFixtureResponse,signal:signals(signal,15000)});
        },signal,async()=>{ticket=await previewGate.beforeRequest();});
      }finally{if(ticket)await previewGate.afterRequest(ticket);}
      const after=await observe(),unchanged=isDeepStrictEqual(before,after);
      results.push({...result,requestIndex:ticket.requestIndex,before,after,passed:result.passed&&unchanged,
        checks:[...result.checks,{id:'certificate.unchanged',passed:unchanged,detail:'Independent SQL and paired caller observations match before and after.'}]});
      await onCheckpoint?.(report(false));
    }
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==initial.workingTreeHash)
      fail('fixture-target','Certificate status source changed during evaluation.');
    await previewGate.finish();
    finished=true;
  }catch(error){
    if(error instanceof LiveFixtureError&&error.certificateAwardCleanupProof)cleanupProof=error.certificateAwardCleanupProof;
    failure={phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report(true));
  }
  return report(true);
}

export async function runFacilityRepairCancellationPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Facility repair cancellation requires an exact protected Preview and source revision.');
  const runId=randomUUID(),results=[],correlationIds=new Set();
  let previewGate,prepared=false,completed=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,deployment:previewGate?.status()??null,
    cleanup:cleanupProof,...(failure?{failure}:{}),liveAcceptance:terminal&&completed&&!failure&&hasFacilityRepairCancellationProof(results)
      &&cleanupProof.verified===true&&cleanupProof.facilityRepairCancellationCleanup===true&&cleanupProof.protectedOwnerUnchanged===true});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Facility repair cancellation requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:facilityRepairCancellationMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    await assertRecordedFixtureLease(s,'Facility repair cancellation setup');
    await previewGate.assertCurrent();
    assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    if(s.users.length!==2)fail('fixture-isolation','Facility repair cancellation requires two disposable callers.');
    const owners=Object.fromEntries(s.users.map(({id},index)=>{
      const matches=s.identityRequests.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||id===s.protectedOwnerBefore.id)fail('fixture-isolation','Facility repair callers are outside the reserved lease.');
      return [index===0?'A':'B',{id,email:matches[0].email,runMarker:runId}];
    }));
    const plan=buildFacilityRepairCancellationPlan(runId,owners);
    s.facilityRepairCancellation={plan,command:null};
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedFacilityRepairCancellation(s.sql,plan)), 'Could not seed the exact disposable repair rows.');
    phase='verification';
    await verifyFacilityRepairCancellation({plan,
      markCancellation:async command=>{
        await assertRecordedFixtureLease(s,'Facility repair cancellation intent');
        await previewGate.assertCurrent();
        s.facilityRepairCancellation.command=command;
        await saveLedger();
      },
      observe:async expectedState=>{
        await assertRecordedFixtureLease(s,'Facility repair cancellation readback');
        await previewGate.assertCurrent();
        return observeFacilityRepairCancellation(s.sql,plan,{command:s.facilityRepairCancellation.command,expectedState,
          readScopes:expected=>readFacilityRepairFixtureScopes(expected,s.users,{origin,signal,fetchImpl:readback})});
      },
      request:async command=>{
        phase=command.caseId;
        const caller=command.actor==='guest'?null:s.users[command.actor==='A'?0:1];
        let ticket,value;
        try{
          value=await pace(async()=>{
            await assertRecordedFixtureLease(s,'Facility repair cancellation request');
            await caller?.renewSession({signal});
            const actionFetch=command.action?createTrustedPreviewFetch({origin,token:previewToken,
              confirmedRepairCommand:{callerToken:caller.token,body:command.action}}):undefined;
            const privateMarkers=[runId,plan.missingId,plan.staleRequestId,...plan.reports.map(row=>row.id),...plan.events.map(row=>row.request_id),
              s.facilityRepairCancellation.command?.request_id,...s.users.flatMap(user=>[user.id,user.token]),...Object.values(owners).map(owner=>owner.email)];
            return requestFacilityRepairCancellation({origin,command,token:caller?.token,previewFetch:readback,actionFetch,
              readResponse:readBoundedFixtureResponse,signal:signals(signal,65000),correlationIds,privateMarkers});
          },signal,async()=>{ticket=await previewGate.beforeRequest();});
        }finally{if(ticket)await previewGate.afterRequest(ticket);}
        return {...value,requestIndex:ticket.requestIndex};
      },
      onResult:async result=>{results.push(result);await onCheckpoint?.(report(false));},
    });
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Facility repair cancellation source changed during evaluation.');
    await previewGate.finish();
    completed=true;
  }catch(error){
    if(error instanceof LiveFixtureError&&error.facilityRepairCancellationCleanupProof)cleanupProof=error.facilityRepairCancellationCleanupProof;
    failure=error instanceof FacilityRepairCancellationAssertion?{phase,code:'fixture-assertion',stage:error.stage}
      :{phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report(true));
  }
  return report(true);
}

export async function runLearningSupportPreview({origin,sourceRevision,previewToken,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Learning support requires an exact protected Preview and source revision.');
  const runId=randomUUID(),results=[];
  let previewGate,prepared=false,completed=false,failure,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,deployment:previewGate?.status()??null,
    cleanup:cleanupProof,...(failure?{failure}:{}),liveAcceptance:terminal&&completed&&!failure
      &&results.length===learningSupportNativeCaseIds.length
      &&results.every((row,index)=>row.passed===true&&row.caseId===learningSupportNativeCaseIds[index])
      &&cleanupProof.verified===true&&cleanupProof.learningSupportPreviewCleanup===true&&cleanupProof.protectedOwnerUnchanged===true});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
    const identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)
      fail('fixture-target','Learning support requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken});
    const pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:learningSupportPreviewMode,previewReadbackFetch:readback});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    const http=learningSupportPreviewHttp({origin,previewToken,readback,readResponse:readBoundedFixtureResponse,
      privateMarkers:()=>[...s.users.map(user=>user.token),...s.identityRequests.map(row=>row.email)]});
    phase='seed';
    await assertRecordedFixtureLease(s,'Learning support fixture setup');
    await previewGate.assertCurrent();
    assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    if(s.users.length!==2)fail('fixture-isolation','Learning support requires two disposable callers.');
    const owners=Object.fromEntries(s.users.map(({id},index)=>{
      const matches=s.identityRequests.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||id===s.protectedOwnerBefore.id)
        fail('fixture-isolation','Learning support callers do not match the disposable identity lease.');
      return [index===0?'A':'B',{id,email:matches[0].email,runMarker:runId}];
    }));
    const fixture=bindLearningSupportPreview(runId,owners);
    s.learningSupportPreview=fixture;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedLearningSupportPreview(s.sql,fixture)),'Could not stage the exact learning support fixture.');
    phase='verification';
    const request=async(actor,mode,input={})=>{
      if(!['A','B','guest'].includes(actor)||actor==='guest'&&mode!=='ask')
        fail('fixture-isolation','Request does not belong to a reserved learning support caller.');
      const caller=actor==='guest'?null:s.users[actor==='A'?0:1];
      let ticket;
      const preflight=async()=>{
        await assertRecordedFixtureLease(s,'Learning support fixture request');
        await caller?.renewSession({signal});
        if(caller&&!caller.token)fail('fixture-signin','The learning support caller has no verified session.');
        ticket=await previewGate.beforeRequest();
      };
      const send=()=>http({mode,callerToken:caller?.token,signal:signals(signal,30000),...input});
      try{
        if(mode==='ask')return await pace(send,signal,preflight);
        await preflight();return await send();
      }finally{if(ticket)await previewGate.afterRequest(ticket);}
    };
    await verifyLearningSupportNativePacket({plan:fixture.plan,
      readRaw:async()=>{
        await assertRecordedFixtureLease(s,'Learning support SQL readback');
        return query(()=>readLearningSupportNativeRows(s.sql,fixture.plan),'Could not read the exact learning support fixture.');
      },
      readNative:actor=>request(actor,'read'),
      ask:(actor,question,route)=>request(actor,'ask',{question,route}),
      confirm:(actor,command)=>request(actor,'confirm',{command}),
      markWithdrawal:async command=>{
        await assertRecordedFixtureLease(s,'Learning support withdrawal journal');
        await previewGate.assertCurrent();
        fixture.command=command;
        await saveLedger();
      },
      markSubmission:async command=>{
        await assertRecordedFixtureLease(s,'Learning support submission journal');
        await previewGate.assertCurrent();
        fixture.submission=command;
        await saveLedger();
      },
      onResult:async row=>{results.push(row);await onCheckpoint?.(report(false));},
    });
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Learning support source changed during evaluation.');
    const pin=await previewGate.finish();
    if(pin.completed!==learningSupportNativeCaseIds.length*5)
      fail('fixture-target','Learning support application request pin coverage was incomplete.');
    completed=true;
  }catch(error){
    if(error instanceof LiveFixtureError&&error.learningSupportPreviewCleanupProof)cleanupProof=error.learningSupportPreviewCleanupProof;
    failure=error instanceof LearningSupportPreviewError||error instanceof LearningSupportPacketError
      ?{phase,code:'fixture-assertion',stage:error.stage}:{phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report(true));
  }
  return report(true);
}

export async function runClearanceStatusPreview({origin,sourceRevision,previewToken,termIds,signal,onCheckpoint}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??'')||onCheckpoint!==undefined&&typeof onCheckpoint!=='function')
    fail('fixture-config','Graduation clearance requires an exact protected Preview and source revision.');
  assertClearanceStatusTermIds(termIds);
  const approvedTermIds=Object.freeze([...termIds]),runId=randomUUID(),results=[];
  let previewGate,prepared=false,completed=false,failure,sharedBinding,phase='preflight',cleanupProof={verified:false,status:'not-started'};
  const report=terminal=>structuredClone({runId,origin,sourceRevision,terminal,results,deferred:clearanceStatusPreviewDeferred,
    scope:'clearance-status-and-notes',sharedBinding:sharedBinding??null,internalProjectionObserved:false,
    deployment:previewGate?.status()??null,cleanup:cleanupProof,...(failure?{failure}:{}),
    liveAcceptance:terminal&&completed&&!failure&&results.length===clearanceStatusPreviewCaseIds.length
      &&results.every((row,index)=>row.passed&&row.caseId===clearanceStatusPreviewCaseIds[index])
      &&cleanupProof.verified&&cleanupProof.protectedOwnerUnchanged&&cleanupProof.clearanceStatusPreviewCleanup
      &&cleanupProof.clearanceStatusSharedUnchanged});
  try{
    const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs'),identity=await sourceIdentity();
    if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Graduation clearance requires the exact clean deployed source.');
    const readback=createTrustedPreviewFetch({origin,token:previewToken}),pace=createLiveRequestPacer();
    phase='prepare';
    await prepare({runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
      signal,fixtureMode:clearanceStatusPreviewMode,previewReadbackFetch:readback,clearanceStatusTerms:approvedTermIds});
    prepared=true;
    const s=ready();
    ({previewGate}=s);
    phase='seed';
    await assertRecordedFixtureLease(s,'Graduation clearance fixture setup');
    await previewGate.assertCurrent();
    assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
    if(s.users.length!==2)fail('fixture-isolation','Graduation clearance requires two disposable callers.');
    const owners=Object.fromEntries(s.users.map(({id},index)=>{
      const matches=s.identityRequests.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
      if(matches.length!==1||id===s.protectedOwnerBefore.id)fail('fixture-isolation','Graduation clearance callers are outside the disposable lease.');
      return [index===0?'A':'B',{id,email:matches[0].email,runMarker:runId}];
    }));
    const fixture=bindClearanceStatusPreview(runId,owners,s.clearanceStatusShared);
    sharedBinding=clearanceStatusDigest(fixture.shared);
    s.clearanceStatusPreview=fixture;
    await saveLedger();
    await query(()=>feeTransaction(s,()=>seedClearanceStatusPreview(s.sql,fixture)),'Could not seed the exact disposable clearance rows.');
    phase='verification';
    const pinnedRequest=async(side,body)=>{
      if(!['A','B','guest'].includes(side)||side==='guest'&&!body)
        fail('fixture-isolation','Graduation clearance request is outside the disposable callers.');
      const caller=side==='guest'?null:s.users[side==='A'?0:1];
      const endpoint=new URL(body?'/api/affairs-assistant':'/api/affairs-data?scope=graduation-clearance&view=student',origin);
      let ticket;
      const preflight=async()=>{
        await assertRecordedFixtureLease(s,'Graduation clearance Preview request');
        await caller?.renewSession({signal});
        if(caller&&!caller.token)fail('fixture-signin','The graduation clearance caller has no verified session.');
        ticket=await previewGate.beforeRequest();
      };
      const send=async()=>{
        const response=await readback(endpoint,{method:body?'POST':'GET',
          headers:{Accept:'application/json',...(caller?{Authorization:'Bearer '+caller.token}:{}),
            ...(body?{'Content-Type':'application/json'}:{})},
          ...(body?{body:JSON.stringify(body)}:{}),signal:signals(signal,body?65000:15000)});
        return {status:response.status,correlationId:response.headers.get('x-assistant-request-id'),
          body:await readBoundedFixtureResponse(response,endpoint,192000,response.status)};
      };
      try{
        if(body)return await pace(send,signal,preflight);
        await preflight();return await send();
      }finally{if(ticket)await previewGate.afterRequest(ticket);}
    };
    await verifyClearanceStatusPreview({fixture,
      readShared:async()=>{
        await assertRecordedFixtureLease(s,'Graduation clearance shared term readback');
        return readClearanceStatusShared(s.sql,approvedTermIds);
      },
      readOwned:async()=>{
        await assertRecordedFixtureLease(s,'Graduation clearance owned SQL readback');
        return readClearanceOwnedRows(s.sql,fixture);
      },
      readNative:side=>pinnedRequest(side),
      ask:(side,question,route)=>pinnedRequest(side,{question,route,stream:false,consentedResearchUse:false}),
      privateMarkers:()=>s.users.map(user=>user.token),
      onResult:async row=>{results.push(row);await onCheckpoint?.(report(false));},
    });
    phase='release-verification';
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Graduation clearance source changed during evaluation.');
    const pin=await previewGate.finish();
    if(pin.completed!==clearanceStatusPreviewCaseIds.length*5)fail('fixture-target','Graduation clearance request pin coverage was incomplete.');
    completed=true;
  }catch(error){
    if(error?.clearanceStatusPreviewCleanupProof)cleanupProof=error.clearanceStatusPreviewCleanupProof;
    failure=error instanceof ClearanceStatusPreviewError?{phase,code:'fixture-assertion',stage:error.stage}
      :{phase,code:error instanceof LiveFixtureError?error.code:'unexpected'};
  }finally{
    if(prepared)cleanupProof=await captureFixtureCleanup();
    await onCheckpoint?.(report(true));
  }
  return report(true);
}

export async function runTutorEvaluationPreview({origin,sourceRevision,previewToken,signal}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Tutor evaluation requires an exact protected Preview and source revision.');
  const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Tutor evaluation requires the exact clean deployed source.');
  const readback=createTrustedPreviewFetch({origin,token:previewToken}),runId=randomUUID(),cases=tutorEvaluationHostedCases();
  await prepare({runId,cases,now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:tutorEvaluationFixtureMode,caseFamily:tutorEvaluationFamily,previewReadbackFetch:readback});
  const s=ready(),pace=createLiveRequestPacer(),results=[],correlationIds=new Set();
  let cleanupProof;
  try{
    const owners=Object.fromEntries(s.users.map((user,index)=>{
      const requests=s.identityRequests.filter(row=>row.id===user.id&&row.runId===runId&&row.state==='created');
      if(requests.length!==1||user.id===s.protectedOwnerBefore.id)fail('fixture-isolation','Tutor evaluation callers are outside the fixture lease.');
      return [index===0?'A':'B',{id:user.id,email:requests[0].email,runMarker:runId}];
    }));
    s.tutorEvaluationFixture=createTutorEvaluationFixture({sql:s.sql,runId,owners,
      assertLease:async({cleanup})=>{
        await assertRecordedFixtureLease(s,'Tutor evaluation');
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        if(!cleanup)await s.previewGate.assertCurrent();
      },
      persist:async journal=>{
        s.tutorEvaluationJournal=journal;
        await saveLedger();
      },
      transaction:work=>feeTransaction(s,work),
    });
    const observe=async()=>{
      const rowsDigest=await s.tutorEvaluationFixture.observe();
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await observeTutorEvaluationCallers(s.tutorEvaluationFixture.current(),{
        users:s.users,publishable:s.publishable,origin,previewFetch:readback,directFetch:s.boundedFetch,
        readResponse:readBoundedFixtureResponse,signal:signals(signal),
      });
      return {rowsDigest,callers};
    };
    for(const testCase of cases){
      await s.tutorEvaluationFixture.transition(testCase.fixtureKey.slice('live:'.length));
      const before=await observe();
      const markers=[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),
        ...s.tutorEvaluationJournal.requestIds];
      let ticket,request;
      try{
        request=await pace(()=>requestTutorEvaluation({testCase,origin,token:s.users[0].token,signal:signals(signal,65000),
          fetchImpl:readback,privateMarkers:markers,correlationIds}),signal,async()=>{ticket=await s.previewGate.beforeRequest();});
      }finally{if(ticket)await s.previewGate.afterRequest(ticket);}
      const after=await observe();
      const {envelope,...requestProof}=request;
      results.push({...gradeHostedTutorEvaluation(testCase,envelope,before,after),...requestProof,requestIndex:ticket.requestIndex});
    }
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Tutor evaluation source changed during verification.');
    await s.previewGate.finish();
  }finally{cleanupProof=await cleanup();}
  return {runId,origin,sourceRevision,results,unmounted:tutorEvaluationHostedGaps(),deployment:s.previewGate.status(),
    cleanup:cleanupProof,egressObservation:false,
    liveAcceptance:results.length===cases.length&&results.every(row=>row.passed)&&cleanupProof.verified&&cleanupProof.tutorEvaluationCleanup===true};
}

export async function runClubEquipmentPreview({origin,sourceRevision,previewToken,signal,confirmedCancellation=false,routeContext=false}={}){
  if(!isEvaluationPreviewOrigin(origin)||!/^[a-f0-9]{40}$/u.test(sourceRevision??''))
    fail('fixture-config','Club equipment requires an exact protected Preview and source revision.');
  if(typeof routeContext!=='boolean'||routeContext&&confirmedCancellation)
    fail('fixture-config','Run the equipment page-context packet separately from confirmed cancellation.');
  const {createLiveRequestPacer,sourceIdentity}=await import('./run.mjs');
  const identity=await sourceIdentity();
  if(identity.dirty||identity.sourceRevision!==sourceRevision)fail('fixture-target','Club equipment requires the exact clean deployed source.');
  const readback=createTrustedPreviewFetch({origin,token:previewToken}),runId=randomUUID(),frozen=clubEquipmentHostedCases();
  const cases=routeContext?clubEquipmentHostedRouteCases():frozen;
  await prepare({runId,cases:frozen,now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,expectedReleaseRevision:sourceRevision,
    signal,fixtureMode:clubEquipmentFixtureMode,caseFamily:clubEquipmentFamily,previewReadbackFetch:readback});
  const s=ready(),pace=createLiveRequestPacer(),results=[],correlationIds=new Set();
  let cleanupProof,cancellation=[];
  try{
    const owners=Object.fromEntries(s.users.map((user,index)=>{
      const requests=s.identityRequests.filter(row=>row.id===user.id&&row.runId===runId&&row.state==='created');
      if(requests.length!==1||user.id===s.protectedOwnerBefore.id)fail('fixture-isolation','Club equipment callers are outside the fixture lease.');
      return [index===0?'A':'B',{id:user.id,email:requests[0].email,runMarker:runId}];
    }));
    let cancellationDate;
    if(confirmedCancellation||routeContext){
      const [clock]=await query(()=>s.sql`select (now() at time zone 'Asia/Taipei')::date::text as today`,'Could not read the club equipment fixture date.');
      if(!clock?.today)fail('fixture-readback','The club equipment fixture date is unavailable.');
      cancellationDate=clock.today;
    }
    const plan=buildClubEquipmentHostedPlan({runId,owners,cancellationDate});
    s.clubEquipmentFixture=createClubEquipmentFixture({sql:s.sql,plan,
      assertLease:async({cleanup})=>{
        await assertRecordedFixtureLease(s,'Club equipment');
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        if(!cleanup)await s.previewGate.assertCurrent();
      },
      persist:async journal=>{s.clubEquipmentJournal=journal;await saveLedger();},
      transaction:work=>feeTransaction(s,work),
    });
    await s.clubEquipmentFixture.setup();
    const observe=async()=>{
      const rowsDigest=await s.clubEquipmentFixture.observe();
      await Promise.all(s.users.map(user=>user.renewSession({signal})));
      const callers=await observeClubEquipmentCallers(plan,{users:s.users,origin,previewFetch:readback,
        readResponse:readBoundedFixtureResponse,signal:signals(signal)});
      return {rowsDigest,callers};
    };
    for(const testCase of cases){
      const before=await observe();
      const token=testCase.actor==='guest'?null:s.users[testCase.actor==='A'?0:1].token;
      let ticket,request;
      try{
        request=await pace(()=>requestClubEquipment({testCase,plan,origin,token,signal:signals(signal,65000),
          fetchImpl:readback,privateMarkers:s.users.map(user=>user.token),correlationIds}),signal,async()=>{ticket=await s.previewGate.beforeRequest();});
      }finally{if(ticket)await s.previewGate.afterRequest(ticket);}
      const after=await observe();
      const {envelope,...requestProof}=request;
      results.push({...gradeClubEquipmentHosted(testCase,{...requestProof,envelope},before,after,plan),...requestProof,requestIndex:ticket.requestIndex});
    }
    if(confirmedCancellation){
      if(!results.every(result=>result.passed))fail('fixture-readback','Club equipment reads did not pass before the mutation check.');
      cancellation=await verifyClubEquipmentCancellation({plan,markCancellation:payload=>s.clubEquipmentFixture.markCancellation(payload),
        observe:async state=>{
          if(state==='initial')return observe();
          const {rows,rowsDigest}=await s.clubEquipmentFixture.observeCancelled();
          await Promise.all(s.users.map(user=>user.renewSession({signal})));
          const callers=await observeClubEquipmentCallers(plan,{users:s.users,origin,previewFetch:readback,expectedRows:rows,
            readResponse:readBoundedFixtureResponse,signal:signals(signal)});
          return {rowsDigest,callers};
        },request:async command=>{
          const caller=s.users[command.actor==='A'?0:1];
          const actionFetch=command.action?createTrustedPreviewFetch({origin,token:previewToken,
            confirmedClubCommand:{callerToken:caller.token,body:command.action}}):undefined;
          let ticket,value;
          try{
            value=await pace(()=>requestClubEquipmentCancellation({origin,command,token:caller.token,previewFetch:readback,
              actionFetch,readResponse:readBoundedFixtureResponse,signal:signals(signal,65000),correlationIds,
              privateMarkers:[...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(row=>row.email),
                ...plan.rows.flatMap(row=>[row.phone,row.student_name,row.student_number,row.other_purpose,row.collateral])]}),
              signal,async()=>{ticket=await s.previewGate.beforeRequest();});
          }finally{if(ticket)await s.previewGate.afterRequest(ticket);}
          return {...value,requestIndex:ticket.requestIndex};
        },
      });
    }
    const final=await sourceIdentity();
    if(final.dirty||final.sourceRevision!==sourceRevision||final.workingTreeHash!==identity.workingTreeHash)
      fail('fixture-target','Club equipment source changed during verification.');
    await s.previewGate.finish();
  }finally{cleanupProof=await cleanup();}
  return {runId,origin,sourceRevision,results,...(confirmedCancellation?{cancellation}:{}),deployment:s.previewGate.status(),cleanup:cleanupProof,
    liveAcceptance:results.length===cases.length&&results.every(row=>row.passed)&&(!confirmedCancellation||cancellation.length===9)
      &&cleanupProof.verified&&cleanupProof.clubEquipmentCleanup===true};
}

async function feeTransaction(s,work){
  await s.sql.unsafe('begin');
  try{
    const result=await work();
    await s.sql.unsafe('commit');
    return result;
  }catch(error){
    try{await s.sql.unsafe('rollback');}catch{/* Retain the journal if the outcome is unknown. */}
    throw error;
  }
}

async function assertFeeFixtureLease(s,{runId,projectRef,ownerIds,studentIds}){
  if(state!==s||!s.locked||s.closed||!s.ledgerOwned||runId!==s.runId||projectRef!==PROJECT
    ||!isSameIds(ownerIds,s.users.map(user=>user.id))||!isSameIds(studentIds,Object.values(s.feeFixture.students).map(row=>row.id)))
    fail('fixture-lease','The fee remission fixture is outside its recorded run or owner lease.');
  if(!s.closing)s.signal?.throwIfAborted();
  const locks=await s.sql`select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()
    and classid=23101314 and objid=115100 and objsubid=2 and granted`;
  if(locks.length!==1)fail('fixture-lease','The disposable fee fixture lost its database lease.');
  assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
  return true;
}

function isSameIds(actual,expected){
  return Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===expected.length&&actual.every(id=>expected.includes(id));
}

async function readFeeFixtureIdentities(s,ownerIds){
  const identities=await s.sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users u where u.id in ${s.sql(ownerIds)} and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
        and i.provider_id=u.id::text and i.identity_data->>'email'=u.email and i.identity_data->>'email_verified'='true')`;
  const students=await s.sql`select st.id,st.user_id from public.affairs_students st
    join public.affairs_profiles p on p.user_id=st.user_id and p.role='student'
    join auth.users u on u.id=st.user_id and u.email=p.email
    where st.user_id in ${s.sql(ownerIds)} and st.source_mode='sample'`;
  return {identities,students};
}

async function feeReadback(s,{role,view,contract}){
  const user=s.users[role==='A'?0:1];
  if(user?.id!==contract.ownerId)fail('fixture-readback','Fee remission fixture caller binding changed.');
  await user.renewSession({signal:s.signal});
  if(view==='charges')return loadOwnAffairsCharges({user:{id:user.id},url:s.url,key:s.publishable,token:user.token});
  if(view!=='feeRemission'||contract.method!=='GET'||contract.path!=='/api/affairs-data'||contract.query.scope!=='fee-remission')
    fail('fixture-readback','Unsupported fee remission readback.');
  const url=new URL('/api/affairs-data?scope=fee-remission',s.origin);
  const response=await (s.previewReadbackFetch??fetch)(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(s.signal,15000)});
  if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
    await response.body?.cancel();fail('fixture-readback','Caller-scoped fee remission read did not return JSON.');
  }
  const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Fee remission readback did not contain a body.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>131072)fail('fixture-readback','Fee remission readback exceeded its bound.');
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

async function prepareFeeFixture(s){
  const owners=Object.fromEntries(s.users.map((user,index)=>{
    const request=s.identityRequests.find(row=>row.id===user.id);
    return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
  }));
  const ownerIds=Object.values(owners).map(row=>row.id);
  if(ownerIds.length!==2||ownerIds.includes(s.protectedOwnerBefore.id))fail('fixture-create','Fee remission requires two disposable owners.');
  const students=Object.fromEntries(Object.entries(owners).map(([role,owner])=>[role,{id:randomUUID(),user_id:owner.id}]));
  const studentIds=Object.values(students).map(row=>row.id);
  buildFeeRemissionFixturePlan({runId:s.runId,owners,students,fixtureKey:'feeRemission'});
  s.feeFixture={owners,students,journal:null,lifecycle:null};
  await saveLedger();
  await query(()=>feeTransaction(s,async()=>{
    await assertFeeFixtureLease(s,{runId:s.runId,projectRef:PROJECT,ownerIds,studentIds});
    const existing=await readFeeFixtureIdentities(s,ownerIds);
    if(existing.identities.length!==2||!Object.values(owners).every(owner=>existing.identities.some(actual=>
      actual.id===owner.id&&actual.email===owner.email&&actual.runMarker===owner.runMarker)))
      fail('fixture-create','Fee remission requires verified disposable Google identities.');
    const programs=await s.sql`select id from public.affairs_programs where code='SAMPLE-GEN' and source_mode='sample'`;
    if(programs.length!==1)fail('fixture-create','The existing sample program could not be bound.');
    for(const [role,owner] of Object.entries(owners)){
      const name=role==='A'?'Evaluation Student':'Evaluation Other';
      const studentId=students[role].id;
      await s.sql`insert into public.affairs_profiles(user_id,email,display_name,role) values(${owner.id},${owner.email},${name},'student')`;
      await s.sql`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level,source_mode)
        values(${studentId},${owner.id},${'EVAL-'+studentId},${name},${programs[0].id},1,'sample')`;
      // The existing student insert trigger creates a sample charge. Remove
      // that exact trigger result in the same transaction, before seeding cases.
      const [charge,...extra]=await s.sql`select id,student_id,label,amount_due,amount_paid,currency,due_on::text,source_mode,
        occurrence_on,category,contact_unit,contact_extension,payment_unit from public.affairs_charges where student_id=${studentId} limit 2`;
      if(extra.length||charge?.student_id!==studentId||!UUID.test(charge.id)||charge.label!=='Sample Fall 2026 tuition'
        ||Number(charge.amount_due)!==28000||Number(charge.amount_paid)!==5000||charge.currency!=='TWD'||charge.due_on!=='2026-12-15'
        ||charge.source_mode!=='sample'||['occurrence_on','category','contact_unit','contact_extension','payment_unit'].some(key=>charge[key]!==null))
        fail('fixture-create','The generated sample charge differed from the published seed.');
      const deleted=await s.sql`delete from public.affairs_charges where id=${charge.id} and student_id=${studentId} returning id`;
      if(deleted.length!==1||deleted[0].id!==charge.id)fail('fixture-create','The generated charge could not be removed exactly.');
    }
  }),'Could not prepare the isolated fee fixture student bindings.');
  s.users.forEach((user,index)=>{user.studentId=students[index===0?'A':'B'].id;});
  s.feeFixture.lifecycle=createFeeRemissionFixtureLifecycle({
    assertLease:binding=>assertFeeFixtureLease(s,binding),
    readIdentities:binding=>readFeeFixtureIdentities(s,binding.ownerIds),
    readRows:descriptor=>readFeeRows(s.sql,descriptor),
    transaction:work=>query(()=>feeTransaction(s,()=>work({
      readRows:descriptor=>readFeeRows(s.sql,descriptor),deleteRows:descriptor=>deleteFeeRows(s.sql,descriptor),insertRows:descriptor=>insertFeeRows(s.sql,descriptor),
    })),'Could not apply the owned fee fixture transaction.'),
    readNative:descriptor=>feeReadback(s,descriptor),
    writeJournal:async journal=>{
      s.feeFixture.journal=journal;
      journal.recordIds.forEach(id=>s.recordIds.add(id));
      await saveLedger();return true;
    },
    readCleanupProof:async descriptor=>{
      const {identities,students}=await readFeeFixtureIdentities(s,ownerIds);
      const rows=await readFeeRows(s.sql,descriptor);
      if(Object.values(rows).some(items=>items.length))fail('fixture-cleanup','A reserved or owned fee fixture row remains.');
      return {identities,students,
        remainingByTable:Object.fromEntries(Object.keys(rows).map(table=>[table,ownerIds.map(userId=>({userId,count:0}))])),
        reservedByTable:{affairs_fee_remission:0,affairs_charges:0}};
    },
  });
}

function assertSupported(testCase,snapshot){
  const key=testCase.fixtureKey,tools=testCase.expected?.requiredTools||[];
  if(!state.caseIds.has(testCase.id))fail('fixture-case','The case was not included in prepare().');
  if(key==='anonymous')fail('fixture-case','Anonymous requests must bypass the signed-in fixture adapter.');
  if(['mixed-currency','admin'].includes(key))fail('fixture-unsupported',`${key} needs an additional real schema adapter; it is not a model result.`);
  if(['empty:profile','empty:courses','empty:dtm','empty:tasks','empty:announcements'].includes(key))fail('fixture-unsupported',`${key} cannot be represented while the account initializer recreates those records or the records are globally shared.`);
  if(tools.some(tool=>!SUPPORTED_TOOLS.has(tool)&&!(tool==='courseCatalog'&&state.catalogBindings?.has(testCase.id)))){
    const onlyPermissionCheck=testCase.id==='account:action-announcement-denied';
    if(!onlyPermissionCheck)fail('fixture-unsupported',`No private live mapping for ${tools.filter(tool=>!SUPPORTED_TOOLS.has(tool)).join(', ')}; unsupported fixtures never count as passing.`);
  }
  if(testCase.id==='account:dtm-notices')fail('fixture-unsupported','DTM notices are globally shared; this adapter never publishes synthetic notices.');
  if(key==='submissions')fail('fixture-unsupported','This adapter does not create file uploads or submission revisions; a tracker row is not submission evidence.');
  if(snapshot.profile.role!=='student')fail('fixture-unsupported','The live adapter never elevates a fixture to administrator.');
  if(key==='facility-repairs:compound'){
    try{assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});}
    catch{fail('fixture-clock','The original published next-class expectation cannot be verified at the current Taipei time.');}
  }
  if(String(key).startsWith('published-sample:')){
    if(key!=='published-sample:records')fail('fixture-unsupported','Unknown published sample fixture family.');
    if(evaluationDates(state.now).today!==evaluationDates(new Date().toISOString()).today)fail('fixture-clock','Published sample evaluation must use the actual campus day; literal term dates cannot be rebased.');
  }
  if(testCase.expected?.timeFixture){
    const expected=evaluationDates(state.now),actual=evaluationDates(new Date().toISOString());
    if(expected.today!==actual.today||expected.nextClass!==actual.nextClass)fail('fixture-clock','Live date boundary no longer matches the authored case; rebuild the suite with the current clock.');
  }
}

// These fields are the persisted migration contract, not answer-derived data.
// Unknown fields cannot become SQL identifiers; all tables and columns below
// are fixed literals. A planner can be exercised entirely offline.
const COMMON=['id','userId','sourceMode','version','createdAt','updatedAt'];
const NATIVE_TABLES={
  studentAid:{records:['affairs_student_aid_records',['applicantLabel','studentName','maskedIdentityNumber','departmentName','phone','applicationKind','relativeCount','subsidyAmount','studentRecordLocked','schoolReviewStatus','ministryReviewStatus','academicYear','semester']]},
  creditLoadHistory:{records:['affairs_credit_load_history',['academicYear','semester','category','requestedCredits','processText','resultText']]},
  courseSelection:{records:['affairs_course_selection_records',['academicYear','semester','selectionPhase','termCourseCode','courseTitle','requiredElectiveText','credits','instructorOne','remarkText','rowOrder','timetableIncluded','meetings']]},
  academicGrades:{
    records:['affairs_academic_grade_records',['recordKind','academicYear','semester','courseTitle','courseCode','categoryText','moduleName','requiredElectiveText','credits','gradeText','remarkText','rowOrder']],
    termSummaries:['affairs_academic_term_summaries',['summaryKind','academicYear','semester','earnedCredits','averageGradeText','attemptedCredits','passedCredits','failedCredits']],
    rankings:['affairs_academic_rankings',['academicYear','semester','departmentRankingText','classRankingText']],
    metadata:['affairs_academic_metadata',['classLabel','englishRequirementText']],
  },
  graduationReview:{reports:['affairs_graduation_reviews',['reportKind']]},
  academicAttendance:{
    statistics:['affairs_academic_attendance_statistics',['academicYear','semester','rowOrder','studentNumber','studentName','courseCode','courseTitle','totalTeachingHours','currentTeachingWeeks','currentTeachingHours','absenceHours','unexcusedAbsenceHours']],
    details:['affairs_academic_attendance_details',['academicYear','semester','rowOrder','courseCode','courseTitle','teacherName','absenceTypeText','courseDate','periodText','rollCalledAt']],
    metadata:['affairs_academic_attendance_metadata',['currentAcademicYear','currentSemester']],
  },
};
const REPORT_FIELDS=['reportedAt','identity','educationProgram','foreignLanguageCompletion','englishRequirement','graduationReview','languageRequirements','categories','otherCourses'];
const PERIOD_FIELDS={scholarship:['termLabel','opensAt','closesAt','published','instructions','sourceMode','version'],housing:['termLabel','academicYear','semester','opensAt','closesAt','published','instructions','agreementText','sourceMode','version']};
const COURSE_FIELDS=['code','title','credits','term','termStartsOn','termEndsOn','instructor','weekday','startsAt','endsAt','room'];
const APPLICATION_FIELDS={
  scholarship:['id','userId','periodId','status','awardAmount','requiredHours','actualHours','reviewNote','submittedAt','reviewedAt','cancelledAt','version'],
  housing:['id','userId','periodId','receiptNumber','fullName','studentNumber','gender','department','birthDate','homePhone','mobilePhone','email','address','postalCode','category','healthNotes','agreementVersion','agreementText','submittedAt','version'],
};
const BED_FIELDS=['id','userId','periodId','bedNumber','dormitory','bunk','accommodationFee','deposit','subsidyAmount','version'];
const snake=key=>key.replace(/[A-Z]/g,character=>'_'+character.toLowerCase());
const ownTables=Object.values(NATIVE_TABLES).flatMap(domain=>Object.values(domain).map(([table])=>table));
const periodTables={scholarship:'affairs_scholarship_periods',housing:'affairs_housing_periods'};
const applicationTables={scholarship:'affairs_scholarship_applications',housing:'affairs_housing_applications'};
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const amount=(value,max,nullable=false)=>nullable&&value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max&&Number(value.toFixed(2))===value;
const validText=(value,max,nullable=false)=>nullable&&value===null||typeof value==='string'&&value.trim().length>0&&[...value].length<=max&&!/[\u0000\ud800-\udfff]/u.test(value);
const validStamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&validDay(value.slice(0,10));
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const requireSchema=(condition,label)=>{if(!condition)fail('fixture-schema',label);};
function requiredFields(row,fields,label){
  requireSchema(row&&typeof row==='object'&&!Array.isArray(row)&&fields.every(key=>Object.hasOwn(row,key)&&row[key]!==undefined),`${label} has missing explicit persisted fields.`);
  return Object.fromEntries(fields.map(key=>[snake(key),structuredClone(row[key])]));
}
function validCommon(row){
  return UUID.test(row.id)&&UUID.test(row.user_id)&&row.source_mode==='local_demo'&&integer(row.version,1,2147483647)&&validStamp(row.created_at)&&validStamp(row.updated_at);
}
function validatePrivateNativeRow(table,row){
  requireSchema(validCommon(row),`Invalid native owner, provenance, version or timestamp in ${table}.`);
  if(table==='affairs_student_aid_records'){
    const mask=row.masked_identity_number;
    requireSchema(validText(row.applicant_label,160)&&validText(row.student_name,160)&&validText(row.department_name,160,true)&&
      (mask===null||typeof mask==='string'&&mask.length>=3&&mask.length<=24&&/^[A-Za-z0-9*•● -]+$/.test(mask)&&/[*•●]{3,}/.test(mask)&&mask.replace(/[^A-Za-z0-9]/g,'').length<=4)&&
      (row.phone===null||typeof row.phone==='string'&&row.phone.length>=3&&row.phone.length<=40&&/^[0-9+()# .-]+$/.test(row.phone))&&
      validText(row.application_kind,120)&&(row.relative_count===null||integer(row.relative_count,0,1000))&&amount(row.subsidy_amount,10000000,true)&&
      [true,false,null].includes(row.student_record_locked)&&validText(row.school_review_status,160,true)&&validText(row.ministry_review_status,160,true)&&
      integer(row.academic_year,1,999)&&integer(row.semester,1,3),'Invalid explicit student aid fields.');
  }else if(table==='affairs_credit_load_history'){
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['over','under'].includes(row.category)&&amount(row.requested_credits,9999.99)&&validText(row.process_text,300,true)&&validText(row.result_text,300,true),'Invalid credit-load history fields.');
  }else if(table==='affairs_course_selection_records'){
    const seen=new Set(),periods=['1','2','3','4','午','5','6','7','8','傍','A','B','C','D'];
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['initial','add_drop','withdrawal','summer1'].includes(row.selection_phase)&&
      validText(row.term_course_code,80)&&validText(row.course_title,160)&&validText(row.required_elective_text,30,true)&&amount(row.credits,999.99)&&
      validText(row.instructor_one,160,true)&&validText(row.remark_text,300,true)&&integer(row.row_order,0,999999)&&typeof row.timetable_included==='boolean'&&Array.isArray(row.meetings)&&row.meetings.length<=98,'Invalid course-selection fields.');
    for(const slot of row.meetings){
      requireSchema(slot&&Object.keys(slot).length===3&&integer(slot.weekday,1,7)&&periods.includes(slot.period)&&typeof slot.room==='string'&&[...slot.room].length<=80,'Invalid course-selection meeting slot.');
      const key=slot.weekday+':'+slot.period;requireSchema(!seen.has(key),'Duplicate course-selection meeting slot.');seen.add(key);
    }
  }
}
function sameFields(a,b,fields){return JSON.stringify(canonical(pick(a,fields)))===JSON.stringify(canonical(pick(b,fields)));}
function uniqueRows(rows){
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){requireSchema(UUID.test(row.id)&&!ids.has(row.id),`Duplicate or invalid synthetic record ID in ${table}.`);ids.add(row.id);}
  }
  for(const [table,keys] of Object.entries({affairs_scholarship_applications:['user_id','period_id'],affairs_housing_applications:['user_id','period_id'],affairs_housing_assignments:['user_id','period_id'],affairs_enrollments:['student_id','section_id'],affairs_attendance:['enrollment_id','meeting_on']})){
    const seen=new Set();for(const row of rows[table]||[]){const value=JSON.stringify(keys.map(key=>row[key]));requireSchema(!seen.has(value),`Duplicate native uniqueness constraint in ${table}.`);seen.add(value);}
  }
  const beds=new Set(),receipts=new Set();
  for(const row of rows.affairs_housing_assignments||[]){const key=row.period_id+':'+row.bed_number;requireSchema(!beds.has(key),'Duplicate housing bed in a period.');beds.add(key);}
  for(const row of rows.affairs_housing_applications||[]){requireSchema(!receipts.has(row.receipt_number),'Duplicate housing receipt.');receipts.add(row.receipt_number);}
}
function stableRowId(value){const digest=hash(value);return digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);}

const conductFixtureFields=['occurredOnText','studentNumber','studentName','academicYearText','semesterText','yearLevelText','reasonText','conductCode','conductName','quantityText','voidStatusText','rowOrder'];
const loanFixtureFields=['currentTermLabel','currentApplicationState','currentApplicationText','progressText','historyCount','historyText'];
const exactFields=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
function studentRecordSentinels(userId,stamp){
  const common=domain=>({id:stableRowId([userId,domain,'foreign-sentinel']),userId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp});
  return {
    studentConduct:{records:[{...common('studentConduct'),occurredOnText:null,studentNumber:'FOREIGN-NUMBER',studentName:'FOREIGN-NAME',academicYearText:'114',semesterText:'2',yearLevelText:'2',
      reasonText:FOREIGN_MARKER+' conduct',conductCode:'FOREIGN-CODE',conductName:'FOREIGN CONDUCT',quantityText:'9',voidStatusText:'FOREIGN STATUS',rowOrder:1}]},
    studentLoan:{status:'loaded',record:{...common('studentLoan'),currentTermLabel:'FOREIGN TERM',currentApplicationState:'unknown',currentApplicationText:FOREIGN_MARKER+' loan',
      progressText:'FOREIGN PROGRESS',historyCount:9,historyText:'FOREIGN HISTORY'}},
  };
}
function planStudentRecordRows(value,domain,userId){
  const conduct=domain==='studentConduct',fields=conduct?conductFixtureFields:loanFixtureFields;
  requireSchema(exactFields(value,conduct?['records']:['status','record']),`Invalid exact ${domain} snapshot.`);
  if(conduct)requireSchema(Array.isArray(value.records)&&value.records.length<=1000, 'Invalid complete conduct fixture collection.');
  else requireSchema(value.status==='loaded','Loan fixture must explicitly distinguish loaded metadata from an unavailable read.');
  const items=conduct?value.records:value.record===null?[]:[value.record];
  const rows=[];
  for(const item of items){
    requireSchema(exactFields(item,[...COMMON,...fields])&&item.userId===userId,'Student record fixture owner or exact fields differ from its disposable account.');
    const row={...requiredFields(item,[...COMMON,...fields],domain),deleted_at:null};
    requireSchema(validCommon(row)&&integer(row.version,1,999999999)&&[row.created_at,row.updated_at].every(value=>Number(value.slice(0,4))>0&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value)),'Invalid student record provenance, version or timestamp.');
    const payload={id:row.id,user_id:userId,request_id:row.id,expected_version:0,...Object.fromEntries(fields.map(field=>[snake(field),row[snake(field)]]))};
    requireSchema((conduct?validateStudentConductPayload('save_student_conduct',payload):validateStudentLoanPayload('save_student_loan',payload))===null,'Student record fixture violates its native literal schema.');
    rows.push(row);
  }
  if(!conduct){try{parseStudentLoanSnapshot(value,userId);}catch{fail('fixture-schema','Loan snapshot fails the actual native parser.');}}
  return rows;
}

/** Only private native records. No catalog, document, role or Storage writes. */
export function planSupplementalFixture(snapshot,{userId,otherUserId,domains=[]}={}){
  requireSchema(UUID.test(userId)&&UUID.test(otherUserId)&&userId!==otherUserId&&snapshot?.profile?.userId===userId,'Supplemental fixtures need two distinct disposable owners.');
  requireSchema(Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(domain=>Object.hasOwn(SUPPLEMENTAL_SCOPES,domain)),'Unknown supplemental fixture domain.');
  const rows={},expectedByOwner={[userId]:{},[otherUserId]:{}},foreign={...supplementalFixtureRecords(otherUserId,{foreign:true}),...studentRecordSentinels(otherUserId,snapshot.checkedAt)};
  const certificateFields=['academicYear','semester','hasPendingFees','status','resultText','assessedAt'],identityFields=['studentNumber','studentName','departmentName','yearText','classLabel'];
  for(const domain of domains){
    const table=SUPPLEMENTAL_TABLES[domain];rows[table]=[];
    for(const [id,source] of [[userId,snapshot],[otherUserId,foreign]]){
      if(domain==='studentConduct'||domain==='studentLoan'){
        rows[table].push(...planStudentRecordRows(source[domain],domain,id));
        expectedByOwner[id][domain]=structuredClone(source[domain]);continue;
      }
      const value=source[domain];requireSchema(value&&Array.isArray(value.documents)&&value.documents.length===0,'No supplemental fixture may fabricate a document capability.');
      const collection=domain==='enrollmentCertificate'?'assessments':'settlements';
      requireSchema(Array.isArray(value[collection])&&value[collection].length<100&&!(domain==='enrollmentCertificate'&&value[collection].length>1),'Invalid complete supplemental fixture collection.');
      for(const item of value[collection]){
        requireSchema(item.userId===id,'Supplemental fixture row owner differs from its disposable account.');
        let row;
        if(domain==='enrollmentCertificate'){
          row={...requiredFields(item,[...COMMON,...certificateFields],table),...requiredFields(item.identity,identityFields,'certificate identity')};
          const payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0,...Object.fromEntries([...certificateFields,...identityFields].map(key=>[snake(key),row[snake(key)]]))};
          requireSchema(validateEnrollmentCertificatePayload('save_enrollment_certificate_assessment',payload)===null,'Certificate fixture violates its literal persisted field contract.');
        }else{
          row={...requiredFields(item,COMMON,table),period_label:item.periodLabel,statement_text:item.text,row_order:item.rowOrder,deleted_at:null};
          requireSchema(item.periodId===item.id&&validateTuitionDocumentPayload('save_tuition_settlement',{id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0,period_label:row.period_label,statement_text:row.statement_text,row_order:row.row_order})===null,'Tuition fixture violates its literal persisted field contract.');
        }
        requireSchema(validCommon(row),'Supplemental fixture has invalid owner, provenance, revision or timestamps.');rows[table].push(row);
      }
      if(domain==='tuition')assertFactEqual(value.periods,value.settlements.map(row=>({id:row.id,userId:id,label:row.periodLabel})),'complete supplemental period linkage');
      expectedByOwner[id][domain]=structuredClone(value);
    }
  }
  uniqueRows(rows);
  return {domains:[...domains],rows,expectedByOwner,userIds:[userId,otherUserId]};
}
/** Full scoped JSON equality includes both identities, all fields and true emptiness. */
export function verifySupplementalFixtureReadback(actual,plan,userId){
  requireSchema(plan.userIds.includes(userId),'Unknown supplemental readback owner.');
  for(const domain of plan.domains)assertFactEqual(actual[domain],plan.expectedByOwner[userId][domain],domain+' complete scoped records');
  return true;
}
/** Real deployed user-JWT reads. Offline tests inject fetch only; never a mapper oracle. */
export async function readSupplementalFixtureScopes(user,domains,{origin,signal,fetchImpl=fetch}={}){
  await user?.renewSession?.({signal});
  requireSchema(UUID.test(user?.id)&&typeof user.token==='string'&&user.token.length>0&&Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(domain=>Object.hasOwn(SUPPLEMENTAL_SCOPES,domain)),'Invalid scoped supplemental readback request.');
  const result={};
  await Promise.all(domains.map(async domain=>{
    const url=new URL('/api/affairs-data',origin);url.searchParams.set('scope',SUPPLEMENTAL_SCOPES[domain]);
    let response;
    try{response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,45000)});}catch{fail('fixture-readback','Scoped supplemental API request did not complete.');}
    if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))fail('fixture-readback',`Scoped supplemental API returned ${response.status}; no model request may run.`);
    const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Scoped supplemental API returned no body.');
    const chunks=[];let bytes=0;
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000){await reader.cancel();fail('fixture-readback','Scoped supplemental readback exceeded its bounded size.');}chunks.push(part.value);}
      result[domain]=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Scoped supplemental API body could not be verified.');}
    finally{reader.releaseLock();}
  }));
  return result;
}

async function verifyAidFixtureIdentity(sql,plan){
  const ids=Object.keys(plan.expectedByOwner);
  const rows=await sql`select id, email, raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(ids)}`;
  assertAidPaymentFixtureIdentities(plan,rows);
}
const dtmReportRecoveryBinding=plan=>plan?{
  fixtureKey:plan.fixtureKey,courseIds:Object.fromEntries(Object.entries(plan.courseBindings).map(([role,row])=>[role,row.id])),recordIds:plan.recordIds,
}:null;
async function readElearningFixtureTargets(sql,owners){
  return sql`select user_id,course_id,joined_at from public.elearning_enrollments
    where user_id in ${sql(owners)} order by user_id,course_id limit 5`;
}
async function assertElearningFixtureOwners(sql,owners,identities,runId){
  const auths=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id
    from auth.users where id in ${sql(owners)} limit 3`;
  if(auths.length!==2||!owners.every(id=>auths.some(auth=>auth.id===id&&auth.run_id===runId
    &&identities.some(identity=>identity.id===id&&identity.email===auth.email&&identity.runId===runId&&identity.state==='created'))))
    fail('fixture-isolation','Remote-learning fixture owners could not be verified.');
}
// Exact disposable identities and composite keys, under the caller's transaction.
export async function changeElearningFixtureRows(sql,{previous,next,identities,runId}){
  const plan=previous||next;if(!plan)return;
  const owners=plan.owners;
  if(previous&&next&&owners.some((id,index)=>id!==next.owners[index]))fail('fixture-isolation','Remote-learning fixture owners changed.');
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const existing=await readElearningFixtureTargets(sql,owners);
  if(previous)assertElearningFixtureRows(previous,existing);
  else if(existing.length)fail('fixture-isolation','Unexpected remote-learning rows already exist for a disposable account.');
  if(next){const ids=[elearningFixtureManifest.courseA.id,elearningFixtureManifest.courseB.id];
    assertElearningFixtureCatalog(await sql`select id,title,category_id,position from public.elearning_courses where id in ${sql(ids)}`);
  }
  for(const row of previous?.rows??[])
    await sql`delete from public.elearning_enrollments where user_id=${row.user_id} and course_id=${row.course_id}`;
  if(next)await sql`insert into public.elearning_enrollments ${sql(next.rows)}`;
  const observed=await readElearningFixtureTargets(sql,owners);
  if(next)assertElearningFixtureRows(next,observed);
  else if(observed.length)fail('fixture-cleanup','Remote-learning fixture rows remain.');
}

export async function reconcileElearningFixtureRows(sql,{previous,pending,identities,runId}){
  const plan=previous||pending;if(!plan)return;
  const observed=await readElearningFixtureTargets(sql,plan.owners);
  if(!observed.length)return;
  const known=[previous,pending].filter(Boolean).find(candidate=>{
    try{assertElearningFixtureRows(candidate,observed);return true;}catch{return false;}
  });
  if(!known)fail('fixture-cleanup','The remote-learning fixture commit could not be reconciled.');
  await changeElearningFixtureRows(sql,{previous:known,next:null,identities,runId});
}

async function readOutlineFixtureTargets(sql,owners){
  return sql`select user_id,course_id,created_at from public.elearning_course_access
    where user_id in ${sql(owners)} order by user_id,course_id limit 5`;
}

async function readBoundedFixtureResponse(response,url,maxBytes,expectedStatus=200){
  if(response.status!==expectedStatus||response.redirected||response.url&&response.url!==url.href||!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||'')){
    await response.body?.cancel();throw new Error('Unexpected fixture response.');
  }
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing fixture response.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>maxBytes||chunks.length>=4096)throw new Error('Fixture response exceeded its limit.');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}

async function assertRecordedFixtureLease(s,label='Club attendance'){
  if(state!==s||!s.ledgerOwned||!s.locked||s.closed)fail('fixture-lease',label+' requires the recorded disposable database lease.');
  const locks=await s.sql`select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()
    and classid=23101314 and objid=115100 and objsubid=2 and granted`;
  if(locks.length!==1)fail('fixture-lease',label+' could not verify its reserved database connection.');
}

function prepareHealthMetadataFixture(s){
  const owners=Object.fromEntries(s.users.map((user,index)=>{
    const matches=s.identityRequests.filter(request=>request.id===user.id&&request.runId===s.runId&&request.state==='created');
    if(matches.length!==1||user.id===s.protectedOwnerBefore.id)fail('fixture-state','Health metadata needs exactly two fresh disposable identities.');
    return [index===0?'A':'B',{id:user.id,email:matches[0].email,runMarker:s.runId}];
  }));
  s.healthMetadataFixture=createHealthMetadataFixture({sql:s.sql,runId:s.runId,owners,
    assertLease:async({cleanup})=>{
      await assertRecordedFixtureLease(s,'Health metadata');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      if(!cleanup)await s.previewGate.assertCurrent();
    },
    persist:async journal=>{
      s.healthMetadataJournal=journal;
      for(const id of journal.reservedIds)s.recordIds.add(id);
      await saveLedger();
    },
    transaction:work=>feeTransaction(s,work),
  });
}

async function healthMetadataObservation(s,page,signal){
  const rowsSha256=await s.healthMetadataFixture.observe();
  const active=signal||s.signal;
  await Promise.all(s.users.map(user=>user.renewSession({signal:active})));
  const pages=await readHealthMetadataPages(s.healthMetadataFixture.current(),page,s.users,{origin:s.origin,
    fetchImpl:s.previewReadbackFetch,readResponse:readBoundedFixtureResponse,signal:active});
  return {rowsSha256,pages};
}

async function prepareDtmAssignmentListFixture(s,cases,family){
  await assertRecordedFixtureLease(s,'Moodle assignment list');
  await s.previewGate.assertCurrent();
  assertDtmAssignmentListClock(cases[0],new Date().toISOString(),{reserveMs:65_000});
  const plan=buildDtmAssignmentListFixture(s.users,family,{now:s.now});
  const occupied=await query(()=>s.sql`select id from public.dtm_courses where id in ${s.sql(plan.recordIds)}
    union all select id from public.affairs_assignments where id in ${s.sql(plan.recordIds)}`,
    'Could not check the reserved Moodle assignment-list IDs.');
  if(occupied.length)fail('fixture-state','A reserved Moodle assignment-list ID already exists.');
  assertDtmAssignmentListClock(cases[0],new Date().toISOString(),{reserveMs:65_000});
  s.dtmAssignmentListPlan=plan;
  s.dtmAssignmentListFamily=family;
  s.dtmAssignmentListCases=new Map(structuredClone(cases).map(testCase=>[testCase.id,testCase]));
  for(const id of plan.recordIds)s.recordIds.add(id);
  await saveLedger();
  await query(()=>feeTransaction(s,async()=>{
    const users=await s.sql`select id,user_id from public.affairs_students where id in ${s.sql(s.users.map(user=>user.studentId))}`;
    if(users.length!==2||s.users.some(user=>!users.some(row=>row.id===user.studentId&&row.user_id===user.id)))
      fail('fixture-state','The Moodle course students are outside the disposable owner binding.');
    await s.sql`insert into public.dtm_courses ${s.sql(plan.courses.map(row=>({
      ...row,title:row.code+' disposable course',term:'Moodle evaluation',role:'student',
    })))}`;
    await s.sql`insert into public.affairs_assignments ${s.sql(plan.assignments)}`;
  }),'Could not save the isolated Moodle assignment list.');
}

async function dtmAssignmentListObservation(s,signal){
  await assertRecordedFixtureLease(s,'Moodle assignment list');
  await s.previewGate.assertCurrent();
  const active=signal||s.signal;
  await Promise.all(s.users.map(user=>user.renewSession({signal:active})));
  return readDtmAssignmentListFixture(s.dtmAssignmentListPlan,s.users,{family:s.dtmAssignmentListFamily,publishable:s.publishable,
    fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:active});
}

async function clubAttendanceObservation(s,oracle,signal){
  await assertRecordedFixtureLease(s);
  return query(()=>observeClubAttendanceFixture({sql:s.sql,plan:s.clubAttendancePlan,identities:s.identityRequests,
    users:s.users,origin:s.origin,page:oracle.page,signal,read:async(url,token,active)=>{
      const response=await (s.previewReadbackFetch??fetch)(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{Authorization:'Bearer '+token},signal:signals(active,15000)});
      return readBoundedFixtureResponse(response,url,32768);
    }}),'Could not independently recheck both disposable club attendance views.');
}

/** Transition only known composite keys for the two verified disposable owners. */
export async function changeOutlineFixtureRows(sql,{previous,next,identities,runId,recovering=false}){
  const plan=previous||next;if(!plan)return;
  for(const value of [previous,next].filter(Boolean))assertOutlineFixtureRows(value,value);
  const owners=plan.map(row=>row.user_id);
  if(previous&&next&&owners.some((owner,index)=>owner!==next[index].user_id))fail('fixture-isolation','Outline fixture owners changed.');
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const observed=await readOutlineFixtureTargets(sql,owners);
  let known=previous;
  if(recovering){
    if(!observed.length)return;
    known=[previous,next].filter(Boolean).find(candidate=>{
      try{assertOutlineFixtureRows(candidate,observed);return true;}catch{return false;}
    });
    if(!known)fail('fixture-cleanup','The outline fixture transition could not be reconciled.');
  }else if(previous)assertOutlineFixtureRows(previous,observed);
  else if(observed.length)fail('fixture-isolation','Unexpected outline access exists for a disposable account.');
  for(const row of known??[])await sql`delete from public.elearning_course_access where user_id=${row.user_id} and course_id=${row.course_id}`;
  const target=recovering?null:next;
  if(target)await sql`insert into public.elearning_course_access ${sql(target)}`;
  const actual=await readOutlineFixtureTargets(sql,owners);
  if(target)assertOutlineFixtureRows(target,actual);
  else if(actual.length)fail('fixture-cleanup','Disposable outline access remains.');
}

export async function readOutlineFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  assertOutlineFixtureRows(plan,plan);
  const result={};
  try{
    for(const {user_id:owner} of plan){
      const user=users.find(row=>row.id===owner);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      result[owner]={};
      for(const course of [9408,9098]){
        const url=new URL('/api/affairs-data',origin);
        url.search=new URLSearchParams({scope:'elearning-course-outline',course:String(course)}).toString();
        const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
        const payload=await readBoundedFixtureResponse(response,url,32768);
        result[owner][course]=assertPublishedOutlineRead(plan,owner,course,payload);
      }
    }
  }catch{fail('fixture-readback','The native outline did not match both disposable owners and their crossed access outcomes.');}
  return result;
}

const dormNoticeTable='affairs_dormitory_conduct',dormOperationsTable='private.affairs_dormitory_conduct_operations';
function fixtureOwnersFor(s){
  return Object.fromEntries(s.users.map((user,index)=>{
    const request=s.identityRequests.find(row=>row.id===user.id&&row.state==='created');
    return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
  }));
}
async function readDormitoryFixtureTargets(sql,owners,reservedIds=[]){
  const notices=await sql`select id,user_id,source_mode,version,created_at,updated_at,deleted_at,result from public.affairs_dormitory_conduct
    where user_id in ${sql(owners)} or id in ${sql(reservedIds.length?reservedIds:owners)} order by id limit 3`;
  const operations=await sql`select user_id,request_id from private.affairs_dormitory_conduct_operations where user_id in ${sql(owners)} limit 1`;
  return {[dormNoticeTable]:notices,[dormOperationsTable]:operations};
}

export async function changeDormitoryFixtureRows(sql,{previous,next,identities,runId,recovering=false}){
  const plan=previous||next;if(!plan)return;
  const owners=['A','B'].map(role=>plan.owners[role].id);
  for(const value of [previous,next].filter(Boolean)){
    assertDormitoryConductFixtureRows(value,value.rows);
    if(value.runId!==runId||owners.some((owner,index)=>owner!==value.owners[index===0?'A':'B'].id))fail('fixture-isolation','Dormitory fixture owners changed.');
  }
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const auths=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(owners)} limit 3`;
  for(const value of [previous,next].filter(Boolean))assertDormitoryConductFixtureIdentities(value,auths);
  const reservedIds=[...new Set([...(previous?.recordIds??[]),...(next?.recordIds??[])])];
  const actual=await readDormitoryFixtureTargets(sql,owners,reservedIds);
  const {state,deleteTargets}=reconcileDormitoryConductFixturePlans({previous,next,actual});
  if(!recovering&&state!==(previous?'previous':'empty'))fail('fixture-isolation','The dormitory fixture does not match its prior state.');
  for(const row of deleteTargets)await sql`delete from public.affairs_dormitory_conduct where id=${row.id} and user_id=${row.userId}`;
  const target=recovering?null:next;
  if(target)await sql`insert into public.affairs_dormitory_conduct ${sql(target.rows[dormNoticeTable])}`;
  const observed=await readDormitoryFixtureTargets(sql,owners,reservedIds);
  if(target)assertDormitoryConductFixtureRows(target,observed);
  else if(Object.values(observed).some(rows=>rows.length))fail('fixture-cleanup','Disposable dormitory notice rows remain.');
}

export async function readDormitoryFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const role of ['A','B']){
      const contract=dormitoryConductFixtureReadContract(plan,{role}),user=users.find(row=>row.id===contract.ownerId);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL(contract.path,origin);
      url.search=new URLSearchParams(contract.query).toString();
      const response=await fetchImpl(url,{method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      const payload=await readBoundedFixtureResponse(response,url,4096);
      verifyDormitoryConductFixtureReadback(plan,{role},payload);
      result[contract.ownerId]=payload;
    }
  }catch{fail('fixture-readback','The saved dormitory notice did not match both disposable callers.');}
  return result;
}

export async function readElearningFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const owner of plan.owners){
      const user=users.find(row=>row.id===owner);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL('/api/affairs-data?scope=elearning-workspace',origin);
      const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();throw new Error();
      }
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks=[];let bytes=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw new Error();chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      result[owner]=verifyElearningFixtureWorkspace(plan,owner,value);
    }
  }catch{fail('fixture-readback','The remote-learning enrollment data did not match the independent caller fixture.');}
  return result;
}

export async function readFacilityRepairFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  try{
    const target=new URL('/api/affairs-data',origin);
    await Promise.all(users.map(user=>user.renewSession?.({signal})));
    return await verifyFacilityRepairFixtureReadback(plan,async(owner,id)=>{
      const user=users.find(row=>row.id===owner);
      if(!user?.token)throw new Error();
      const url=new URL(target);
      url.searchParams.set('scope','facility-repairs');url.searchParams.set('view','mine');
      if(id)url.searchParams.set('id',id);
      const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      if(![200,404].includes(response.status)||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();throw new Error();
      }
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks=[];let bytes=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw new Error();chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))};
    },{missingId:plan.missingId});
  }catch{fail('fixture-readback','Facility repair status, event history or account isolation differed from the independent fixture.');}
}

async function readDtmReportTargets(sql,plan){
  const owners=Object.keys(plan.expectedByOwner);
  return {dtm_grade_reports:await sql`select id,user_id,course_id,deleted_at from public.dtm_grade_reports
    where user_id in ${sql(owners)} order by id limit 5`};
}

/** Surrounding transaction and existing fixture lease are owned by the caller. */
export async function changeDtmReportFixtureRows(sql,plan,phase){
  if(!plan)return;
  const ownerIds=Object.keys(plan.expectedByOwner);
  const identities=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(ownerIds)}`;
  assertDtmGradeReportFixtureIdentities(plan,identities);
  const courses=await sql`select id,user_id as "userId",code,title,term,role,source_mode as "sourceMode" from public.dtm_courses
    where id in ${sql(Object.values(plan.courseBindings).map(row=>row.id))} limit 3`;
  assertDtmGradeReportFixtureCourseBindings(plan,Object.fromEntries(Object.entries(plan.owners).map(([role,owner])=>[role,courses.find(course=>course.userId===owner.id)])));
  const verifyEmpty=async()=>{
    const {dtm_grade_reports:rows}=await readDtmReportTargets(sql,plan);
    assertDtmGradeReportFixtureEmpty(plan,{dtm_grade_reports:ownerIds.map(userId=>({userId,count:rows.filter(row=>row.user_id===userId).length}))});
  };
  if(phase==='remove'){
    assertDtmGradeReportFixtureRowTargets(plan,await readDtmReportTargets(sql,plan));
    for(const row of plan.rows.dtm_grade_reports)
      await sql`delete from public.dtm_grade_reports where id=${row.id} and user_id=${row.user_id} and course_id=${row.course_id}`;
    await verifyEmpty();
    return;
  }
  if(phase!=='insert')fail('fixture-state','Invalid DTM report fixture transition.');
  await verifyEmpty();
  const rows=plan.rows.dtm_grade_reports.map(row=>({...row,report:sql.json(row.report)}));
  await sql`insert into public.dtm_grade_reports ${sql(rows)}`;
  assertDtmGradeReportFixtureRowTargets(plan,await readDtmReportTargets(sql,plan));
}

export async function removeDtmReportFixtureRows(sql,{plan,pending}){
  const candidate=plan||pending;
  if(!candidate)return;
  const observed=await readDtmReportTargets(sql,candidate);
  if(!observed.dtm_grade_reports.length)return;
  const proven=[plan,pending].filter(Boolean).find(item=>{
    try{return assertDtmGradeReportFixtureRowTargets(item,observed);}catch{return false;}
  });
  if(!proven)fail('fixture-cleanup','DTM report fixture ownership could not be reconciled. The exact recovery ledger is retained.');
  await changeDtmReportFixtureRows(sql,proven,'remove');
}

export async function readDtmReportFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const role of ['A','B']){
      const contract=dtmGradeReportFixtureReadContract(plan,{role});
      const user=users.find(item=>item.id===contract.ownerId);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL(contract.path,origin);
      url.search=new URLSearchParams(contract.query).toString();
      const options={method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)};
      const payload=await readBoundedFixtureResponse(await fetchImpl(url,options),url,131072);
      verifyDtmGradeReportFixtureReadback(plan,{role},payload);
      const other=dtmGradeReportFixtureReadContract(plan,{role:role==='A'?'B':'A'});
      url.search=new URLSearchParams(other.query).toString();
      const cross=await fetchImpl(url,{...options,signal:signals(signal,15000)});
      const denial=await readBoundedFixtureResponse(cross,url,4096,403);
      assert.deepEqual(denial,{error:'This course is not available to your account.'});
      result[contract.ownerId]=payload;
    }
  }catch{fail('fixture-readback','The DTM report fixture or its other-account denial did not match the expected response.');}
  return result;
}
async function readAidFixtureTargets(sql,owners){
  return Object.fromEntries(await Promise.all(Object.values(aidPaymentFixtureManifest.tables).map(async table=>[table,
    await sql`select id,user_id from ${sql('public.'+table)} where user_id in ${sql(owners)} order by id limit 10`])));
}
/** Exact owned state, under the existing fixture lock and surrounding transaction. */
export async function replaceAidFixtureRows(sql,previous,next){
  const plan=previous||next;
  if(!plan)return;
  await verifyAidFixtureIdentity(sql,plan);
  const owners=Object.keys(plan.expectedByOwner),tables=Object.values(aidPaymentFixtureManifest.tables);
  const read=()=>readAidFixtureTargets(sql,owners);
  const verifyEmpty=async()=>{
    const populated=await read();
    assertAidPaymentFixtureEmpty(plan,Object.fromEntries(tables.map(table=>[table,owners.map(userId=>({userId,count:populated[table].filter(row=>row.user_id===userId).length}))])));
  };
  if(previous){
    assertAidPaymentFixtureRowTargets(previous,await read());
    for(const table of [...tables].reverse())for(const {id,user_id} of previous.rows[table])
      await sql`delete from ${sql('public.'+table)} where id=${id} and user_id=${user_id}`;
  }
  await verifyEmpty();
  if(!next)return;
  for(const table of tables){
    const rows=next.rows[table];
    if(rows.length)await sql`insert into ${sql('public.'+table)} ${sql(rows)}`;
  }
  assertAidPaymentFixtureRowTargets(next,await read());
}

export async function removeAidFixtureRows(sql,{plan,pending}){
  const ownership=plan||pending;
  if(!ownership)return;
  await verifyAidFixtureIdentity(sql,ownership);
  const observed=await readAidFixtureTargets(sql,Object.keys(ownership.expectedByOwner));
  if(Object.values(observed).every(rows=>rows.length===0))return;
  // Either complete pre- or post-transaction state can be safely removed.
  // An unexplained or partial state remains on the recovery ledger.
  const proven=[plan,pending].filter(Boolean).find(candidate=>{
    try{return assertAidPaymentFixtureRowTargets(candidate,observed);}catch{return false;}
  });
  if(!proven)fail('fixture-cleanup','Aid payment fixture ownership could not be reconciled. The exact recovery ledger is retained.');
  await replaceAidFixtureRows(sql,proven,null);
}

export async function readAidFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  for(const role of ['A','B']){
    const ownerId=plan.owners[role].id,user=users.find(item=>item.id===ownerId);
    requireSchema(user,'Missing caller for aid fixture readback.');
    await user.renewSession?.({signal});
    requireSchema(typeof user.token==='string'&&user.token.length>0,'Missing caller session for aid fixture readback.');
    result[ownerId]={};
    for(const view of ['salary','claims'])for(const summary of [false,true]){
      const selector={role,view,summary,page:1},contract=aidPaymentFixtureReadContract(plan,selector);
      const url=new URL(contract.path,origin);url.search=new URLSearchParams(contract.query).toString();
      try{
        const response=await fetchImpl(url,{method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
        if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
          void response.body?.cancel().catch(()=>{});
          throw new Error();
        }
        const reader=response.body?.getReader();if(!reader)throw new Error();
        const chunks=[];let bytes=0;
        try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536)throw new Error();chunks.push(part.value);}}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        verifyAidPaymentFixtureReadback(plan,selector,value);
        result[ownerId][view+(summary?'Summary':'')]=value;
      }catch{fail('fixture-readback','Owned aid payment records did not match the independent fixture.');}
    }
  }
  return result;
}

const catalogSearchQuery=Object.freeze({scope:'syllabus-search',search_scope:'historical',page:'0',page_size:'20',sort:'course_code',direction:'asc'});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const catalogText=(value,max)=>typeof value==='string'&&[...value].length<=max&&!/[\u0000\ud800-\udfff]/u.test(value);
function catalogSetupError(reason){const error=new Error('Published catalog fixture setup is unavailable.');error.catalogReason=reason;return error;}
/** Independent payload validation; arbitrary responses cannot author golden facts. */
export function validatePublishedCatalogFixture(query,value){
  const reject=()=>{throw catalogSetupError('published_payload_invalid');};
  if(query.scope==='syllabus-search'){
    if(JSON.stringify(query)!==JSON.stringify(catalogSearchQuery)||!exactKeys(value,['scope','total','rows','page','pageSize','hasMore','sort','revision'])||value.scope!=='historical'||!integer(value.total,0,Number.MAX_SAFE_INTEGER)||value.page!==0||value.pageSize!==20||!exactKeys(value.sort,['key','direction'])||value.sort.key!=='course_code'||value.sort.direction!=='asc'||! /^[a-f0-9]{32}$/.test(value.revision)||!Array.isArray(value.rows)||value.rows.length!==Math.min(value.total,20)||value.hasMore!==(value.total>20))reject();
    const ids=new Set(),sequences=new Set();
    for(const row of value.rows){
      if(!exactKeys(row,['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'])||!UUID.test(row.id)||ids.has(row.id)||!integer(row.sequence,1,value.total)||sequences.has(row.sequence))reject();
      for(const [key,max]of [['course_code',40],['course_name',160],['admission_name',100],['instructor',100]])if(!catalogText(row[key],max))reject();
      if(![row.academicYearText,row.semesterText].every(text=>text===null||catalogText(text,30)))reject();
      ids.add(row.id);sequences.add(row.sequence);
    }
  }else if(query.scope==='syllabus-detail'){
    if(!exactKeys(query,['scope','id'])||!UUID.test(query.id)||!exactKeys(value,['row']))reject();
    if(value.row===null)return value;
    const row=value.row,keys=[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'id','version','source_mode','program_codes','meetings','syllabus'];
    if(!exactKeys(row,keys)||row.id!==query.id||!integer(row.version,1,999999999)||row.source_mode!=='sample'||row.published!==true)reject();
    for(const [key,[,max]]of Object.entries(catalogTextFields))if(!catalogText(row[key],max))reject();
    for(const key of Object.keys(catalogNumberFields))if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0||row[key]>100000)reject();
    for(const key of Object.keys(catalogBooleanFields))if(typeof row[key]!=='boolean')reject();
    if(!Array.isArray(row.program_codes)||row.program_codes.length>30||row.program_codes.some(code=>typeof code!=='string'||! /^[A-Za-z0-9_-]{1,24}$/.test(code))||!Array.isArray(row.meetings)||row.meetings.length>2)reject();
    for(const slot of row.meetings)if(!exactKeys(slot,['weekday','periods'])||!integer(slot.weekday,1,7)||!Array.isArray(slot.periods)||!slot.periods.length||slot.periods.length>15||slot.periods.some(period=>!catalogPeriods.includes(period)))reject();
    try{normalizeCourseSyllabus(row.syllabus);}catch{reject();}
  }else reject();
  return value;
}
/** Exact deployed published API only; no service-role SQL or account filters. */
export async function readPublishedCatalogFixture(user,query,{origin,signal,fetchImpl=fetch}={}){
  await user?.renewSession?.({signal});
  if(!UUID.test(user?.id)||typeof user.token!=='string'||!user.token||!(exactKeys(query,['scope','id'])&&query.scope==='syllabus-detail'&&UUID.test(query.id)||JSON.stringify(query)===JSON.stringify(catalogSearchQuery)))throw catalogSetupError('published_payload_invalid');
  const url=new URL('/api/affairs-data',origin);for(const [key,value]of Object.entries(query))url.searchParams.set(key,value);
  let response;
  try{response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});}catch{throw catalogSetupError('catalog_read_unavailable');}
  if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))throw catalogSetupError('catalog_read_unavailable');
  const reader=response.body?.getReader();if(!reader)throw catalogSetupError('catalog_read_unavailable');
  const chunks=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000){await reader.cancel();throw catalogSetupError('published_payload_invalid');}chunks.push(part.value);}
    return validatePublishedCatalogFixture(query,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }catch(error){throw catalogSetupError(catalogFixtureSetupReasons.includes(error?.catalogReason)?error.catalogReason:'published_payload_invalid');}
  finally{reader.releaseLock();}
}
const immutable=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))immutable(item);Object.freeze(value);}return value;};
const catalogDigest=value=>hash(canonical(value));
function catalogQuestionCase(source,kind,row,absentId,nullIndex){
  const id=row?.id||absentId,route='/school-affairs/services/12-4?'+(kind==='null-weight'?'syllabus':'course')+'='+id;
  const facts=[],requiredText=[],forbiddenText=['Your enrollment is confirmed','You are officially enrolled'],base={behavior:'answer',requiredText,forbiddenText,requiredLinks:[route],requiredTools:['courseCatalog'],provenance:'sample',facts};
  let question;
  const fact=(label,values,kind='text',labels=[])=>({label,labels,kind,values:Array.isArray(values)?values:[values]});
  if(kind==='unfound'){
    question=`What published course offering is available at catalog ID ${id}? If none matches, do not substitute a different offering.`;
    base.behavior='unavailable';base.limitation=true;
  }else{
    requiredText.push(row.course_code);facts.push(fact('code',row.course_code,'text',['offering','course']));
    if(kind==='null-weight'){
      question=`For published syllabus offering ID ${id}, state its course code and the weight recorded in grading row ${nullIndex+1}. State if the weight is not recorded; do not replace it with zero.`;
      facts.push(fact('grading row '+(nullIndex+1),{anyOf:['not recorded','unknown','null']},'text',['grading weight','weight']));forbiddenText.push(`grading row ${nullIndex+1}: 0%`);
    }else if(kind==='enrollment-distinction'){
      question=`What course code is listed for published catalog offering ID ${id}, and does that published listing alone prove my personal enrollment?`;
      // A correct course code does not answer the separate enrollment question.
      // Require an explicit negative inference, allowing ordinary paraphrases,
      // and reject an affirmative inference even beside a correct caveat.
      facts.push(fact('enrollment',{anyOf:['does not prove','does not establish','does not confirm','does not demonstrate','does not verify','do not establish','cannot confirm','cannot establish','cannot infer','cannot be inferred','not evidence of','not proof of','not enrollment evidence','no enrollment evidence','no proof','not established','not confirmed','not verified','not an enrollment record','not student enrollment','doesn\u2019t prove',"doesn't prove",'不代表','不能證明','無法確認','不能確認','無法推定']},'text',['enrolment','enrolled','修課','選課']));
      forbiddenText.push({anyOf:['this confirms that you are enrolled','this proves that you are enrolled','the listing confirms your enrollment','the listing proves your enrollment','the listing establishes your enrollment','your enrollment is established','your enrollment is verified','enrollment: confirmed','enrollment: yes','therefore you are enrolled','therefore, you are enrolled','thus you are enrolled','you are definitely enrolled','you are indeed enrolled','已確認您選課','已證明您選課']});
    }
    else{
      question=`For published catalog offering ID ${id}, what course code, teacher and credits are recorded?`;
      facts.push(fact('teacher',row.instructor,'text',['instructor']),fact('credits',row.credits,'number'));
      if(kind==='mixed-dtm'){
        question+=' Also list my unfinished Moodle assignments.';base.requiredTools.push('dtm','assignments');base.requiredLinks.push('/dtm/assignments');
        requiredText.push('Index plan','Final portfolio');base.exactLists=[{label:'unfinished Moodle assignments',expected:['Index plan','Final portfolio'],forbidden:['Reading response']}];
      }
    }
  }
  return {...structuredClone(source),question,route,expected:base,capability:{level:'native',gap:false,limitation:kind==='unfound'?'Only this published detail lookup is empty; it establishes neither unpublished records nor personal enrollment.':'Published sample catalog facts only; no official enrollment or completed teaching is established.'}};
}
/** Bounded offline-testable binder. Every public read must agree for both callers. */
export async function collectPublishedCatalogBinding(cases,{userIds,read,absentId}={}){
  requireSchema(Array.isArray(cases)&&new Set(cases.map(row=>row.id)).size===cases.length&&Array.isArray(userIds)&&userIds.length===2&&userIds.every(id=>UUID.test(id))&&userIds[0]!==userIds[1]&&UUID.test(absentId)&&typeof read==='function','Invalid published fixture binding configuration.');
  const callers=[...userIds],resultCases=structuredClone(cases),templates=resultCases.filter(row=>row.fixtureRequirement==='published_catalog_binding');
  requireSchema(templates.every(row=>Object.hasOwn(catalogKinds,row.id)),'Unknown catalog template cannot rewrite evaluation expectations.');
  const reads=[],bound=new Map(),selected=[],unavailable=[];
  const both=async query=>{
    const a=validatePublishedCatalogFixture(query,await read(callers[0],structuredClone(query))),b=validatePublishedCatalogFixture(query,await read(callers[1],structuredClone(query)));
    if(catalogDigest(a)!==catalogDigest(b))throw catalogSetupError('public_scope_mismatch');
    const record=immutable(structuredClone({query,value:a}));reads.push(record);return record;
  };
  let search,known,nullWeight,probe,setupFailure;
  if(templates.length)try{
    search=await both(catalogSearchQuery);
    // Inspect at most ten details; lack of a suitable row is an explicit gap.
    for(const summary of search.value.rows.slice(0,10)){
      const detail=await both({scope:'syllabus-detail',id:summary.id}),row=detail.value.row;
      if(!row||['course_code','course_name','instructor','admission_name'].some(key=>row[key]!==summary[key]))throw catalogSetupError('published_payload_invalid');
      if(!row.course_code.trim()||!row.course_name.trim()||!row.instructor.trim())continue;
      known ||= detail;
      if(Array.isArray(row.syllabus.grading)&&row.syllabus.grading.some(item=>item.weight===null))nullWeight ||= detail;
      if(known&&nullWeight)break;
    }
    if(known&&templates.some(row=>catalogKinds[row.id]==='unfound'))probe=await both({scope:'syllabus-detail',id:absentId});
  }catch(error){setupFailure=catalogFixtureSetupReasons.includes(error?.catalogReason)?error.catalogReason:'catalog_read_unavailable';}
  for(const template of templates){
    const kind=catalogKinds[template.id],detail=kind==='null-weight'?nullWeight:kind==='unfound'?probe:known;
    const reason=setupFailure||(!known?'no_suitable_published_offering':kind==='null-weight'&&!detail?'no_null_weight_offering':kind==='unfound'&&detail?.value.row!==null?'absent_probe_not_empty':null);
    if(reason){unavailable.push({caseId:template.id,reason});continue;}
    const row=detail.value.row,nullIndex=row?.syllabus.grading?.findIndex(item=>item.weight===null)??-1;
    const testCase=catalogQuestionCase(template,kind,row,absentId,nullIndex);
    resultCases[resultCases.findIndex(item=>item.id===template.id)]=testCase;
    const evidenceReads=[search,detail,...(kind==='unfound'?[known]:[])];
    const record=immutable({caseId:template.id,kind,caseDigest:catalogDigest(testCase),reads:structuredClone(evidenceReads)});bound.set(template.id,record);
    selected.push({caseId:template.id,offeringId:row?.id||absentId,offeringVersion:row?.version??null,syllabusVersion:null,syllabusDigest:row?catalogDigest(row.syllabus):null,publishedSearchRevision:search.value.revision});
  }
  const binding=immutable({version:1,digest:catalogDigest({reads,selected,unavailable}),selected,unavailable});
  return {cases:resultCases,binding,bound};
}
/** Explicit post-prepare, pre-fingerprint step. No golden facts change afterward. */
export async function bindCatalogCases(cases,{signal}={}){
  const s=ready();if(s.current||s.catalogBound)fail('fixture-state','Catalog cases can be bound once before any model case.');
  if(!Array.isArray(cases)||cases.length!==s.caseIds.size||cases.some(row=>!s.caseIds.has(row.id)))fail('fixture-case','Catalog binding must preserve exactly the prepared case IDs.');
  const bounded=signals(signal||s.signal,120000);
  const result=await collectPublishedCatalogBinding(cases,{userIds:s.users.map(user=>user.id),absentId:randomUUID(),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:bounded,fetchImpl:s.previewReadbackFetch})});
  s.catalogBound=true;s.catalogBindings=result.bound;s.catalogBindingFailures=new Map(result.binding.unavailable.map(row=>[row.caseId,row.reason]));s.catalogBindingDigest=result.binding.digest;
  return {cases:result.cases,binding:result.binding};
}
/** Drift and changed case expectations fail before/after a model request. */
export async function verifyPublishedCatalogBinding(testCase,binding,{userIds,read}={}){
  if(!binding||binding.caseId!==testCase.id||binding.caseDigest!==catalogDigest(testCase))fail('fixture-catalog','The bound catalog case changed after fingerprinting.');
  requireSchema(Array.isArray(userIds)&&userIds.length===2&&userIds.every(id=>UUID.test(id))&&userIds[0]!==userIds[1]&&typeof read==='function','Catalog rechecks require the two distinct disposable callers.');
  const callers=[...userIds];
  for(const saved of binding.reads)for(const userId of callers){
    const actual=validatePublishedCatalogFixture(saved.query,await read(userId,structuredClone(saved.query)));
    if(catalogDigest(actual)!==catalogDigest(saved.value))fail('fixture-catalog','Published catalog records or revisions changed after binding; rebuild the case bank before evaluation.');
  }
  return catalogDigest(binding.reads);
}

/**
 * Pure translation boundary. shared contains already-read public catalog rows
 * and published periods. Nothing here fetches, resolves credentials or writes.
 * It returns only account-owned rows; no shared table is ever an insertion target.
 */
export async function planNativeFixture(snapshot,{userId,studentId,otherUserId,domains=PRIVATE_NATIVE_DOMAINS,shared={}}={}){
  requireSchema(UUID.test(userId)&&UUID.test(studentId)&&(!otherUserId||UUID.test(otherUserId))&&userId!==otherUserId,'Fixture identities must be distinct valid UUIDs.');
  requireSchema(Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(key=>PRIVATE_NATIVE_DOMAINS.includes(key)||CONDITIONAL_NATIVE_DOMAINS.includes(key)),'Unknown or duplicate native fixture domain.');
  const rows={},expected={},owner=source=>{
    if(source===snapshot.profile?.userId)return userId;
    if(source===EVAL_OTHER_USER_ID&&otherUserId)return otherUserId;
    fail('fixture-isolation','A fixture record belongs to an account outside the two disposable identities.');
  };
  for(const domain of domains){
    if(!NATIVE_TABLES[domain])continue;
    expected[domain]={};
    for(const [collection,[table,fields]] of Object.entries(NATIVE_TABLES[domain])){
      const source=snapshot[domain]?.[collection];requireSchema(Array.isArray(source),`Missing ${domain}.${collection} fixture collection.`);
      rows[table]=source.map(item=>{
        const row=requiredFields(item,[...COMMON,...fields],table);row.user_id=owner(item.userId);
        if(domain==='graduationReview')row.report=Object.fromEntries(REPORT_FIELDS.map(key=>{requireSchema(Object.hasOwn(item,key),`Missing graduation report field ${key}.`);return [key,structuredClone(item[key])];}));
        validatePrivateNativeRow(table,row);return row;
      });
      expected[domain][collection]=source.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId}));
      // The reader deliberately omits createdAt for aid; its persisted value is
      // still validated above, rather than fabricated or discarded from SQL.
      if(domain==='studentAid')expected[domain][collection].forEach(item=>delete item.createdAt);
    }
  }
  // Exercise the exact grade/graduation/attendance read validators offline.
  for(const id of [userId,otherUserId].filter(Boolean)){
    try{await loadNativeAcademicRecords(id,false,async table=>(rows[table]||[]).filter(row=>row.user_id===id));}
    catch{fail('fixture-schema','The persisted native academic rows failed the application read contract.');}
  }
  for(const domain of ['scholarship','housing'].filter(key=>domains.includes(key))){
    const value=snapshot[domain],published=shared[domain]?.periods;
    requireSchema(value&&Array.isArray(value.periods)&&Array.isArray(value.applications)&&(domain!=='housing'||Array.isArray(value.assignments)),`Missing ${domain} fixture collections.`);
    if(!Array.isArray(published))fail('fixture-unsupported',`${domain} requires an exact read-only published-period binding.`);
    if(published.length!==value.periods.length)fail('fixture-unsupported',`${domain} published periods do not equal the golden fixture; shared periods will not be changed.`);
    const bindings=new Map();expected[domain]=structuredClone(value);
    expected[domain].periods=value.periods.map(period=>{
      requiredFields(period,['id',...PERIOD_FIELDS[domain]],domain+' period');
      requireSchema(UUID.test(period.id)&&validText(period.termLabel,80)&&validStamp(period.opensAt)&&validStamp(period.closesAt)&&Date.parse(period.opensAt)<Date.parse(period.closesAt)&&period.opensAt.slice(0,10)>='2000-01-01'&&period.closesAt.slice(0,10)<'2101-01-01'&&typeof period.instructions==='string'&&period.instructions.length<=2000&&period.sourceMode==='local_demo'&&integer(period.version,1,2147483647),'Invalid published-period fixture fields.');
      if(domain==='housing')requireSchema(integer(period.academicYear,1,300)&&[1,2].includes(period.semester)&&validText(period.agreementText,4000),'Invalid housing period term or agreement.');
      const matches=published.filter(item=>item.published===true&&sameFields(item,period,PERIOD_FIELDS[domain]));
      if(matches.length!==1||!UUID.test(matches[0].id)||bindings.has(period.id))fail('fixture-unsupported',`${domain} has no unique, exactly matching published period.`);
      bindings.set(period.id,matches[0].id);return {...structuredClone(period),id:matches[0].id};
    });
    const bind=periodId=>{if(!bindings.has(periodId))fail('fixture-schema',`${domain} record references an absent golden period.`);return bindings.get(periodId);};
    rows[applicationTables[domain]]=value.applications.map(item=>{
      const row=requiredFields(item,APPLICATION_FIELDS[domain],domain+' application');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
      requireSchema(integer(row.version,1,2147483647)&&validStamp(row.submitted_at),'Invalid application version or timestamp.');
      if(domain==='scholarship'){
        requireSchema(['pending','approved','rejected','cancelled'].includes(row.status)&&
          (['approved','rejected'].includes(row.status)?validStamp(row.reviewed_at):row.reviewed_at===null)&&
          (row.status==='cancelled'?validStamp(row.cancelled_at):row.cancelled_at===null)&&
          (row.status==='approved'?amount(row.award_amount,10000000)&&amount(row.required_hours,10000)&&amount(row.actual_hours,10000):row.award_amount===null&&row.required_hours===null&&row.actual_hours===null)&&typeof row.review_note==='string'&&row.review_note.length<=2000,'Invalid scholarship review fields.');
      }else{
        const categories=['general','disability','island','low_income','lower_middle_income','college','academic_award','athlete','dorm_leader','overseas_chinese','international','mainland'];
        requireSchema(validText(row.full_name,80)&&validText(row.student_number,40)&&['male','female'].includes(row.gender)&&validText(row.department,100)&&validDay(row.birth_date)&&row.birth_date>='1900-01-01'&&row.birth_date<='2100-12-31'&&
          [row.home_phone,row.mobile_phone].every(item=>typeof item==='string'&&item.length<=40)&&typeof row.email==='string'&&row.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)&&validText(row.address,300)&&validText(row.postal_code,12)&&categories.includes(row.category)&&
          typeof row.health_notes==='string'&&row.health_notes.length<=250&&integer(row.agreement_version,1,2147483647)&&validText(row.agreement_text,4000),'Housing application is missing valid explicit synthetic form fields.');
      }
      return row;
    });
    expected[domain].applications=value.applications.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    if(domain==='housing'){
      rows.affairs_housing_assignments=value.assignments.map(item=>{
        const row=requiredFields(item,BED_FIELDS,'housing assignment');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
        const period=value.periods.find(period=>period.id===item.periodId);
        requireSchema(item.academicYear===period.academicYear&&item.semester===period.semester,'Housing bed term differs from the actual bound period.');
        requireSchema(/^[A-Za-z0-9-]{1,32}$/.test(row.bed_number)&&validText(row.dormitory,80)&&[null,'upper','lower'].includes(row.bunk)&&[row.accommodation_fee,row.deposit,row.subsidy_amount].every(value=>amount(value,10000000,true))&&integer(row.version,1,2147483647),'Invalid housing assignment fields.');
        return row;
      });
      expected[domain].assignments=value.assignments.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    }
  }
  if(domains.includes('courses')){
    requireSchema(Array.isArray(snapshot.courses),'Missing enrollment course fixture.');
    if(!Array.isArray(shared.courses))fail('fixture-unsupported','Enrollment fixtures require exact read-only catalog section bindings.');
    rows.affairs_enrollments=[];rows.affairs_grade_items=[];rows.affairs_attendance=[];expected.courses=structuredClone(snapshot.courses);
    for(const course of snapshot.courses){
      requiredFields(course,['enrollmentId','status','sourceMode',...COURSE_FIELDS,'grades','attendance'],'enrollment');
      const matching=shared.courses.filter(row=>sameFields(row,course,COURSE_FIELDS));
      if(matching.length!==1||!UUID.test(matching[0].sectionId))fail('fixture-unsupported','No unique catalog section matches every golden enrollment field, including term dates and meeting times.');
      requireSchema(['enrolled','withdrawn','completed'].includes(course.status)&&['sample','verified'].includes(course.sourceMode),'Invalid enrollment status or provenance.');
      rows.affairs_enrollments.push({id:course.enrollmentId,student_id:studentId,section_id:matching[0].sectionId,status:course.status,source_mode:course.sourceMode});
      requireSchema(Array.isArray(course.grades)&&Array.isArray(course.attendance),'Missing enrollment grade or attendance collection.');
      course.grades.forEach((item,index)=>{
        requireSchema(validText(item.label,10000)&&amount(item.score,999.99)&&amount(item.maximum,999.99)&&item.maximum>0&&item.score<=item.maximum&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment assessment fields.');
        rows.affairs_grade_items.push({id:stableRowId([course.enrollmentId,'grade',index]),enrollment_id:course.enrollmentId,label:item.label,score:item.score,maximum:item.maximum,released_at:snapshot.checkedAt,source_mode:item.sourceMode});
      });
      course.attendance.forEach((item,index)=>{
        requireSchema(validDay(item.date)&&['present','late','absent','excused'].includes(item.status)&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment attendance fields.');
        rows.affairs_attendance.push({id:stableRowId([course.enrollmentId,'attendance',index]),enrollment_id:course.enrollmentId,meeting_on:item.date,status:item.status,source_mode:item.sourceMode});
      });
    }
    if(shared.initializerSectionIds?.some(id=>!rows.affairs_enrollments.some(row=>row.section_id===id)))fail('fixture-unsupported','The account initializer would add catalog enrollments outside this golden fixture; the fixture cannot be evaluated faithfully.');
  }
  uniqueRows(rows);
  return {domains:[...domains],rows,expected,userId,studentId,otherUserId};
}

/** Exact comparison after the real API read; field mismatches are fixture errors. */
export function verifyNativeFixtureReadback(actual,plan){
  for(const domain of plan.domains){
    const ordered=value=>domain==='courses'&&Array.isArray(value)?[...value].sort((a,b)=>String(a.enrollmentId).localeCompare(String(b.enrollmentId))):value;
    assertFactEqual(ordered(actual[domain]),ordered(plan.expected[domain]),domain+' native records');
  }
  if(plan.publishedSampleBinding){
    assertFactEqual(actual.profile?.userId,plan.userId,'published sample caller');
    assertFactEqual(actual.student?.id,plan.studentId,'published sample student');
    assertFactEqual(actual.student?.program,sampleEnrollmentManifest.program.name,'published sample program');
  }
  return true;
}

/** Complete read-only initializer union, not a convenient five-code lookup.
 * The injected query runner preserves the live adapter's connection/timeouts. */
export async function readPublishedSampleInitializerRows(sql,{runQuery=task=>task()}={}){
  requireSchema(typeof sql==='function'&&typeof runQuery==='function','A bounded shared-row query is required.');
  const values=await runQuery(()=>sql`select s.id as section_id,c.id as course_id,t.id as term_id,p.id as program_id,
    c.code,c.title,c.credits,c.source_mode as course_source_mode,p.code as program_code,p.name as program_name,p.department,p.source_mode as program_source_mode,
    t.code as term_code,t.label as term_label,to_char(t.starts_on,'YYYY-MM-DD') as term_starts_on,to_char(t.ends_on,'YYYY-MM-DD') as term_ends_on,t.source_mode as term_source_mode,
    s.section_code,s.instructor,s.weekday,s.starts_at::text,s.ends_at::text,s.room,s.source_mode as section_source_mode
    from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
    left join public.affairs_programs p on p.id=c.program_id
    where t.code='SAMPLE-2026-FALL' or c.code in ('SAMP090','SAMP103','SAMP201') order by s.id limit 501`);
  if(!Array.isArray(values)||values.length>500)fail('fixture-unsupported','The complete published sample initializer union could not be established.');
  return {scope:structuredClone(sampleEnrollmentManifest.scope),complete:true,rows:values.map(row=>({
    sectionId:row.section_id,courseId:row.course_id,termId:row.term_id,programId:row.program_id,code:row.code,title:row.title,credits:Number(row.credits),courseSourceMode:row.course_source_mode,
    programCode:row.program_code,programName:row.program_name,department:row.department,programSourceMode:row.program_source_mode,
    termCode:row.term_code,termLabel:row.term_label,termStartsOn:row.term_starts_on,termEndsOn:row.term_ends_on,termSourceMode:row.term_source_mode,
    sectionCode:row.section_code,instructor:row.instructor,weekday:Number(row.weekday),startsAt:row.starts_at,endsAt:row.ends_at,room:row.room,sectionSourceMode:row.section_source_mode,
  }))};
}

/** Independent migration constants stay golden; only shared UUIDs are bound.
 * These rows target the fresh caller's enrollments, never the shared catalog. */
export async function planPublishedSampleFixture(snapshot,{userId,studentId,otherUserId,now,read,domains=PRIVATE_NATIVE_DOMAINS,shared={}}={}){
  requireSchema(snapshot?.profile?.userId===userId&&snapshot.profile.role==='student'&&Array.isArray(snapshot.courses)&&snapshot.courses.length===5,'Published samples require the exact disposable student and five-course fixture.');
  requireSchema(validStamp(snapshot.checkedAt),'Published sample seeded grades require a valid readback timestamp.');
  requireSchema(snapshot.student?.program===sampleEnrollmentManifest.program.name,'Published sample program must retain its independently authored literal name.');
  const enrollmentIdsByCode=Object.fromEntries(snapshot.courses.map(course=>[course.code,course.enrollmentId]));
  let bound;
  try{bound=bindPublishedSampleEnrollments(read,{userId,studentId,enrollmentIdsByCode,now});}
  catch{fail('fixture-unsupported','Published sample initializer rows or literal evaluation dates do not match the reviewed binding.');}
  // 050100 initializer restores this exact released grade on every read.
  // Keeping it absent would make readback itself mutate the expected fixture.
  const practiceGrade={label:'Sample practice quiz',score:8,maximum:10,sourceMode:'sample'};
  const expectedCourses=bound.expectedCourses.map(course=>({...course,grades:course.code==='SAMP101'?[{...practiceGrade}]:[],attendance:[]}));
  assertFactEqual([...snapshot.courses].sort((a,b)=>a.code.localeCompare(b.code)),[...expectedCourses].sort((a,b)=>a.code.localeCompare(b.code)),'published sample golden enrollment fields');
  const plan=await planNativeFixture(snapshot,{userId,studentId,otherUserId,domains:domains.filter(domain=>domain!=='courses'),shared});
  const enrollment=bound.enrollments.find(row=>row.id===enrollmentIdsByCode.SAMP101);
  plan.domains.push('courses');plan.expected.courses=expectedCourses;
  plan.rows.affairs_enrollments=bound.enrollments.map(row=>({...row}));
  plan.rows.affairs_grade_items=[{id:stableRowId([enrollment.id,'grade',0]),enrollment_id:enrollment.id,...pick(practiceGrade,['label','score','maximum']),released_at:snapshot.checkedAt,source_mode:'sample'}];
  plan.rows.affairs_attendance=[];
  plan.publishedSampleBinding=structuredClone(bound.binding);
  plan.publishedSampleEnrollmentIds={...enrollmentIdsByCode};
  uniqueRows(plan.rows);return plan;
}

/** Re-read all shared facts before and after the model. Never relax a mismatch. */
export async function verifyPublishedSampleFixtureBinding(plan,{read,now}={}){
  requireSchema(plan?.publishedSampleBinding&&typeof read==='function','A published sample binding and complete read are required.');
  let current;
  try{current=bindPublishedSampleEnrollments(await read(),{...plan.publishedSampleBinding.owner,enrollmentIdsByCode:plan.publishedSampleEnrollmentIds,now});}
  catch{fail('fixture-unsupported','Published sample facts changed or their complete read is unavailable.');}
  if(current.binding.sharedDigest!==plan.publishedSampleBinding.sharedDigest)fail('fixture-mapping','Published sample shared identities changed after binding.');
  return current.binding.sharedDigest;
}
/** Matches service row checks, including the separate mental-health time enum. */
export function validateFixtureServiceRecord(row){
  requireSchema(UUID.test(row?.id)&&validText(row.title,160)&&typeof row.notes==='string'&&row.notes.length<=2000&&['draft','filed','withdrawn'].includes(row.status)&&validStamp(row.updatedAt),'Invalid private service record fields.');
  const start=row.startsOn??null,end=row.endsOn??null,category=row.leaveCategory??null,periods=row.periods??null,phone=row.contactPhone??null,time=row.leaveTimePeriod??null;
  requireSchema(start===null&&end===null||validDay(start)&&validDay(end)&&start>='2000-01-01'&&end<='2100-12-31'&&start<=end,'Invalid service record dates.');
  requireSchema(category===null||['personal','sick','official','bereavement','nursing','mental_health','maternity','menstrual','other'].includes(category),'Invalid leave category.');
  requireSchema(row.serviceKey==='leave'&&row.recordType==='leave'&&start!==null&&category!==null&&validText(periods,80)||
    row.serviceKey==='internship'&&['contract','self_assessment','company'].includes(row.recordType)&&category===null&&periods===null||
    /^[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$/.test(row.serviceKey)&&row.recordType==='note'&&start===null&&category===null&&periods===null,'Invalid service-specific record shape.');
  requireSchema(phone===null||row.serviceKey==='leave'&&typeof phone==='string'&&phone.length>=3&&phone.length<=32&&/^[+0-9 ()#.-]+$/.test(phone),'Invalid private leave contact field.');
  requireSchema(category==='mental_health'?['am','pm','day'].includes(time):time===null,'leaveTimePeriod is an am/pm/day mental-health enum; ordinary leave uses periods and must leave it null.');
  requireSchema(row.reviewStatus==null||['open','in_review','resolved'].includes(row.reviewStatus),'Invalid joined service review state.');
  return true;
}
async function readPublishedHousingPeriods(s){
  const rows=await query(()=>s.sql`select id,term_label,academic_year,semester,published,instructions,agreement_text,source_mode,version,
    to_char(opens_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as opens_at,
    to_char(closes_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as closes_at
    from public.affairs_housing_periods where published=true order by id limit 501`,'Could not read the bounded published housing period inventory.');
  if(!Array.isArray(rows)||rows.length>500)fail('fixture-unsupported','Published housing period inventory exceeds the bounded fixture size.');
  return mapHousingRecords(rows,[],[]).periods;
}

function housingPublishedFingerprint(periods){
  requireSchema(Array.isArray(periods)&&periods.length<=500,'Invalid published housing period inventory.');
  const unique=new Set(),terms=new Set();
  for(const period of periods){
    const term=period?.academicYear+'-'+period?.semester;
    requireSchema(period&&Object.keys(period).length===PERIOD_FIELDS.housing.length+1&&Object.hasOwn(period,'id')
      &&PERIOD_FIELDS.housing.every(key=>Object.hasOwn(period,key))&&UUID.test(period.id)&&!unique.has(period.id)&&!terms.has(term)
      &&integer(period.academicYear,1,300)&&[1,2].includes(period.semester)&&validText(period.termLabel,80)
      &&validStamp(period.opensAt)&&validStamp(period.closesAt)&&Date.parse(period.opensAt)<Date.parse(period.closesAt)
      &&period.published===true&&typeof period.instructions==='string'&&period.instructions.length<=2000
      &&validText(period.agreementText,4000)&&period.sourceMode==='local_demo'&&integer(period.version,1,2147483647),
    'Invalid or ambiguous published housing period row.');
    unique.add(period.id);terms.add(term);
  }
  return hash([...periods].sort((a,b)=>a.id.localeCompare(b.id)));
}

/** Bind the synthetic bed cells to a real period with the same academic term.
 * The period's dates, agreement and ID are independently observed, not seeded. */
export async function bindPublishedHousingBedFixture(snapshot,{shared,read,...options}){
  const housing=snapshot.housing;
  requireSchema(Array.isArray(housing?.assignments)&&housing.assignments.length<=1&&Array.isArray(housing.periods),
    'The scoped housing bed fixture requires an exact assignment or empty history.');
  const periods=await read();
  const sha256=housingPublishedFingerprint(periods);
  const [assignment]=housing.assignments;
  let scopedPeriods=[],sharedPeriods=[],term={academicYear:null,semester:null};
  if(assignment){
    const stored=housing.periods.find(period=>period.id===assignment.periodId);
    requireSchema(stored&&assignment.academicYear===stored.academicYear&&assignment.semester===stored.semester,
      'The housing bed fixture term is not bound to its original oracle.');
    const candidates=periods.filter(period=>period.academicYear===stored.academicYear&&period.semester===stored.semester);
    if(candidates.length!==1)fail('fixture-unsupported',`No unique published housing period is available for academic year ${stored.academicYear} semester ${stored.semester}.`);
    const [period]=candidates;
    scopedPeriods=[{...period,id:stored.id}];sharedPeriods=[period];
    term={academicYear:period.academicYear,semester:period.semester};
  }else requireSchema(housing.periods.length===0&&housing.applications?.length===0,'The scoped empty housing fixture must have no saved records.');
  const scoped={...snapshot,housing:{periods:scopedPeriods,applications:[],assignments:housing.assignments}};
  const result=await planNativeFixture(scoped,{...options,shared:{...shared,housing:{periods:sharedPeriods}}});
  result.expected.housing.periods=structuredClone(periods);
  result.housingBedPeriodBinding={...term,sha256};
  return result;
}

export async function verifyPublishedHousingBedBinding(binding,{read}){
  if(housingPublishedFingerprint(await read())!==binding.sha256)
    fail('fixture-mapping','Published housing periods changed after the independent bed fixture binding.');
  return binding;
}

async function readNativeBindings(snapshot,testCase){
  const s=state,publishedSample=testCase.fixtureKey==='published-sample:records'||testCase.fixtureKey==='facility-repairs:compound';
  const required=new Set(testCase.expected?.requiredTools||[]),domains=[...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS.filter(domain=>required.has(domain)||domain==='housing'&&required.has('housingApplications')||domain==='courses'&&publishedSample)],shared={};
  const bedOnly=/^(?:account:(?:housing-bed|housing-costs|empty-housing|dormitory-conduct-mixed-housing)|service:34-1:(?:record|empty))$/u.test(testCase.id??'')
    &&required.has('housing')&&!required.has('housingApplications');
  if(bedOnly&&!s.previewGate)fail('fixture-target','The bounded housing bed fixture requires a pinned Preview.');
  for(const domain of ['scholarship','housing'].filter(domain=>domains.includes(domain)&&!(bedOnly&&domain==='housing'))){
    const values=await query(()=>s.sql`select * from ${s.sql('public.'+periodTables[domain])} where published=true order by id limit 501`,'Could not read published fixture period bindings.');
    if(values.length>500)fail('fixture-unsupported','Published period bindings exceed the bounded fixture inventory.');
    const normalized=values.map(row=>({...row,opens_at:timestamp(row.opens_at),closes_at:timestamp(row.closes_at)}));
    shared[domain]=domain==='scholarship'?mapScholarshipRecords(normalized,[]):mapHousingRecords(normalized,[],[]);
  }
  if(bedOnly)return bindPublishedHousingBedFixture(snapshot,{shared,domains,userId:s.users[0].id,
    studentId:s.users[0].studentId,otherUserId:s.users[1].id,read:()=>readPublishedHousingPeriods(s)});
  if(publishedSample){
    const read=await readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not read the complete published sample initializer union.')});
    return planPublishedSampleFixture(snapshot,{userId:s.users[0].id,studentId:s.users[0].studentId,otherUserId:s.users[1].id,now:s.now,read,domains,shared});
  }
  if(domains.includes('courses')){
    const codes=snapshot.courses.map(row=>row.code);
    const values=await query(()=>s.sql`select s.id as section_id,c.code,c.title,c.credits,t.label as term,
      to_char(t.starts_on,'YYYY-MM-DD') as term_starts_on,to_char(t.ends_on,'YYYY-MM-DD') as term_ends_on,
      s.instructor,s.weekday,s.starts_at::text,s.ends_at::text,s.room,t.code as term_code
      from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
      where c.code in ${s.sql(codes.length?codes:['__NO_SYNTHETIC_COURSES__'])} or t.code='SAMPLE-2026-FALL' limit 501`,'Could not read exact shared course bindings.');
    if(values.length>500)fail('fixture-unsupported','Catalog bindings exceed the bounded fixture inventory.');
    shared.courses=values.map(row=>({sectionId:row.section_id,code:row.code,title:row.title,credits:Number(row.credits),term:row.term,termStartsOn:row.term_starts_on,termEndsOn:row.term_ends_on,instructor:row.instructor,weekday:Number(row.weekday),startsAt:row.starts_at,endsAt:row.ends_at,room:row.room}));
    shared.initializerSectionIds=values.filter(row=>row.term_code==='SAMPLE-2026-FALL').map(row=>row.section_id);
  }
  return planNativeFixture(snapshot,{userId:s.users[0].id,studentId:s.users[0].studentId,otherUserId:s.users[1].id,domains,shared});
}
function recordsToInsert(snapshot,user){
  const courses=snapshot.dtm.courses.filter(row=>row.sourceMode==='personal');
  const courseIds=new Set(courses.map(row=>row.id));
  const rows={
    dtm_courses:courses.map((row,index)=>({...pick(row,['id','code','title','term','role']),user_id:user.id,source_mode:'personal',created_at:new Date(Date.parse(state.now)-index*1000).toISOString()})),
    dtm_materials:courses.flatMap(course=>course.materials.map(row=>({id:row.id,course_id:course.id,title:row.title,kind:row.kind,summary:row.summary,position:row.position,source_mode:'personal',source_url:row.sourceUrl??null,target_url:row.targetUrl??null}))),
    dtm_meetings:courses.flatMap(course=>course.meetings.map(row=>({id:row.id,course_id:course.id,meeting_on:row.date,starts_at:row.startsAt,title:row.title,attendance:row.attendance,notes:row.notes}))),
    dtm_grade_items:courses.flatMap(course=>course.grades.map(row=>({id:row.id,course_id:course.id,label:row.label,score:row.score,maximum:row.maximum,graded_on:row.date,feedback:row.feedback}))),
    affairs_assignments:snapshot.assignments.map(row=>{
      if(row.sourceMode!=='personal'||!courseIds.has(row.dtmCourseId)||row.enrollmentId)fail('fixture-unsupported','Only actual private DTM assignments are mapped by this adapter.');
      return {id:row.id,student_id:user.studentId,enrollment_id:null,dtm_course_id:row.dtmCourseId,title:row.title,details:row.details,due_at:row.dueAt,status:row.status,submitted_at:row.submittedAt,source_mode:'personal',meeting_id:row.meetingId,import_key:row.origin==='moodle_calendar'?hash({fixture:row.id}):null};
    }),
    affairs_charges:snapshot.charges.map(row=>({id:row.id,student_id:user.studentId,label:row.label,amount_due:row.amountDue,amount_paid:row.amountPaid,currency:row.currency,due_on:row.dueOn,source_mode:row.sourceMode,occurrence_on:row.occurrenceOn,category:row.category,contact_unit:row.contactUnit,contact_extension:row.contactExtension,payment_unit:row.paymentUnit})),
    affairs_tasks:snapshot.tasks.map(row=>({id:row.id,user_id:user.id,title:row.title,due_at:row.dueAt,completed_at:row.completedAt,source_mode:row.sourceMode})),
    affairs_service_requests:snapshot.requests.map(row=>({id:row.id,user_id:user.id,request_type:row.type,title:row.title,details:row.details,status:row.status,created_at:row.createdAt,updated_at:row.createdAt})),
    affairs_service_records:[],
  };
  for(const row of snapshot.serviceRecords){
    validateFixtureServiceRecord(row);
    if(row.userId&&row.userId!==user.id)fail('fixture-isolation','Service fixture record belongs to a different account.');
    const reviewId=row.reviewStatus?randomUUID():null;
    if(reviewId)rows.affairs_service_requests.push({id:reviewId,user_id:user.id,request_type:'general',title:'Review '+row.title,details:'Synthetic local review request for '+row.title,status:row.reviewStatus,created_at:state.now,updated_at:state.now});
    rows.affairs_service_records.push({id:row.id,user_id:user.id,service_key:row.serviceKey,record_type:row.recordType,title:row.title,notes:row.notes,status:row.status,starts_on:row.startsOn,ends_on:row.endsOn,leave_category:row.leaveCategory,periods:row.periods,review_request_id:reviewId,updated_at:row.updatedAt,contact_phone:row.contactPhone??null,leave_time_period:row.leaveTimePeriod??null});
  }
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){if(!UUID.test(row.id)||ids.has(row.id))fail('fixture-schema',`Duplicate or invalid synthetic record ID for ${table}.`);ids.add(row.id);}
  }
  return rows;
}
async function persistSnapshot(snapshot,rows,testCase,nativePlan,supplementalPlan,aidPlan,dtmReportPlan,elearningPlan,facilityRepairPlan,outlinePlan,dormitoryPlan){
  const s=state,user=s.users[0];
  for(const values of Object.values(rows))for(const row of values)s.recordIds.add(row.id);
  for(const domain of supplementalPlan.domains)s.supplementalTables.add(SUPPLEMENTAL_TABLES[domain]);
  if(aidPlan){
    for(const id of aidPlan.recordIds)s.recordIds.add(id);
    for(const table of Object.values(aidPaymentFixtureManifest.tables))s.supplementalTables.add(table);
  }
  if(dtmReportPlan){
    for(const id of dtmReportPlan.recordIds)s.recordIds.add(id);
    s.supplementalTables.add(dtmGradeReportFixtureManifest.table);
  }
  if(dtmReportPlan||s.dtmReportPlan){s.pendingDtmReportPlan=dtmReportPlan;s.dtmReportTransitionPending=true;}
  if(elearningPlan||s.elearningPlan){
    s.supplementalTables.add('elearning_enrollments');
    s.pendingElearningPlan=elearningPlan;s.elearningTransitionPending=true;
  }
  if(outlinePlan||s.outlinePlan){
    s.outlineTouched=true;
    s.pendingOutlinePlan=outlinePlan;s.outlineTransitionPending=true;
  }
  if(dormitoryPlan||s.dormitoryPlan){
    s.dormitoryTouched=true;
    for(const id of dormitoryPlan?.recordIds??[])s.recordIds.add(id);
    s.pendingDormitoryPlan=dormitoryPlan;s.dormitoryTransitionPending=true;
  }
  if(facilityRepairPlan||s.facilityRepairPlan){
    s.pendingFacilityRepairPlan=facilityRepairPlan;s.facilityRepairTransitionPending=true;
  }
  await saveLedger();
  if(aidPlan||s.aidPlan){s.pendingAidPlan=aidPlan;s.aidTransitionPending=true;}
  await query(async()=>{
    const tx=s.sql;await tx.unsafe('begin');
    try{
    if(nativePlan.housingBedPeriodBinding)
      await verifyPublishedHousingBedBinding(nativePlan.housingBedPeriodBinding,{read:()=>readPublishedHousingPeriods(s)});
    if(s.dtmReportPlan)await changeDtmReportFixtureRows(tx,s.dtmReportPlan,'remove');
    // Deletes are scoped only to the freshly created fixture account. Global
    // sample courses, university captures, notices and real people are untouched.
    await tx`delete from public.affairs_service_records where user_id=${user.id}`;
    await tx`delete from public.affairs_service_requests where user_id=${user.id}`;
    await tx`delete from public.affairs_tasks where user_id=${user.id} and source_mode='site'`;
    await tx`delete from public.affairs_assignments where student_id=${user.studentId}`;
    await tx`delete from public.dtm_courses where user_id=${user.id} and source_mode='personal'`;
    await tx`delete from public.affairs_charges where student_id=${user.studentId}`;
    // Both owners are newly created in this lifecycle. Foreign sentinel records
    // are written only to the second fixture account, never a real identity.
    const fixtureUsers=s.users.map(item=>item.id);
    for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments',...s.supplementalTables]){
      if(table==='affairs_aid_payment_claims'||table==='affairs_aid_salary_records'||table==='dtm_grade_reports'||table==='elearning_enrollments')continue;
      await tx`delete from ${tx('public.'+table)} where user_id in ${tx(fixtureUsers)}`;
    }
    if(aidPlan||s.aidPlan)await replaceAidFixtureRows(tx,s.aidPlan,aidPlan);
    if(elearningPlan||s.elearningPlan)await changeElearningFixtureRows(tx,{previous:s.elearningPlan,next:elearningPlan,identities:s.identityRequests,runId:s.runId});
    if(outlinePlan||s.outlinePlan)await changeOutlineFixtureRows(tx,{previous:s.outlinePlan,next:outlinePlan,identities:s.identityRequests,runId:s.runId});
    if(dormitoryPlan||s.dormitoryPlan)await changeDormitoryFixtureRows(tx,{previous:s.dormitoryPlan,next:dormitoryPlan,identities:s.identityRequests,runId:s.runId});
    if(facilityRepairPlan||s.facilityRepairPlan)await changeFacilityRepairFixtureRows(tx,{previous:s.facilityRepairPlan,next:facilityRepairPlan,identities:s.identityRequests,runId:s.runId});
    if(nativePlan.domains.includes('courses'))await tx`delete from public.affairs_enrollments where student_id=${user.studentId}`;
    await tx`update public.affairs_profiles set preferred_name=${snapshot.profile.displayName} where user_id=${user.id}`;
    await tx`update public.affairs_students set student_number=${snapshot.student.studentNumber},full_name=${snapshot.student.fullName},year_level=${snapshot.student.yearLevel} where id=${user.studentId} and user_id=${user.id}`;
    // Programs are shared catalog data. Existing rows may be referenced, never
    // created or changed to accommodate an evaluation.
    if(nativePlan.publishedSampleBinding){
      const programId=nativePlan.publishedSampleBinding.sections[0].programId;
      await tx`update public.affairs_students set program_id=${programId} where id=${user.studentId} and user_id=${user.id}`;
    }else{
      const programs=await tx`select id from public.affairs_programs where name=${snapshot.student.program} order by id limit 2`;
      if(programs.length===1)await tx`update public.affairs_students set program_id=${programs[0].id} where id=${user.studentId} and user_id=${user.id}`;
      else if(JSON.stringify(testCase.expected).includes('Information Studies'))fail('fixture-unsupported','The required synthetic program is absent from the shared catalog; no global catalog row will be created.');
    }
    for(const [table,values] of Object.entries(rows)){
      for(let start=0;start<values.length;start+=100){
        const batch=values.slice(start,start+100).map(row=>({...row,...(table==='affairs_course_selection_records'?{meetings:tx.json(row.meetings)}:{}),...(table==='affairs_graduation_reviews'?{report:tx.json(row.report)}:{})}));
        if(batch.length)await tx`insert into ${tx('public.'+table)} ${tx(batch)}`;
      }
    }
    if(dtmReportPlan)await changeDtmReportFixtureRows(tx,dtmReportPlan,'insert');
    await tx.unsafe('commit');
    if(s.aidTransitionPending){s.aidPlan=aidPlan;s.pendingAidPlan=null;s.aidTransitionPending=false;}
    if(s.dtmReportTransitionPending){s.dtmReportPlan=dtmReportPlan;s.pendingDtmReportPlan=null;s.dtmReportTransitionPending=false;}
    if(s.elearningTransitionPending){s.elearningPlan=elearningPlan;s.pendingElearningPlan=null;s.elearningTransitionPending=false;}
    if(s.outlineTransitionPending){s.outlinePlan=outlinePlan;s.pendingOutlinePlan=null;s.outlineTransitionPending=false;}
    if(s.dormitoryTransitionPending){s.dormitoryPlan=dormitoryPlan;s.pendingDormitoryPlan=null;s.dormitoryTransitionPending=false;}
    if(s.facilityRepairTransitionPending){s.facilityRepairPlan=facilityRepairPlan;s.pendingFacilityRepairPlan=null;s.facilityRepairTransitionPending=false;}
    }catch(error){try{await tx.unsafe('rollback');}catch{/* Preserve the original, sanitized error. */}throw error;}
  },'Could not persist private evaluation rows.');
}
function canonical(value){
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value)){const result=value.map(canonical);return result.every(row=>row&&typeof row==='object'&&row.id)?result.sort((a,b)=>String(a.id).localeCompare(String(b.id))):result;}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value)))return timestamp(value);
  return value;
}
function assertFactEqual(actual,expected,label){
  try{assert.deepEqual(canonical(actual),canonical(expected));}catch{fail('fixture-mapping',`${label} differs between the independent golden fixture and authenticated /api/affairs-data. Model evaluation was not started.`);}
}
function verifyReadback(actual,expected,testCase){
  assertFactEqual(pick(actual.profile,['email','displayName','role']),pick(expected.profile,['email','displayName','role']),'profile');
  assertFactEqual(pick(actual.student,['studentNumber','fullName','yearLevel','status','sourceMode']),pick(expected.student,['studentNumber','fullName','yearLevel','status','sourceMode']),'student identity');
  if(JSON.stringify(testCase.expected).includes('Information Studies'))assertFactEqual(actual.student.program,expected.student.program,'program');
  assertFactEqual(sort(actual.dtm.courses.filter(row=>row.sourceMode==='personal')),sort(expected.dtm.courses.filter(row=>row.sourceMode==='personal')),'personal DTM courses, material content, meetings and grade feedback');
  assertFactEqual(sort(actual.assignments),sort(expected.assignments),'assignment records and linkage');
  assertFactEqual(sort(actual.charges),sort(expected.charges),'fee balances and contact fields');
  assertFactEqual(sort(actual.tasks.filter(row=>row.sourceMode==='site')),sort(expected.tasks),'personal task records');
  const requestIds=new Set(expected.requests.map(row=>row.id));
  assertFactEqual(sort(actual.requests.filter(row=>requestIds.has(row.id))),sort(expected.requests),'request status');
  if(testCase.fixtureKey==='empty:requests')assertFactEqual(actual.requests,[],'empty request collection');
  const serviceKeys=['id','serviceKey','recordType','title','notes','status','startsOn','endsOn','leaveCategory','periods','updatedAt','reviewStatus','contactPhone','leaveTimePeriod'];
  assertFactEqual(sort(actual.serviceRecords.map(row=>pick(row,serviceKeys))),sort(expected.serviceRecords.map(row=>pick(row,serviceKeys))),'service records and joined review status');
}
function ownState(snapshot){
  const keys=['profile','student','courses','assignments','charges','tasks','requests','serviceRecords','scholarship','studentAid','housing','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
  return canonical({...Object.fromEntries(keys.map(key=>[key,snapshot[key]??null])),dtm:{sourceMode:snapshot.dtm.sourceMode,courses:snapshot.dtm.courses}});
}

/** Persists golden facts, then proves the application's actual auth/RLS read path. */
function serviceNoteBinding(s){
  return {owners:s.users.map(user=>user.id),identities:s.identityRequests,runId:s.runId};
}
async function changeServiceNoteFixture(s,next,{recovering=false}={}){
  if(!s.locked||!s.ledgerOwned||s.closed||(!recovering&&s.serviceNotePending))
    fail('fixture-lease','The disposable service-note fixture lease or transition is unavailable.');
  if(!recovering){
    s.pendingServiceNotePlan=next;
    s.serviceNotePending=true;
    for(const row of [...(next?.rows??[]),...(next?.companion?.rows??[])])s.recordIds.add(row.id);
    await saveLedger();
  }
  const change={...serviceNoteBinding(s),previous:s.serviceNotePlan,next:s.pendingServiceNotePlan,recovering};
  await query(()=>feeTransaction(s,()=>changeServiceNoteRows(s.sql,change)),'Could not reconcile the exact disposable service-note rows.');
  s.serviceNotePlan=recovering?null:next;
  s.pendingServiceNotePlan=null;
  s.serviceNotePending=false;
  await saveLedger();
}
async function currentServiceNoteFixture(s,signal){
  const active=signal||s.signal;
  await Promise.all(s.users.map(user=>user.renewSession({signal:active})));
  const context={sql:s.sql,users:s.users,publishable:s.publishable,signal:active};
  const notes=await query(()=>observeServiceNoteRows({...context,plan:s.serviceNotePlan,...serviceNoteBinding(s)}),
    'Could not verify persisted and caller-scoped service notes.');
  const companion=s.serviceNotePlan.companion
    ?await query(()=>observeNoteCompanion({...context,plan:s.serviceNotePlan.companion,fetchImpl:s.boundedFetch,
      readResponse:readBoundedFixtureResponse,readInitializer:()=>readPublishedSampleInitializerRows(s.sql)}),
    'Could not verify the exact caller-scoped service-note companion.')
    :null;
  return {digest:companion?hash([notes,companion]):notes,companion};
}

export async function forCase(testCase,{signal,fixtureMode,fixtureFamily}={}){
  if(testCase?.fixtureRequirement==='club_equipment_disposable'||/^account:club-equipment-/u.test(testCase?.id??''))
    fail('fixture-unsupported','Club equipment requires its isolated paired-owner evaluator.');
  if(nativeInternshipSetupRequired(testCase))
    fail('fixture-unsupported','Native internship requires isolated caller fixtures and independent request observations.');
  if(nativeStudentLeaveSetupRequired(testCase))
    fail('fixture-unsupported','Native Student Leave requires an isolated fixture and trusted request observations.');
  if(testCase?.venueOracle||testCase?.fixtureRequirement==='offline_native_venue_requests'||testCase?.fixtureRequirement==='legacy_venue_request_rebind'
    ||/^(?:account:venue-native-|service:44-1:(?:record|empty|action-boundary)$)/u.test(testCase?.id??'')
    ||typeof testCase?.fixtureKey==='string'&&testCase.fixtureKey.startsWith('offline:venue-requests:'))
    fail('fixture-unsupported','Native venue requests require exact caller fixtures and independent request observations.');
  const s=ready();if(s.current)fail('fixture-state','afterCase() must complete before selecting another fixture.');
  const transcript=s.applicationFetch?s.transcriptFixture??null:null;
  if(s.applicationFetch){
    if(transcript?.blocked)fail('fixture-state','The saved transcript fixture requires reconciliation.');
    assertTranscriptFixtureCase(testCase,transcript?.nextIndex??0);
    if(transcript&&(!transcript.publishedSamplePlan||!transcript.beforeHash))
      fail('fixture-state','The saved transcript fixture is not bound.');
    if(transcript)transcript.blocked=true;
  }
  if(s.feeFixture){
    const family=feeRemissionLiveFamilyForCase(testCase);
    const anonymous=testCase.id==='account:fee-remission-anonymous';
    if(fixtureMode!==FEE_FIXTURE_MODE||fixtureFamily!==family||!s.caseIds.has(testCase.id)
      ||testCase.fixtureKey!==(anonymous?'anonymous':'planned:'+family))
      fail('fixture-case','Unexpected case or family for the disposable fee fixture.');
    (signal||s.signal)?.throwIfAborted();
    const {lifecycle,owners,students}=s.feeFixture;
    const plan=buildFeeRemissionFixturePlan({runId:s.runId,owners,students,fixtureKey:family});
    const before=lifecycle.status().currentFamily===family?await lifecycle.verifyUnchanged():await lifecycle.transition(plan);
    if(!anonymous)await s.users[0].renewSession({signal:signal||s.signal});
    s.current={caseId:testCase.id,beforeHash:before.digest,fixtureFamily:family};
    try{await saveLedger();}catch(error){s.current=null;throw error;}
    return anonymous?{}:{token:s.users[0].token};
  }
  if(s.healthMetadataFixture){
    if(fixtureMode!==healthMetadataFixtureMode||fixtureFamily!==healthMetadataFamily||!s.caseIds.has(testCase.id))
      fail('fixture-case','Health metadata is outside the prepared isolated fixture.');
    const oracle=healthMetadataCase(testCase);
    await s.healthMetadataFixture.transition(oracle.family);
    const before=await healthMetadataObservation(s,oracle.page,signal);
    s.current={caseId:testCase.id,healthMetadata:before};
    return testCase.fixtureKey==='anonymous'?{}:{token:s.users[0].token};
  }
  if(s.dtmAssignmentListPlan){
    if(fixtureMode!==dtmAssignmentListFixtureMode||fixtureFamily!==s.dtmAssignmentListFamily
      ||!isDeepStrictEqual(testCase,s.dtmAssignmentListCases.get(testCase.id)))
      fail('fixture-case','The Moodle assignment-list case is outside its isolated fixture.');
    assertDtmAssignmentListClock(testCase,new Date().toISOString(),{reserveMs:65_000});
    const before=await dtmAssignmentListObservation(s,signal);
    s.current={caseId:testCase.id,dtmAssignmentList:before};
    return testCase.fixtureKey==='anonymous'?{}:{token:s.users[0].token};
  }
  if(fixtureMode!==undefined||fixtureFamily!==undefined)fail('fixture-case','Fixture mode changed after preparation.');
  if(isElearningPublishedReadbackCase(testCase)){
    assertElearningCatalogCaseReady(testCase);
    if(!s.caseIds.has(testCase.id)||!s.previewGate)fail('fixture-case','The Digital Academy case is outside its exact Preview binding.');
    await assertRecordedFixtureLease(s,'Digital Academy published readback');
    const active=signal||s.signal;
    await s.previewGate.assertCurrent();
    for(const user of s.users)await user.renewSession({signal:active});
    const read=isElearningMetadataCase(testCase)?readMetadataObservations:readCatalogObservations;
    const before=await read(testCase,{users:s.users,publishable:s.publishable,
      fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:active});
    s.current={caseId:testCase.id,elearningPublishedReadback:before};
    return {token:s.users[0].token};
  }
  if(s.elearningPublishedReadbackOnly)fail('fixture-state','The Digital Academy published fixture cannot serve an unrelated case.');
  if(testCase?.fixtureRequirement==='service_notes_disposable'){
    serviceNoteRunnerOracle(testCase);
    if(!s.caseIds.has(testCase.id)||testCase.auth==='anonymous')
      fail('fixture-case','The service-note case is outside its selected disposable binding.');
    (signal||s.signal)?.throwIfAborted();
    if(testCase.publishedNextClass)assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});
    const plan=buildServiceNotePlan(testCase,s.users.map(user=>user.id));
    const companion=serviceNoteCompanionPlan(testCase,s.users);
    if(companion)plan.companion=companion;
    await changeServiceNoteFixture(s,plan);
    const before=await currentServiceNoteFixture(s,signal);
    s.current={caseId:testCase.id,beforeHash:before.digest,companionBefore:before.companion,serviceNotes:true};
    await saveLedger();
    return {token:s.users[0].token};
  }
  if(s.noteOnly||s.serviceNotePending)fail('fixture-state','The service-note fixture cannot serve an unrelated case or unresolved transition.');
  if(s.serviceNotePlan)await changeServiceNoteFixture(s,null);
  if(testCase?.clubAttendanceOracle!==undefined||testCase?.fixtureRequirement==='club_attendance_disposable'){
    const oracle=clubAttendanceOracle(testCase);
    if(!s.caseIds.has(testCase.id)||oracle.guest||!s.locked||!s.ledgerOwned||s.clubAttendancePending)
      fail('fixture-case','The club attendance case is outside its selected disposable owner binding.');
    const active=signal||s.signal;active?.throwIfAborted();
    await assertRecordedFixtureLease(s);
    if(!s.clubAttendancePlan){
      s.clubAttendancePlan=buildClubAttendancePlan({runId:s.runId,owners:s.users.map(user=>user.id)});
      s.clubAttendancePending=true;
      await saveLedger();
      await query(()=>feeTransaction(s,()=>changeClubAttendanceFixture(s.sql,s.clubAttendancePlan,s.identityRequests)),
        'Could not prepare the exact disposable club attendance fixture.');
      s.clubAttendancePending=false;
    }
    const beforeHash=await clubAttendanceObservation(s,oracle,active);
    s.current={caseId:testCase.id,beforeHash,clubAttendance:true};
    try{await saveLedger();}catch(error){s.current=null;throw error;}
    return {token:s.users[oracle.role==='A'?0:1].token};
  }
  if(s.clubOnly||s.clubAttendancePending)fail('fixture-state','The club attendance fixture cannot serve an unrelated case or unresolved transaction.');
  if(s.aidTransitionPending)fail('fixture-state','The preceding aid fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.dtmReportTransitionPending)fail('fixture-state','The preceding DTM report fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.elearningTransitionPending)fail('fixture-state','The preceding remote-learning fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.outlineTransitionPending)fail('fixture-state','The preceding outline access transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.dormitoryTransitionPending)fail('fixture-state','The preceding dormitory notice transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.facilityRepairTransitionPending)fail('fixture-state','The preceding repair fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if((signal||s.signal)?.aborted)fail('fixture-aborted','Evaluation was interrupted.');
  await Promise.all(s.users.map(user=>user.renewSession?.({signal:signal||s.signal})));
  const catalogBinding=s.catalogBindings?.get(testCase.id);
  if(testCase.fixtureRequirement==='published_catalog_binding'&&!catalogBinding)fail('fixture-unsupported','Published catalog fixture binding is unavailable; this case remains in the denominator and no model request may run.');
  const checkCatalog=()=>verifyPublishedCatalogBinding(testCase,catalogBinding,{userIds:s.users.map(user=>user.id),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch})});
  const catalog=catalogBinding?await checkCatalog():null;
  const catalogOnly=Boolean(catalogBinding&&(testCase.expected?.requiredTools||[]).every(key=>key==='courseCatalog'));
  const expected=fixtureForCase(testCase,{userId:s.users[0].id,now:s.now});
  assertSupported(testCase,expected);
  const nativePlan=transcript?.publishedSamplePlan??(catalogOnly?null:await readNativeBindings(expected,testCase));
  const supplementalPlan=planSupplementalFixture(expected,{userId:s.users[0].id,otherUserId:s.users[1].id,domains:(testCase.expected?.requiredTools||[]).filter(key=>Object.hasOwn(SUPPLEMENTAL_SCOPES,key))});
  const aidPlan=['aidPayments','empty:aidPayments'].includes(testCase.fixtureKey)?buildAidPaymentFixturePlan({
    runId:s.runId,fixtureKey:testCase.fixtureKey,owners:Object.fromEntries(s.users.map((user,index)=>{
      const request=s.identityRequests.find(row=>row.id===user.id);
      return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
    })),
  }):null;
  if(!aidPlan&&(testCase.expected?.requiredTools||[]).includes('aidPayments'))fail('fixture-unsupported','No independent aid payment fixture is declared for this case.');
  const dtmReportPlan=/^(?:(?:empty|full):)?dtmGradeReport$/u.test(testCase.fixtureKey??'')?buildDtmGradeReportFixturePlan({
    runId:s.runId,fixtureKey:testCase.fixtureKey,owners:Object.fromEntries(s.users.map((user,index)=>{
      const request=s.identityRequests.find(row=>row.id===user.id);
      return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
    })),
    courseBindings:{
      A:{...pick(expected.dtm.courses.find(row=>row.id===dtmGradeReportFixtureManifest.A.course.id)||{},['id','code','title','term','role','sourceMode']),userId:s.users[0].id},
      B:{...dtmGradeReportFixtureManifest.B.course,id:s.foreignDtmCourseId,userId:s.users[1].id},
    },
  }):null;
  if(!dtmReportPlan&&(testCase.expected?.requiredTools||[]).includes('dtmGradeReport'))fail('fixture-unsupported','No independent DTM report fixture is declared for this case.');
  const enrollmentFixtureKey=testCase.fixtureKey==='elearningOutline:mixed-enrollments'?'elearningEnrollments':testCase.fixtureKey;
  const elearningPlan=/^(?:empty:)?elearningEnrollments$/u.test(enrollmentFixtureKey??'')
    ?elearningFixturePlan(enrollmentFixtureKey,s.users.map(user=>user.id)):null;
  if(!elearningPlan&&(testCase.expected?.requiredTools||[]).includes('elearningEnrollments'))
    fail('fixture-unsupported','No independent remote-learning enrollment fixture is declared for this case.');
  const outlinePlan=testCase.fixtureRequirement==='native_elearning_outline'&&isOutlineFixtureKey(testCase.fixtureKey)
    ?planPublishedOutlineAccess(s.users.map(user=>user.id),testCase.fixtureKey):null;
  if(!outlinePlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('elearningOutline'))
    fail('fixture-unsupported','No independent remote-learning outline fixture is declared for this case.');
  const dormitoryPlan=testCase.fixtureRequirement==='native_dormitory_conduct'&&dormitoryConductLiveFixtureKey(testCase.fixtureKey)
    ?buildDormitoryConductFixturePlan({runId:s.runId,owners:fixtureOwnersFor(s),fixtureKey:testCase.fixtureKey}):null;
  if(!dormitoryPlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('dormitoryConduct'))
    fail('fixture-unsupported','No independent dormitory notice fixture is declared for this case.');
  const facilityRepairPlan=testCase.fixtureRequirement==='native_facility_repair'&&facilityRepairLiveFixtureKey(testCase.fixtureKey)
    ?buildFacilityRepairFixturePlan(testCase,s.users.map(user=>user.id)):null;
  if(!facilityRepairPlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('facilityRepairs'))
    fail('fixture-unsupported','No independent repair history fixture is declared for this case.');
  if(!catalogOnly&&!transcript){
    if(s.applicationFetch)s.transcriptFixture={blocked:true};
    const rows={...recordsToInsert(expected,s.users[0]),...nativePlan.rows,...supplementalPlan.rows};
    await persistSnapshot(expected,rows,testCase,nativePlan,supplementalPlan,aidPlan,dtmReportPlan,elearningPlan,facilityRepairPlan,outlinePlan,dormitoryPlan);
  }
  const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
  if(!catalogOnly){verifyReadback(actual,expected,testCase);verifyNativeFixtureReadback(actual,nativePlan);}
  if(nativePlan?.housingBedPeriodBinding)await verifyHousingBedOwnerIsolation(s,nativePlan.housingBedPeriodBinding,signal);
  const publishedSample=nativePlan?.publishedSampleBinding?await verifyPublishedSampleFixtureBinding(nativePlan,{now:s.now,
    read:()=>readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not recheck the published sample initializer union.')})}):null;
  const supplementalDomains=Object.keys(SUPPLEMENTAL_TABLES).filter(key=>s.supplementalTables.has(SUPPLEMENTAL_TABLES[key]));
  const supplemental={};
  for(const user of s.users){
    supplemental[user.id]=await readSupplementalFixtureScopes(user,supplementalDomains,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch});
    verifySupplementalFixtureReadback(supplemental[user.id],supplementalPlan,user.id);
  }
  const aid=s.aidPlan?await readAidFixtureScopes(s.aidPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
  const dtmReport=s.dtmReportPlan?await readDtmReportFixtureScopes(s.dtmReportPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
  const elearning=s.elearningPlan?await readElearningFixtureScopes(s.elearningPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
  const outline=s.outlinePlan?await currentOutlineFixture(s,signal):null;
  const dormitory=s.dormitoryPlan?await currentDormitoryFixture(s,signal):null;
  const facilityRepairs=s.facilityRepairPlan?await currentFacilityRepairFixture(s,signal):null;
  const before={snapshot:ownState(actual),supplemental,catalog,...(publishedSample?{publishedSample}:{}),...(aid?{aid}:{}),...(dtmReport?{dtmReport}:{}),...(elearning?{elearning}:{}),...(facilityRepairs?{facilityRepairs}:{}),...(outline?{outline}:{}),...(dormitory?{dormitory}:{})};
  const beforeHash=hash(before);
  if(transcript&&beforeHash!==transcript.beforeHash){
    transcript.blocked=true;
    fail('fixture-readback','The saved transcript fixture changed between turns.');
  }
  if(s.applicationFetch)s.transcriptFixture={blocked:true,nextIndex:transcript?.nextIndex??0,beforeHash,publishedSamplePlan:nativePlan};
  s.current={caseId:testCase.id,beforeHash,supplementalDomains,catalogBinding,
    ...(nativePlan?.housingBedPeriodBinding?{housingBedPeriodBinding:nativePlan.housingBedPeriodBinding}:{}),
    ...(publishedSample?{publishedSamplePlan:nativePlan}:{})};
  await saveLedger();
  await s.users[0].renewSession?.({signal:signal||s.signal});
  return {token:s.users[0].token};
}

async function verifyHousingBedOwnerIsolation(s,binding,signal){
  await verifyPublishedHousingBedBinding(binding,{read:()=>readPublishedHousingPeriods(s)});
  const other=await readSnapshot(s.users[1],{signal:signal||s.signal});
  assertFactEqual(other.housing?.assignments,[],'other disposable caller’s housing bed history');
  assertFactEqual(other.housing?.applications,[],'other disposable caller’s housing applications');
}

async function currentFacilityRepairFixture(s,signal){
  const readback=await readFacilityRepairFixtureScopes(s.facilityRepairPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch});
  await query(()=>verifyFacilityRepairFixtureDatabase(s.sql,s.facilityRepairPlan),'Could not verify persisted repair rows and event metadata.');
  return readback;
}

async function currentOutlineFixture(s,signal){
  const plan=s.outlinePlan,owners=plan.map(row=>row.user_id);
  const rows=await query(()=>readOutlineFixtureTargets(s.sql,owners),'Could not verify saved outline access.');
  assertOutlineFixtureRows(plan,rows);
  return readOutlineFixtureScopes(plan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch});
}

async function currentDormitoryFixture(s,signal){
  const plan=s.dormitoryPlan,owners=['A','B'].map(role=>plan.owners[role].id);
  const rows=await query(()=>readDormitoryFixtureTargets(s.sql,owners,plan.recordIds),'Could not verify persisted dormitory notices.');
  assertDormitoryConductFixtureRows(plan,rows);
  return readDormitoryFixtureScopes(plan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch});
}

/** Deliberately never confirms or executes a proposed assistant action. */
export async function afterCase(testCase,envelope,{signal,fixtureMode,fixtureFamily}={}){
  const s=ready();if(s.current?.caseId!==testCase.id)fail('fixture-state','afterCase() does not match the prepared case.');
  const current=s.current;
  try{
    if(current.healthMetadata){
      if(fixtureMode!==healthMetadataFixtureMode||fixtureFamily!==healthMetadataFamily)
        fail('fixture-case','Health metadata is outside the prepared isolated fixture.');
      const oracle=healthMetadataCase(testCase);
      const plan=s.healthMetadataFixture.current();
      const sensitive=[...plan.recordIds,...s.users.flatMap(user=>[user.id,user.token]),...s.identityRequests.map(request=>request.email)];
      const output=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
      if(sensitive.some(marker=>marker&&output.includes(marker.toLowerCase()))){
        envelope.body={error:'Health metadata identity isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The assistant exposed a disposable identity, credential or record ID.');
      }
      const after=await healthMetadataObservation(s,oracle.page,signal);
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
        healthMetadata:bindHealthMetadataReadback(testCase,envelope,{before:current.healthMetadata,after})};
      envelope.stateBefore={ownedRecordsDigest:current.healthMetadata.rowsSha256};
      envelope.stateAfterProposal={ownedRecordsDigest:after.rowsSha256};
      return;
    }
    if(current.dtmAssignmentList){
      if(fixtureMode!==dtmAssignmentListFixtureMode||fixtureFamily!==s.dtmAssignmentListFamily
        ||!isDeepStrictEqual(testCase,s.dtmAssignmentListCases.get(testCase.id)))
        fail('fixture-case','The Moodle assignment-list case changed after dispatch.');
      const output=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
      const other=s.users[1];
      const plan=s.dtmAssignmentListPlan;
      const foreignIds=[...plan.courses.filter(row=>row.user_id===other.id),
        ...plan.assignments.filter(row=>row.student_id===other.studentId)].map(row=>row.id);
      const identityMarkers=s.users.flatMap(user=>[user.id,user.studentId,user.token]).concat(s.identityRequests.map(request=>request.email));
      if([...foreignIds,...identityMarkers].some(marker=>marker&&output.includes(marker.toLowerCase()))){
        envelope.body={error:'Moodle assignment-list fixture isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The response disclosed a disposable caller identity, credential or foreign record.');
      }
      const after=await dtmAssignmentListObservation(s,signal);
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
        dtmAssignmentList:bindDtmAssignmentListReadback(testCase,envelope,{before:current.dtmAssignmentList,after,
          checkedAfter:testCase.assignmentListClock?new Date().toISOString():undefined})};
      return;
    }
    if(current.elearningPublishedReadback){
      assertElearningCatalogCaseReady(testCase);
      const output=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
      const identityMarkers=s.users.flatMap(user=>[user.id,user.token]).concat(s.identityRequests.map(request=>request.email));
      if(identityMarkers.some(marker=>marker&&output.includes(marker.toLowerCase()))){
        envelope.body={error:'Digital Academy identity isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The response disclosed a disposable caller identity or credential.');
      }
      await assertRecordedFixtureLease(s,'Digital Academy published readback');
      const active=signal||s.signal;
      const metadata=isElearningMetadataCase(testCase);
      const read=metadata?readMetadataObservations:readCatalogObservations;
      const bind=metadata?bindMetadataObservation:bindCatalogObservation;
      const after=await read(testCase,{users:s.users,publishable:s.publishable,
        fetchImpl:s.boundedFetch,readResponse:readBoundedFixtureResponse,signal:active});
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
        [metadata?'elearningMetadata':'elearningCatalog']:bind(testCase,envelope,{before:current.elearningPublishedReadback,after})};
      return;
    }
    if(current.serviceNotes){
      serviceNoteRunnerOracle(testCase);
      const after=await currentServiceNoteFixture(s,signal);
      if(after.digest!==current.beforeHash||after.companion!==current.companionBefore)
        fail('fixture-unapproved-write','The disposable service-note or companion rows changed during the assistant request.');
      const output=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
      const plan=s.serviceNotePlan;
      const companionIds=plan.companion?.rows.map(row=>row.id)??[];
      if([...plan.owners,...plan.rows.map(row=>row.id),...companionIds,...s.users.map(user=>user.token)].some(marker=>output.includes(marker.toLowerCase()))){
        envelope.body={error:'Service-note fixture identity isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The response disclosed a disposable credential or record identifier.');
      }
      envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
      envelope.stateAfterProposal={ownedRecordsDigest:after.digest};
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
        serviceNotes:{caseId:testCase.id,twoOwnersVerified:true,method:'caller RLS and persisted notes',
          ...(plan.companion?{companion:{kind:plan.companion.kind,before:current.companionBefore,after:after.companion,
            validUntil:plan.companion.clock?.validUntil??null}}:{})}};
      return;
    }
    if(current.clubAttendance){
      const oracle=clubAttendanceOracle(testCase);
      const after=await clubAttendanceObservation(s,oracle,signal||s.signal);
      if(after!==current.beforeHash)fail('fixture-unapproved-write','Saved attendance fixture rows changed during the assistant request.');
      const emitted=JSON.stringify([envelope.body,envelope.events]);
      if([...s.clubAttendancePlan.ids,...s.clubAttendancePlan.owners].some(marker=>emitted.toLowerCase().includes(marker.toLowerCase()))){
        envelope.body={error:'Club attendance fixture identity isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The assistant exposed a disposable account or record identifier.');
      }
      envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
      envelope.stateAfterProposal={ownedRecordsDigest:after};
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
        clubAttendance:{page:oracle.page,role:oracle.role,twoOwnersVerified:true}};
      return;
    }
    if(s.feeFixture){
      if(fixtureMode!==FEE_FIXTURE_MODE||fixtureFamily!==current.fixtureFamily)fail('fixture-state','Fee fixture scope changed during evaluation.');
      const after=await s.feeFixture.lifecycle.verifyUnchanged();
      if(after.digest!==current.beforeHash)fail('fixture-unapproved-write','The fee records changed during the assistant request.');
      const publicReply=JSON.stringify({body:envelope.body,events:envelope.events});
      const ownerMarkers=[s.feeFixture.owners.B.id,s.feeFixture.students.B.id,s.feeFixture.owners.B.email];
      if(ownerMarkers.some(marker=>publicReply.includes(marker))){
        envelope.body={error:'Fee fixture account isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The assistant exposed a disposable foreign identity.');
      }
      envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
      envelope.stateAfterProposal={ownedRecordsDigest:after.digest};
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true};
      return;
    }
    const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
    if(current.housingBedPeriodBinding)await verifyHousingBedOwnerIsolation(s,current.housingBedPeriodBinding,signal);
    let publishedSample=null;
    if(current.publishedSamplePlan){
      verifyNativeFixtureReadback(actual,current.publishedSamplePlan);
      publishedSample=await verifyPublishedSampleFixtureBinding(current.publishedSamplePlan,{now:s.now,
        read:()=>readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not recheck the published sample initializer union.')})});
    }
    const supplemental={};
    for(const user of s.users)supplemental[user.id]=await readSupplementalFixtureScopes(user,current.supplementalDomains,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch});
    const catalog=current.catalogBinding?await verifyPublishedCatalogBinding(testCase,current.catalogBinding,{userIds:s.users.map(user=>user.id),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch})}):null;
    const aid=s.aidPlan?await readAidFixtureScopes(s.aidPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
    const dtmReport=s.dtmReportPlan?await readDtmReportFixtureScopes(s.dtmReportPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
    const elearning=s.elearningPlan?await readElearningFixtureScopes(s.elearningPlan,s.users,{origin:s.origin,signal:signal||s.signal,fetchImpl:s.previewReadbackFetch}):null;
    const outline=s.outlinePlan?await currentOutlineFixture(s,signal):null;
    const dormitory=s.dormitoryPlan?await currentDormitoryFixture(s,signal):null;
    const facilityRepairs=s.facilityRepairPlan?await currentFacilityRepairFixture(s,signal):null;
    if(testCase.publishedNextClass)assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});
    const afterHash=hash({snapshot:ownState(actual),supplemental,catalog,...(publishedSample?{publishedSample}:{}),...(aid?{aid}:{}),...(dtmReport?{dtmReport}:{}),...(elearning?{elearning}:{}),...(facilityRepairs?{facilityRepairs}:{}),...(outline?{outline}:{}),...(dormitory?{dormitory}:{})});
    envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
    envelope.stateAfterProposal={ownedRecordsDigest:afterHash};
    if(afterHash!==current.beforeHash)fail('fixture-unapproved-write','Generating an answer or proposal changed the fixture records before confirmation.');
    envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true,
      ...(elearning&&Object.keys(elearning).length===2
        ?{elearningEnrollment:{caseId:testCase.id,twoOwnersVerified:true}}:{}),
      ...(current.housingBedPeriodBinding?{publishedHousingBedPeriod:{...current.housingBedPeriodBinding,otherCallerEmpty:true}}:{})};
    if(s.applicationFetch&&envelope.statusCode===200){
      s.transcriptFixture.nextIndex++;
      s.transcriptFixture.blocked=false;
    }
  }finally{s.current=null;await saveLedger();}
}

/** Removes only this lifecycle's fresh users and proves cascaded data is absent. */
export function reconcileFixtureIdentity(request,rows){
  if(!request||!UUID.test(request.runId||'')||typeof request.email!=='string'||
    request.id!==undefined&&!UUID.test(request.id)||!['pending','uncertain','created','rejected'].includes(request.state)||!Array.isArray(rows)||rows.length>1)
    fail('fixture-cleanup','Fixture identity reconciliation could not establish a unique owned account.');
  if(!rows.length)return {userId:null,unresolved:['pending','uncertain'].includes(request.state)};
  const row=rows[0];
  if(!UUID.test(row?.id||'')||row.email?.toLowerCase()!==request.email.toLowerCase()||row.run_id!==request.runId||request.id&&request.id!==row.id)
    fail('fixture-cleanup','Reserved identity ownership does not match this run; no existing account will be deleted.');
  return {userId:row.id,unresolved:false};
}

/** Only the exact four-turn application fixture exposes this metadata. No
 * access token, email, student identifier or mutable state escapes. */
export function transcriptFixtureIdentity(){
  const s=ready();
  if(!s.applicationFetch||!s.locked||!s.ledgerOwned||s.users.length!==2||s.users.some(user=>!UUID.test(user.id)))
    fail('fixture-state','The reserved transcript fixture is not ready.');
  return Object.freeze({ownerId:s.users[0].id});
}

export async function reserveTranscriptConversation({conversationId,journal}={}){
  const s=ready(),{ownerId}=transcriptFixtureIdentity();
  if(s.transcriptConversation)fail('fixture-state','This fixture already reserved a transcript conversation.');
  const owners=s.users.map(user=>{
    const matches=s.identityRequests.filter(request=>request.id===user.id&&request.runId===s.runId&&request.state==='created');
    if(matches.length!==1)fail('fixture-state','The transcript owner is not an exact disposable identity.');
    return {id:user.id,email:matches[0].email};
  });
  const fixture=createTranscriptConversationFixture({runId:s.runId,owners,conversationId,journal,sql:s.sql,
    assertLease:async()=>{
      if(state!==s||!s.locked||s.closed||!s.ledgerOwned)fail('fixture-lease','The transcript fixture lease is unavailable.');
      if(!s.closing)s.signal?.throwIfAborted();
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));return true;
    },
    persist:async record=>{
      if(state!==s||s.closed||!s.ledgerOwned)fail('fixture-ledger','The transcript cleanup ledger is unavailable.');
      s.transcriptConversationRecovery=record;await saveLedger();
    }});
  // Keep a failed reservation attached: cleanup must not cascade an unexpected
  // pre-existing conversation or lose the reserved-ID collision evidence.
  s.transcriptConversation=fixture;
  await fixture.reserve();
  return Object.freeze({ownerId,conversationId,readback:async()=>{
    if(ready()!==s)fail('fixture-state','The transcript fixture changed.');
    return fixture.readback();
  }});
}

export async function cleanup(){
  const s=state;if(!s)return {verified:true,createdUsers:0};
  // Deletion/reconciliation uses the administrative client, never these tokens.
  // Clear before any await, including failed/uncertain cleanup and closed retry.
  for(const user of s.users)user.token=null;
  if(s.closed){
    for(const user of s.users)user.token=null;
    fail('fixture-cleanup','The previous cleanup could not be completed and its connection is closed; use the retained private ledger for explicit recovery before another fixture run.');
  }
  s.closing=true;let verified=false,protectedOwnerUnchanged=false,cleanupError;
  // A changed email must not hide a known ID from ownership validation.
  const readFixtureIdentityRows=request=>query(()=>s.sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id from auth.users
    where lower(email)=lower(${request.email}) or id=${request.id??null}::uuid limit 2`,'Could not reconcile the pending fixture identity.');
  try{
    let unresolvedCreation=false;const deletable=new Map(),absent=new Set();
    if((s.identityRequests.length||s.users.length)&&!s.ledgerOwned)fail('fixture-cleanup','Fixture identities have no owned cleanup ledger; no account will be deleted.');
    if(s.identityRequests.length||s.users.length||s.ledgerOwned)checkedProtectedOwnerFingerprint(s.protectedOwnerBefore);
    if(s.protectedOwnerBefore&&(s.users.some(user=>user.id===s.protectedOwnerBefore.id)||s.identityRequests.some(request=>request.id===s.protectedOwnerBefore.id||request.email?.toLowerCase()===s.protectedOwnerEmail?.toLowerCase())))
      fail('fixture-protected-owner','The protected owner cannot be treated as a disposable fixture; no account will be deleted.');
    for(const request of s.identityRequests){
      if(request.runId!==s.runId||request.id!==undefined&&!UUID.test(request.id))fail('fixture-cleanup','The fixture recovery request does not belong to this lifecycle.');
      const rows=await readFixtureIdentityRows(request);
      const resolved=reconcileFixtureIdentity(request,rows);
      if(resolved.userId&&resolved.userId===s.protectedOwnerBefore.id)fail('fixture-protected-owner','The protected owner cannot be treated as a disposable fixture; no account will be deleted.');
      unresolvedCreation ||= resolved.unresolved;
      if(resolved.userId&&!s.users.some(user=>user.id===resolved.userId))s.users.push({id:resolved.userId,token:null});
      if(resolved.userId){request.id=resolved.userId;request.state='created';deletable.set(resolved.userId,request);}
      else if(request.id)absent.add(request.id);
    }
    if(s.users.some(user=>!UUID.test(user.id)||!deletable.has(user.id)&&!absent.has(user.id)))fail('fixture-cleanup','A known fixture identity could not be reconciled; no account will be deleted.');
    if(s.ledgerOwned)await saveLedger();
    if(s.transcriptConversation){
      await s.transcriptConversation.cleanup();
      await saveLedger();
    }
    if(s.feeFixture?.lifecycle){
      await s.feeFixture.lifecycle.cleanup();
      await saveLedger();
    }
    if(s.internshipChargePlan){
      await assertRecordedFixtureLease(s,'Internship charge cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupInternshipCharges(s.sql,s.internshipChargePlan)),
        'Could not reconcile the exact disposable Internship companion rows; the cleanup ledger is retained.');
    }
    if(s.internshipTimetablePlan){
      await assertRecordedFixtureLease(s,'Internship timetable cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupInternshipTimetable(s.sql,s.internshipTimetablePlan,s.internshipTimetableState)),
        'Could not reconcile the exact disposable Internship timetable students; the cleanup ledger is retained.');
    }
    if(s.internshipFixture){
      await s.internshipFixture.cleanup();
      s.internshipObservationKey=undefined;
      await saveLedger();
    }
    if(s.teachingSampleFixture){
      await s.teachingSampleFixture.cleanup();
      s.teachingObservationKey=undefined;
      await saveLedger();
    }
    if(s.studentLeaveData){
      s.studentLeaveDataCleanup=await s.studentLeaveData.lifecycle.cleanup();
      await saveLedger();
    }
    if(s.healthMetadataFixture){
      await s.healthMetadataFixture.cleanup();
      await s.healthMetadataFixture.verifyAbsent();
    }
    if(s.clubEquipmentFixture){
      await s.clubEquipmentFixture.cleanup();
      await s.clubEquipmentFixture.verifyAbsent();
    }
    if(s.tutorEvaluationFixture){
      await s.tutorEvaluationFixture.cleanup();
      await s.tutorEvaluationFixture.verifyAbsent();
    }
    if(s.serviceNotePlan||s.serviceNotePending)await changeServiceNoteFixture(s,null,{recovering:true});
    if(s.clubAttendancePlan){
      await assertRecordedFixtureLease(s);
      await query(()=>feeTransaction(s,()=>changeClubAttendanceFixture(s.sql,s.clubAttendancePlan,s.identityRequests,{cleanup:true})),
        'Could not reconcile the exact disposable club attendance rows; the cleanup ledger is retained.');
      s.clubAttendancePlan=null;s.clubAttendancePending=false;
      await saveLedger();
    }
    if(s.counselingCompound){
      await assertRecordedFixtureLease(s,'Counseling tuition cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupCounselingCompoundRows(s.sql,s.counselingCompound)),
        'Could not reconcile the exact Counseling tuition rows. The recovery ledger is retained.');
    }else if(s.counselingCancellation){
      await assertRecordedFixtureLease(s,'Counseling cancellation cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupCounselingCancellation(s.sql,s.counselingCancellation)),
        'Could not reconcile the exact disposable counseling cancellation; the cleanup ledger is retained.');
    }else if(s.counselingFixture||s.pendingCounselingFixture){
      await query(()=>feeTransaction(s,()=>transitionCounselingFixtures(s.sql,{
        previous:s.counselingFixture,next:s.pendingCounselingFixture,recovering:true,knownIds:[...s.recordIds],
      })),'Could not reconcile the exact disposable counseling rows; the cleanup ledger is retained.');
      s.counselingFixture=null;s.pendingCounselingFixture=null;
      await saveLedger();
    }
    if(s.dormitoryPlan||s.pendingDormitoryPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeDormitoryFixtureRows(s.sql,{previous:s.dormitoryPlan,next:s.pendingDormitoryPlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.dormitoryPlan=null;s.pendingDormitoryPlan=null;s.dormitoryTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable dormitory notice rows.');
      await saveLedger();
    }
    if(s.outlinePlan||s.pendingOutlinePlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeOutlineFixtureRows(s.sql,{previous:s.outlinePlan,next:s.pendingOutlinePlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.outlinePlan=null;s.pendingOutlinePlan=null;s.outlineTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable outline access rows.');
      await saveLedger();
    }
    if(s.venueProtectedPlan){
      s.venueObservationKey=undefined;
      await assertRecordedFixtureLease(s,'Venue fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>deleteVenueProtectedFixture(s.sql,s.venueProtectedPlan)),
        'Could not remove the exact disposable venue rows.');
    }
    if(s.assignmentTrackerPlan){
      await assertRecordedFixtureLease(s,'Confirmed assignment tracker cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>deleteConfirmedAssignmentTrackerRows(s.sql,s.assignmentTrackerPlan,s.assignmentTrackerJournal)),
        'Could not remove the exact disposable tracker rows, audit and receipt.');
    }
    if(s.certificateAwardPreviewPlan){
      await assertRecordedFixtureLease(s,'Certificate award fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>deleteCertificateAwardPreview(s.sql,s.certificateAwardPreviewPlan)),
        'Could not remove the exact disposable certificate award rows.');
    }
    if(s.learningSupportPreview){
      await assertRecordedFixtureLease(s,'Learning support fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupLearningSupportPreview(s.sql,s.learningSupportPreview)),
        'Could not remove the exact disposable learning support rows and operations.');
    }
    if(s.clearanceStatusPreview){
      await assertRecordedFixtureLease(s,'Graduation clearance fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>feeTransaction(s,()=>cleanupClearanceStatusPreview(s.sql,s.clearanceStatusPreview)),
        'Could not remove the exact disposable clearance applications and reviews.');
    }
    if(s.academicGradesPreview){
      await assertRecordedFixtureLease(s,'Academic grades fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>verifyAcademicGradesPreviewRows(s.sql,s.academicGradesPreview,{allowEmpty:true}),
        'Could not authorize cascade cleanup of the exact disposable academic grade rows.');
    }
    if(s.dtmStudyPreview){
      await assertRecordedFixtureLease(s,'Moodle study fixture cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      await query(()=>verifyDtmStudyPreviewRows(s.sql,s.dtmStudyPreview,{allowEmpty:true}),
        'Could not authorize cascade cleanup of the exact disposable Moodle study records.');
    }
    if(s.facilityRepairCancellation){
      await assertRecordedFixtureLease(s,'Facility repair cancellation cleanup');
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
      const {plan,command}=s.facilityRepairCancellation;
      await query(()=>feeTransaction(s,()=>deleteFacilityRepairCancellation(s.sql,plan,command)),
        'Could not remove the exact disposable repair cancellation and events.');
    }
    if(s.facilityRepairPlan||s.pendingFacilityRepairPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeFacilityRepairFixtureRows(s.sql,{previous:s.facilityRepairPlan,next:s.pendingFacilityRepairPlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.facilityRepairPlan=null;s.pendingFacilityRepairPlan=null;s.facilityRepairTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable repair records and history.');
      await saveLedger();
    }
    if(s.elearningPlan||s.pendingElearningPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await reconcileElearningFixtureRows(s.sql,{previous:s.elearningPlan,pending:s.pendingElearningPlan,identities:s.identityRequests,runId:s.runId});
          await s.sql.unsafe('commit');
          s.elearningPlan=null;s.pendingElearningPlan=null;s.elearningTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable remote-learning enrollments.');
    }
    if(s.dtmGradePreview){
      await assertRecordedFixtureLease(s,'Moodle grade cleanup');
      const remove=()=>s.dtmGradeOverview?deleteDtmGradeOverviewRows(s.sql,s.dtmGradePreview):deleteDtmGradePreview(s.sql,s.dtmGradePreview,{
        prior:s.dtmReportPlan??null,pending:s.pendingDtmReportPlan,remove:changeDtmReportFixtureRows,
      });
      await query(()=>feeTransaction(s,remove),'Could not remove the exact disposable Moodle grade and tracker records.');
      s.dtmReportPlan=null;s.pendingDtmReportPlan=null;s.dtmReportTransitionPending=false;
      await saveLedger();
    }else if(s.dtmReportPlan||s.pendingDtmReportPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await removeDtmReportFixtureRows(s.sql,{plan:s.dtmReportPlan,pending:s.pendingDtmReportPlan});
          await s.sql.unsafe('commit');
          s.dtmReportPlan=null;s.pendingDtmReportPlan=null;s.dtmReportTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable DTM report records.');
    }
    if(s.aidPlan||s.pendingAidPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await removeAidFixtureRows(s.sql,{plan:s.aidPlan,pending:s.pendingAidPlan});
          await s.sql.unsafe('commit');
          s.aidPlan=null;s.pendingAidPlan=null;s.aidTransitionPending=false;
        }
        catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable aid payment records.');
    }
    if(s.tuitionLedgerPlan){
      await assertRecordedFixtureLease(s,'Tuition ledger cleanup');
      await query(()=>feeTransaction(s,()=>deleteTuitionLedgerPreviewState(s.sql,s.tuitionLedgerPlan)),
        'Could not remove the exact disposable tuition ledger rows.');
    }
    if(s.dtmTimingPlan){
      await assertRecordedFixtureLease(s,'Moodle timing cleanup');
      await query(()=>feeTransaction(s,()=>deleteDtmTimingRows(s.sql,s.dtmTimingPlan)),'Could not remove the exact disposable Moodle timing records.');
    }
    for(const user of [...s.users].reverse().filter(user=>deletable.has(user.id))){
      const request=deletable.get(user.id),backoffs=[1000,4000];
      let deleted=false;
      for(let attempt=0;attempt<=backoffs.length;attempt++){
        let status;
        try{
          const result=await s.admin.auth.admin.deleteUser(user.id);
          if(!result.error||result.error.status===404){deleted=true;break;}
          status=result.error.status;
        }catch{/* A network failure may follow a committed deletion. */}
        const retry=attempt<backoffs.length&&(!(status>=400&&status<500)||status===408||status===429);
        if(retry)await pause(backoffs[attempt]);
        const rows=await readFixtureIdentityRows(request);
        if(!reconcileFixtureIdentity(request,rows).userId){deleted=true;break;}
        if(!retry)break;
      }
      if(!deleted)fail('fixture-cleanup','Disposable account removal failed; exact IDs remain in the owner-only cleanup ledger.');
      user.token=null;
    }
    if(s.users.length){
      const ids=s.users.map(user=>user.id);
      const remaining=await query(()=>s.sql`select 'auth' as kind,id from auth.users where id in ${s.sql(ids)}
        union all select 'profile',user_id from public.affairs_profiles where user_id in ${s.sql(ids)}
        union all select 'student',id from public.affairs_students where user_id in ${s.sql(ids)}
        union all select 'dtm',id from public.dtm_courses where user_id in ${s.sql(ids)}
        union all select 'service',id from public.affairs_service_records where user_id in ${s.sql(ids)}`,'Could not verify disposable fixture cleanup.');
      if(remaining.length)fail('fixture-cleanup','Fixture-owned rows remain; the private cleanup ledger is retained.');
      if(s.outlineTouched){
        const access=await query(()=>readOutlineFixtureTargets(s.sql,ids),'Could not verify outline access cleanup.');
        if(access.length)fail('fixture-cleanup','Fixture-owned outline access remains.');
      }
      if(s.dormitoryTouched){
        const notices=await query(()=>readDormitoryFixtureTargets(s.sql,ids),'Could not verify dormitory notice cleanup.');
        if(Object.values(notices).some(rows=>rows.length))fail('fixture-cleanup','Fixture-owned dormitory records remain.');
      }
      for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments',...(s.supplementalTables||[])]){
        const native=await query(()=>table==='elearning_enrollments'
          ?s.sql`select user_id from public.elearning_enrollments where user_id in ${s.sql(ids)} limit 1`
          :s.sql`select id from ${s.sql('public.'+table)} where user_id in ${s.sql(ids)} limit 1`,'Could not verify native fixture cleanup.');
        if(native.length)fail('fixture-cleanup','Native fixture-owned rows remain; the private cleanup ledger is retained.');
      }
    }
    if(s.dtmAssignmentListPlan){
      const ids=s.dtmAssignmentListPlan.recordIds;
      const remaining=await query(()=>s.sql`select id from public.dtm_courses where id in ${s.sql(ids)}
        union all select id from public.affairs_assignments where id in ${s.sql(ids)}`,
        'Could not verify exact Moodle assignment-list cleanup.');
      if(remaining.length)fail('fixture-cleanup','Reserved Moodle assignment-list rows remain.');
    }
    if(s.fixtureMode==='confirmed-task-actions'&&s.users.length===2){
      const ids=s.users.map(user=>user.id);
      const remaining=await query(()=>readConfirmedTaskRows(s.sql,ids),'Could not verify task and receipt cleanup.');
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)}`,'Could not verify task fixture identity cleanup.');
      if(identities.length||!isDeepStrictEqual(remaining,{tasks:[],audits:[],receipts:[]}))
        fail('fixture-cleanup','A task fixture identity, task, audit or receipt remains.');
      s.taskActionCleanup=true;
    }
    if(s.tuitionLedgerPlan){
      const remaining=await query(()=>readTuitionLedgerPreviewState(s.sql,s.tuitionLedgerPlan),'Could not verify tuition ledger cleanup.');
      const ids=s.tuitionLedgerPlan.accounts.map(account=>account.userId);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)} limit 1`,'Could not verify tuition ledger identity cleanup.');
      if(!isEmptyTuitionLedgerPreviewState(remaining)||identities.length)
        fail('fixture-cleanup','An exact tuition ledger row or disposable identity remains.');
      s.tuitionLedgerCleanup=true;
    }
    if(s.dtmMaterialPreview){
      const plan=s.dtmMaterialPreview.plan;
      const remaining=await query(()=>readDtmMaterialPreviewRows(s.sql,plan),'Could not prove exact Moodle material cleanup.');
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(plan.ownerIds)} limit 1`,
        'Could not verify Moodle material identity cleanup.');
      if(remaining.courses.length||remaining.materials.length||identities.length)
        fail('fixture-cleanup','A reserved Moodle course, material or disposable identity remains.');
      s.dtmMaterialPreviewCleanup=true;
    }
    if(s.dtmTimingPlan){
      const remaining=await query(()=>readDtmTimingState(s.sql,s.dtmTimingPlan),'Could not verify Moodle timing cleanup.');
      const ids=s.dtmTimingPlan.owners.map(owner=>owner.id);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)} limit 1`,
        'Could not verify Moodle timing identity cleanup.');
      if(!emptyDtmTimingState(remaining)||identities.length)
        fail('fixture-cleanup','An exact Moodle timing row, queue entry or disposable identity remains.');
      s.dtmTimingCleanup=true;
    }
    if(s.dtmGradePreview){
      await query(()=>verifyDtmGradePreviewAbsent(s.sql,s.dtmGradePreview),'Could not prove exact Moodle grade fixture cleanup.');
      s.dtmGradePreviewCleanup=true;
    }
    if(s.counselingCancellation){
      await verifyCounselingCancellationAbsent(s.sql,s.counselingCancellation);
      const ids=s.users.map(user=>user.id);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)}`,
        'Could not verify counseling cancellation fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A counseling cancellation fixture identity remains.');
      s.counselingCancellationCleanup=true;
    }
    if(s.venueProtectedPlan){
      await query(()=>verifyVenueProtectedFixtureAbsent(s.sql,s.venueProtectedPlan),'Could not prove exact venue cleanup.');
      s.venueProtectedCleanup=true;
    }
    if(s.assignmentTrackerPlan){
      await query(()=>verifyConfirmedAssignmentTrackerAbsent(s.sql,s.assignmentTrackerPlan),'Could not prove exact tracker and caller cleanup.');
      s.assignmentTrackerCleanup=true;
    }
    if(s.certificateAwardPreviewPlan){
      s.certificateAwardCatalogUnchanged=await query(()=>verifyCertificateAwardPreviewAbsent(s.sql,s.certificateAwardPreviewPlan),
        'Could not prove exact certificate award cleanup.');
      s.certificateAwardPreviewCleanup=true;
    }
    if(s.learningSupportPreview){
      await query(()=>verifyLearningSupportPreviewAbsent(s.sql,s.learningSupportPreview),'Could not prove exact learning support cleanup.');
      s.learningSupportPreviewCleanup=true;
    }
    if(s.clearanceStatusPreview){
      s.clearanceStatusSharedUnchanged=await query(()=>verifyClearanceStatusPreviewAbsent(s.sql,s.clearanceStatusPreview),
        'Could not prove exact clearance cleanup.');
      s.clearanceStatusPreviewCleanup=true;
    }
    if(s.academicGradesPreview){
      const plan=s.academicGradesPreview;
      await query(()=>verifyAcademicGradesPreviewRows(s.sql,plan,{expectEmpty:true}),'Could not verify academic grades fixture cleanup.');
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(plan.ownerIds)} limit 1`,
        'Could not verify academic grade fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A reserved academic grades fixture identity remains.');
      s.academicGradesPreviewCleanup=true;
    }
    if(s.dtmStudyPreview){
      const plan=s.dtmStudyPreview;
      await query(()=>verifyDtmStudyPreviewRows(s.sql,plan,{expectEmpty:true}),'Could not verify Moodle study fixture cleanup.');
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(plan.ownerIds)} limit 1`,
        'Could not verify Moodle study fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A reserved Moodle study fixture identity remains.');
      s.dtmStudyPreviewCleanup=true;
    }
    if(s.facilityRepairCancellation){
      const {plan,command}=s.facilityRepairCancellation;
      await query(()=>verifyFacilityRepairCancellationAbsent(s.sql,plan,command),'Could not prove exact facility repair cancellation cleanup.');
      s.facilityRepairCancellationCleanup=true;
    }
    if(s.healthMetadataFixture)await s.healthMetadataFixture.verifyAbsent();
    if(s.internshipFixture)await s.internshipFixture.verifyAbsent();
    if(s.internshipChargePlan){
      await verifyInternshipChargesAbsent(s.sql,s.internshipChargePlan);
      s.internshipChargeCleanup=true;
    }
    if(s.counselingCompound){
      const {appointmentPlan,chargePlan}=s.counselingCompound;
      await verifyCounselingFixtureAbsent(s.sql,appointmentPlan);
      await verifyOwnedChargeRowsAbsent(s.sql,chargePlan);
      const ownerIds=Object.values(appointmentPlan.owners).map(owner=>owner.id);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ownerIds)} limit 1`,
        'Could not verify Counseling tuition fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A reserved Counseling tuition fixture identity remains.');
      s.counselingCompoundCleanup=true;
    }
    if(s.internshipTimetablePlan){
      await verifyInternshipTimetableAbsent(s.sql,s.internshipTimetablePlan,s.internshipTimetableState);
      s.internshipTimetableCleanup=true;
    }
    if(s.teachingSampleFixture){
      await s.teachingSampleFixture.verifyAbsent();
      const ids=s.users.map(user=>user.id);
      const identities=await s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)} limit 1`;
      if(identities.length)fail('fixture-cleanup','A teaching fixture identity remains.');
      s.teachingSampleCleanup=true;
    }
    if(s.clubEquipmentFixture){
      await s.clubEquipmentFixture.verifyAbsent();
      const ids=s.users.map(user=>user.id);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)}`,
        'Could not verify club equipment fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A club equipment fixture identity remains.');
      s.clubEquipmentCleanup=true;
    }
    if(s.tutorEvaluationFixture){
      await s.tutorEvaluationFixture.verifyAbsent();
      const ids=s.users.map(user=>user.id);
      const identities=await query(()=>s.sql`select 1 from auth.identities where user_id in ${s.sql(ids)}`,
        'Could not verify tutor evaluation fixture identity cleanup.');
      if(identities.length)fail('fixture-cleanup','A tutor evaluation fixture identity remains.');
      s.tutorEvaluationCleanup=true;
    }
    if(s.transcriptConversation)s.transcriptConversationCleanup=await s.transcriptConversation.verifyAbsent();
    // A timed-out create with no row yet may still commit later. Keep the
    // exact private recovery intent and never turn an absent row into success.
    if(unresolvedCreation)fail('fixture-cleanup','An Auth creation outcome is still uncertain; the exact pending identity is retained in the private recovery ledger.');
    verified=true;
  }catch(error){cleanupError=error;}
  finally{
    // Verify even after failed cleanup, before releasing the reserved lock.
    // This asserts identity/profile preservation, not all owner records.
    if(s.protectedOwnerBefore){
      try{
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        protectedOwnerUnchanged=true;
      }catch{cleanupError=new LiveFixtureError('fixture-protected-owner','Protected owner preservation could not be verified; the recovery ledger is retained for independent review.');}
    }
    try{if(s.locked)await s.sql`select pg_advisory_unlock(23101314,115100)`;}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not release the fixture advisory lock.');}
    try{await s.sql?.release?.();}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not release the reserved fixture database connection.');}
    try{await s.db?.end({timeout:5});}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not close the fixture database connection.');}
    for(const user of s.users)user.token=null;
    s.closed=true;
  }
  if(verified&&!cleanupError){
    try{
      if(s.ledgerOwned){if(s.ledgerTempOwned)await rm(s.ledger+'.tmp',{force:true});await rm(s.ledger,{force:true});}
      state=undefined;
    }catch{cleanupError=new LiveFixtureError('fixture-cleanup','Fixture rows were removed, but the owned recovery ledger could not be cleared.');}
  }
  if(cleanupError){if(cleanupError instanceof LiveFixtureError)throw cleanupError;fail('fixture-cleanup','Cleanup could not be verified; the private ledger is retained.');}
  return {verified:true,createdUsers:s.users.length,projectRef:PROJECT,protectedOwnerUnchanged,
    ...(s.assignmentTrackerCleanup?{assignmentTrackerCleanup:true}:{}),
    ...(s.taskActionCleanup?{taskActionCleanup:true}:{}),
    ...(s.tuitionLedgerCleanup?{tuitionLedgerCleanup:true}:{}),
    ...(s.dtmTimingCleanup?{dtmTimingCleanup:true}:{}),
    ...(s.dtmMaterialPreviewCleanup?{dtmMaterialPreviewCleanup:true}:{}),
    ...(s.dtmGradePreviewCleanup?{dtmGradePreviewCleanup:true}:{}),
    ...(s.tutorEvaluationCleanup?{tutorEvaluationCleanup:true}:{}),
    ...(s.clubEquipmentCleanup?{clubEquipmentCleanup:true}:{}),
    ...(s.counselingCancellationCleanup?{counselingCancellationCleanup:true}:{}),
    ...(s.counselingCompoundCleanup?{counselingCompoundCleanup:true}:{}),
    ...(s.venueProtectedCleanup?{venueProtectedCleanup:true}:{}),
    ...(s.certificateAwardPreviewCleanup?{certificateAwardPreviewCleanup:true,certificateAwardCatalogUnchanged:s.certificateAwardCatalogUnchanged}:{}),
    ...(s.facilityRepairCancellationCleanup?{facilityRepairCancellationCleanup:true}:{}),
    ...(s.learningSupportPreviewCleanup?{learningSupportPreviewCleanup:true}:{}),
    ...(s.clearanceStatusPreviewCleanup?{clearanceStatusPreviewCleanup:true,clearanceStatusSharedUnchanged:s.clearanceStatusSharedUnchanged}:{}),
    ...(s.academicGradesPreviewCleanup?{academicGradesPreviewCleanup:true}:{}),
    ...(s.dtmStudyPreviewCleanup?{dtmStudyPreviewCleanup:true}:{}),
    ...(s.internshipFixture?{internshipCleanup:true}:{}),
    ...(s.internshipChargeCleanup?{internshipChargeCleanup:true}:{}),
    ...(s.internshipTimetableCleanup?{internshipTimetableCleanup:true}:{}),
    ...(s.teachingSampleCleanup?{teachingSampleCleanup:true}:{}),
    ...(s.studentLeaveData?{studentLeaveDataCleanup:s.studentLeaveDataCleanup}:{}),
    ...(s.transcriptConversation?{conversationCleanup:s.transcriptConversationCleanup}:{})};
}
