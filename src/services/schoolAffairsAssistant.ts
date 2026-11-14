import { clubStudentQuestion } from '../../server/clubStudentContract.js';
import { answerStudentClubs } from './clubStudent';
import { clubOfficerGuide,clubOfficerQuestion } from '../../server/clubOfficerContract.js';
import { clubGuide,clubIntent } from '../../server/clubServicesContract.js';
import { healthExaminationGuide, healthExaminationQuestion } from '../../server/healthExaminationContract.js';
import {elearningGuide,elearningQuestion,elearningOutlineCourse} from '../../server/elearningContract.js';
import {isAidPaymentsEvidenceQuestion,isForeignAidPaymentsQuestion} from '../../server/aidPaymentsEvidenceIntent.js';
import {isForeignDtmGradesQuestion,shouldReadNativeDtmGrades} from '../../server/dtmGradeEvidenceIntent.js';
import {isElearningEvidenceQuestion,isForeignElearningRecordsQuestion} from '../../server/elearningEvidenceIntent.js';
import {isFacilityRepairEvidenceQuestion,isForeignFacilityRepairQuestion} from '../../server/facilityRepairEvidenceIntent.js';
import {answerElearningOutline} from './elearning';
import {counselingGuide,counselingQuestion} from '../../server/counselingContract.js';
import {certificateAwardQuestion} from '../../server/certificateAwardsContract.js';
import {readCertificateAwardAnswer} from './certificateAwards';
import {announcementEmailQuestion} from '../../server/announcementEmailContract.js';
import {readAnnouncementEmailAnswer} from './announcementEmail';
import {studentProfileQuestion} from '../../server/studentProfileContract.js';
import {readStudentProfileAnswer} from './studentProfile';
import {clearanceQuestion} from '../../server/graduationClearanceContract.js';
import {readGraduationClearanceAnswer} from './graduationClearance';
import {permanentCourseQuestion} from '../features/public/affairs/permanentCourseRouting.js';
import {venueQuestion} from '../features/public/affairs/venueContract.js';
import {readVenueAnswer} from './venueBooking';
import {repairQuestion} from '../features/public/affairs/facilityRepair.js';
import {teachingFeedbackQuestion} from '../../server/teachingFeedbackContract.js';
import {readTeachingFeedbackAnswer} from './teachingFeedback';
import {earlyGraduationQuestion} from '../../server/earlyGraduationContract.js';
import {readEarlyGraduationAnswer} from './earlyGraduation';
import {courseSubstitutionQuestion} from '../features/public/affairs/courseSubstitution.js';
import {firstSelectionQuestion} from '../features/public/affairs/firstSelection.js';
import {adjustmentPaths,adjustmentQuestion,summerSelectionQuestion} from '../../server/courseAdjustmentContract.js';
import {readCourseAdjustmentAnswer} from './courseAdjustment';
import {withdrawalQuestion} from '../../server/courseWithdrawalContract.js';
import {readWithdrawalAnswer} from './courseWithdrawal';
import {creditTransferQuestion} from '../../server/creditTransferContract.js';
import {readCreditTransferAnswer} from './creditTransfer';
import {isProgramRegistrationQuestion} from '../../server/programRegistrationContract.js';
import {readProgramRegistrationAnswer} from './programRegistration';
import {askCampusAssistant,type AssistantResponse,type AssistantProgress} from './researchAssistant';
import {readAssistantReply} from './assistantStreamReader.js';
import { affairsClient } from '@/features/public/affairs/authClient';

