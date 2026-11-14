import { readClubStudent } from '../server/clubStudent.js';
import { clubStudentScope } from '../server/clubStudentContract.js';
import { clubDocumentScope,readClubDocuments } from '../server/clubActivityDocuments.js';
import { clubOfficerScope } from '../server/clubOfficerContract.js';
import { readClubOfficer, readClubServices } from '../server/clubServices.js';
import { clubScope } from '../server/clubServicesContract.js';
import { authorizeHealthReport, readHealthExaminations } from '../server/healthExaminations.js';
import { healthExaminationScope } from '../server/healthExaminationContract.js';
import {readElearning,readElearningCatalog,readElearningOutline} from '../server/elearning.js';
import {readAidPayments} from '../server/aidPayments.js';
import {aidPaymentsScope} from '../server/aidPaymentsContract.js';
import {elearningScope,elearningCatalogScope,elearningOutlineScope} from '../server/elearningContract.js';
import {readCounseling} from '../server/counseling.js';
import {counselingScope} from '../server/counselingContract.js';
import {readCertificateAward} from '../server/certificateAwards.js';
import {certificateAwardScope} from '../server/certificateAwardsContract.js';
import {deliverAnnouncementEmail} from '../server/announcementEmailDelivery.js';
import {readAnnouncementEmail} from '../server/announcementEmail.js';
import {announcementEmailScope} from '../server/announcementEmailContract.js';
import {readStudentProfile} from '../server/studentProfile.js';
import {studentProfileScope} from '../server/studentProfileContract.js';
import {readGraduationClearance} from '../server/graduationClearance.js';
import {servePermanentCourses} from '../server/permanentCourses.js';
import {readVenueRequests,serveVenue} from '../server/venueBooking.js';
import {readFacilityRepairs} from '../server/facilityRepair.js';
import {clearanceScope} from '../server/graduationClearanceContract.js';
import {readTeachingFeedback} from '../server/teachingFeedback.js';
import { readEarlyGraduation } from '../server/earlyGraduation.js';
import { earlyGraduationScope } from '../server/earlyGraduationContract.js';
import { serveCourseSubstitution } from '../server/courseSubstitution.js';
import { serveFirstSelectionNotice } from '../server/firstSelectionNotice.js';
import { readAdjustmentScope, serveAdjustmentNotice, serveSummerNotice } from '../server/courseAdjustment.js';
import { adjustmentNoticeScope, adjustmentScope, summerNoticeScope } from '../server/courseAdjustmentContract.js';
import { readWithdrawalScope } from '../server/courseWithdrawal.js';
import { withdrawalScope } from '../server/courseWithdrawalContract.js';
import { readCreditTransfer } from '../server/creditTransfer.js';
import { creditTransferScope } from '../server/creditTransferContract.js';
import { firstSelectionScope } from '../src/features/public/affairs/firstSelection.js';
import { answerProgramRegistrations, loadProgramRegistrations } from '../server/programRegistration.js';
import { programRegistrationScope } from '../server/programRegistrationContract.js';
import { serveCurriculumMap } from '../server/curriculumMapLookup.js';
import { serveCurriculumPlan } from '../server/curriculumPlanDocument.js';
import { serveInterdisciplinaryPrograms } from '../server/interdisciplinaryPrograms.js';
import { loadTutorEvaluation } from '../server/tutorEvaluation.js';
import { loadExchangeGrants } from '../server/exchangeGrant.js';
import { loadFeeRemission } from '../server/feeRemission.js';
import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';
import conversations from '../server/assistantConversations.js';
import { loadCourseCatalog } from '../server/courseCatalog.js';
import { DtmSubmissionError, loadDtmSubmissionWorkspace, createDtmSubmissionDownload } from '../server/dtmSubmissions.js';
import { EnrollmentCertificateError, loadEnrollmentCertificate, loadEnrollmentCertificateAdmin } from '../server/enrollmentCertificate.js';
import { SyllabusSearchError, loadSyllabusSearch, loadSyllabusOptions, loadSyllabusDetail } from '../server/syllabusSearch.js';
import { TuitionDocumentsError, loadTuitionDocuments, loadTuitionDocumentsAdmin } from '../server/tuitionDocuments.js';
import { StudentConductError, loadStudentConduct, loadStudentConductAdmin } from '../server/studentConduct.js';
import { StudentLoanError, loadStudentLoan, loadStudentLoanAdmin } from '../server/studentLoan.js';
import { DormitoryConductError, loadDormitoryConduct, loadDormitoryConductAdmin } from '../server/dormitoryConduct.js';
import { DtmDashboardLayoutError, loadDtmDashboardLayout } from '../server/dtmDashboardLayout.js';
import { DtmGradeReportError, loadDtmGradeReport, loadDtmGradeReportAdmin, loadDtmGradeReportCoursesAdmin, loadDtmGradeReportOverview } from '../server/dtmGradeReport.js';
import { DtmCourseContentError, loadDtmCourseContent, loadDtmCourseContentAdmin, loadDtmCourseContentCoursesAdmin, loadDtmCourseContentAssignment } from '../server/dtmCourseContent.js';
import { DtmCourseResourceError, loadDtmCourseResource } from '../server/dtmCourseResource.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,string|string[]|undefined>};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void;end?:(data:Buffer)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export const config={maxDuration:60};
export default async function handler(request:Request,response:Response) {
  const scopes=Array.isArray(request.query?.scope)?request.query.scope:[request.query?.scope];
  if (scopes.includes(clubStudentScope) &&
      (scopes.length!==1 || Object.keys(request.query ?? {}).some(key=>!['scope','view','q','page'].includes(key)))) {
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.status(400).json({error:'Invalid student club query.'});
    return;
  }
  if (scopes.includes(clubDocumentScope) &&
      (scopes.length!==1 || Object.keys(request.query ?? {}).some(key=>!['scope','application_id','download','version'].includes(key)))) {
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.status(400).json({error:'Invalid club document query.'});
    return;
  }
  if (scopes.includes(clubOfficerScope) &&
      (scopes.length!==1 || Object.keys(request.query ?? {}).some(key=>!['scope','view','club'].includes(key)))) {
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.status(400).json({error:'Invalid club officer query.'});
    return;
  }
  if (scopes.includes(clubScope) &&
      (scopes.length!==1 || Object.keys(request.query ?? {}).some(key=>!['scope','view','month'].includes(key)))) {
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.status(400).json({error:'Invalid club service query.'});
    return;
  }
  if (scopes.includes(healthExaminationScope) &&
      (scopes.length !== 1 || Object.keys(request.query ?? {}).some(key => key !== 'scope' && key !== 'page' && key !== 'report'))) {
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.status(400).json({ error: 'Invalid health examination inquiry.' });
    return;
  }
  if(first(request.query?.resource)==='announcement-email-delivery')return deliverAnnouncementEmail(request,response);
  if (scopes.includes('venue-search') || scopes.includes('venue-schedule')) return serveVenue(request,response);
  if (scopes.includes('permanent-courses')) return servePermanentCourses(request,response);
  if (scopes.includes(firstSelectionScope)) return serveFirstSelectionNotice(request,response);
  if (scopes.includes(summerNoticeScope)) return serveSummerNotice(request,response);
  if (scopes.includes(adjustmentNoticeScope)) return serveAdjustmentNotice(request,response);
  if (scopes.includes('course-substitution') || scopes.includes('course-substitution-departments')) return serveCourseSubstitution(request,response);
  if (scopes.includes('curriculum-map')) return serveCurriculumMap(request,response);
  if (scopes.includes('curriculum-plan')) return serveCurriculumPlan(request,response);
  if (scopes.includes('interdisciplinary-programs')) return serveInterdisciplinaryPrograms(request,response);
  const strictStudentScope=scopes.some(scope=>typeof scope==='string'&&(scope===elearningScope||scope===elearningCatalogScope||scope===elearningOutlineScope||scope===counselingScope||scope===certificateAwardScope||scope===announcementEmailScope||scope===studentProfileScope||scope===programRegistrationScope||scope.startsWith('tutor-evaluation')||scope.startsWith('exchange-grant')||scope.startsWith('fee-remission')||scope.startsWith('student-conduct')||scope.startsWith('student-loan')||scope.startsWith('dormitory-conduct')||scope.startsWith('dtm-dashboard-layout')||scope.startsWith('dtm-grade-report')||scope.startsWith('dtm-course-content')||scope.startsWith('dtm-course-resource')||scope.startsWith('teaching-feedback')||scope.startsWith(clearanceScope)));
  if(first(request.query?.resource)==='conversations'&&!strictStudentScope&&!scopes.includes(aidPaymentsScope)&&!scopes.includes('venue-requests')&&!scopes.includes('facility-repairs')&&!scopes.some(scope=>typeof scope==='string'&&(scope.startsWith(adjustmentScope)||scope.startsWith(withdrawalScope)||scope.startsWith(creditTransferScope)||scope.startsWith(earlyGraduationScope))))return conversations(request,response);
  const requestDeadline=Date.now()+17000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed'});return;}
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const scope=request.query?.scope;
    if(Array.isArray(scope)){response.status(400).json({error:'Choose one records scope.'});return;}
    if (scope === clubStudentScope) {
      response.status(200).json(await readClubStudent({...account,requestDeadline},request.query??{}));
      return;
    }
    if (scope === clubDocumentScope) {
      const result=await readClubDocuments({...account,requestDeadline},request.query??{});
      if ('bytes' in result) {
        if (!response.end) throw new AffairsWorkspaceError('無法下載附件。',503);
        response.setHeader('Content-Type','application/pdf');
        response.setHeader('Content-Disposition',"attachment; filename=\"club-activity.pdf\"; filename*=UTF-8''"+
          encodeURIComponent(result.filename).replace(/['()*]/g,symbol=>'%'+symbol.charCodeAt(0).toString(16).toUpperCase()));
        response.setHeader('Content-Length',String(result.bytes.length));
        response.end(result.bytes);
      } else {
        response.status(200).json(result);
      }
      return;
    }
    if (scope === clubOfficerScope) {
      const result=await readClubOfficer({...account,requestDeadline},request.query??{});
      response.status(200).json(result);
      return;
    }
    if (scope === clubScope) {
      const result=await readClubServices({...account,requestDeadline},request.query??{});
      response.status(200).json(result);
      return;
    }
    if (scope === healthExaminationScope) {
      const query = request.query ?? {};
      const bounded = { ...account, requestDeadline };
      const result = await ('report' in query ? authorizeHealthReport(bounded, query) : readHealthExaminations(bounded, query));
      response.status(200).json(result);
      return;
    }
    if(scope===aidPaymentsScope){response.status(200).json(await readAidPayments({...account,requestDeadline},request.query??{}));return;}
    if(scope==='venue-requests'){
      response.status(200).json(await readVenueRequests(account,request.query??{}));return;
    }
    if(scope===elearningCatalogScope){response.status(200).json(await readElearningCatalog({...account,requestDeadline},request.query??{}));return;}
    if(scope===elearningOutlineScope){response.status(200).json(await readElearningOutline({...account,requestDeadline},request.query??{}));return;}
    if(scope===elearningScope){response.status(200).json(await readElearning({...account,requestDeadline},request.query??{}));return;}
    if(scope===counselingScope){response.status(200).json(await readCounseling({...account,requestDeadline},request.query??{}));return;}
    if(scope===certificateAwardScope){response.status(200).json(await readCertificateAward({...account,requestDeadline},request.query??{}));return;}
    if(scope===announcementEmailScope){response.status(200).json(await readAnnouncementEmail({...account,requestDeadline},request.query??{}));return;}
    if(scope===studentProfileScope){response.status(200).json(await readStudentProfile({...account,requestDeadline},request.query??{}));return;}
    if(scope==='facility-repairs'){
      response.status(200).json(await readFacilityRepairs({...account,requestDeadline},request.query??{}));return;
    }
    if(typeof scope==='string'&&scope.startsWith(clearanceScope)){
      response.status(200).json(await readGraduationClearance({...account,requestDeadline},request.query??{}));
      return;
    }
    if(typeof scope==='string'&&scope.startsWith('teaching-feedback')){
      response.status(200).json(await readTeachingFeedback({...account,requestDeadline},request.query??{}));
      return;
    }
    if(typeof scope==='string'&&scope.startsWith(earlyGraduationScope)){
      response.status(200).json(await readEarlyGraduation({...account,requestDeadline},request.query??{}));
      return;
    }
    if(scope===creditTransferScope||scope===creditTransferScope+'-admin'){
      response.status(200).json(await readCreditTransfer({...account,requestDeadline},request.query??{}));
      return;
    }
    if(scope===withdrawalScope||scope===withdrawalScope+'-admin'){
      response.status(200).json(await readWithdrawalScope({...account,requestDeadline},request.query??{}));
      return;
    }
    if(scope===adjustmentScope||scope===adjustmentScope+'-admin'){
      response.status(200).json(await readAdjustmentScope({...account,requestDeadline},request.query??{}));
      return;
    }
    if (scope === programRegistrationScope) {
      const answer = request.query?.answer;
      if (!Object.keys(request.query || {}).every(key=>['scope','answer'].includes(key)) ||
        (answer !== undefined && answer !== 'en' && answer !== 'zh')) {
        response.status(400).json({error:'Program registrations take no account selector.'});return;
      }
      const bounded={...account,requestDeadline};
      response.status(200).json(answer === 'en' || answer === 'zh' ? await answerProgramRegistrations(bounded,answer)
        : {userId:account.user.id,records:await loadProgramRegistrations(bounded)});
      return;
    }
    if (typeof scope === 'string' && scope.startsWith('tutor-evaluation')) {
      if (scope !== 'tutor-evaluation' || Object.keys(request.query || {}).length !== 1) {
        response.status(400).json({error:'Tutor evaluation takes no account selector.'});
        return;
      }
      response.status(200).json(await loadTutorEvaluation({...account,requestDeadline}));
      return;
    }
    if (typeof scope === 'string' && scope.startsWith('exchange-grant')) {
      if (scope === 'exchange-grant' && Object.keys(request.query || {}).length === 1) {
        response.status(200).json(await loadExchangeGrants({...account, requestDeadline}));
        return;
      }
      response.status(400).json({error:'Grant history takes no account selector.'});
      return;
    }
    if (typeof scope === 'string' && scope.startsWith('fee-remission')) {
      const keys = Object.keys(request.query || {});
      const userId = request.query?.user_id;
      const bounded = {...account, requestDeadline};
      if (scope === 'fee-remission' && keys.length === 1) {
        response.status(200).json(await loadFeeRemission(bounded));
        return;
      }
      if (scope === 'fee-remission-admin' && keys.length === 2 && typeof userId === 'string') {
        response.status(200).json(await loadFeeRemission(bounded, userId));
        return;
      }
      response.status(400).json({error: 'Choose one fee remission scope and its required account selector.'});
      return;
    }
    if(typeof scope==='string'&&scope.startsWith('dtm-course-resource')){
      const courseId=request.query?.course_id,materialId=request.query?.material_id;
      if(scope==='dtm-course-resource'&&typeof courseId==='string'&&typeof materialId==='string'
        &&Object.keys(request.query||{}).every(key=>['scope','course_id','material_id'].includes(key))){
        response.status(200).json(await loadDtmCourseResource({...account,requestDeadline},{courseId,materialId}));return;
      }
      response.status(400).json({error:'Choose one course and material without additional query fields.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('dtm-course-content')){
      const userId=request.query?.user_id,courseId=request.query?.course_id,assignmentId=request.query?.assignment_id;
      const afterKind=request.query?.after_kind,afterId=request.query?.after_id;
      const keys=Object.keys(request.query||{}),bounded={...account,requestDeadline};
      const validCursor=afterKind===undefined&&afterId===undefined
        ||(afterKind==='assignment'||afterKind==='material')&&typeof afterId==='string';
      const cursor:{afterKind?:'assignment'|'material';afterId?:string}=(afterKind==='assignment'||afterKind==='material')&&typeof afterId==='string'?{afterKind,afterId}:{};
      if(scope==='dtm-course-content'&&typeof courseId==='string'&&validCursor&&keys.every(key=>['scope','course_id','after_kind','after_id'].includes(key))){
        response.status(200).json(await loadDtmCourseContent(bounded,{courseId,...cursor}));return;
      }
      if(scope==='dtm-course-content-admin'&&typeof userId==='string'&&typeof courseId==='string'&&validCursor&&keys.every(key=>['scope','user_id','course_id','after_kind','after_id'].includes(key))){
        response.status(200).json(await loadDtmCourseContentAdmin(bounded,{userId,courseId,...cursor}));return;
      }
      if(scope==='dtm-course-content-courses-admin'&&typeof userId==='string'&&(afterId===undefined||typeof afterId==='string')&&keys.every(key=>['scope','user_id','after_id'].includes(key))){
        response.status(200).json(await loadDtmCourseContentCoursesAdmin(bounded,{userId,...(typeof afterId==='string'?{afterId}:{})}));return;
      }
      if(scope==='dtm-course-content-assignment'&&typeof courseId==='string'&&typeof assignmentId==='string'&&keys.every(key=>['scope','course_id','assignment_id'].includes(key))){
        response.status(200).json(await loadDtmCourseContentAssignment(bounded,{courseId,assignmentId}));return;
      }
      response.status(400).json({error:'Choose one course content scope with only its required fields and a complete pagination cursor.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('dtm-grade-report')){
      const userId=request.query?.user_id,courseId=request.query?.course_id,afterId=request.query?.after_id;
      const keys=Object.keys(request.query||{}),bounded={...account,requestDeadline};
      if(scope==='dtm-grade-report'&&typeof courseId==='string'&&keys.every(key=>['scope','course_id'].includes(key))){
        response.status(200).json(await loadDtmGradeReport(bounded,{courseId}));return;
      }
      if(scope==='dtm-grade-report-admin'&&typeof userId==='string'&&typeof courseId==='string'&&keys.every(key=>['scope','course_id','user_id'].includes(key))){
        response.status(200).json(await loadDtmGradeReportAdmin(bounded,{userId,courseId}));return;
      }
      if(scope==='dtm-grade-report-courses-admin'&&typeof userId==='string'&&(afterId===undefined||typeof afterId==='string')&&keys.every(key=>['scope','user_id','after_id'].includes(key))){
        response.status(200).json(await loadDtmGradeReportCoursesAdmin(bounded,{userId,...(typeof afterId==='string'?{afterId}:{})}));return;
      }
      if(scope==='dtm-grade-report-overview'&&(afterId===undefined||typeof afterId==='string')&&keys.every(key=>['scope','after_id'].includes(key))){
        response.status(200).json(await loadDtmGradeReportOverview(bounded,typeof afterId==='string'?{afterId}:{}));return;
      }
      response.status(400).json({error:'Choose one grade report scope with only its required course, account or pagination fields.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('dtm-dashboard-layout')){
      if(scope!=='dtm-dashboard-layout'||Object.keys(request.query||{}).some(key=>key!=='scope')){
        response.status(400).json({error:'Choose the personal dashboard layout scope without account filters.'});return;
      }
      response.status(200).json(await loadDtmDashboardLayout({...account,requestDeadline}));return;
    }
    if(typeof scope==='string'&&scope.startsWith('dormitory-conduct')){
      const userId=request.query?.user_id;
      if(scope==='dormitory-conduct'){
        if(Object.keys(request.query||{}).some(key=>key!=='scope')){response.status(400).json({error:'Personal dormitory records do not accept account filters.'});return;}
        response.status(200).json(await loadDormitoryConduct({...account,requestDeadline}));return;
      }
      if(scope==='dormitory-conduct-admin'){
        if(typeof userId!=='string'||Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='user_id')){response.status(400).json({error:'Choose one student account for dormitory record maintenance.'});return;}
        response.status(200).json(await loadDormitoryConductAdmin({...account,requestDeadline},{userId}));return;
      }
      response.status(400).json({error:'Choose a supported dormitory records scope.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('student-loan')){
      const userId=request.query?.user_id;
      if(scope==='student-loan'){
        if(Object.keys(request.query||{}).some(key=>key!=='scope')){response.status(400).json({error:'Personal loan records do not accept account filters.'});return;}
        response.status(200).json(await loadStudentLoan({...account,requestDeadline}));return;
      }
      if(scope==='student-loan-admin'){
        if(typeof userId!=='string'||Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='user_id')){response.status(400).json({error:'Choose one student account for loan maintenance.'});return;}
        response.status(200).json(await loadStudentLoanAdmin({...account,requestDeadline},{userId}));return;
      }
      response.status(400).json({error:'Choose a supported loan scope.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('student-conduct')){
      const userId=request.query?.user_id;
      if(scope==='student-conduct'){
        if(Object.keys(request.query||{}).some(key=>key!=='scope')){response.status(400).json({error:'Personal conduct records do not accept account filters.'});return;}
        response.status(200).json(await loadStudentConduct({...account,requestDeadline}));return;
      }
      if(scope==='student-conduct-admin'){
        if(typeof userId!=='string'||Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='user_id')){response.status(400).json({error:'Choose one student account for conduct maintenance.'});return;}
        response.status(200).json(await loadStudentConductAdmin({...account,requestDeadline},{userId}));return;
      }
      response.status(400).json({error:'Choose a supported conduct scope.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('tuition-')){
      const userId=request.query?.user_id;
      if(scope==='tuition-documents'){
        if(Object.keys(request.query||{}).some(key=>key!=='scope')){response.status(400).json({error:'Personal tuition records do not accept account filters.'});return;}
        response.status(200).json(await loadTuitionDocuments({...account,requestDeadline}));return;
      }
      if(scope==='tuition-documents-admin'){
        if(typeof userId!=='string'||Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='user_id')){response.status(400).json({error:'Choose one student account for tuition maintenance.'});return;}
        response.status(200).json(await loadTuitionDocumentsAdmin({...account,requestDeadline},{userId}));return;
      }
      response.status(400).json({error:'Choose a supported tuition scope.'});return;
    }
    if(typeof scope==='string'&&scope.startsWith('syllabus-')){
      const bounded={...account,requestDeadline};
      if(scope==='syllabus-search'){
        response.status(200).json(await loadSyllabusSearch(bounded,request.query));return;
      }
      if(scope==='syllabus-options'){
        if(Object.keys(request.query||{}).some(key=>key!=='scope')){response.status(400).json({error:'Syllabus options do not accept search or account filters.'});return;}
        response.status(200).json(await loadSyllabusOptions(bounded));return;
      }
      if(scope==='syllabus-detail'){
        const id=request.query?.id;
        if(typeof id!=='string'||Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='id')){response.status(400).json({error:'Choose one published syllabus identifier.'});return;}
        response.status(200).json(await loadSyllabusDetail(bounded,id));return;
      }
      response.status(400).json({error:'Choose a supported syllabus scope.'});return;
    }
    if(scope==='enrollment-certificate'||scope==='enrollment-certificate-admin'){
      const userId=request.query?.user_id;
      if(Object.keys(request.query||{}).some(key=>key!=='scope'&&key!=='user_id')||
        userId!==undefined&&(scope!=='enrollment-certificate-admin'||typeof userId!=='string')){
        response.status(400).json({error:'Choose one certificate scope and an optional administrator account filter.'});return;
      }
      const bounded={...account,requestDeadline};
      const result=scope==='enrollment-certificate-admin'
        ?await loadEnrollmentCertificateAdmin(bounded,userId===undefined?{}:{userId:userId as string})
        :await loadEnrollmentCertificate(bounded);
      response.status(200).json(result);return;
    }
    if(scope==='dtm-submission'||scope==='dtm-submission-admin'||scope==='dtm-submission-download'){
      const assignmentId=request.query?.assignment_id,uploadId=request.query?.upload_id;
      if(typeof assignmentId!=='string'||scope==='dtm-submission-download'&&typeof uploadId!=='string'){
        response.status(400).json({error:'A single assignment and saved-file identifier are required.'});return;
      }
      const result=scope==='dtm-submission-download'
        ? await createDtmSubmissionDownload(account,assignmentId,uploadId as string)
        : await loadDtmSubmissionWorkspace(account,assignmentId,{admin:scope==='dtm-submission-admin'});
      response.status(200).json(result);return;
    }
    const snapshot=first(request.query?.scope)==='catalog'
      ? await loadCourseCatalog(account,request.query)
      : await loadAffairsSnapshot(account,first(request.query?.scope)==='admin');
    response.status(200).json(snapshot);
  } catch(error) {
    const known=error instanceof AffairsWorkspaceError||error instanceof DtmSubmissionError||error instanceof EnrollmentCertificateError||error instanceof SyllabusSearchError||error instanceof TuitionDocumentsError||error instanceof StudentConductError||error instanceof StudentLoanError||error instanceof DormitoryConductError||error instanceof DtmDashboardLayoutError||error instanceof DtmGradeReportError||error instanceof DtmCourseContentError||error instanceof DtmCourseResourceError;
    response.status(known?error.status:503).json({error:known?error.message:'School Affairs records could not be loaded.'});
  }
}
