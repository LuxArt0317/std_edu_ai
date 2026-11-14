import {readStudentConductEvidence} from '../server/accountStudentConductEvidence.js';
import {readStudentLoanEvidence} from '../server/accountStudentLoanEvidence.js';
import {readAidPaymentsEvidence} from '../server/accountAidPaymentsEvidence.js';
import {isForeignAidPaymentsQuestion} from '../server/aidPaymentsEvidenceIntent.js';
import {readDtmGradeReportEvidence} from '../server/accountDtmGradeReportEvidence.js';
import {isForeignDtmGradesQuestion} from '../server/dtmGradeEvidenceIntent.js';
import {independentElearningQuestion,isElearningEvidenceQuestion,isForeignElearningRecordsQuestion} from '../server/elearningEvidenceIntent.js';
import {readElearningEvidence} from '../server/accountElearningEvidence.js';
import {readFacilityRepairEvidence} from '../server/accountFacilityRepairEvidence.js';
import {isForeignFacilityRepairQuestion} from '../server/facilityRepairEvidenceIntent.js';
import {readDormitoryConductEvidence} from '../server/accountDormitoryConductEvidence.js';
import {readElearningOutlineEvidence} from '../server/accountElearningOutlineEvidence.js';
import {facilityRepairLookupContext,nativePageLookupContext} from '../server/accountSupplementalLookup.js';
import {randomUUID} from 'node:crypto';
import { questionKind } from '../server/schoolWebSearch.js';
import { accountQuestionIntent } from '../server/affairsAnswer.js';
import { answerAccountWithVerification, requiredNativeTools, requiredSupplementalTools, type SupplementalAccountReaders } from '../server/answerVerificationAccount.js';
import { readCatalogEvidence } from '../server/accountCatalogEvidence.js';
import { readCertificateEvidence } from '../server/accountCertificateEvidence.js';
import { readSubmissionEvidence } from '../server/accountSubmissionEvidence.js';
import { readTuitionEvidence } from '../server/accountTuitionEvidence.js';
import { answerCampusNavigation } from '../server/schoolAffairsDirectory.js';
import { isDtmRecordQuestion } from '../server/dtmAnswer.js';
import { isScholarshipRecordQuestion } from '../server/scholarshipRecords.js';
import { isStudentAidRecordQuestion } from '../server/studentAidRecords.js';
import { isHousingRecordQuestion } from '../server/housingRecords.js';
import { isPendingFeeQuestion } from '../server/pendingFeesAnswer.js';
import { isCreditLoadHistoryQuestion } from '../server/creditLoadHistory.js';
import { isCourseSelectionQuestion } from '../server/courseSelection.js';
import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';
import { createAssistantStream } from '../server/assistantStream.js';
import { readAssistantReply } from '../src/services/assistantStreamReader.js';
import researchHandler from '../server/researchAssistantHandler.js';

