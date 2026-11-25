import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';

// Pure metadata planning only. No Auth, SQL, HTTP, Storage, file authorization,
// clinical report, shared catalog or lease operation is performed by this module.
const table='affairs_health_examinations',roles=['A','B'];
const columns=['id','user_id','examination_code','student_number','student_name','class_label','examined_on','report_available'];
const nativeColumns=['id','examination_code','student_number','student_name','class_label','report_available'];
const families=['healthExaminations','empty:healthExaminations','paged:healthExaminations'];
const planned=['metadata','report-unavailable','page-one','page-two','empty-later-page','empty','history-followup','invalid-page','ambiguous-page','invalid-route',
  'clinical-boundary','document-boundary','identity-boundary','write-boundary','mixed-tuition','mixed-reversed','negative-health','foreign-account','anonymous'];
const compounds=['mixed-tuition','mixed-reversed','negative-health'];
const offline=['report-available','read-unavailable','access-denied','wrong-owner','malformed','mixed-health-unavailable','mixed-charges-unavailable'];
const prefix='account:health-examinations-',path='/school-affairs/services/36-1',scope='health-examinations',pageSize=25;
const copy=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const fail=code=>{throw Object.assign(new Error('Health metadata fixture '+code+'.'),{name:'HealthExaminationFixturePlanError',code});};
const requireValue=(value,code)=>{if(!value)fail(code);};
const pageValid=value=>Number.isSafeInteger(value)&&value>=1&&value<=201;
const byNativeOrder=(a,b)=>(a.examined_on===null?1:0)-(b.examined_on===null?1:0)
  ||(a.examined_on===b.examined_on?0:(a.examined_on??'')>(b.examined_on??'')?-1:1)||a.id.localeCompare(b.id);
const byId=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const project=row=>Object.fromEntries(nativeColumns.map(key=>[key,row[key]]));

export const healthExaminationFixtureManifest=freeze({version:1,kind:'offline-plan',mounted:false,liveAcceptance:false,
  projectRef:'xiftudmvxphxcjtmfmib',sourceMigration:'20261115060000_student_health_reports.sql',downloadMigration:'20261115061000_student_health_report_downloads.sql',
  table,columns:[...columns],nativeColumns:[...nativeColumns],families:[...families],path,scope,pageSize,maxPage:201,
  plannedCaseIds:planned.map(id=>prefix+id),metadataOnlyCaseIds:planned.filter(id=>!compounds.includes(id)).map(id=>prefix+id),
  compoundCaseIds:compounds.map(id=>prefix+id),offlineOnlyCaseIds:offline.map(id=>prefix+id),
  boundaries:[
    'Every proposed metadata row has report_available=false. No report objects, PDF bytes, signed URLs or download authorization are prepared or invoked.',
    'The native availability result is the saved flag AND a matching private object; false flags establish a false result without inspecting or asserting object absence.',
    'Fresh two-owner Google identity, exact client, durable mutation intent, current lease and protected-owner preservation are executor obligations, not granted by this plan.',
    'Only an explicitly authorized fixture executor may insert/delete the exact owned metadata rows. No account initializer, student profile or administrator workflow is required by this table.',
    'Canonical SQL observation must include complete own rows and globally reserved old/new IDs; unknown, partial or moved rows never grant cleanup authority.',
    'Native responses include identity fields for readback only. Assistant evidence may expose only examinationCode and reportAvailable; no identity, date, diagnosis, clinical result or file content.',
    'Mixed tuition cases require a separately reviewed independent charges fixture and readback; this single-table plan does not satisfy that requirement.',
  ],
});

