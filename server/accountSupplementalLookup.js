import {isStudentConductEvidenceQuestion,studentConductEvidenceMaxBytes} from './accountStudentConductEvidence.js';
import {isStudentLoanEvidenceQuestion,studentLoanEvidenceMaxBytes} from './accountStudentLoanEvidence.js';
import {isAidPaymentsEvidenceQuestion,aidPaymentsEvidenceMaxBytes} from './accountAidPaymentsEvidence.js';
import {aidPaymentsPageSize,aidPaymentsPaths} from './aidPaymentsContract.js';
import {dtmGradeReportEvidenceMaxBytes,unavailableDtmGradeReportEvidence} from './accountDtmGradeReportEvidence.js';
import {mentionsDtmSubmissionDetail,shouldReadNativeDtmGrades} from './dtmGradeEvidenceIntent.js';
import {elearningEvidenceMaxBytes,unavailableElearningEvidence} from './accountElearningEvidence.js';
import {independentElearningQuestion,isElearningEvidenceQuestion} from './elearningEvidenceIntent.js';
import {isCatalogEvidenceQuestion} from './accountCatalogEvidence.js';
import {isCertificateEvidenceQuestion} from './accountCertificateEvidence.js';
import {isSubmissionEvidenceQuestion} from './accountSubmissionEvidence.js';
import {isTuitionEvidenceQuestion} from './accountTuitionEvidence.js';
import {normalizeSyllabusSearchQuery} from './syllabusSearch.js';
import {formatSupplementalAccountAnswers} from './supplementalAccountAnswers.js';

export const supplementalAccountTools=Object.freeze({
  courseCatalog:'Published local sample course offerings and syllabus plans, independent of enrollment. Supports exact offering IDs and validated keyword/term/department/theme search.',
  enrollmentCertificate:'Own saved enrollment-certificate assessment, literal independent pending-fee flag/status and individually requested identity fields; no issuance/download capability.',
  dtmSubmissions:'Own saved DTM assignment file metadata and revision-specific reviews; current files, retained older reviews and pending reservations are distinct. No file content or upload action.',
  studentConduct:'Own saved student conduct rows, including reason, quantity and void text. Different from dormitory conduct or official clearance.',
  studentLoan:'Own saved student loan application state, progress and history metadata. No disbursement, payment or official approval.',
  tuition:'Own literal saved tuition settlement statements/periods at49-1, plus explicit unavailable file capabilities at48-1/48-3 and extended-study records at48-2; not charges, balances or payment ledger.',
  aidPayments:'Own saved student aid claims and salary records, with separate counts, exact periods, amounts, deductions and approval text. Independent from financial aid applications, student loans, tuition, and bank transfers.',
  dtmGradeReport:'Own native DTM grade report and grades overview. Literal report items, feedback and saved total values. Separate from the personal grade tracker, file reviews, and School Affairs transcript.',
  elearningEnrollments:'Saved local remote-learning Moodle course enrollments and joined times. Separate from DTM and School Affairs. Does not contain personal remote-learning grades, assignments, submissions or attendance.',
});
const predicates={courseCatalog:isCatalogEvidenceQuestion,enrollmentCertificate:isCertificateEvidenceQuestion,dtmSubmissions:isSubmissionEvidenceQuestion,tuition:isTuitionEvidenceQuestion,studentConduct:isStudentConductEvidenceQuestion,studentLoan:isStudentLoanEvidenceQuestion,aidPayments:isAidPaymentsEvidenceQuestion,dtmGradeReport:shouldReadNativeDtmGrades,elearningEnrollments:isElearningEvidenceQuestion};
const keys=Object.keys(supplementalAccountTools),plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const sourceLimits={courseCatalog:18000,enrollmentCertificate:12000,dtmSubmissions:24000,tuition:16000,studentConduct:studentConductEvidenceMaxBytes,studentLoan:studentLoanEvidenceMaxBytes,aidPayments:aidPaymentsEvidenceMaxBytes,dtmGradeReport:dtmGradeReportEvidenceMaxBytes,elearningEnrollments:elearningEvidenceMaxBytes};
export const supplementalEvidenceBudget=54000;
export function requiredSupplementalTools(question,route='',history=[]){
  const remote=isElearningEvidenceQuestion(question,route,history);
  const otherQuestion=remote?independentElearningQuestion(question,route,history):question;
  const nativeGradeOnly=shouldReadNativeDtmGrades(otherQuestion,route,history)&&!mentionsDtmSubmissionDetail(otherQuestion,history);
  return keys.filter(key=>key==='elearningEnrollments'?remote:otherQuestion&&(key!=='dtmSubmissions'||!nativeGradeOnly)&&predicates[key](otherQuestion,route,history));
}
const queryKeys=['id','search_scope','keyword','term','department','themes','page','page_size','sort','direction'];
export const catalogReadPlanSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:Object.fromEntries(queryKeys.map(key=>[key,{type:['string','null'],...(key==='search_scope'?{enum:['current','historical',null]}:key==='direction'?{enum:['asc','desc',null]}:{})}])),required:queryKeys}]};
/** Only named search fields, never a table/owner/URL. Reader independently
 * validates the complete route and conflicts before any transport. */