type ApiRequest = {method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type ApiResponse = {status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void;write?:(chunk:string)=>void;end?:()=>void;flushHeaders?:()=>void};
type PublicResearchHandler = (request:ApiRequest,response:ApiResponse)=>Promise<void>;
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
  void Promise.resolve().then(()=>handler(request,response)).then(()=>{
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
  readers?:{courseCatalog?:typeof readCatalogEvidence;enrollmentCertificate?:typeof readCertificateEvidence;dtmSubmissions?:typeof readSubmissionEvidence;tuition?:typeof readTuitionEvidence;studentConduct?:typeof readStudentConductEvidence;studentLoan?:typeof readStudentLoanEvidence;aidPayments?:typeof readAidPaymentsEvidence;dtmGradeReport?:typeof readDtmGradeReportEvidence;elearningEnrollments?:typeof readElearningEvidence;facilityRepairs?:typeof readFacilityRepairEvidence;dormitoryConduct?:typeof readDormitoryConductEvidence;elearningOutline?:typeof readElearningOutlineEvidence};
}={}) {
const publicResearch=dependencies.publicResearch??researchHandler;
const verifyToken=dependencies.verifyToken??verifyAffairsToken,loadSnapshot=dependencies.loadSnapshot??loadAffairsSnapshot,answerAccount=dependencies.answerAccount??answerAccountWithVerification;
const readers={courseCatalog:dependencies.readers?.courseCatalog??readCatalogEvidence,enrollmentCertificate:dependencies.readers?.enrollmentCertificate??readCertificateEvidence,
  dtmSubmissions:dependencies.readers?.dtmSubmissions??readSubmissionEvidence,tuition:dependencies.readers?.tuition??readTuitionEvidence,
  studentConduct:dependencies.readers?.studentConduct??readStudentConductEvidence,studentLoan:dependencies.readers?.studentLoan??readStudentLoanEvidence,
  aidPayments:dependencies.readers?.aidPayments??readAidPaymentsEvidence,
  dtmGradeReport:dependencies.readers?.dtmGradeReport??readDtmGradeReportEvidence,
  elearningEnrollments:dependencies.readers?.elearningEnrollments??readElearningEvidence,
  facilityRepairs:dependencies.readers?.facilityRepairs??readFacilityRepairEvidence,
  dormitoryConduct:dependencies.readers?.dormitoryConduct??readDormitoryConductEvidence,
  elearningOutline:dependencies.readers?.elearningOutline??readElearningOutlineEvidence};
return async function handler(request:ApiRequest,response:ApiResponse) {
  const deadline=Date.now()+55_000;
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST') {response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  const body=typeof request.body==='string' ? (()=>{try{return JSON.parse(request.body);}catch{return null;}})() : request.body;
  const input=body && typeof body==='object' && !Array.isArray(body) ? body as Record<string,unknown> : null;
  const question=typeof input?.question==='string'?input.question.trim():'';
  if(question.length<2||question.length>2000) {response.status(400).json({error:'Provide a question between 2 and 2,000 characters.'});return;}
  let route:string;
  try{route=validateAffairsAssistantRoute(input?.route);}catch{response.status(400).json({error:'Provide a local page route of at most 3,100 characters, without a fragment.'});return;}
  let account;
  try {
    const authorization=value(request.headers.authorization);
    const verified=await verifyToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
    // Only verified transport/identity scalars enter these private closures.
    // Copy before any later await; neither graph state nor planner input gets
    // credentials or a mutable reference to the verifier's account object.
    account=Object.freeze({url:verified.url,key:verified.key,token:verified.token,user:Object.freeze({id:verified.user.id,...(verified.user.email?{email:verified.user.email}:{})})});
  } catch(error) {
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'School Affairs sign-in could not be checked.'});return;
  }
  const now=Date.now(),active=(requestWindows.get(account.user.id)||[]).filter(time=>time>now-60_000);
  active.push(now);requestWindows.set(account.user.id,active);
  if(active.length>24){response.status(429).json({error:'Too many questions. Please wait a moment.'});return;}
  const history=Array.isArray(input?.history)?input.history.slice(-6).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const entry=item as Record<string,unknown>;
    return ['user','assistant'].includes(String(entry.role))&&typeof entry.content==='string'?[{role:String(entry.role),content:entry.content.slice(0,1000)}]:[];
  }):[];
  const correlationId=randomUUID();
  response.setHeader('X-Assistant-Request-Id',correlationId);
  const stream=createAssistantStream(input?.stream===true,response);
  const foreignDtmGrades=isForeignDtmGradesQuestion(question,route);
  const foreignElearning=isForeignElearningRecordsQuestion(question,route);
  const foreignRepair=isForeignFacilityRepairQuestion(question);
  const pageContext=nativePageLookupContext(question,route,history);
  if(foreignDtmGrades||foreignElearning||foreignRepair||pageContext.foreign||isForeignAidPaymentsQuestion(question)){
    const chinese=/[\u3400-\u9fff]/u.test(question);
    const records=foreignDtmGrades?(chinese?'數位教材成績紀錄':'Moodle grade records')
      :foreignElearning?(chinese?'數位學園紀錄':'remote-learning Moodle records')
        :foreignRepair?(chinese?'報修紀錄':'facility repair records')
          :pageContext.foreign?(chinese?'宿舍獎懲或數位學園課程紀錄':'dormitory conduct or remote-learning course records')
            :(chinese?'薪資或助學請款紀錄':'salary or aid claim records');
    const answer=chinese?`我只能查詢您登入的 stu.best 帳戶，無法存取其他學生的${records}。`
      :`I can only check your signed-in stu.best account. I can’t show another student’s ${records}.`;
    stream.progress('account-access',chinese?'已確認帳戶範圍':'Checked account access',answer,'complete');
    stream.send(200,{status:'handoff',answer,citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}});
    return;
  }
  const intent=accountQuestionIntent(question,history,route);
  if(intent.recognized&&intent.kind==='coaching'&&!intent.baseTools.length&&!pageContext.selected){
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
      stream.progress('guidance',answer.verification?.status==='verified'?'Answer ready':'Verification incomplete',
        answer.verification?.status==='verified'?'The guidance passed the independent checks.':'The unchecked draft was withheld.',answer.verification?.status==='verified'?'complete':'unavailable');
      stream.send(200,answer);
    }catch{stream.send(503,{error:'The guidance could not be checked. Please try again.'});}
    return;
  }
  const needsRecords=intent.baseTools.length>0 || personal(question,history) || isDtmRecordQuestion(question,route,history) || isScholarshipRecordQuestion(question,route,history) || isStudentAidRecordQuestion(question,route,history) || isHousingRecordQuestion(question,route,history) || isPendingFeeQuestion(question,route,history) || isCreditLoadHistoryQuestion(question,route,history) || isCourseSelectionQuestion(question,route,history) || requiredNativeTools(question,route,history).length>0 || requiredSupplementalTools(question,route,history).length>0;
  const navigation=!needsRecords && !(Array.isArray(input?.images) && input.images.length) && !questionKind(question).irrelevant
    ? answerCampusNavigation(question) : null;
  if(navigation) {
    stream.progress('directory','Checked campus services','Found a verified service link.','complete');
    stream.send(200,navigation);
    return;
  }
  if(!needsRecords) {
    // Reuse this deployment's public handler; never send account state into it.
    stream.progress('public','Checking public school information','This question does not need your account records.');
    try {
      const research=await dispatchPublicResearch(publicResearch,{
        method:'POST',
        headers:{'content-type':'application/json',...(value(request.headers['x-forwarded-for'])?{'x-forwarded-for':value(request.headers['x-forwarded-for'])!}:{})},
        body:{question,history:[],images:Array.isArray(input?.images)?input.images.map(image=>{
          if(!image||typeof image!=='object'||Array.isArray(image))return image;
          const attachment=image as Record<string,unknown>;
          return {name:attachment.name,dataUrl:attachment.dataUrl};
        }):input?.images,route,consentedResearchUse:false,stream:stream.enabled},
      },deadline,step=>stream.progress(step.kind,step.label,step.detail,step.status));
      const result=research.result as Record<string,unknown>|null;
      if(!result || typeof result!=='object' || Array.isArray(result) || (!research.ok && typeof result.error!=='string')) {stream.send(502,{error:'School research returned an invalid response.'});return;}
      stream.progress('public','Checked public information','The public school lookup finished.','complete');
      stream.send(research.status,result);
    } catch {stream.send(503,{error:'School research is temporarily unavailable. Please try again.'});}
    return;
  }
  if(Array.isArray(input?.images) && input.images.length) {stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});return;}
  try {
    const residual=pageContext.selected?pageContext.otherQuestion:question;
    const remoteOnly=Boolean(residual)&&isElearningEvidenceQuestion(residual,route,history)&&!independentElearningQuestion(residual,route,history);
    const repairContext=facilityRepairLookupContext(residual,route,history),repairOnly=repairContext.repairOnly;
    const selectedReaderOnly=pageContext.readerOnly||remoteOnly||repairOnly;
    const scopedSnapshot=()=>({checkedAt:new Date().toISOString(),profile:{userId:account.user.id}});
    if(selectedReaderOnly)stream.progress('account','Checked account access','The selected reader uses this signed-in Google account.','complete');
    else stream.progress('account','Loading your account records','Checking School Affairs and DTM records for this signed-in Google account.');
    const snapshot=selectedReaderOnly?scopedSnapshot():await loadSnapshot(account,false,{deadline});
    if(!selectedReaderOnly)stream.progress('account','Loaded your account records','Only records linked to this Google account were read.','complete');
    stream.progress('answer','Preparing your answer','Checking the account data and any requested stu.best action.');
    const readDeadline=(selected:number)=>{
      if(!Number.isFinite(selected))throw new TypeError('Invalid account reader deadline.');
      return Math.min(deadline,selected);
    };
    const supplementalReaders:SupplementalAccountReaders={
      courseCatalog:context=>readers.courseCatalog(account,{question:residual||question,route,query:context.catalogQuery,deadline:readDeadline(context.deadline)}),
      enrollmentCertificate:context=>readers.enrollmentCertificate(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      dtmSubmissions:context=>readers.dtmSubmissions(account,{question:residual||question,route,history,snapshot:context.snapshot,deadline:readDeadline(context.deadline)}),
      studentConduct:context=>readers.studentConduct(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      studentLoan:context=>readers.studentLoan(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      aidPayments:context=>readers.aidPayments(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      dtmGradeReport:context=>readers.dtmGradeReport(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      elearningEnrollments:context=>readers.elearningEnrollments(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
      facilityRepairs:context=>readers.facilityRepairs(account,{question:repairContext.repairQuestion,route,history,deadline:readDeadline(context.deadline)}),
      dormitoryConduct:context=>readers.dormitoryConduct(account,{question:pageContext.questions.dormitoryConduct||question,route,history,deadline:readDeadline(context.deadline)}),
      elearningOutline:context=>readers.elearningOutline(account,{question:pageContext.questions.elearningOutline||question,route,history,deadline:readDeadline(context.deadline)}),
      tuition:context=>readers.tuition(account,{question:residual||question,route,history,deadline:readDeadline(context.deadline)}),
    };
    const answer=await answerAccount({question,correlationId,snapshot,history,route,deadline,supplementalReaders,
      loadSnapshot:()=>selectedReaderOnly?Promise.resolve(scopedSnapshot()):loadSnapshot(account,false,{initialize:false,deadline}),
      onProgress:step=>stream.progress(step.kind,step.label,step.detail,step.status),
    });
    stream.progress('answer',answer.verification?.status==='verified'?'Answer ready':'Verification incomplete',
      answer.verification?.status==='verified'?'The answer passed the account evidence checks.':'An unverified draft was withheld.',
      answer.verification?.status==='verified'?'complete':'unavailable');
    stream.send(200,answer);
  } catch(error) {
    stream.send(error instanceof AffairsWorkspaceError?error.status:503,{error:error instanceof AffairsWorkspaceError?error.message:'Your School Affairs records could not be checked.'});
  }
};
}

export default createAffairsAssistantHandler();
