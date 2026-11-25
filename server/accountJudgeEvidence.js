import {loadOwnAffairsTimetable} from './ownAffairsTimetable.js';
import {createHash} from 'node:crypto';
import {loadOwnAffairsCharges} from './affairsWorkspace.js';
import {accountEvidence} from './answerVerificationAccount.js';
import {readStudentLeaveEvidence} from './accountStudentLeaveEvidence.js';
import {studentLeaveLookupContext} from './studentLeaveEvidenceIntent.js';
const supportedCases={'survey-faq-q03':{route:'/school-affairs/services/39-1',kind:'charges'},
 'survey-faq-q13':{route:'/school-affairs/services/11-2',kind:'timetable'},
 'survey-faq-q12':{route:'/school-affairs/services/leave/history',kind:'leaveRecords'}};
export const accountJudgeMethodVersion='account-source-context-v1';
/** Caller must supply the server-verified session, never a request-body account.
 * Matching a saved actor is a selection guard, not an execution attestation.
 * Ephemeral evidence describes current caller records, never historical proof.
 */
export async function resolveAccountJudgeEvidence(account,run,caseSnapshot,{deadline=Date.now()+5000,loadCharges=loadOwnAffairsCharges,loadLeaves=readStudentLeaveEvidence,loadTimetable=loadOwnAffairsTimetable}={}){
 const summary={methodVersion:accountJudgeMethodVersion,checkedAt:new Date().toISOString(),temporalComparability:'current-reconstruction-only',actorAttested:false,
  provenance:'Current authenticated caller reconstruction only. Saved actor identity is not an attestation of historical execution; current records do not prove earlier values.',sources:[]};
 const fail=reason=>({evidence:[],summary:{...summary,reason}});
 if(!account||typeof account.user?.id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(account.user.id)||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())return fail('verified_session_required');
 try{const origin=new URL(account.url);if(origin.protocol!=='https:'||origin.username||origin.password) return fail('verified_session_required');}catch{return fail('verified_session_required');}
 const descriptor=Object.hasOwn(supportedCases,run?.caseId??'')?supportedCases[run.caseId]:null;
 if(run?.scope!=='account'||!descriptor)return fail('unsupported_case');
 const {route}=descriptor,caseId=run.caseId;
 if(run.actor?.id!==account.user.id)return fail('different_or_missing_actor');
 // A caller-selected current or retained immutable case version must explicitly match.
 if(!caseSnapshot||caseSnapshot.id!==caseId||caseSnapshot.scope!=='account'||caseSnapshot.version!==run.caseVersion
  ||typeof run.question!=='string'||caseSnapshot.question!==run.question||caseSnapshot.route!==route)return fail('case_snapshot_mismatch');
 if(run.route!==undefined&&run.route!==caseSnapshot.route)return fail('route_mismatch');
 if(!Number.isFinite(deadline)||deadline<=Date.now())return fail('deadline');
 if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))return fail('deadline');
 const end=Math.min(deadline,Date.now()+5000,account.requestDeadline??Infinity);
 if(end<=Date.now())return fail('deadline');
 try{
  if(descriptor.kind==='timetable'){
   const snapshot=await loadTimetable({...account,user:{id:account.user.id},requestDeadline:end},{deadline:end});
   const coverage=snapshot?.completeness?.courses;
   if(snapshot?.profile?.userId!==account.user.id||typeof snapshot.studentRecordFound!=='boolean'||!Array.isArray(snapshot.courses)
    ||snapshot.officialUniversityData!==false||coverage?.scope!=='owned_enrolled_timetable'||coverage.returned!==snapshot.courses.length
    ||coverage.cap!==200||snapshot.courses.length>200||!Number.isFinite(Date.parse(snapshot.checkedAt)))return fail('read_unavailable');
   if(snapshot.studentRecordFound?coverage.complete!==true||coverage.reason!==null
     :snapshot.courses.length!==0||coverage.complete!==false||coverage.reason!=='student_unlinked')return fail('read_unavailable');
   const evidence=accountEvidence({...snapshot,currentStudyScope:true},['courses'],{question:run.question,route,scopedReadOnly:true,budget:24000});
   const source=evidence.find(item=>item.id==='account:courses');if(!source)return fail('read_unavailable');
   source.content=JSON.stringify({...JSON.parse(source.content),readerCoverage:coverage,
    readerScope:'Only this caller’s saved enrolled timetable. Unlinked students and incomplete/failed reads cannot establish zero classes. Weekly meetings are not proof of actual teaching, attendance, exams, holiday exceptions or university synchronization.'});
   if(Buffer.byteLength(JSON.stringify(evidence))>30000)return fail('evidence_budget');
   return {evidence,summary:{...summary,checkedAt:snapshot.checkedAt,selection:'current_caller_timetable_only',caseVersion:run.caseVersion,route,
    routeResolution:run.route===undefined?'explicit_matching_case_snapshot':'saved_route_and_matching_case_snapshot',
    sources:evidence.map(item=>({id:item.id,checksum:createHash('sha256').update(item.content).digest('hex')})),reason:null}};
  }
  if(descriptor.kind==='leaveRecords'){
   const context=studentLeaveLookupContext(run.question,route,[]);
   if(!context.selection||context.selection.reason||context.otherQuestion||context.excluded)return fail('unsupported_selection');
   const result=await loadLeaves({...account,user:{id:account.user.id},requestDeadline:end},{selection:context.selection,deadline:end});
   if(!['ok','empty','partial'].includes(result?.readState)||result.evidence?.id!=='account:leaveRecords'
    ||typeof result.evidence.content!=='string')return fail('read_unavailable');
   const evidence=[result.evidence];
   if(Buffer.byteLength(JSON.stringify(evidence))>30000)return fail('evidence_budget');
   const payload=JSON.parse(result.evidence.content);
   if(payload.collection!=='leaveRecords'||payload.readState!==result.readState)return fail('read_unavailable');
   return {evidence,summary:{...summary,checkedAt:payload.checkedAt,selection:'current_caller_leave_records_only',caseVersion:run.caseVersion,route,
    routeResolution:run.route===undefined?'explicit_matching_case_snapshot':'saved_route_and_matching_case_snapshot',
    sources:evidence.map(item=>({id:item.id,checksum:createHash('sha256').update(item.content).digest('hex')})),reason:null}};
  }
  const snapshot=await loadCharges({...account,user:{id:account.user.id},requestDeadline:end},{deadline:end,requireExactProjection:true});
  if(snapshot?.profile?.userId!==account.user.id||!Array.isArray(snapshot.charges)||typeof snapshot.studentRecordFound!=='boolean')return fail('read_unavailable');
  const evidence=accountEvidence(snapshot,['charges'],{question:run.question,route:caseSnapshot.route,scopedReadOnly:true,budget:24000});
  if(!evidence.some(item=>item.id==='account:charges')||Buffer.byteLength(JSON.stringify(evidence))>30000)return fail('evidence_budget');
  const sources=evidence.map(item=>({id:item.id,checksum:createHash('sha256').update(item.content).digest('hex')}));
  return {evidence,summary:{...summary,checkedAt:snapshot.checkedAt,selection:'current_caller_charges_only',caseVersion:run.caseVersion,route:caseSnapshot.route,
   routeResolution:run.route===undefined?'explicit_matching_case_snapshot':'saved_route_and_matching_case_snapshot',sources,reason:null}};
 }catch{return fail('read_unavailable');}
}

/** Resolve only an exact saved case version; conflicting retained snapshots fail closed. */
export function accountJudgeCaseSnapshot(state,run){
 const candidates=[...(state?.cases||[]),...(state?.referenceHistory||[]).map(row=>({...row,id:row.caseId}))]
  .filter(row=>row.id===run.caseId&&row.version===run.caseVersion&&row.question===run.question&&row.scope==='account');
 if(!candidates.length||candidates.some(row=>row.route!==candidates[0].route))return null;
 return candidates[0];
}