/** Uses only School Affairs credentials; never imports the Nexus client. */
export async function askSchoolAffairsAssistant(expectedUserId: string, question: string, history: Array<{role:string;content:string}>, signal?: AbortSignal, images: Array<{name:string;dataUrl:string}> = [], route = '', onProgress?: (step:AssistantProgress)=>void): Promise<AssistantResponse> {
  signal?.throwIfAborted();
  if (!affairsClient) throw new Error('School Affairs sign-in is not configured.');
  const {data,error} = await affairsClient.auth.getSession();
  signal?.throwIfAborted();
  if (error || !data.session) throw new Error('Your School Affairs session expired. Please sign in again.');
  if (data.session.user.id !== expectedUserId) throw new Error('Your account changed. Reopen the assistant and try again.');
  const {access_token:accessToken}=data.session;
  if (isAidPaymentsEvidenceQuestion(question,route,history)||isForeignAidPaymentsQuestion(question)
    ||isForeignDtmGradesQuestion(question,route)||shouldReadNativeDtmGrades(question,route,history)
    ||isElearningEvidenceQuestion(question,route,history)||isForeignElearningRecordsQuestion(question,route)
    ||isFacilityRepairEvidenceQuestion(question,route,history)||isForeignFacilityRepairQuestion(question))
    return askVerifiedAccount(accessToken,question,history,signal,images,route,onProgress);
  const officer = !images.length ? clubOfficerQuestion(question) : null;
  if (officer) return clubOfficerGuide(question,officer,true);
  const studentClub = !images.length ? clubStudentQuestion(question) : null;
  if (studentClub) {
    onProgress?.({kind:'student-clubs',label:'Checking club records',detail:'Using your School Affairs session.',status:'running'});
    return answerStudentClubs(data.session.user.id,question,studentClub,signal);
  }
  const clubs = !images.length ? clubIntent(question) : null;
  if (clubs) return clubGuide(question, clubs, true);
  if (healthExaminationQuestion(question)) return healthExaminationGuide(question, true);
  const outline=images.length?null:elearningOutlineCourse(question,route);
  if(outline!==null){
    onProgress?.({kind:'elearning-outline',label:'Checking the course outline',detail:'Looking up activities available to your account.',status:'running'});
    return answerElearningOutline(data.session.user.id,outline,question,signal);
  }
  const elearning=elearningQuestion(question,route);
  if(elearning)return elearningGuide(question,elearning,true);
  const counseling=counselingQuestion(question);
  if(counseling)return counselingGuide(question,counseling,true);
  const certificate=!images.length&&certificateAwardQuestion(question);
  if(certificate==='guide')return askCampusAssistant(question,[],signal,[],route,onProgress);
  if(certificate==='status'){
    onProgress?.({kind:'certificate-awards',label:'Checking certificate applications',detail:'Reading your saved application status.',status:'running'});
    return readCertificateAwardAnswer(data.session.user.id,question,signal);
  }
  const email=!images.length&&announcementEmailQuestion(question);
  if(email==='guide')return askCampusAssistant(question,[],signal,[],route,onProgress);
  if(email==='status'){
    onProgress?.({kind:'announcement-email',label:'Checking announcement email preference',detail:'Reading your saved setting.',status:'running'});
    return readAnnouncementEmailAnswer(data.session.user.id,question,signal);
  }
  const profile=!images.length&&studentProfileQuestion(question);
  if(profile==='guide')return askCampusAssistant(question,[],signal,[],route,onProgress);
  if(profile==='status'){
    onProgress?.({kind:'student-profile',label:'Checking student information confirmation',detail:'Reading your confirmation status.',status:'running'});
    return readStudentProfileAnswer(data.session.user.id,question,signal);
  }
  const repair=!images.length&&repairQuestion(question);
  if(repair&&repair!=='history')return askCampusAssistant(question,[],signal,[],route,onProgress);
  const venue=!images.length&&venueQuestion(question);
  if(venue){
    if(venue.view!=='mine')return askCampusAssistant(question,[],signal,[],route,onProgress);
    onProgress?.({kind:'venue-booking',label:'Checking venue requests',detail:'Reading your saved request statuses.',status:'running'});
    return readVenueAnswer(data.session.user.id,question,signal);
  }
  if (!images.length && permanentCourseQuestion(question)) return askCampusAssistant(question,[],signal,[],route,onProgress);
  if (!images.length && isProgramRegistrationQuestion(question)) {
    onProgress?.({kind:'program-registrations',label:'Checking interdisciplinary program registrations',detail:'Reading your School Affairs records.',status:'running'});
    const result:AssistantResponse = await readProgramRegistrationAnswer(data.session.user.id,question,signal);
    if (typeof result?.answer !== 'string' || result.grounding?.source !== 'account') throw new Error('Program registrations could not be loaded.');
    return result;
  }
  if(!images.length&&clearanceQuestion(question)){
    onProgress?.({kind:'graduation-clearance',label:'Checking graduation clearance',detail:'Reading your applications and office decisions.',status:'running'});
    const result=await readGraduationClearanceAnswer(data.session.user.id,question,signal) as AssistantResponse;
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Graduation clearance records could not be loaded.');
    return result;
  }
  const teachingFeedback=!images.length&&teachingFeedbackQuestion(question);
  if(teachingFeedback){
    onProgress?.({kind:'teaching-feedback',label:'Checking teaching feedback',detail:'Reading your saved completion and review statuses.',status:'running'});
    const result=await readTeachingFeedbackAnswer(data.session.user.id,teachingFeedback,question,signal) as AssistantResponse;
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Teaching feedback records could not be loaded.');
    return result;
  }
  if (!images.length && earlyGraduationQuestion(question)) {
    onProgress?.({kind:'early-graduation',label:'Checking early graduation',detail:'Reading your application window and saved records.',status:'running'});
    const result=await readEarlyGraduationAnswer(data.session.user.id,question,signal) as AssistantResponse;
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Early graduation records could not be loaded.');
    return result;
  }
  if (!images.length && creditTransferQuestion(question)) {
    onProgress?.({kind:'credit-transfer',label:'Checking credit transfer',detail:'Reading your saved applications.',status:'running'});
    const result=await readCreditTransferAnswer(data.session.user.id,question,signal) as AssistantResponse;
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Credit transfer records could not be loaded.');
    return result;
  }
  const summer=!images.length&&summerSelectionQuestion(question);
  if(summer){
    if(summer.view!=='mine'||summer.ambiguousYear)return askCampusAssistant(question,[],signal,[],route,onProgress);
    onProgress?.({kind:'course-adjustment',label:'Checking summer eligibility',detail:'Reading your saved eligibility decision.',status:'running'});
    const params=new URL(route||'/',window.location.origin);
    const routeYear=params.pathname===adjustmentPaths.summer?params.searchParams.get('year'):null;
    const year=summer.year??(routeYear&&/^[1-9][0-9]{2}$/.test(routeYear)?Number(routeYear):undefined);
    const result:AssistantResponse=await readCourseAdjustmentAnswer(data.session.user.id,'summer',question,signal,year);
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Summer eligibility could not be checked.');
    return result;
  }
  const adjustment = !images.length && adjustmentQuestion(question);
  const withdrawal = !images.length && withdrawalQuestion(question);
  if(withdrawal){
    onProgress?.({kind:'course-withdrawal',label:'Checking course withdrawal',detail:'Reading your saved withdrawal records and window.',status:'running'});
    const result:AssistantResponse=await readWithdrawalAnswer(data.session.user.id,withdrawal,question,signal);
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Course withdrawal records could not be loaded.');
    return result;
  }
  if (adjustment && adjustment !== 'rules') {
    onProgress?.({kind:'course-adjustment',label:'Checking course adjustment',detail:'Reading your saved eligibility decision.',status:'running'});
    const result:AssistantResponse = await readCourseAdjustmentAnswer(data.session.user.id,adjustment,question,signal);
    if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new Error('Eligibility could not be checked.');
    return result;
  }
  if (!images.length && (adjustment === 'rules' || courseSubstitutionQuestion(question,route) || firstSelectionQuestion(question,route))) {
    return askCampusAssistant(question,[],signal,[],route,onProgress);
  }
  return askVerifiedAccount(accessToken,question,history,signal,images,route,onProgress);
}

async function askVerifiedAccount(accessToken:string, question:string, history:Array<{role:string;content:string}>, signal:AbortSignal|undefined, images:Array<{name:string;dataUrl:string}>, route:string, onProgress:((step:AssistantProgress)=>void)|undefined) {
  const response = await fetch('/api/affairs-assistant', {
    method:'POST', signal, headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
    body:JSON.stringify({question:question.trim(),history:history.slice(-6).map(item=>({role:item.role,content:item.content.slice(0,2000)})),images,route,stream:Boolean(onProgress)}),
  });
  const result = await readAssistantReply(response,onProgress) as (Partial<AssistantResponse> & {error?:string})|null;
  if (!response.ok || typeof result?.answer !== 'string') throw new Error(typeof result?.error === 'string' ? result.error : 'Your account answer could not be loaded. Please try again or sign in again.');
  return {answer:result.answer,status:result.status||'answered',citations:result.citations||[],suggestedQuestions:result.suggestedQuestions||[],grounding:result.grounding,verification:result.verification,views:result.views,activity:result.activity,feedback:result.feedback,proposedAction:result.proposedAction};
}
