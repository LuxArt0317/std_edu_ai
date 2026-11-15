import {answerVenueRequests} from '../server/accountVenueRequestAnswer.js';
import {openVenueObservation,venueObservationHeader} from '../server/venueObservation.js';
import {answerClubActivityAttendance} from '../server/accountClubAttendanceAnswer.js';
import {clubAttendanceBoundary,clubAttendanceSelection} from '../server/clubAttendanceIntent.js';
import {answerClubEquipment} from '../server/accountClubEquipmentAnswer.js';
import {clubEquipmentBoundary,clubEquipmentPlan} from '../server/clubEquipmentIntent.js';
import {answerCatalogDetail} from '../server/accountCatalogDetailAnswer.js';
import {catalogDetailIntent} from '../server/catalogDetailIntent.js';
import {venueRequestBoundary,venueRequestPlan} from '../server/venueRequestIntent.js';
import {parseExplicitAccountAction} from '../server/accountActionIntent.js';
import {answerRequestedAffairsAction} from '../server/answerRequestedAffairsAction.js';
import type {VerificationProgress} from '../server/answerVerification.js';
import {accountStatusIntent} from '../server/accountStatusIntent.js';
import {answerCampusEntry,campusEntryIntent} from '../server/campusEntryContract.js';
import {answerLearningEntry,learningEntryIntent} from '../server/learningEntryContract.js';
import {answerAccountStatus} from '../server/accountStatusAnswer.js';
import {answerElearningCatalog,answerElearningMetadata,elearningCatalogBoundary,elearningMetadataBoundary} from '../server/accountElearningCatalogAnswer.js';
import {isElearningCatalogPageQuestion,selectElearningCatalogPage} from '../server/elearningCatalogPageIntent.js';
import {isElearningMetadataQuestion,selectElearningMetadata} from '../server/elearningMetadataIntent.js';
import {answerDtmMaterial} from '../server/accountDtmMaterialAnswer.js';
import {answerDtmAssignmentList} from '../server/accountDtmAssignmentListAnswer.js';
import {dtmAssignmentListBoundary,dtmAssignmentListSelection} from '../server/dtmAssignmentListIntent.js';
import {dtmMaterialBoundary,dtmMaterialIntent} from '../server/dtmMaterialIntent.js';
import {answerDtmSubmissionTiming} from '../server/accountDtmSubmissionTiming.js';
import {dtmSubmissionTimingBoundary,selectDtmSubmissionTiming} from '../server/dtmSubmissionTimingIntent.js';
import {readInternshipEvidence} from '../server/accountInternshipEvidence.js';
import {internshipAssistantPlan,internshipBoundary,internshipSelectedTools,internshipUnavailable} from '../server/internshipAssistantPlan.js';
import {readStudentLeaveEvidence} from '../server/accountStudentLeaveEvidence.js';
import {internshipObservationHeader,openInternshipObservation} from '../server/internshipObservation.js';
import {teachingObservationHeader,openTeachingObservation} from '../server/teachingFeedbackObservation.js';
import {leaveObservationHeader,openStudentLeaveObservation} from '../server/studentLeaveObservation.js';
import {studentLeaveAssistantPlan,studentLeaveBoundary,studentLeaveNavigation,studentLeaveSelectedTools,studentLeaveZeroReadDisposition} from '../server/studentLeaveAssistantPlan.js';
import {dtmNativeClauseScope,dtmNativeClauseNotice} from '../server/dtmNativeClauseScope.js';
import {dtmAssignmentLookupContext} from '../server/dtmAssignmentEvidenceIntent.js';
import {readDtmAssignmentEvidence} from '../server/accountDtmAssignmentEvidence.js';
import {studentConductScope} from '../server/studentConductEvidenceScope.js';
import {boundedAssistantText} from '../src/services/assistantActivityBudget.js';
import {studentConductGuide} from '../server/studentConductGuide.js';
import {isServiceNoteNextClass,serviceNoteLookup,serviceNotePageNavigation,serviceOperationPageNavigation} from '../server/serviceNoteIntent.js';
import {serviceNoteGuide,serviceNoteNavigationAnswer} from '../server/serviceNoteGuide.js';
import {readTutorEvaluationEvidence} from '../server/accountTutorEvaluationEvidence.js';
import {tutorEvaluationNavigation} from '../server/tutorEvaluationEvidenceIntent.js';
import {tutorEvaluationGuide} from '../server/tutorEvaluationGuide.js';
import {readClearanceEvidence} from '../server/accountClearanceEvidence.js';
import {clearanceNavigationView,clearanceTimetableQuestion} from '../server/clearanceEvidenceIntent.js';
import {clearanceDirectoryAnswer} from '../server/graduationClearanceContract.js';
import {readCounselingEvidence} from '../server/accountCounselingEvidence.js';
import {isCounselingNavigationQuestion} from '../server/counselingEvidenceIntent.js';
import {counselingGuide} from '../server/counselingContract.js';
import {readFeeRemissionEvidence} from '../server/accountFeeRemissionEvidence.js';
import {readHealthExaminationEvidence} from '../server/accountHealthExaminationEvidence.js';
import {isHealthExaminationNavigationQuestion,withoutExcludedHealthClause} from '../server/healthExaminationEvidenceIntent.js';
import {healthExaminationGuide} from '../server/healthExaminationContract.js';
import {readStudentConductEvidence} from '../server/accountStudentConductEvidence.js';
import {readStudentLoanEvidence} from '../server/accountStudentLoanEvidence.js';
import {readAidPaymentsEvidence} from '../server/accountAidPaymentsEvidence.js';
import {aidPaymentsLookupContext,aidPaymentsNavigation} from '../server/aidPaymentsEvidenceIntent.js';
import {aidPaymentsCapabilityGuide,aidPaymentsGuide,aidPaymentsUnsupportedAction} from '../server/aidPaymentsGuide.js';
import {readDtmGradeReportEvidence} from '../server/accountDtmGradeReportEvidence.js';
import {isForeignDtmGradesQuestion,isNativeDtmGradeOnlyQuestion} from '../server/dtmGradeEvidenceIntent.js';
import {independentElearningQuestion,isElearningEvidenceQuestion,isForeignElearningRecordsQuestion} from '../server/elearningEvidenceIntent.js';
import {readElearningEvidence} from '../server/accountElearningEvidence.js';
import {readFacilityRepairEvidence} from '../server/accountFacilityRepairEvidence.js';
import {isForeignFacilityRepairQuestion} from '../server/facilityRepairEvidenceIntent.js';
import {readDormitoryConductEvidence} from '../server/accountDormitoryConductEvidence.js';
import {readElearningOutlineEvidence} from '../server/accountElearningOutlineEvidence.js';
import {facilityRepairLookupContext,nativePageLookupContext,withoutExcludedNativePageClause} from '../server/accountSupplementalLookup.js';
import {selectDormitoryConductEvidence} from '../server/dormitoryConductEvidenceIntent.js';
import {randomUUID} from 'node:crypto';
import { questionKind } from '../server/schoolWebSearch.js';
import {publicServiceFollowup} from '../server/publicServiceFollowup.js';
import { accountQuestionIntent,isAccountOverviewQuestion,isCurrentStudyRecordQuestion } from '../server/affairsAnswer.js';
import { loadOwnAffairsStudyYear } from '../server/ownAffairsStudyYear.js';
import { loadAccountOverviewSnapshot } from '../server/accountOverviewEvidence.js';
import { currentStudyForeignYearQuestion } from '../server/currentStudyOwnerScope.js';
import { teachingFeedbackLookupContext } from '../server/teachingFeedbackEvidenceIntent.js';
import { teachingFeedbackGuide } from '../server/teachingFeedbackGuide.js';
import { readHousingBedEvidence, unavailableHousingBedEvidence } from '../server/accountHousingBedEvidence.js';
import { housingBedLookupContext } from '../server/housingBedEvidenceIntent.js';
import { housingBedGuide } from '../server/housingBedAnswer.js';
import {housingApplicationLookupContext} from '../server/housingApplicationEvidenceIntent.js';
import {housingApplicationGuide} from '../server/housingApplicationAnswer.js';
import {readHousingApplicationEvidence,unavailableHousingApplicationEvidence} from '../server/accountHousingApplicationEvidence.js';
import { readTeachingFeedbackEvidence,unavailableTeachingFeedbackEvidence } from '../server/accountTeachingFeedbackEvidence.js';
import { answerAccountWithVerification, requiredNativeTools, requiredSupplementalTools, type SupplementalAccountReaders } from '../server/answerVerificationAccount.js';
import { readCatalogEvidence } from '../server/accountCatalogEvidence.js';
import { readCertificateEvidence } from '../server/accountCertificateEvidence.js';
import { readSubmissionEvidence } from '../server/accountSubmissionEvidence.js';
import { readTuitionEvidence } from '../server/accountTuitionEvidence.js';
import { answerCampusNavigation,answerSchoolSystemSearch,campusDirectoryResearch } from '../server/schoolAffairsDirectory.js';
import { isDtmRecordQuestion } from '../server/dtmAnswer.js';
import { isScholarshipRecordQuestion } from '../server/scholarshipRecords.js';
import { isStudentAidRecordQuestion } from '../server/studentAidRecords.js';
import { isHousingRecordQuestion } from '../server/housingRecords.js';
import {readChargePaymentHistory} from '../server/chargePaymentHistory.js';
import {answerChargePaymentHistory,chargePaymentHistoryBoundary,selectChargePaymentHistory} from '../server/accountChargePaymentHistory.js';
import { answerDirectTuitionPayment, isOwnFeeBalanceQuestion, isPendingFeeQuestion, ownFeeBalanceLabel, savedFeeBalanceFollowup, standaloneFeeBalanceLabel } from '../server/pendingFeesAnswer.js';
import { isCreditLoadHistoryQuestion } from '../server/creditLoadHistory.js';
import { isCourseSelectionQuestion } from '../server/courseSelection.js';
import { AffairsWorkspaceError, loadAffairsSnapshot, loadOwnAffairsCharges, loadOwnServiceNotes, verifyAffairsToken, type AffairsAccount } from '../server/affairsWorkspace.js';
import {loadOwnAffairsTimetable} from '../server/ownAffairsTimetable.js';
import { createAssistantStream } from '../server/assistantStream.js';
import { readAssistantReply } from '../src/services/assistantStreamReader.js';
import researchHandler, {type ResearchApiHandler} from '../server/researchAssistantHandler.js';

