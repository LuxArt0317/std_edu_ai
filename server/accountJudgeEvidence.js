import {createHash} from 'node:crypto';
import {loadOwnAffairsCharges} from './affairsWorkspace.js';
import {accountEvidence} from './answerVerificationAccount.js';
const route='/school-affairs/services/39-1',caseId='survey-faq-q03';
export const accountJudgeMethodVersion='account-source-context-v1';
/** Caller must supply the server-verified session, never a request-body account.
 * Matching a saved actor is a selection guard, not an execution attestation.
 * Ephemeral evidence describes current caller records, never historical proof.
 */
export async function resolveAccountJudgeEvidence(account,run,caseSnapshot,{deadline=Date.now()+5000,loadCharges=loadOwnAffairsCharges}={}){
 const summary={methodVersion:accountJudgeMethodVersion,checkedAt:new Date().toISOString(),temporalComparability:'current-reconstruction-only',actorAttested:false,
  provenance:'Current authenticated caller reconstruction only. Saved actor identity is not an attestation of historical execution; current records do not prove earlier values.',sources:[]};
 const fail=reason=>({evidence:[],summary:{...summary,reason}});
 if(!account||typeof account.user?.id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(account.user.id)||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())return fail('verified_session_required');
 try{const origin=new URL(account.url);if(origin.protocol!=='https:'||origin.username||origin.password) return fail('verified_session_required');}catch{return fail('verified_session_required');}
 if(run?.scope!=='account'||run.caseId!==caseId)return fail('unsupported_case');
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