export function validateCatalogReadPlan(value){
  if(value===null||value===undefined)return null;
  if(!plain(value)||Object.keys(value).some(key=>!queryKeys.includes(key)||!(value[key]===null||typeof value[key]==='string')))throw new TypeError('Invalid catalog read selectors.');
  const query=Object.fromEntries(Object.entries(value).filter(([,value])=>value!==null));
  if(query.id!==undefined){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.id)||Object.keys(query).length!==1)throw new TypeError('Invalid catalog read selectors.');return query;}
  if(query.themes&&new Set(query.themes.split(',')).size!==query.themes.split(',').length)throw new TypeError('Invalid catalog read selectors.');
  const args=normalizeSyllabusSearchQuery({search_scope:'historical',page_size:'20',...query});
  if(args.p_page_size>50||args.p_page>1000)throw new TypeError('Invalid catalog read selectors.');
  return query;
}
function catalogRouteContext(route,question){
  const url=new URL(route||'/','https://stu.best');
  if(url.origin!=='https://stu.best'||!/^\/school-affairs\/services\/(?:12-3|12-4)\/?$/.test(url.pathname))return false;
  if([...url.searchParams].some(([key,value])=>['course','syllabus','keyword','term','department','themes','yr','dep','search_scope','searched'].includes(key)&&value))return true;
  return /^(?:show|list|browse)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:course\s+)?(?:catalog(?:ue)?|offerings?|available courses)\s*[.!?]?$/i.test(question.trim())||/\b(?:this page|this catalog|these offerings)\b|這個頁面|本頁|這些課程/.test(question);
}
function unavailable(key,reason){
  if(key==='dtmGradeReport')return unavailableDtmGradeReportEvidence(reason);
  if(key==='elearningEnrollments')return unavailableElearningEvidence(reason);
  const checkedAt=new Date().toISOString(),common={checkedAt,rules:'This selected lookup is unavailable. No record absence or successful account read can be inferred.'};
  let payload,url;
  if(key==='courseCatalog'){url='/school-affairs/services/12-4';payload={...common,collection:'courseCatalog',readState:'unavailable',reason,provenance:{sourceMode:'sample',officialUniversityData:false,enrollmentEvidence:false},rows:[],omittedFields:[],counts:{total:null,returnedRows:null,includedRows:null,complete:false}};}
  else if(key==='enrollmentCertificate'){url='/school-affairs/services/17-1';payload={...common,collection:'enrollmentCertificate',sourceMode:'local_demo',readState:'unavailable',assessment:null};}
  else if(key==='dtmSubmissions'){url='/dtm';payload={...common,officialUniversityData:false,selection:{scope:'unavailable',requiresClarification:false,choices:[]},counts:{available:null,selected:null,requested:null,loaded:null,included:null,omitted:null,unavailable:null},complete:false,records:[],unavailable:[]};}
  else if(key==='aidPayments'){
    url=aidPaymentsPaths.claims;payload={...common,collection:key,readState:'unavailable',
      selection:{views:[],summaryOnly:false,scope:'owned_first_page_per_view',page:1,pageSize:aidPaymentsPageSize},
      provenance:{source:'saved_local',officialUniversityData:false,synchronizationVerified:false,currency:null},
      counts:{viewsSelected:0,viewsLoaded:0,viewsUnavailable:0,available:null,included:0,omitted:null},
      complete:false,recordsComplete:false,excerpted:false,views:[],
      capabilities:{read:true,write:false,approve:false,pay:false,bankAccess:false,verifiedDocument:false}};
  }
  else if(key==='studentConduct'||key==='studentLoan'){
    url=key==='studentConduct'?'/school-affairs/services/38-1':'/school-affairs/services/21-1';
    payload={...common,collection:key,sourceMode:'local_demo',readState:'unavailable',unavailableReason:reason,complete:false,excerpted:false,
      counts:{available:null,matching:null,included:0,omitted:null},...(key==='studentConduct'?{records:[]}:{record:null,recordPresent:null})};
  }
  else{url='/school-affairs/services/49-1';payload={...common,collection:'tuition',sourceMode:'local_demo',readState:'unavailable',coverageScope:'selected_settlement_records_and_periods_only',selection:{view:'settlement',requestedViews:['settlement'],scope:'unavailable',requiresClarification:false,choices:[]},serviceAvailability:[{view:'settlement',url,capability:'literal_settlement_records'}],counts:{available:null,matching:null,included:null,omitted:null},complete:false,excerpted:false,records:{periods:[],settlements:[]}};}
  const provenance=key==='aidPayments'?'saved_local':['tuition','enrollmentCertificate','studentConduct','studentLoan'].includes(key)?'local_demo':null;
  return {readState:'unavailable',reason,evidence:{id:'account:'+key,title:supplementalAccountTools[key],url,urls:[url],...(provenance?{provenance}:{}),content:JSON.stringify(payload)}};
}
function trimOne(result){
  const p=JSON.parse(result.evidence.content),key=result.evidence.id.slice(8);
  if(key==='courseCatalog'&&p.rows.length>1){p.rows.pop();p.counts.includedRows--;p.counts.complete=false;p.readState='partial';p.reason='evidence_budget';result.readState='partial';result.reason='evidence_budget';}
  else if(key==='dtmSubmissions'){
    const old=[...p.records].reverse().find(row=>row.reviewedRetiredFiles.length);
    if(old){old.reviewedRetiredFiles.pop();old.reviewHistory.included--;old.reviewHistory.omitted++;old.reviewHistory.completeRetainedHistory=false;}
    else if(p.records.length>1){p.records.pop();p.counts.included--;p.counts.omitted++;}
    else return false;
    p.complete=false;result.readState='partial';result.reason='evidence_budget';
  }else if(key==='tuition'&&p.records.periods.length>1){
    p.records.periods.pop();if(p.records.settlements.length)p.records.settlements.pop();p.counts.included--;p.counts.omitted++;p.complete=false;p.excerpted=true;
  }else if(key==='studentConduct'&&p.records.length>1){
    p.records.pop();p.counts.included--;p.counts.omitted++;p.complete=false;p.excerpted=true;
  }else return false;
  result.evidence.content=JSON.stringify(p);return true;
}
/** Whole validated rows/lineage only. Keep one source record where possible;
 * if even that cannot fit, mark that source unavailable, never empty. */