type ApiRequest = {method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type ApiResponse = {status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void;write?:(chunk:string)=>void;end?:()=>void;flushHeaders?:()=>void};
type PublicResearchHandler = ResearchApiHandler;
type PublicProgress = Parameters<NonNullable<Parameters<typeof readAssistantReply>[1]>>[0];
export const config = {maxDuration:60};
const requestWindows = new Map<string,number[]>();
function value(input:string|string[]|undefined) {return Array.isArray(input)?input[0]:input;}
function hasRouteControls(text:string,spaces=false):boolean {
  return Array.from(text).some(character=>{const point=character.codePointAt(0)!;return point<=(spaces?32:31)||point===127||(point>=0xd800&&point<=0xdfff);});
}
/** Preserve validated selectors for local readers; never silently crop a URL
 * into a different lookup or accept a browser-supplied remote origin. */
export function validateAffairsAssistantRoute(input:unknown):string {
  if(input===undefined||input==='')return '';
  if(typeof input!=='string'||input.length>3100||input!==input.trim()||hasRouteControls(input,true)||/[\\#]/u.test(input)||/%(?![0-9a-f]{2})/iu.test(input))throw new TypeError('Invalid local page route.');
  const local=input.startsWith('/')&&!input.startsWith('//');
  if(!local&&!input.startsWith('https://stu.best/'))throw new TypeError('Invalid local page route.');
  let url:URL;
  try{url=new URL(input,'https://stu.best');}catch{throw new TypeError('Invalid local page route.');}
  if(url.origin!=='https://stu.best'||url.username||url.password||url.hash)throw new TypeError('Invalid local page route.');
  const full=url.pathname+url.search;
  if(full.length>3100)throw new TypeError('Invalid local page route.');
  try{
    // Reject encoded control characters, path separators and dot segments.
    // Query values retain their exact encoding for the reader's field validator.
    const rawPath=(local?input:input.slice('https://stu.best'.length)).split('?')[0];
    const path=decodeURIComponent(rawPath);
    if(hasRouteControls(path)||path.includes('\\')||/%(?:2f|5c)/i.test(url.pathname)||path.split('/').some(part=>part==='.'||part==='..'))throw new TypeError('Invalid local page route.');
    if(hasRouteControls(decodeURIComponent(url.search)))throw new TypeError('Invalid local page route.');
  }catch{throw new TypeError('Invalid local page route.');}
  return (url.pathname.replace(/\/+$/u,'')||'/')+url.search;
}
function personal(question:string,history:Array<{role:string;content:string}>=[]):boolean {
  // A signed-in question mentioning the caller or this assistant's account tools
  // must never be downgraded to public search just because the noun is novel.
  const direct=questionKind(question).personal || /\b(?:my|mine|me|i|our)\b|\b(?:what (?:details|information|data|records?) do you (?:know|have) about me|what (?:tools|actions|account (?:tools|actions)) (?:do you have|can you (?:use|do)))\b|\b(?:signed in as|add (?:a )?task|create (?:a )?task|remind me|complete (?:my |the )?task|submit (?:a )?request|publish (?:an? )?announcement)\b|我(?:的|是|能)|關於我|(?:新增|建立|完成|提交|發布).{0,25}(?:任務|待辦|申請|公告)/i.test(question)
    || /\b(?:next class|classes today|subjects today|current subjects|upcoming subjects|past subjects|historical subjects|tuition|school fees|fee balance|assignments?|homework|coursework|leave (?:status|history|records?|draft)|internship (?:status|history|records?))\b|下堂課|下一門課|今天.{0,8}(?:課|科目)|學費|繳費|費用餘額|作業|功課|請假紀錄|假單狀態|實習紀錄/i.test(question);
  if(direct || /^(?:please\s+)?(?:add|create|complete|mark|submit|publish|post|update|rename|change|set)\b|\b(?:credits?|assignments?|subjects?|enrollments?|grades?|timetable)\b|學分|作業|成績|課表/i.test(question))return true;
  const previous=[...history].reverse().find(item=>item.role==='user')?.content;
  return Boolean(previous && /^(?:and\b|how about\b|what about\b|also\b|tomorrow\b|next semester\b|next term\b|那|還有|明天)/i.test(question)
    && personal(previous));
}

/** Adapt the same deployment's handler to the existing bounded JSON/SSE reader.
 * Child headers never overwrite the outer response, and late writes after the
 * request deadline are discarded. No browser-supplied origin becomes a URL.
 */
export async function dispatchPublicResearch(handler:PublicResearchHandler,request:ApiRequest,deadline:number,onProgress:(step:PublicProgress)=>void) {
  if(deadline<=Date.now())throw new Error('School research deadline exceeded.');
  let status=200,bytes=0,started=false,ended=false,active=true;
  const headers=new Headers();
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const body=new ReadableStream<Uint8Array>({start(value){controller=value;}});
  let resolveResponse!:(response:Response)=>void,rejectResponse!:(error:unknown)=>void;
  const pendingResponse=new Promise<Response>((resolve,reject)=>{resolveResponse=resolve;rejectResponse=reject;});
  const encoder=new TextEncoder();
  function bounded(text:string) {
    const chunk=encoder.encode(text);bytes+=chunk.byteLength;
    if(bytes>300_000)throw new Error('School research response was too large.');
    return chunk;
  }
  function start() {
    if(started)return;
    resolveResponse(new Response(body,{status,headers}));started=true;
  }
  const response:ApiResponse={
    status(code){if(active&&!started)status=code;return response;},
    setHeader(name,value){if(active&&!started)headers.set(name,value);},
    flushHeaders(){if(active&&!ended)start();},
    json(payload){
      if(!active||ended)return;
      if(started)throw new Error('School research mixed JSON and streaming responses.');
      const text=JSON.stringify(payload);
      if(typeof text!=='string')throw new Error('School research returned an invalid response.');
      bounded(text);headers.set('Content-Type','application/json');
      resolveResponse(new Response(text,{status,headers}));started=true;ended=true;
    },
    write(chunk){if(active&&!ended){const encoded=bounded(chunk);start();controller.enqueue(encoded);}},
    end(){if(active&&!ended){start();controller.close();ended=true;}},
  };
  function fail(error:unknown) {
    if(!active||ended)return;
    ended=true;rejectResponse(error);controller.error(error);
  }
  // Observe rejection even if the deadline expires before the child finishes.
  // Leave time for the child to report why it stopped and for the bridge to
  // deliver that final response before the outer request expires.
  void Promise.resolve().then(()=>handler(request,response,{deadline:deadline-1_250})).then(()=>{
    if(!ended)fail(new Error('School research ended without a response.'));
  },fail);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      (async()=>{
        const result=await pendingResponse;
        return {status:result.status,ok:result.ok,result:await readAssistantReply(result,step=>{if(active)onProgress(step);})};
      })(),
      new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('School research deadline exceeded.')),Math.max(1,deadline-Date.now()));}),
    ]);
  } finally {
    active=false;if(timer!==undefined)clearTimeout(timer);
    if(!ended){ended=true;const error=new Error('School research response closed.');rejectResponse(error);controller.error(error);}
  }
}