/** This is setup eligibility, never evidence that a live case has executed. */
export function healthExaminationFixtureCaseBinding(testCase){
  const id=typeof testCase==='string'?testCase:testCase?.id;
  if(healthExaminationFixtureManifest.offlineOnlyCaseIds.includes(id))return null;
  requireValue(healthExaminationFixtureManifest.plannedCaseIds.includes(id),'invalid_case');
  const suffix=id.slice(prefix.length),compound=compounds.includes(suffix);
  const fixtureKey=suffix==='empty'?'empty:healthExaminations':['page-one','page-two','empty-later-page','history-followup','mixed-reversed'].includes(suffix)?'paged:healthExaminations':'healthExaminations';
  return freeze({fixtureKey,metadataOnly:!compound,requiresAdditionalFixtures:compound?['charges']:[]});
}
function rowId(binding,family,role,index){
  const hash=createHash('sha256').update(JSON.stringify(['health-metadata-fixture-v1',binding.runId,binding.owners[role].id,family,index])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
}
function dateFor(family,index){
  if(family==='paged:healthExaminations')return index===25?null:new Date(Date.UTC(2026,10,14-index)).toISOString().slice(0,10);
  return index===2?null:index===0?'2026-11-13':'2026-11-12';
}
export function buildHealthExaminationFixturePlan(input){
  requireValue(exact(input,['runId','owners','fixtureKey'])&&families.includes(input.fixtureKey),'invalid_plan');
  let binding;try{binding=validateAidPaymentFixtureOwners({runId:input.runId,owners:input.owners});}catch{fail('invalid_owners');}
  const family=input.fixtureKey,rows=[],expectedByOwner={};
  for(const role of roles){
    const foreign=role==='B',count=foreign?1:family==='empty:healthExaminations'?0:family==='paged:healthExaminations'?26:3;
    const owned=Array.from({length:count},(_,index)=>({id:rowId(binding,family,role,index),user_id:binding.owners[role].id,
      examination_code:foreign?'FOREIGN HEALTH METADATA':family==='paged:healthExaminations'?'QA HEALTH PAGE '+String(index+1).padStart(2,'0'):'QA HEALTH A-'+String(index+1).padStart(2,'0'),
      student_number:foreign?'FOREIGN HEALTH NUMBER':'PRIVATE HEALTH NUMBER A',student_name:foreign?'FOREIGN HEALTH NAME':'PRIVATE HEALTH NAME A',
      class_label:foreign?'FOREIGN HEALTH CLASS':'PRIVATE HEALTH CLASS A',examined_on:foreign?'2026-11-14':dateFor(family,index),report_available:false}));
    rows.push(...owned);expectedByOwner[binding.owners[role].id]={total:owned.length,orderedRows:owned.sort(byNativeOrder).map(project)};
  }
  const recordIds=rows.map(row=>row.id),identityIds=[binding.runId,...roles.map(role=>binding.owners[role].id)];
  requireValue(new Set(recordIds).size===recordIds.length&&!recordIds.some(id=>identityIds.includes(id)),'invalid_plan');
  return freeze({version:1,kind:'health-examination-metadata-fixture-plan',fixtureKey:family,...binding,table,rows:{[table]:rows},recordIds,expectedByOwner,
    setup:[{kind:'persist-exact-metadata-intent',recordIds},{kind:'assert-current-lease-fresh-identities-and-protected-owner'},
      {kind:'read-complete-owned-and-global-reserved-union'},{kind:'require-empty-or-exact-previous-state'},
      {kind:'begin-owned-transaction'},{kind:'delete-exact-reconciled-metadata-targets'},{kind:'verify-empty-owned-and-reserved-state'},
      {kind:'insert-exact-metadata-rows',table,rows:copy(rows)},{kind:'verify-canonical-state-before-commit'},
      {kind:'commit-with-uncertain-outcome-tracked'},{kind:'verify-both-caller-native-pages'}],
    cleanup:[{kind:'assert-current-lease-fresh-identities-and-protected-owner'},
      {kind:'reconcile-complete-previous-next-or-empty-state'},{kind:'begin-owned-transaction'},
      {kind:'delete-exact-recorded-targets',targets:rows.map(row=>({table,id:row.id,userId:row.user_id}))},
      {kind:'verify-owned-and-global-reserved-zero-state'},{kind:'commit-with-uncertain-outcome-tracked'},
      {kind:'return-to-existing-auth-cleanup'}]});
}
function checked(plan){
  requireValue(exact(plan,['version','kind','fixtureKey','runId','owners','table','rows','recordIds','expectedByOwner','setup','cleanup']),'invalid_plan');
  const expected=buildHealthExaminationFixturePlan({runId:plan.runId,owners:plan.owners,fixtureKey:plan.fixtureKey});
  requireValue(isDeepStrictEqual(plan,expected),'invalid_plan');return expected;
}
export function assertHealthExaminationFixtureIdentities(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities'])&&Array.isArray(proof.identities)&&proof.identities.length===2,'identity_mismatch');
  for(const role of roles){const owner=plan.owners[role],matches=proof.identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===owner.id);
    requireValue(matches.length===1&&isDeepStrictEqual(matches[0],owner),'identity_mismatch');}
  return true;
}
export function healthExaminationFixtureSqlReadContract(plan){
  plan=checked(plan);return freeze({table,columns:[...columns],dateColumns:['examined_on'],
    anyOf:[{column:'user_id',values:roles.map(role=>plan.owners[role].id)},{column:'id',values:[...plan.recordIds]}],order:['id']});
}
export function healthExaminationFixtureReadContract(plan,options){
  plan=checked(plan);requireValue(exact(options,['role','page'])&&roles.includes(options.role)&&pageValid(options.page),'invalid_request');
  const ownerId=plan.owners[options.role].id,source=plan.expectedByOwner[ownerId],offset=(options.page-1)*pageSize;
  return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope,page:String(options.page)},
    rpc:{name:'affairs_read_health_examinations',body:{p_offset:offset}},localUrl:path+(options.page===1?'':'?page='+options.page),
    expected:{userId:ownerId,total:source.total,rows:copy(source.orderedRows.slice(offset,offset+pageSize))}});
}
function canonical(value){
  requireValue(exact(value,[table])&&Array.isArray(value[table])&&value[table].length<=200,'rows_mismatch');
  for(const row of value[table])requireValue(exact(row,columns)&&uuid(row.id)&&uuid(row.user_id)&&row.report_available===false
    &&(row.examined_on===null||typeof row.examined_on==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(row.examined_on)),'rows_mismatch');
  return {[table]:byId(value[table])};
}
export function assertHealthExaminationFixtureRows(plan,value){
  plan=checked(plan);requireValue(isDeepStrictEqual(canonical(value),canonical(plan.rows)),'rows_mismatch');return true;
}
export function verifyHealthExaminationFixtureReadback(plan,options,actual){
  const contract=healthExaminationFixtureReadContract(plan,options);
  requireValue(isDeepStrictEqual(actual,contract.expected),'readback_mismatch');return true;
}
/** Unknown, partial, mixed, true-flag or foreign/moved rows do not authorize deletion. */
export function reconcileHealthExaminationFixturePlans({previous=null,next=null,actual}={}){
  requireValue(previous!==null||next!==null,'invalid_plan');previous=previous===null?null:checked(previous);next=next===null?null:checked(next);
  if(previous&&next)requireValue(previous.runId===next.runId&&isDeepStrictEqual(previous.owners,next.owners),'invalid_plan');
  const observed=canonical(actual);if(!observed[table].length)return freeze({state:'empty',deleteTargets:[]});
  for(const [state,plan]of [['previous',previous],['next',next]])if(plan&&isDeepStrictEqual(observed,canonical(plan.rows)))
    return freeze({state,deleteTargets:copy(plan.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets)});
  fail('rows_mismatch');
}
export function assertHealthExaminationFixtureCleanup(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities','remainingByOwner','reservedRemaining']),'rows_remain');
  assertHealthExaminationFixtureIdentities(plan,{identities:proof.identities});
  requireValue(proof.reservedRemaining===0&&Array.isArray(proof.remainingByOwner)&&proof.remainingByOwner.length===2,'rows_remain');
  for(const role of roles){const matches=proof.remainingByOwner.filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);
    requireValue(matches.length===1&&matches[0].count===0,'rows_remain');}
  return true;
}
