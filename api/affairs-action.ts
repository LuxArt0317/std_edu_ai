import {changeLearningSupport,learningSupportMaxPayloadBytes,learningSupportReviewAction,learningSupportStudentActions} from '../server/learningSupport.js';
import { writeClubFoundation } from '../server/clubStudent.js';
import { clubDocumentActions,clubDocumentJsonLimit,writeClubDocument } from '../server/clubActivityDocuments.js';
import { clubOfficerActions } from '../server/clubOfficerContract.js';
import { changeClubEquipment,changeClubOfficer } from '../server/clubServices.js';
import {enrollElearning} from '../server/elearning.js';
import {joinElearningCourse} from '../server/elearningContract.js';
import {changeCounseling} from '../server/counseling.js';
import {changeCertificateAward} from '../server/certificateAwards.js';
import {saveAnnouncementEmail} from '../server/announcementEmail.js';
import {announcementEmailAction} from '../server/announcementEmailContract.js';
import {changeStudentProfile} from '../server/studentProfile.js';
import {changeGraduationClearance} from '../server/graduationClearance.js';
import {changeVenueRequest} from '../server/venueBooking.js';
import {changeFacilityRepair} from '../server/facilityRepair.js';
import {clearanceSubmit} from '../server/graduationClearanceContract.js';
import {changeTeachingFeedback} from '../server/teachingFeedback.js';
import {teachingFeedbackStudentActions,teachingFeedbackMaxBytes} from '../server/teachingFeedbackContract.js';
import { changeEarlyGraduation } from '../server/earlyGraduation.js';
import { earlyGraduationStudentActions } from '../server/earlyGraduationContract.js';
import { changeProgramRegistration } from '../server/programRegistration.js';
import { changeWithdrawal } from '../server/courseWithdrawal.js';
import { withdrawalChange } from '../server/courseWithdrawalContract.js';
import { changeCreditTransfer } from '../server/creditTransfer.js';
import { creditTransferSave,creditTransferSubmit } from '../server/creditTransferContract.js';
import { programRegistrationAction } from '../server/programRegistrationContract.js';
import { submitTutorEvaluation } from '../server/tutorEvaluation.js';
import { tutorEvaluationKind, tutorEvaluationMaxBytes } from '../server/tutorEvaluationContract.js';
import { manageExchangeGrant } from '../server/exchangeGrant.js';
import { exchangeGrantKinds, exchangeGrantMaxPayloadBytes } from '../server/exchangeGrantContract.js';
import { AffairsWorkspaceError, executeAffairsAction, verifyAffairsToken } from '../server/affairsWorkspace.js';
import { studentLeaveDraftAction } from '../server/studentLeaveDraft.js';
import { DtmSubmissionError, dtmSubmissionStudentKinds, executeDtmSubmissionAction, cleanupDtmSubmissionUploads } from '../server/dtmSubmissions.js';
import { DtmDashboardLayoutError, dtmDashboardLayoutKinds, dtmDashboardLayoutMaxPayloadBytes, executeDtmDashboardLayoutAction } from '../server/dtmDashboardLayout.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export default async function handler(request:Request,response:Response) {
  const submissionDeadline=Date.now()+17000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST'){response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  let body:unknown=request.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{body=null;}}
  const input=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:null;
  const submissionAction=typeof input?.kind==='string'&&dtmSubmissionStudentKinds.includes(input.kind);
  const submissionCleanup=input?.kind==='cleanup_dtm_submission_uploads';
  const programRegistration = input?.kind === programRegistrationAction;
  const withdrawal = input?.kind === withdrawalChange;
  const transfer = input?.kind === creditTransferSave || input?.kind === creditTransferSubmit;
  const tutorEvaluation = input?.kind === tutorEvaluationKind;
  const grantKind = exchangeGrantKinds.find(kind => kind === input?.kind);
  const dashboardKind=dtmDashboardLayoutKinds.find(kind=>kind===input?.kind);
  const earlyGraduation = earlyGraduationStudentActions.find(kind=>kind===input?.kind);
  const teachingFeedback=teachingFeedbackStudentActions.find(kind=>kind===input?.kind);
  const clearance=input?.kind===clearanceSubmit;
  const learningSupport=learningSupportStudentActions.find(kind=>kind===input?.kind);
  const leaveDraft=input?.kind===studentLeaveDraftAction;
  const venue=input?.kind==='submit_venue_request'||input?.kind==='cancel_venue_request';
  const repair=input?.kind==='submit_facility_repair'||input?.kind==='cancel_facility_repair';
  const confirmProfile=input?.kind==='confirm_student_profile';
  const enroll=input?.kind===joinElearningCourse;
  const foundation=input?.kind==='submit_club_foundation'||input?.kind==='withdraw_club_foundation';
  const clubDocument=typeof input?.kind==='string'&&clubDocumentActions.includes(input.kind);
  const clubOfficer=typeof input?.kind==='string'&&input.kind!=='review_club_application'&&Object.hasOwn(clubOfficerActions,input.kind);
  const clubEquipment=input?.kind==='submit_club_equipment'||input?.kind==='edit_club_equipment'||input?.kind==='cancel_club_equipment';
  const counseling=typeof input?.kind==='string'&&input.kind.startsWith('counseling_');
  const certificateAward=typeof input?.kind==='string'&&input.kind.startsWith('certificate_award_');
  const saveEmail=input?.kind===announcementEmailAction;
  const dedicatedPayloadLimit = learningSupport ? learningSupportMaxPayloadBytes : clubDocument ? clubDocumentJsonLimit : foundation ? 4500 : clubOfficer ? 11000 : enroll ? 200 : clubEquipment ? 3000 : counseling ? 2000 : certificateAward ? 9000 : saveEmail || confirmProfile ? 1024 : repair ? 7000 : venue ? 3600 : clearance ? 1024 : teachingFeedback ? teachingFeedbackMaxBytes : earlyGraduation ? 2400 : transfer ? 36000 : programRegistration || withdrawal ? 1024 : tutorEvaluation ? tutorEvaluationMaxBytes : grantKind ? exchangeGrantMaxPayloadBytes : dashboardKind ? dtmDashboardLayoutMaxPayloadBytes : undefined;
  if(!input || typeof input.kind!=='string' || input.kind===learningSupportReviewAction || !input.payload || typeof input.payload!=='object'
    || Array.isArray(input.payload) || (dedicatedPayloadLimit?Buffer.byteLength(JSON.stringify(input),'utf8')>dedicatedPayloadLimit+1024:submissionAction?Buffer.byteLength(JSON.stringify(input),'utf8')>14000:JSON.stringify(input).length>(input.kind==='import_dtm_deadlines'?50000:4000))
    || leaveDraft&&(Object.keys(input).length!==3||!Object.hasOwn(input,'requestId'))
    || dedicatedPayloadLimit&&(Object.keys(input).length!==2||!Object.hasOwn(input,'kind')||!Object.hasOwn(input,'payload'))){
    response.status(400).json({error:'Invalid action request.'});return;
  }
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const bounded={...account,requestDeadline:submissionDeadline};
    if(foundation){response.status(200).json(await writeClubFoundation(bounded,input.kind,input.payload));return;}
    if(clubDocument){response.status(200).json(await writeClubDocument(bounded,input.kind,input.payload));return;}
    if(clubOfficer){response.status(200).json(await changeClubOfficer(bounded,input.kind,input.payload));return;}
    if(clubEquipment){response.status(200).json(await changeClubEquipment(bounded,input.kind,input.payload));return;}
    if(enroll){response.status(200).json(await enrollElearning(bounded,input.payload));return;}
    if(counseling){response.status(200).json(await changeCounseling(bounded,String(input.kind),input.payload));return;}
    if(certificateAward){response.status(200).json(await changeCertificateAward(bounded,String(input.kind).slice(18),input.payload));return;}
    if(saveEmail){response.status(200).json(await saveAnnouncementEmail(bounded,input.payload));return;}
    if(confirmProfile){response.status(200).json(await changeStudentProfile(bounded,'confirm',input.payload));return;}
    if(repair){response.status(200).json(await changeFacilityRepair(bounded,input.kind,input.payload));return;}
    if(learningSupport){response.status(200).json(await changeLearningSupport(bounded,learningSupport,input.payload));return;}
    if(venue){response.status(200).json(await changeVenueRequest(bounded,input.kind,input.payload));return;}
    if(clearance){response.status(200).json(await changeGraduationClearance(bounded,clearanceSubmit,input.payload));return;}
    if(teachingFeedback){response.status(200).json(await changeTeachingFeedback(bounded,teachingFeedback,input.payload));return;}
    if (earlyGraduation) {response.status(200).json(await changeEarlyGraduation(bounded,earlyGraduation,input.payload));return;}
    if (transfer) {response.status(200).json(await changeCreditTransfer(bounded,input.kind,input.payload));return;}
    if (withdrawal) {response.status(200).json(await changeWithdrawal(bounded,withdrawalChange,input.payload));return;}
    if (programRegistration) {response.status(200).json(await changeProgramRegistration(bounded,input.payload));return;}
    if (tutorEvaluation) {response.status(200).json(await submitTutorEvaluation(bounded,input.payload));return;}
    if (grantKind) {response.status(200).json(await manageExchangeGrant(bounded, grantKind, input.payload));return;}
    if(dashboardKind){response.status(200).json(await executeDtmDashboardLayoutAction(bounded,dashboardKind,input.payload));return;}
    if(submissionCleanup){
      if(Object.keys(input.payload).length){response.status(400).json({error:'Cleanup takes no file paths or user identifiers.'});return;}
      // The database limits students to their own queue; a verified manager
      // can also remove discarded files belonging to deleted accounts.
      response.status(200).json(await cleanupDtmSubmissionUploads(bounded));return;
    }
    const result=submissionAction?await executeDtmSubmissionAction(bounded,input.kind,input.payload)
      :await executeAffairsAction(leaveDraft?bounded:account,input.kind,input.payload,input.requestId as string|undefined);
    if(submissionAction){
      // A cleanup outage must never replace the durable successful receipt.
      // The same request deadline bounds this pass; queued rows survive for
      // the next mutation or an explicit maintenance retry.
      try{const cleaned=await cleanupDtmSubmissionUploads(bounded);response.setHeader('X-DTM-Cleanup',cleaned.remaining?'deferred':'batch-complete');}
      catch{response.setHeader('X-DTM-Cleanup','deferred');}
    }
    response.status(200).json(result);
  } catch(error) {
    const known=error instanceof AffairsWorkspaceError||error instanceof DtmSubmissionError||error instanceof DtmDashboardLayoutError;
    response.status(known?error.status:503).json({error:known?error.message:'School Affairs action could not be completed.'});
  }
}