export function createAffairsAssistantHandler(dependencies:{
  publicResearch?:PublicResearchHandler;
  verifyToken?:typeof verifyAffairsToken;
  loadSnapshot?:typeof loadAffairsSnapshot;
  answerAccount?:typeof answerAccountWithVerification;
  readers?:{internshipRecords?:typeof readInternshipEvidence;leaveRecords?:typeof readStudentLeaveEvidence;dtmAssignment?:typeof readDtmAssignmentEvidence;courseCatalog?:typeof readCatalogEvidence;enrollmentCertificate?:typeof readCertificateEvidence;dtmSubmissions?:typeof readSubmissionEvidence;tuition?:typeof readTuitionEvidence;studentConduct?:typeof readStudentConductEvidence;studentLoan?:typeof readStudentLoanEvidence;aidPayments?:typeof readAidPaymentsEvidence;dtmGradeReport?:typeof readDtmGradeReportEvidence;elearningEnrollments?:typeof readElearningEvidence;facilityRepairs?:typeof readFacilityRepairEvidence;dormitoryConduct?:typeof readDormitoryConductEvidence;elearningOutline?:typeof readElearningOutlineEvidence;feeRemission?:typeof readFeeRemissionEvidence;healthExaminations?:typeof readHealthExaminationEvidence;counselingAppointments?:typeof readCounselingEvidence;graduationClearance?:typeof readClearanceEvidence;tutorEvaluation?:typeof readTutorEvaluationEvidence;teachingFeedback?:typeof readTeachingFeedbackEvidence;housingBed?:typeof readHousingBedEvidence;housingApplications?:typeof readHousingApplicationEvidence};
}={}) {
const publicResearch=dependencies.publicResearch??researchHandler;
const verifyToken=dependencies.verifyToken??verifyAffairsToken,loadSnapshot=dependencies.loadSnapshot??loadAffairsSnapshot,answerAccount=dependencies.answerAccount??answerAccountWithVerification;
const readers={internshipRecords:dependencies.readers?.internshipRecords??readInternshipEvidence,leaveRecords:dependencies.readers?.leaveRecords??readStudentLeaveEvidence,dtmAssignment:dependencies.readers?.dtmAssignment??readDtmAssignmentEvidence,courseCatalog:dependencies.readers?.courseCatalog??readCatalogEvidence,enrollmentCertificate:dependencies.readers?.enrollmentCertificate??readCertificateEvidence,
  dtmSubmissions:dependencies.readers?.dtmSubmissions??readSubmissionEvidence,tuition:dependencies.readers?.tuition??readTuitionEvidence,
  studentConduct:dependencies.readers?.studentConduct??readStudentConductEvidence,studentLoan:dependencies.readers?.studentLoan??readStudentLoanEvidence,
  aidPayments:dependencies.readers?.aidPayments??readAidPaymentsEvidence,
  dtmGradeReport:dependencies.readers?.dtmGradeReport??readDtmGradeReportEvidence,
  elearningEnrollments:dependencies.readers?.elearningEnrollments??readElearningEvidence,
  facilityRepairs:dependencies.readers?.facilityRepairs??readFacilityRepairEvidence,
  dormitoryConduct:dependencies.readers?.dormitoryConduct??readDormitoryConductEvidence,
  elearningOutline:dependencies.readers?.elearningOutline??readElearningOutlineEvidence,
  feeRemission:dependencies.readers?.feeRemission??readFeeRemissionEvidence,
  healthExaminations:dependencies.readers?.healthExaminations??readHealthExaminationEvidence,
  counselingAppointments:dependencies.readers?.counselingAppointments??readCounselingEvidence,
  graduationClearance:dependencies.readers?.graduationClearance??readClearanceEvidence,
  tutorEvaluation:dependencies.readers?.tutorEvaluation??readTutorEvaluationEvidence,
  teachingFeedback:dependencies.readers?.teachingFeedback??readTeachingFeedbackEvidence,
  housingBed:dependencies.readers?.housingBed??readHousingBedEvidence,
  housingApplications:dependencies.readers?.housingApplications??readHousingApplicationEvidence};
return async function handler(request:ApiRequest,response:ApiResponse) {
  const deadline=Date.now()+55_000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST') {response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  const body=typeof request.body==='string' ? (()=>{try{return JSON.parse(request.body);}catch{return null;}})() : request.body;
  const input=body && typeof body==='object' && !Array.isArray(body) ? body as Record<string,unknown> : null;
  const hasLeaveProbe=Boolean(input&&Object.hasOwn(input,'evaluationLeaveProbe'));
  const hasInternshipProbe=Boolean(input&&Object.hasOwn(input,'evaluationInternshipProbe'));
  const hasTeachingProbe=Boolean(input&&Object.hasOwn(input,'evaluationTeachingProbe'));
  const hasVenueProbe=Boolean(input&&Object.hasOwn(input,'evaluationVenueProbe'));
  const probeCount=[hasLeaveProbe,hasInternshipProbe,hasTeachingProbe,hasVenueProbe].filter(Boolean).length;
  const hasProbe=probeCount>0;
  const rejectProbe=()=>response.status(404).json({error:hasVenueProbe?'Venue observation unavailable.'
    :hasTeachingProbe?'Teaching feedback observation unavailable.':hasInternshipProbe?'Internship observation unavailable.':'Student Leave observation unavailable.'});
  if(hasProbe&&(probeCount!==1||process.env.VERCEL_ENV!=='preview'||value(request.headers.host)!==process.env.VERCEL_URL)){
    rejectProbe();return;
  }
  const requestedQuestion=typeof input?.question==='string'?input.question.trim():'';
  let question=requestedQuestion;
  if(question.length<2||question.length>2000) {if(hasProbe)rejectProbe();else response.status(400).json({error:'Provide a question between 2 and 2,000 characters.'});return;}
  let route:string;
  try{route=validateAffairsAssistantRoute(input?.route);}catch{if(hasProbe)rejectProbe();else response.status(400).json({error:'Provide a local page route of at most 3,100 characters, without a fragment.'});return;}
  let account:AffairsAccount;
  let probeIdentity;
  try {
    const authorization=value(request.headers.authorization);
    const verified=await verifyToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    // Only verified transport/identity scalars enter these private closures.
    // Copy before any later await; neither graph state nor planner input gets
    // credentials or a mutable reference to the verifier's account object.
    account=Object.freeze({url:verified.url,key:verified.key,token:verified.token,user:Object.freeze({id:verified.user.id,...(verified.user.email?{email:verified.user.email}:{})})});
    if(hasProbe)probeIdentity={id:verified.user.id,email:verified.user.email,runMarker:verified.user.user_metadata?.assistant_evaluation_run};
  } catch(error) {
    if(hasProbe){rejectProbe();return;}
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'School Affairs sign-in could not be checked.'});return;
  }
  let history=Array.isArray(input?.history)?input.history.slice(-6).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const entry=item as Record<string,unknown>;
    return ['user','assistant'].includes(String(entry.role))&&typeof entry.content==='string'?[{role:String(entry.role),content:boundedAssistantText(entry.content,1000)}]:[];
  }):[];
  const correlationId=randomUUID();
  const observation=hasLeaveProbe?openStudentLeaveObservation({body,identity:probeIdentity,correlationId}):null;
  const observedPlan=observation?studentLeaveAssistantPlan(question,route,history):null;
  const observedLeaveBoundary=observation?.purpose==='boundary'&&observedPlan?studentLeaveZeroReadDisposition(observedPlan):null;
  if(hasLeaveProbe&&(!observedPlan||observedPlan.hasOtherQuestion||(observation?.purpose==='boundary'
    ? !observedLeaveBoundary
    : !observedPlan.selection||observedPlan.selection.reason||studentLeaveSelectedTools(observedPlan).join()!=='leaveRecords'))){
    rejectProbe();return;
  }
  const internshipObservation=hasInternshipProbe?openInternshipObservation({body,identity:probeIdentity,correlationId}):null;
  const observedInternship=internshipObservation?internshipAssistantPlan(question,route,history):null;
  if(hasInternshipProbe&&(!internshipObservation||!observedInternship||observedInternship.selection&&observedInternship.hasOtherQuestion
    ||(internshipObservation.companion
      ? !observedInternship.selection||observedInternship.reason||observedInternship.feeLabel!==null
        ||internshipSelectedTools(observedInternship).join()!=='internshipRecords,'+internshipObservation.companion
      : internshipSelectedTools(observedInternship).some(tool=>tool!=='internshipRecords')))){
    rejectProbe();return;
  }
  const teachingObservation=hasTeachingProbe?openTeachingObservation({body,identity:probeIdentity,correlationId}):null;
  const observedTeaching=teachingObservation?teachingFeedbackLookupContext(question,route,history):null;
  if(hasTeachingProbe&&(!observedTeaching||observedTeaching.otherQuestion||
    !(observedTeaching.selection||observedTeaching.foreign||observedTeaching.excluded||observedTeaching.navigation.length))){
    rejectProbe();return;
  }
  const venueObservation=hasVenueProbe?openVenueObservation({body,identity:probeIdentity,correlationId}):null;
  const now=Date.now();
  const observedVenue=venueObservation?venueRequestPlan(question,route,history,now):null;
  if(hasVenueProbe&&(!observedVenue||observedVenue.feeQuestion!==null
    ||observedVenue.selection.reason!==null&&!['foreign','mixed'].includes(observedVenue.selection.reason))){
    rejectProbe();return;
  }
  const active=(requestWindows.get(account.user.id)||[]).filter(time=>time>now-60_000);
  active.push(now);requestWindows.set(account.user.id,active);
  if(active.length>24){response.status(429).json({error:'Too many questions. Please wait a moment.'});return;}
  response.setHeader('X-Assistant-Request-Id',correlationId);
  const stream=createAssistantStream(input?.stream===true,response);
  async function replyVenue(venue:NonNullable<ReturnType<typeof venueRequestPlan>>,asOf:number,observation?:NonNullable<typeof venueObservation>){
    if(!venue.selection.reason&&Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about private venue requests using text, without an image.'});
      return;
    }
    try{
      const result=venue.selection.reason?venueRequestBoundary(venue.selection,question,true)
        :await answerVenueRequests({account,plan:venue,question,route,history,asOf,deadline,observation,
          onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)});
      const receipt=observation?.finish(result,!venue.selection.reason);
      if(receipt)response.setHeader(venueObservationHeader,receipt);
      stream.send(200,result);
    }catch{stream.send(503,{error:'The saved venue requests could not be checked.'});}
  }
  const payment=answerDirectTuitionPayment(requestedQuestion);
  if(payment){stream.send(200,payment);return;}
  const paymentHistory=selectChargePaymentHistory(requestedQuestion,route,history,now);
  if(paymentHistory){
    if(paymentHistory.reason){stream.send(200,chargePaymentHistoryBoundary(paymentHistory));return;}
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about your payment history using text.'});return;
    }
    try{
      stream.send(200,await answerChargePaymentHistory({account,selection:paymentHistory,question:requestedQuestion,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)},readChargePaymentHistory));
    }catch{stream.send(503,{error:'Your saved payment history could not be checked.'});}
    return;
  }
  const campusEntry=campusEntryIntent(question,route);
  if(campusEntry){stream.send(200,answerCampusEntry(question,campusEntry,true));return;}
  const accountStatus=accountStatusIntent(question,route);
  if(accountStatus){
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:accountStatus==='displayName'?'Ask about your display name using text.':'Ask about your current sign-in using text.'});
      return;
    }
    try{
      stream.send(200,await answerAccountStatus({account,question,route,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)}));
    }catch{stream.send(503,{error:accountStatus==='displayName'
      ?(/[㐀-鿿]/u.test(question)?'無法查詢已儲存的顯示名稱。':'Your saved display name could not be checked.')
      :'The current School Affairs sign-in could not be checked.'});}
    return;
  }
  const learningEntry=learningEntryIntent(question,route);
  if(learningEntry){stream.send(200,answerLearningEntry(question,learningEntry,true));return;}
  const clubAttendance=clubAttendanceSelection(question,route);
  if(clubAttendance){
    if(clubAttendance.reason){stream.send(200,clubAttendanceBoundary(clubAttendance,question,true));return;}
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about your attendance using text, without an image.'});return;
    }
    try{
      stream.send(200,await answerClubActivityAttendance({account,question,route,selection:clubAttendance,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)}));
    }catch{stream.send(503,{error:'The selected club attendance page could not be checked.'});}
    return;
  }
  const actionRequest=parseExplicitAccountAction(question);
  const clubEquipment=actionRequest?.kind==='cancel_club_equipment'?null:clubEquipmentPlan(question,route,history);
  if(clubEquipment){
    if(clubEquipment.selection.reason){stream.send(200,clubEquipmentBoundary(question,clubEquipment.selection,true));return;}
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about private equipment requests using text, without an image.'});return;
    }
    try{
      stream.send(200,await answerClubEquipment({account,question,route,history,plan:clubEquipment,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)}));
    }catch{stream.send(503,{error:'The saved club equipment requests could not be checked.'});}
    return;
  }
  const offering=catalogDetailIntent(question,route);
  if(offering){
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about the selected course or syllabus using text.'});
      return;
    }
    try{
      stream.send(200,await answerCatalogDetail({account,question,selection:offering,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)}));
    }catch{stream.send(503,{error:'The selected offering could not be checked.'});}
    return;
  }
  const metadataQuestion=isElearningMetadataQuestion(question,route);
  if(metadataQuestion||isElearningCatalogPageQuestion(question,route)){
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'For exact Digital Academy page questions, remove the image and ask using text.'});
      return;
    }
    const selection=metadataQuestion?selectElearningMetadata(question,route):selectElearningCatalogPage(question,route);
    if(!selection){
      const reply=metadataQuestion?elearningMetadataBoundary(question,null,true):elearningCatalogBoundary(question,null,true);
      stream.send(200,reply);
      return;
    }
    const onProgress=(step:VerificationProgress)=>stream.progress(step.kind,step.label,step.detail,step.status);
    try{
      const answer=metadataQuestion?answerElearningMetadata:answerElearningCatalog;
      stream.send(200,await answer({account,question,route:selection.path,deadline,onProgress}));
    }catch{stream.send(503,{error:'The selected Digital Academy page could not be checked.'});}
    return;
  }
  const searchGuide=(!input?.images||Array.isArray(input.images)&&input.images.length===0)&&!questionKind(question).irrelevant
    ? answerSchoolSystemSearch(question,route) : null;
  if(searchGuide){
    const [step]=searchGuide.activity;
    stream.progress(step.kind,step.label,step.detail,step.status);
    stream.send(200,searchGuide);
    return;
  }
  if(actionRequest){
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Describe the requested change as text before reviewing it.'});
      return;
    }
    try{
      const result=await answerRequestedAffairsAction({account,question,selection:actionRequest,route,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)});
      stream.send(200,result);
    }catch{
      stream.send(503,{error:'The requested change could not be checked.'});
    }
    return;
  }
  const venueClock=observedVenue?now:Date.now();
  const venue=venueRequestPlan(question,route,history,venueClock);
  if(venue){await replyVenue(venue,venueClock,venueObservation??undefined);return;}
  const submissionTiming=selectDtmSubmissionTiming(question,route,history);
  if(submissionTiming){
    if(submissionTiming.reason){stream.send(200,dtmSubmissionTimingBoundary(submissionTiming,question));return;}
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'Ask about your saved submission timing using text, without an image.'});
      return;
    }
    try{
      stream.send(200,await answerDtmSubmissionTiming({account,selection:submissionTiming,question,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)}));
    }catch{stream.send(503,{error:'The selected submission timing could not be checked.'});}
    return;
  }
  const assignmentList=dtmAssignmentListSelection(question,route);
  if(assignmentList){
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});
      return;
    }
    if(!('mode' in assignmentList)){stream.send(200,dtmAssignmentListBoundary(assignmentList,question,true));return;}
    try{
      const result=await answerDtmAssignmentList({account,selection:assignmentList,question,deadline,
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)});
      stream.send(200,result);
    }catch{
      stream.send(503,{error:'The saved Moodle assignment list could not be checked.'});
    }
    return;
  }
  const material=dtmMaterialIntent(question,route);
  if(material){
    const progress=(step:VerificationProgress)=>
      stream.progress(step.kind,step.label,step.detail,step.status);
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});
      return;
    }
    const loadFees=()=>loadOwnAffairsCharges(account,{deadline});
    const feeQuestion=material.feeQuestion;
    try{
      const [resource,fees]=await Promise.all([
        material.reason?Promise.resolve(dtmMaterialBoundary(material,question,true)):answerDtmMaterial({account,selection:material,question,deadline,onProgress:progress}),
        feeQuestion?loadFees().then(snapshot=>answerAccount({question:feeQuestion,route:'/school-affairs/services/39-1',
          snapshot,loadSnapshot:loadFees,deadline,correlationId,onProgress:progress})).catch(()=>({
            answer:/\p{Script=Han}/u.test(question)?'目前無法查核你的待繳費用。':'I couldn’t verify your saved fee balance.',citations:[],activity:[],
            verification:{status:'unverified',attempts:0},
          })):null,
      ]);
      const results=[resource,...(fees?[fees]:[])];
      const checks=results.flatMap(result=>'verification' in result&&result.verification?[result.verification]:[]);
      const verification=checks.length?{status:checks.every(check=>check.status==='verified')?'verified':'unverified',
        attempts:Math.max(...checks.map(check=>check.attempts))}:undefined;
      const other=material.hasOtherQuestion?(/\p{Script=Han}/u.test(question)?'其他問題需要另行查詢。':'Ask the other part separately so I can check its own records.'):'';
      const answerParts=[...results.map(result=>result.answer),other].filter(Boolean);
      stream.send(200,{...resource,status:fees?.verification?.status==='verified'?'answered':resource.status,
        verification,answer:answerParts.join('\n\n'),
        citations:results.flatMap(result=>result.citations),
        activity:results.flatMap(result=>'activity' in result?result.activity??[]:[]),
      });
    }catch{
      stream.send(503,{error:'The selected Moodle materials could not be checked.'});
    }
    return;
  }
  const leavePlan=observedPlan??studentLeaveAssistantPlan(question,route,history);
  const internshipPlan=leavePlan?null:observedInternship??internshipAssistantPlan(question,route,history);
  const servicePlan=leavePlan??internshipPlan;
  if(servicePlan){
    const {feeQuestion,feeLabel,classQuestion,gradeQuestion}=servicePlan;
    const leaveSelection=leavePlan?.selection;
    const tools=leavePlan?studentLeaveSelectedTools(leavePlan):internshipSelectedTools(internshipPlan!);
    const nav=leavePlan?studentLeaveNavigation(leavePlan,question):null;
    const boundary=nav?.answer??(leavePlan?studentLeaveBoundary(leavePlan,question):internshipBoundary(internshipPlan!,question));
    const unavailable=leavePlan?.foreign||Boolean(internshipPlan&&internshipUnavailable(internshipPlan));
    if(!tools.length){
      const payload=nav??{status:unavailable?'handoff':'clarification',answer:boundary,citations:[],
        suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
      if(leavePlan&&observedLeaveBoundary){
        const receipt=observation?.finishBoundary(payload,observedLeaveBoundary);
        if(receipt)response.setHeader(leaveObservationHeader,receipt);
      }
      const receipt=internshipObservation?.finish(payload,false);
      if(receipt)response.setHeader(internshipObservationHeader,receipt);
      stream.send(200,payload);
      return;
    }
    if(Array.isArray(input?.images)&&input.images.length){
      stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});
      return;
    }
    const loadServiceCompanions=async()=>{
      const base={checkedAt:new Date().toISOString(),profile:{userId:account.user.id}};
      const readFees=async(observeRead?:(read:unknown)=>void)=>{
        const saved=await loadOwnAffairsCharges(account,{deadline,observeRead});
        const normalize=(value:string)=>value.normalize('NFKC').trim().toLowerCase();
        return feeLabel?{...saved,chargeSelectionLabel:feeLabel,charges:saved.charges.filter(row=>normalize(row.label)===normalize(feeLabel))}:saved;
      };
      const readTimetable=(observeRead?:(read:unknown)=>void)=>loadOwnAffairsTimetable(account,{deadline},{observeRead});
      const [fees,timetable]=await Promise.all([
        feeQuestion?(internshipObservation?.companion==='charges'?internshipObservation.observeCompanion('charges',readFees):readFees())
          .catch(()=>({charges:[],chargeReadUnavailable:true})):null,
        classQuestion?(internshipObservation?.companion==='courses'?internshipObservation.observeCompanion('courses',readTimetable):readTimetable())
          .catch(()=>({courses:[],timetableReadUnavailable:true})):null,
      ]);
      if(fees&&timetable&&'studentRecordFound' in fees&&'studentRecordFound' in timetable&&fees.studentRecordFound!==timetable.studentRecordFound)
        return {...base,charges:[],courses:[],chargeReadUnavailable:true,timetableReadUnavailable:true};
      return {...fees,...timetable,...base};
    };
    const supplementalReaders:SupplementalAccountReaders={};
    if(leaveSelection&&!leaveSelection.reason)supplementalReaders.leaveRecords=context=>{
      const options={selection:leaveSelection,deadline:Math.min(deadline,context.deadline)};
      return observation?observation.observe(dependencies=>readers.leaveRecords(account,options,dependencies)):readers.leaveRecords(account,options);
    };
    if(internshipPlan?.selection)supplementalReaders.internshipRecords=context=>{
      const options={question,route,history,deadline:Math.min(deadline,context.deadline)};
      return internshipObservation?internshipObservation.observe(dependencies=>readers.internshipRecords(account,options,dependencies))
        :readers.internshipRecords(account,options);
    };
    if(gradeQuestion)supplementalReaders.dtmGradeReport=context=>
      readers.dtmGradeReport(account,{question:gradeQuestion,route:'/dtm/grades',history:[],deadline:Math.min(deadline,context.deadline)});
    const nativeQuestion=leaveSelection&&!leaveSelection.reason?leaveSelection.question:internshipPlan?.selection?internshipPlan.question:'';
    const selectedQuestion=[nativeQuestion,feeQuestion,classQuestion,gradeQuestion].filter(Boolean).join('. ');
    try{
      const snapshot=await loadServiceCompanions();
      const answer=await answerAccount({question:selectedQuestion,history:[],route,snapshot,loadSnapshot:loadServiceCompanions,deadline,correlationId,
        leavePlan:leavePlan??undefined,internshipPlan:internshipPlan??undefined,supplementalReaders,
        ...(observation?{onProviderCompleted:observation.modelCompleted,onNativeLeaveVerified:observation.nativeCheckCompleted}:
          internshipObservation?{onProviderCompleted:internshipObservation.modelCompleted,onNativeInternshipVerified:internshipObservation.nativeCheckCompleted}:{}),
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status)});
      const payload={...answer,answer:[answer.answer,boundary].filter(Boolean).join('\n\n'),citations:[...answer.citations,...(nav?.citations??[])]};
      const receipt=observation?.finish(payload);
      if(receipt)response.setHeader(leaveObservationHeader,receipt);
      const internshipReceipt=internshipObservation?.finish(payload,true);
      if(internshipReceipt)response.setHeader(internshipObservationHeader,internshipReceipt);
      stream.send(200,payload);
    }catch{
      stream.send(503,{error:'The selected School Affairs records could not be checked.'});
    }
    return;
  }
  const nativeDtm=dtmNativeClauseScope(question,route,history);
  const dtmCompound=nativeDtm.recognized&&nativeDtm.compound?nativeDtm:null;
  if(dtmCompound&&!dtmCompound.tools.length){
    stream.send(200,{status:'handoff',answer:dtmNativeClauseNotice(dtmCompound,question),citations:[],suggestedQuestions:[],
      grounding:{source:'account',webSearched:false}});
    return;
  }
  const assignment=dtmCompound
    ?{selection:dtmCompound.assignment?.selection??null,otherQuestion:'',excluded:false}
    :dtmAssignmentLookupContext(question,route,history);
  if(assignment.selection?.reason||assignment.excluded&&!assignment.selection&&!assignment.otherQuestion){
    const reason=assignment.selection?.reason;
    const answer=reason==='foreign_request'?"I can only check your own saved assignment. I cannot show another student's records.":reason==='unsupported_operation'?'I cannot edit, submit or delete an assignment through this lookup. No action was performed.':reason?'Open the exact local assignment page or provide both its course ID and assignment ID. No assignment record was read.':'The excluded assignment record was not read.';
    stream.send(200,{status:reason==='foreign_request'?'handoff':'clarification',answer,citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}});return;
  }
  if(assignment.excluded&&!assignment.selection&&assignment.otherQuestion){question=assignment.otherQuestion;history=[];route='';}
  const assignmentOnly=Boolean(assignment.selection&&!assignment.otherQuestion);
  const assignmentFees=Boolean(assignment.selection&&(isOwnFeeBalanceQuestion(assignment.otherQuestion)||ownFeeBalanceLabel(assignment.otherQuestion)!==null));
  const application=housingApplicationLookupContext(question,route,history);
  const applicationSelection=application.selection&&!application.selection.reason?application.selection:null;
  const applicationGuidance=!applicationSelection&&(application.selection||application.navigation||application.foreign||application.excluded)
    ?housingApplicationGuide(question,application,true):null;
  if(applicationGuidance&&!application.otherQuestion){stream.send(200,applicationGuidance);return;}
  if(applicationGuidance){question=application.otherQuestion;history=[];if(route==='/school-affairs/services/26-1')route='';}
  const housing=housingBedLookupContext(applicationSelection?application.otherQuestion:question,applicationSelection?'':route,applicationSelection?[]:history);
  const housingSelection=housing.selection?.fields.length?housing.selection:null;
  const housingGuidance=!housingSelection&&(housing.navigation||housing.foreign||housing.excluded||housing.selection?.reason)
    ?housingBedGuide(question,housing,true):null;
  if(housingGuidance&&!housing.otherQuestion&&!applicationSelection){stream.send(200,housingGuidance);return;}
  if(housingGuidance&&!applicationSelection){
    question=housing.otherQuestion;history=[];
    if(route.split('?')[0].replace(/\/+$/u,'')==='/school-affairs/services/34-1')route='';
  }
  const resolvedFee=savedFeeBalanceFollowup(question,history);
  if(!housingSelection&&!applicationSelection&&resolvedFee){question=resolvedFee;history=[];route='';}
  const housingFees=Boolean((housingSelection||applicationSelection)&&housing.companions.includes('fee_balance'));
  const housingNext=Boolean((housingSelection||applicationSelection)&&housing.companions.includes('next_class'));
  const housingOnly=Boolean((housingSelection||applicationSelection)&&(!housing.otherQuestion||housing.companionOnly));
  const housingCompanionBoundary=(housingSelection||applicationSelection)&&housing.foreignCompanions.length
    ?(/\p{Script=Han}/u.test(question)?'我可以查看你自己的住宿紀錄，但不能提供他人的費用或課表紀錄。':'I can check your own housing records, but cannot show another person’s fee or timetable records.'):null;
  const teaching=teachingFeedbackLookupContext(question,route,history);
  const teachingSelection=teaching.selection?.views.length?teaching.selection:null;
  const teachingReason=teaching.foreign?'foreign_request':teaching.selection?.reason??(teachingSelection?.unavailableDetails?'outside_scope':null);
  const teachingNotes=teaching.navigation.length||teachingReason||teaching.excluded&&!teachingSelection
    ?teachingFeedbackGuide(question,{views:teaching.selection?.requestedViews,navigation:teaching.navigation,reason:teachingReason,
      excluded:teaching.excluded&&!teachingSelection,signedIn:true}):null;
  if(teachingNotes&&!teachingSelection&&!teaching.otherQuestion){
    const receipt=teachingObservation?.finish(teachingNotes,false);
    if(receipt)response.setHeader(teachingObservationHeader,receipt);
    stream.send(200,teachingNotes);return;
  }
  if(teachingNotes&&!teachingSelection){question=teaching.otherQuestion;history=[];}
  const foreignYear=currentStudyForeignYearQuestion(teachingSelection?teaching.otherQuestion:question);
  const foreignYearMessage=foreignYear&&(/\p{Script=Han}/u.test(question)?
    '我可以查看你的校務紀錄，但無法查看他人的年級。':'I can check your own School Affairs records. I can’t show another person’s year level.');
  const foreignYearResidual=foreignYear?.courseQuestion??'';
  const residualCourseIntent=accountQuestionIntent(foreignYearResidual,[],'');
  const ownCoursesBesideForeignYear=foreignYearResidual&&residualCourseIntent.recognized&&residualCourseIntent.currentCourses
    &&residualCourseIntent.baseTools.length===1&&residualCourseIntent.baseTools[0]==='courses'?foreignYearResidual:'';
  if(foreignYear&&!teachingSelection){
    if(!ownCoursesBesideForeignYear){
      stream.send(200,{status:'handoff',answer:foreignYearMessage,citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}});
      return;
    }
    question=ownCoursesBesideForeignYear;history=[];
  }
  const noteDestination=!(Array.isArray(input?.images)&&input.images.length)
    ?serviceNoteNavigationAnswer(question,serviceNotePageNavigation(question,route),true)
      ??serviceNoteNavigationAnswer(question,serviceOperationPageNavigation(question,route),true,false):null;
  if(noteDestination){
    stream.progress('service-note-navigation','Found the local service page','The service directory confirmed the page link.','complete');
    stream.send(200,noteDestination);
    return;
  }
  const noteQuestion=question;
  const notes=serviceNoteLookup(noteQuestion,route,history);
  if(notes.foreign||notes.invalidService||!notes.otherQuestion&&!notes.keys.length&&(notes.excluded||notes.officialOnly)){
    if(notes.operation&&!notes.foreign)stream.progress('service-note-write-boundary','Checked note actions',
      'This service allows editing on its page. The chat request ended at the read-only boundary.','complete');
    stream.send(200,serviceNoteGuide(question,notes,true));
    return;
  }
  if(!notes.keys.length&&(notes.excluded||notes.officialOnly)){
    question=notes.otherQuestion;
    history=[];
  }
  const conduct=studentConductScope(question,route,history);
  const conductNavigation=conduct.navigation&&Boolean(conduct.otherQuestion||conduct.selected)?studentConductGuide(question,conduct,true):null;
  if(conduct.foreign||conduct.navigation&&!conductNavigation&&!conduct.selected||conduct.excluded&&!conduct.selected&&!conduct.otherQuestion){
    stream.send(200,studentConductGuide(question,conduct,true));
    return;
  }
  if((conduct.excluded||conductNavigation)&&!conduct.selected){question=conduct.otherQuestion;history=[];}
  const withLocalGuidance=<T extends {answer:string;citations?:unknown[]}>(answer:T)=>conductNavigation||foreignYearMessage||teachingNotes||housingGuidance||housingCompanionBoundary||applicationGuidance
    ?{...answer,answer:[foreignYearMessage,conductNavigation?.answer,teachingNotes?.answer,applicationGuidance?.answer,housingGuidance?.answer,housingCompanionBoundary,answer.answer].filter(Boolean).join('\n\n'),
      citations:[...(conductNavigation?.citations??[]),...(teachingNotes?.citations??[]),...(housingGuidance?.citations??[]),...(applicationGuidance?.citations??[]),...(answer.citations??[])]}:answer;
  const foreignDtmGrades=!dtmCompound&&isForeignDtmGradesQuestion(question,route);
  const foreignElearning=isForeignElearningRecordsQuestion(question,route);
  const foreignRepair=isForeignFacilityRepairQuestion(question);
  const pageContext=nativePageLookupContext(housingSelection||applicationSelection?housing.otherQuestion:notes.keys.length?notes.otherQuestion:question,
    housingSelection||applicationSelection||notes.keys.length?'':route,housingSelection||applicationSelection||notes.keys.length?[]:history);
  const dormitoryAction=pageContext.readerOnly&&pageContext.tools.length===1&&pageContext.questions.dormitoryConduct
    ?selectDormitoryConductEvidence(pageContext.questions.dormitoryConduct,route,history):null;
  if(dormitoryAction?.operation&&!dormitoryAction.reason&&!housingSelection&&!applicationSelection&&!notes.keys.length){
    const chinese=/\p{Script=Han}/u.test(question),url='/school-affairs/services/34-2';
    const title=chinese?'宿舍獎懲查詢':'Dormitory conduct notice';
    const message=chinese?'助理無法修改或刪除宿舍獎懲紀錄。':'I cannot change or delete a dormitory conduct record.';
    stream.send(200,{status:'handoff',answer:`${message}\n\n[${title}](${url})`,
      citations:[{chunkId:'directory:dormitory-conduct',title,url,claim:title,sourceName:'School Affairs'}],
      suggestedQuestions:[],grounding:{source:'directory',webSearched:false}});
    return;
  }
  const scopedQuestion=withoutExcludedNativePageClause(question);
  const aidQuestion=notes.keys.length?notes.otherQuestion:scopedQuestion;
  const aid=aidPaymentsLookupContext(aidQuestion,notes.keys.length?'':route,notes.keys.length?[]:history);
  const aidLink=notes.keys.length?null:aidPaymentsNavigation(aidQuestion);
  if(aid.foreign||!aid.otherQuestion&&(aid.excluded||aid.selection?.reason)||aidLink&&!(Array.isArray(input?.images)&&input.images.length)){
    const guidance=aidPaymentsGuide(scopedQuestion,aid,aidLink);
    if(aid.foreign){
      const chinese=/[\u3400-\u9fff]/u.test(question);
      stream.progress('account-access',chinese?'已確認帳戶範圍':'Checked account access',guidance.answer,'complete');
    }
    stream.send(200,guidance);
    return;
  }
  const aidAction=notes.keys.length?null:aidPaymentsUnsupportedAction(aidQuestion,aid);
  if(aidAction){stream.send(200,aidPaymentsCapabilityGuide(aidQuestion,aid,aidAction));return;}
  const aidFees=Boolean(aid.selection&&aid.otherQuestion&&(isOwnFeeBalanceQuestion(aid.otherQuestion)||ownFeeBalanceLabel(aid.otherQuestion)!==null));
  const aidNext=Boolean(aid.selection&&isServiceNoteNextClass(aid.otherQuestion));
  const aidOnly=Boolean(aid.selection&&!aid.otherQuestion);
  if(aid.excluded&&aid.otherQuestion){question=aid.otherQuestion;history=[];}
  if(foreignDtmGrades||foreignElearning||foreignRepair||pageContext.foreign){
    const chinese=/[\u3400-\u9fff]/u.test(question);
    const records=foreignDtmGrades?(chinese?'數位教材成績紀錄':'Moodle grade records')
      :foreignElearning?(chinese?'數位學園紀錄':'remote-learning Moodle records')
        :foreignRepair?(chinese?'報修紀錄':'facility repair records')
          :pageContext.foreign&&pageContext.tools.includes('feeRemission')?(chinese?'學雜費減免紀錄':'fee remission records')
          :pageContext.foreign&&pageContext.tools.includes('healthExaminations')?(chinese?'健檢紀錄':'health examination records')
          :pageContext.foreign&&pageContext.tools.includes('counselingAppointments')?(chinese?'諮商預約紀錄':'counseling appointments')
          :pageContext.foreign&&pageContext.tools.includes('tutorEvaluation')?(chinese?'導師問卷紀錄':'tutor evaluation records')
          :pageContext.foreign&&pageContext.tools.includes('graduationClearance')?(chinese?'畢業離校紀錄':'graduation clearance records')
          :(chinese?'宿舍獎懲或數位學園課程紀錄':'dormitory conduct or remote-learning course records');
    const answer=chinese?`我只能查詢您登入的 stu.best 帳戶，無法存取其他學生的${records}。`
      :`I can only check your signed-in stu.best account. I can’t show another student’s ${records}.`;
    stream.progress('account-access',chinese?'已確認帳戶範圍':'Checked account access',answer,'complete');
    stream.send(200,{status:'handoff',answer,citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}});
    return;
  }
  if(!notes.keys.length&&tutorEvaluationNavigation(question)&&!(Array.isArray(input?.images)&&input.images.length)){
    stream.send(200,tutorEvaluationGuide(question,true));
    return;
  }
  const clearanceNavigation=clearanceNavigationView(question);
  if(!notes.keys.length&&clearanceNavigation&&!(Array.isArray(input?.images)&&input.images.length)){
    stream.send(200,clearanceDirectoryAnswer(question,clearanceNavigation,true));
    return;
  }
  if(!notes.keys.length&&isCounselingNavigationQuestion(question)&&!(Array.isArray(input?.images)&&input.images.length)){
    stream.send(200,counselingGuide(question,'guide',true));
    return;
  }
  if(!notes.keys.length&&isHealthExaminationNavigationQuestion(question)&&!(Array.isArray(input?.images)&&input.images.length)){
    stream.send(200,healthExaminationGuide(question,true));
    return;
  }
  const intent=accountQuestionIntent(question,history,route);
  const overviewOnly=!housingSelection&&!applicationSelection&&!teachingSelection&&!notes.keys.length&&isAccountOverviewQuestion(intent,question);
  const studyQuestion=teachingSelection?(foreignYear?ownCoursesBesideForeignYear:teaching.otherQuestion):question;
  const studyIntent=teachingSelection?accountQuestionIntent(studyQuestion,[],''):intent;
  const currentStudyScope=foreignYear&&(!teachingSelection||studyQuestion)?'courses':isCurrentStudyRecordQuestion(studyIntent,studyQuestion)?'courses_and_year':null;
  const teachingFees=Boolean(teachingSelection&&(isOwnFeeBalanceQuestion(studyQuestion)||ownFeeBalanceLabel(studyQuestion)!==null));
  const teachingNext=Boolean(teachingSelection&&isServiceNoteNextClass(studyQuestion));
  if(!housingSelection&&!applicationSelection&&!teachingSelection&&!notes.keys.length&&intent.recognized&&intent.kind==='coaching'&&!intent.baseTools.length&&!pageContext.selected){
    if(Array.isArray(input?.images)&&input.images.length){stream.send(400,{error:'For this coaching request, remove the image and ask using text.'});return;}
    try{
      // Authentication remains mandatory, but wording help needs no student
      // profile, role, account initialization, record reader or write tool.
      const emptySnapshot={checkedAt:new Date().toISOString(),profile:{userId:account.user.id}};
      stream.progress('guidance','Preparing helpful guidance','No personal record lookup is needed for this request.','running');
      const answer=await answerAccount({question,correlationId,snapshot:emptySnapshot,history,route,deadline,supplementalReaders:{},
        loadSnapshot:async()=>({...emptySnapshot,checkedAt:new Date().toISOString()}),
        onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status),
      });
      if(answer.proposedAction||Array.isArray(answer.views)&&answer.views.length)throw new Error('Unexpected private output from coaching.');
      const usedGuide=answer.activity?.some(step=>step.kind==='general-coaching-guide'&&step.status==='complete');
      const checked=answer.verification?.status==='verified';
      stream.progress('guidance',checked?'Answer ready':'Verification incomplete',
        usedGuide?'The reply uses general practice guidance.':checked?'The guidance passed the independent checks.':'The unchecked draft was withheld.',checked?'complete':'unavailable');
      stream.send(200,withLocalGuidance(answer));
    }catch{stream.send(503,{error:'The guidance could not be checked. Please try again.'});}
    return;
  }
  const noteFees=notes.keys.length>0&&(isOwnFeeBalanceQuestion(notes.otherQuestion)||ownFeeBalanceLabel(notes.otherQuestion)!==null);
  const noteNext=notes.keys.length>0&&isServiceNoteNextClass(notes.otherQuestion);
  const excludedNoteFeeLabel=notes.excluded&&!notes.keys.length&&!notes.officialOnly?ownFeeBalanceLabel(notes.otherQuestion):null;
  const hasImages=Array.isArray(input?.images)&&input.images.length>0;
  const textOnly=input?.images===undefined||(Array.isArray(input.images)&&!hasImages);
  const excludedHealthFee=textOnly&&scopedQuestion!==question&&withoutExcludedHealthClause(question)===scopedQuestion
    &&standaloneFeeBalanceLabel(scopedQuestion)!==null?scopedQuestion:null;
  const standaloneChargeLabel=question===requestedQuestion?standaloneFeeBalanceLabel(excludedHealthFee??question):null;
  const chargeLabel=excludedNoteFeeLabel??pageContext.feeChargeLabel??(assignmentFees?ownFeeBalanceLabel(assignment.otherQuestion):housingFees?ownFeeBalanceLabel(housing.otherQuestion):teachingFees?ownFeeBalanceLabel(studyQuestion):noteFees?ownFeeBalanceLabel(notes.otherQuestion):aidFees?ownFeeBalanceLabel(aid.otherQuestion):aid.excluded?ownFeeBalanceLabel(question):scopedQuestion!==question?ownFeeBalanceLabel(scopedQuestion):standaloneChargeLabel);
  const chargesOnly=assignmentFees||isOwnFeeBalanceQuestion(aid.excluded?question:scopedQuestion)||pageContext.feeAndBalance||aidFees||teachingFees||housingFees||chargeLabel!==null&&!noteFees;
  const exactBalance=(question===requestedQuestion||question===resolvedFee)
    &&(chargeLabel?chargeLabel===standaloneChargeLabel:isOwnFeeBalanceQuestion(question)
      &&/^how much\b|\b(?:balance|owe|remain(?:s)? unpaid)\b|還要繳|還有|尚欠|剩餘|餘額|還剩/iu.test(question.normalize('NFKC')))
    &&!pageContext.selected&&!notes.keys.length
    &&!dtmCompound&&!assignment.selection&&!aid.selection&&!teachingSelection&&!housingSelection&&!applicationSelection;
  const timetableOnly=Boolean(clearanceTimetableQuestion(question,pageContext))||aidNext||teachingNext||housingNext;
  const publicFollowup=textOnly&&question===requestedQuestion
    ?publicServiceFollowup(question,input?.history):null;
  const publicDirectory=textOnly&&question===requestedQuestion&&campusDirectoryResearch(question);
  const needsRecords=!publicFollowup&&!publicDirectory&&(
    Boolean(dtmCompound||housingSelection||applicationSelection||teachingSelection||aid.selection) || conduct.selected
    || notes.keys.length>0 || chargesOnly || timetableOnly || intent.baseTools.length>0 || personal(question,history)
    || isDtmRecordQuestion(question,route,history) || isScholarshipRecordQuestion(question,route,history)
    || isStudentAidRecordQuestion(question,route,history) || isHousingRecordQuestion(question,route,history)
    || isPendingFeeQuestion(question,route,history) || isCreditLoadHistoryQuestion(question,route,history)
    || isCourseSelectionQuestion(question,route,history) || requiredNativeTools(question,route,history).length>0
    || requiredSupplementalTools(question,route,history).length>0);
  const navigation=!needsRecords && !publicDirectory && !hasImages && !questionKind(question).irrelevant
    ? answerCampusNavigation(publicFollowup??question) : null;
  if(navigation) {
    stream.progress('directory','Checked campus services','Found a verified service link.','complete');
    stream.send(200,withLocalGuidance(navigation));
    return;
  }
  if(!needsRecords) {
    // Reuse this deployment's public handler; never send account state into it.
    stream.progress('public','Checking public school information','This question does not need your account records.');
    try {
      const research=await dispatchPublicResearch(publicResearch,{
        method:'POST',
        headers:{'content-type':'application/json',...(value(request.headers['x-forwarded-for'])?{'x-forwarded-for':value(request.headers['x-forwarded-for'])!}:{})},
        body:{question:publicFollowup??question,history:[],images:Array.isArray(input?.images)?input.images.map(image=>{
          if(!image||typeof image!=='object'||Array.isArray(image))return image;
          const attachment=image as Record<string,unknown>;
          return {name:attachment.name,dataUrl:attachment.dataUrl};
        }):input?.images,route:publicFollowup||publicDirectory?'/':route,consentedResearchUse:false,stream:stream.enabled},
      },deadline,step=>stream.progress(step.kind,step.label,step.detail,step.status));
      const result=research.result as Record<string,unknown>|null;
      if(!result || typeof result!=='object' || Array.isArray(result) || (!research.ok && typeof result.error!=='string')) {stream.send(502,{error:'School research returned an invalid response.'});return;}
      stream.progress('public','Checked public information','The public school lookup finished.','complete');
      stream.send(research.status,(conductNavigation||foreignYearMessage||teachingNotes||housingGuidance)&&typeof result.answer==='string'?withLocalGuidance({...result,answer:result.answer}):result);
    } catch {stream.send(503,{error:'School research is temporarily unavailable. Please try again.'});}
    return;
  }
  if(Array.isArray(input?.images) && input.images.length) {stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});return;}
  try {
    const housingRead=Boolean(housingSelection||applicationSelection);
    const residual=notes.keys.length?notes.otherQuestion:pageContext.selected?pageContext.otherQuestion:housingRead?housing.otherQuestion:question;
    const residualRoute=housingRead?'':route;
    const residualHistory=housingRead?[]:history;
    const remoteOnly=Boolean(residual)&&isElearningEvidenceQuestion(residual,residualRoute,residualHistory)&&!independentElearningQuestion(residual,residualRoute,residualHistory);
    const repairContext=facilityRepairLookupContext(residual,route,history),repairOnly=repairContext.repairOnly;
    const ownNoteRead=notes.keys.length>0;
    const noteScopeOnly=ownNoteRead&&(!notes.otherQuestion||noteFees||noteNext);
    const nativeDtmOnly=isNativeDtmGradeOnlyQuestion(residual,residualRoute,residualHistory)
      &&!notes.keys.length&&!teachingSelection&&!pageContext.selected;
    const selectedReaderOnly=!chargesOnly&&!timetableOnly&&(dtmCompound||nativeDtmOnly||assignmentOnly||noteScopeOnly||pageContext.readerOnly||remoteOnly||repairOnly||aidOnly||teachingSelection&&!studyQuestion);
    const scopedSnapshot=()=>({checkedAt:new Date().toISOString(),profile:{userId:account.user.id}});
    if(housingOnly)stream.progress('account','Checking saved dormitory assignments','Only the requested accommodation fields and any requested fee or timetable records will be checked.');
    else if(overviewOnly)stream.progress('account','Checking your saved overview','Checking course lists and counts from your signed-in account.');
    else if(selectedReaderOnly)stream.progress('account','Checked account access','The selected reader uses this signed-in Google account.','complete');
    else stream.progress('account','Loading your account records',currentStudyScope==='courses_and_year'?'Checking your School Affairs subjects and recorded year level.':currentStudyScope||timetableOnly?'Checking the timetable linked to this Google account.':chargesOnly?'Checking only the fees linked to this Google account.':'Checking School Affairs and DTM records for this signed-in Google account.');
    const loadCharges=async()=>{
      try{
        const saved=await loadOwnAffairsCharges(account,{deadline});
        const normalize=(value:string)=>value.normalize('NFKC').trim().toLowerCase();
        const selected=chargeLabel?{...saved,chargeSelectionLabel:chargeLabel,charges:saved.charges.filter(row=>normalize(row.label)===normalize(chargeLabel))}:saved;
        return exactBalance?{...selected,feeBalanceScope:true}:selected;
      }catch(error){
        if(!exactBalance&&!assignmentFees&&!pageContext.feeAndBalance&&!noteFees&&!excludedNoteFeeLabel&&!aidFees&&!teachingFees&&!housingFees)throw error;
        const charges:Awaited<ReturnType<typeof loadOwnAffairsCharges>>['charges']=[];
        return {...scopedSnapshot(),charges,chargeReadUnavailable:true,...(exactBalance?{feeBalanceScope:true}:{}),
          ...(chargeLabel?{chargeSelectionLabel:chargeLabel}:{})};
      }
    };
    const loadTimetable=async()=>{
      try{return await loadOwnAffairsTimetable(account,{deadline});}
      catch{
        const courses:Awaited<ReturnType<typeof loadOwnAffairsTimetable>>['courses']=[];
        return {...scopedSnapshot(),courses,timetableReadUnavailable:true};
      }
    };
    const loadCurrentStudy=async()=>{
      const [timetable,year]=await Promise.all([loadTimetable(),loadOwnAffairsStudyYear(account,{deadline}).then(
        saved=>({student:saved.student,studyYearStudentFound:saved.studentRecordFound}),
        ()=>{
          const student:Awaited<ReturnType<typeof loadOwnAffairsStudyYear>>['student']=null;
          return {student,studyYearReadUnavailable:true};
        },
      )]);
      return {...timetable,...year,currentStudyScope:'courses_and_year'};
    };
    const loadHousingCompanions=async()=>{
      if(!housingNext)return housingFees?loadCharges():scopedSnapshot();
      if(!housingFees)return loadTimetable();
      const [timetable,charges]=await Promise.all([loadTimetable(),loadCharges()]);
      // The independent lookups must agree that the student is linked before
      // their results are presented as one coherent set. A failed lookup keeps
      // its own unavailable flag; it does not erase a successful other source.
      if('studentRecordFound' in timetable&&'studentRecordFound' in charges
        &&timetable.studentRecordFound!==charges.studentRecordFound)
        return {...scopedSnapshot(),courses:[],charges:[],timetableReadUnavailable:true,chargeReadUnavailable:true};
      return {...timetable,...charges};
    };
    const loadBaseSnapshot=(initialize?:false)=>housingOnly
      ?loadHousingCompanions()
      :overviewOnly?loadAccountOverviewSnapshot(account,{deadline})
      :currentStudyScope==='courses_and_year'?loadCurrentStudy()
      :currentStudyScope==='courses'?loadTimetable().then(saved=>({...saved,currentStudyScope:'courses'}))
      :timetableOnly||noteNext?loadTimetable():chargesOnly||noteFees?loadCharges()
      :selectedReaderOnly?Promise.resolve(scopedSnapshot())
        :loadSnapshot(account,false,{deadline,...(initialize===false||ownNoteRead?{initialize:false}:{}),...(ownNoteRead||notes.excluded||notes.officialOnly?{includeServiceRecords:false}:{})});
    const loadSelectedSnapshot=async(initialize?:false)=>{
      const base=loadBaseSnapshot(housingSelection||applicationSelection?false:initialize);
      const housingEvidence=housingSelection?readers.housingBed(account,{fields:[...housingSelection.fields],term:housingSelection.term,deadline})
        .catch(()=>unavailableHousingBedEvidence('read_failed')):null;
      const withHousing=housingEvidence?Promise.all([base,housingEvidence]).then(([snapshot,result])=>({...snapshot,housingBedEvidence:result.evidence})):base;
      const applicationEvidence=applicationSelection?readers.housingApplications(account,{term:applicationSelection.term,deadline})
        .catch(()=>unavailableHousingApplicationEvidence('read_failed')):null;
      const withApplication=applicationEvidence?Promise.all([withHousing,applicationEvidence]).then(([snapshot,result])=>({...snapshot,housingApplicationEvidence:result.evidence})):withHousing;
      if(!ownNoteRead)return withApplication;
      const [snapshot,selected]=await Promise.all([withApplication,loadOwnServiceNotes(account,notes.keys,{deadline}).then(
        serviceRecords=>({serviceRecords}),()=>{
          const serviceRecords:Awaited<ReturnType<typeof loadOwnServiceNotes>>=[];
          return {serviceRecords,serviceNoteReadUnavailable:true};
        },
      )]);
      return {...snapshot,...selected};
    };
    const snapshot=await loadSelectedSnapshot();
    if(housingOnly)stream.progress('account','Selected your dormitory records','The dormitory lookup uses this signed-in Google account.','complete');
    else if(overviewOnly)stream.progress('account','Checked your saved overview','Only the account name, program, year, course lists and record counts were requested.','complete');
    else if(currentStudyScope==='courses_and_year')stream.progress('account','Checked your School Affairs sources','Subjects and recorded year level were checked separately.','complete');
    else if('chargeReadUnavailable' in snapshot)stream.progress('account','Fee balance unavailable',exactBalance?'The saved fee records could not be read.':'The other requested records can still be checked independently.','unavailable');
    else if('timetableReadUnavailable' in snapshot)stream.progress('account','Timetable unavailable','The timetable could not be verified for this account.','unavailable');
    else if(!selectedReaderOnly)stream.progress('account','Loaded your account records',timetableOnly?'Read the timetable scope for this Google account.':chargesOnly?'Read the fee scope for this Google account.':'Only records linked to this Google account were read.','complete');
    stream.progress('answer','Preparing your answer','Checking the account data and any requested stu.best action.');
    const readDeadline=(selected:number)=>{
      if(!Number.isFinite(selected))throw new TypeError('Invalid account reader deadline.');
      return Math.min(deadline,selected);
    };
    const supplementalReaders:SupplementalAccountReaders={
      dtmAssignment:context=>readers.dtmAssignment(account,{question:dtmCompound?.assignment?.question||assignment.selection?.question||context.question,
        route:dtmCompound?.assignment?.route??route,history:dtmCompound?.assignment?.history??history,deadline:readDeadline(context.deadline)}),
      courseCatalog:context=>readers.courseCatalog(account,{question:residual||question,route,query:context.catalogQuery,deadline:readDeadline(context.deadline)}),
      enrollmentCertificate:context=>readers.enrollmentCertificate(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      dtmSubmissions:context=>readers.dtmSubmissions(account,{question:residual||question,route,history,snapshot:context.snapshot,deadline:readDeadline(context.deadline)}),
      studentConduct:context=>readers.studentConduct(account,{question:pageContext.questions.studentConduct||conduct.question||residual||question,route,history,deadline:readDeadline(context.deadline)}),
      studentLoan:context=>readers.studentLoan(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      aidPayments:context=>readers.aidPayments(account,{question:aid.selection?.question||residual||question,route,history,deadline:readDeadline(context.deadline)}),
      dtmGradeReport:context=>readers.dtmGradeReport(account,{question:dtmCompound?.grades?.question||(residual||question),route:dtmCompound?.grades?.route??route,
        history:dtmCompound?.grades?.history??residualHistory,deadline:readDeadline(context.deadline)}),
      elearningEnrollments:context=>readers.elearningEnrollments(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      facilityRepairs:context=>readers.facilityRepairs(account,{question:repairContext.repairQuestion,route,history,deadline:readDeadline(context.deadline)}),
      dormitoryConduct:context=>readers.dormitoryConduct(account,{question:pageContext.questions.dormitoryConduct||question,route,history,deadline:readDeadline(context.deadline)}),
      elearningOutline:context=>readers.elearningOutline(account,{question:pageContext.questions.elearningOutline||question,route,history,deadline:readDeadline(context.deadline)}),
      feeRemission:context=>readers.feeRemission(account,{question,route,history,deadline:readDeadline(context.deadline)}),
      healthExaminations:context=>readers.healthExaminations(account,{question:context.question,route,history,deadline:readDeadline(context.deadline)}),
      counselingAppointments:context=>readers.counselingAppointments(account,{question:context.question,route,history,deadline:readDeadline(context.deadline)}),
      tutorEvaluation:context=>readers.tutorEvaluation(account,{question:context.question,route,history,deadline:readDeadline(context.deadline)}),
      graduationClearance:context=>readers.graduationClearance(account,{question:context.question,route,history,deadline:readDeadline(context.deadline)}),
      tuition:context=>readers.tuition(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      teachingFeedback:context=>{
        if(!teachingSelection)return Promise.resolve(unavailableTeachingFeedbackEvidence('reader_unavailable'));
        const options={views:[...teachingSelection.views],commentRequested:teachingSelection.commentRequested,
          ...(teachingSelection.course?{course:{...teachingSelection.course}}:{}),deadline:readDeadline(context.deadline)};
        return teachingObservation?teachingObservation.observe(dependencies=>readers.teachingFeedback(account,options,dependencies))
          :readers.teachingFeedback(account,options);
      },
    };
    const graphQuestion=teachingSelection&&foreignYear?[teaching.question,studyQuestion].filter(Boolean).join('\n')
      :excludedNoteFeeLabel?noteQuestion:exactBalance&&excludedHealthFee?excludedHealthFee:question;
    const answer=await answerAccount({question:graphQuestion,correlationId,snapshot,history,route,deadline,supplementalReaders,
      allowNativeTeachingVerification:graphQuestion===question,
      loadSnapshot:()=>loadSelectedSnapshot(false),
      onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status),
      ...(teachingObservation?{onProviderCompleted:teachingObservation.modelCompleted,onNativeTeachingVerified:teachingObservation.nativeCheckCompleted}:{}),
    });
    stream.progress('answer',answer.verification?.status==='verified'?'Answer ready':'Verification incomplete',
      answer.verification?.status==='verified'?'The answer passed the account evidence checks.':'An unverified draft was withheld.',
      answer.verification?.status==='verified'?'complete':'unavailable');
    if(!notes.keys.length&&notes.officialOnly){
      const boundary=serviceNoteGuide(question,notes,true);
      stream.send(200,{...answer,answer:[boundary.answer,answer.answer].join('\n\n'),citations:[...boundary.citations,...answer.citations]});
    }else {
      const payload=withLocalGuidance(answer);
      const receipt=teachingObservation?.finish(payload,true);
      if(receipt)response.setHeader(teachingObservationHeader,receipt);
      stream.send(200,payload);
    }
  } catch(error) {
    stream.send(error instanceof AffairsWorkspaceError?error.status:503,{error:error instanceof AffairsWorkspaceError?error.message:'Your School Affairs records could not be checked.'});
  }
};
}

export default createAffairsAssistantHandler();