export function boundSupplementalResults(input,budget=supplementalEvidenceBudget){
  if(!Array.isArray(input)||input.length>keys.length||!Number.isSafeInteger(budget)||budget<6000||budget>supplementalEvidenceBudget)throw new TypeError('Invalid supplemental budget.');
  const results=structuredClone(input);
  for(const result of results){if(bytes(result)>(sourceLimits[result?.evidence?.id?.slice(8)]||0))throw new TypeError('Invalid supplemental source budget.');formatSupplementalAccountAnswers([result]);}
  if(new Set(results.map(result=>result.evidence.id)).size!==results.length)throw new TypeError('Duplicate supplemental sources.');
  while(bytes(results)>budget){
    const ranked=results.map((result,index)=>({result,index,size:bytes(result)})).sort((a,b)=>b.size-a.size);
    if(ranked.some(({result})=>trimOne(result)))continue;
    const candidate=ranked.find(({result})=>result.reason!=='aggregate_evidence_budget');
    if(!candidate)throw new RangeError('Supplemental metadata exceeds aggregate budget.');
    results[candidate.index]=unavailable(candidate.result.evidence.id.slice(8),'aggregate_evidence_budget');
  }
  return results;
}
/** API closures capture verified credentials; this context never carries them.
 * Two concurrent read-only callbacks share the request's absolute deadline. */
