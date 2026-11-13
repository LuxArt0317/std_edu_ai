import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';
import conversations from '../server/assistantConversations.js';
import { loadCourseCatalog } from '../server/courseCatalog.js';
import { DtmSubmissionError, loadDtmSubmissionWorkspace, createDtmSubmissionDownload } from '../server/dtmSubmissions.js';
import { EnrollmentCertificateError, loadEnrollmentCertificate, loadEnrollmentCertificateAdmin } from '../server/enrollmentCertificate.js';
import { SyllabusSearchError, loadSyllabusSearch, loadSyllabusOptions, loadSyllabusDetail } from '../server/syllabusSearch.js';
import { TuitionDocumentsError, loadTuitionDocuments, loadTuitionDocumentsAdmin } from '../server/tuitionDocuments.js';

type Request = {method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,string|string[]|undefined>};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
export default async function handler(request:Request,response:Response) {
  if(first(request.query?.resource)==='conversations')return conversations(request,response);
  const requestDeadline=Date.now()+17000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed'});return;}
  try {
    const authorization=first(request.headers.authorization);
    const account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    const scope=request.query?.scope;
    if(Array.isArray(scope)){response.status(400).json({error:'Choose one records scope.'});return;}
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
    const known=error instanceof AffairsWorkspaceError||error instanceof DtmSubmissionError||error instanceof EnrollmentCertificateError||error instanceof SyllabusSearchError||error instanceof TuitionDocumentsError;
    response.status(known?error.status:503).json({error:known?error.message:'School Affairs records could not be loaded.'});
  }
}