export async function readSupplementalLookups({tools,readers={},question,route='',history=[],snapshot,deadline,attempt=1,catalogQuery=null,onProgress=()=>{}}){
  const selected=[...new Set(tools.filter(key=>keys.includes(key)))],results=new Array(selected.length);
  readers={...readers};history=history.map(row=>({...row}));catalogQuery=catalogQuery===null?null:structuredClone(catalogQuery);
  const deadlineExceeded=Symbol('Supplemental account read timed out');
  let next=0;
  const emit=(key,status,detail)=>{try{onProgress({kind:`account-read:${key}:${attempt}`,label:(status==='running'?'Reading ':'Checked ')+supplementalAccountTools[key],detail,status});}catch{/* Disconnected progress cannot approve a read. */}};
  const worker=async()=>{while(next<selected.length){
    const index=next++,key=selected[index];let timer,result;
    try{
      if(!Number.isFinite(deadline)||Date.now()>=deadline)result=unavailable(key,'deadline_exceeded');
      else if(typeof readers[key]!=='function')result=unavailable(key,'reader_unavailable');
      else if(key==='courseCatalog'&&catalogQuery===null&&!catalogRouteContext(route,question))result=unavailable(key,'catalog_selection_unavailable');
      else{
        const query=key==='courseCatalog'?validateCatalogReadPlan(catalogQuery):null;
        emit(key,'running','Starting the selected authorized reader. No action is executed.');
        result=await Promise.race([
          Promise.resolve().then(()=>readers[key]({question,route,history:history.map(row=>({...row})),snapshot,deadline,...(query===null?{}:{catalogQuery:query})})),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(deadlineExceeded),Math.max(1,deadline-Date.now()));}),
        ]);
        if(Date.now()>=deadline)throw deadlineExceeded;
        result=structuredClone(result);
        if(result?.evidence?.id!=='account:'+key)throw new TypeError('Reader source mismatch.');
        if(bytes(result)>sourceLimits[key])throw new TypeError('Reader source exceeds its fixed budget.');
        formatSupplementalAccountAnswers([result],{question});
      }
    }catch(error){result=unavailable(key,error===deadlineExceeded||Date.now()>=deadline?'deadline_exceeded':'read_failed');}
    finally{if(timer!==undefined)clearTimeout(timer);}
    results[index]=result;
    const payload=JSON.parse(result.evidence.content),limited=result.readState==='partial'||payload.complete===false||payload.counts?.complete===false||payload.selection?.requiresClarification;
    emit(key,result.readState==='unavailable'?'unavailable':'complete',result.readState==='unavailable'?'The selected lookup is unavailable. No absent record was inferred.':limited?'The lookup returned limited evidence or requires a choice; omitted records remain unknown.':result.readState==='empty'?'The authorized lookup completed with no matching saved records in its stated scope.':'The selected authorized lookup completed. Only its returned scope can support the answer.');
  }};
  await Promise.all(Array.from({length:Math.min(2,selected.length)},worker));
  const bounded=boundSupplementalResults(results);
  for(let i=0;i<bounded.length;i++)if(bounded[i].evidence.content!==results[i].evidence.content||bounded[i].readState!==results[i].readState)emit(selected[i],bounded[i].readState==='unavailable'?'unavailable':'complete','The aggregate evidence limit omitted complete records; missing values remain unknown.');
  return bounded;
}
