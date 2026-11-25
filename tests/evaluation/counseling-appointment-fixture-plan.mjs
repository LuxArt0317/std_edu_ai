import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';

// Pure unmounted planning/proof. No credentials, Auth, SQL, HTTP, queue, staff,
// consent workflow, booking/cancellation operation or lease is invoked here.
const table='affairs_counseling_appointments',roles=['A','B'];
const columns=['id','user_id','kind','preferred_on','preferred_period','status','scheduled_at','consent_version','consent_at','updated_at','version'];
const nativeColumns=['id','kind','status','preferred_on','preferred_period','scheduled_at','version','updated_at'];
const families=['counselingAppointments','scheduled:counselingAppointments','empty:counselingAppointments','capped:counselingAppointments'];
const planned=['history','requested-date','scheduled-time','assessment-kind','cancelled-history','closed-history','empty','capped-history',
  'clinical-boundary','document-boundary','identity-boundary','mixed-tuition','mixed-reversed','negative-counseling','foreign-account','anonymous',
  'write-cancel','write-request','queue-boundary','access-boundary','history-followup'];
const compounds=['mixed-tuition','mixed-reversed','negative-counseling'];
const offline=['service-unavailable','read-unavailable','access-denied','wrong-owner','malformed','mixed-counseling-unavailable','mixed-charges-unavailable'];
const prefix='account:counseling-appointments-',path='/school-affairs/services/29-1/appointments',scope='counseling-appointments',limit=50;
const timestamps=['scheduled_at','consent_at','updated_at'];
const copy=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const fail=code=>{throw Object.assign(new Error('Counseling metadata fixture '+code+'.'),{name:'CounselingAppointmentFixturePlanError',code});};
const requireValue=(value,code)=>{if(!value)fail(code);};
const byId=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const dateOrder=(a,b)=>instant(b.updated_at).localeCompare(instant(a.updated_at))||a.id.localeCompare(b.id);
const open=row=>['requested','scheduled'].includes(row.status);
const nativeRows=rows=>[...rows].sort((a,b)=>Number(open(b))-Number(open(a))||dateOrder(a,b)).slice(0,limit).sort(dateOrder)
  .map(row=>Object.fromEntries(nativeColumns.map(key=>[key,row[key]])));
const instant=value=>{
  if(typeof value!=='string')return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/u.exec(value);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1||month<1||month>12||day<1||day>days[month-1]||!Number.isFinite(Date.parse(value)))return null;
  return new Date(value).toISOString().slice(0,-1)+(match[4]??'').padEnd(6,'0').slice(3)+'Z';
};

export const counselingAppointmentFixtureManifest=freeze({version:1,kind:'offline-plan',mounted:false,liveAcceptance:false,
  projectRef:'xiftudmvxphxcjtmfmib',sourceMigration:'20261115000000_counseling_appointments.sql',table,columns:[...columns],nativeColumns:[...nativeColumns],
  families:[...families],path,scope,view:'mine',nativeLimit:limit,
  plannedCaseIds:planned.map(id=>prefix+id),metadataOnlyCaseIds:planned.filter(id=>!compounds.includes(id)).map(id=>prefix+id),
  compoundCaseIds:compounds.map(id=>prefix+id),offlineOnlyCaseIds:offline.map(id=>prefix+id),
  boundaries:[
    'Only exact disposable owner appointment metadata rows are planned. No coordinator/access roster, operation receipt, appointment action, clinical data, identity payload or document is created.',
    'Consent values are synthetic fixture columns, not a submitted user consent or authority to create a real appointment.',
    'Fresh two-owner Google identity, exact client, current lease, durable intent and protected-owner preservation remain executor obligations.',
    'Canonical observation must include complete both-owner rows and globally reserved previous/new IDs. Unknown, partial or moved rows do not grant cleanup authority.',
    'Native available and canCoordinate are shared/service access observations. Validate their Boolean types only; never seed a coordinator or assume either value.',
    'Exactly50 returned native rows imply only a lower bound and possible truncation, even when the fixture plan knows its seeded cardinality.',
    'Compound tuition cases require a separate reviewed independent charges fixture; this single-table plan does not satisfy it.',
    'No student profile initializer is needed: this table references only the fresh auth.users identities.'],
});
export function counselingAppointmentFixtureCaseBinding(testCase){
  const id=typeof testCase==='string'?testCase:testCase?.id;
  if(counselingAppointmentFixtureManifest.offlineOnlyCaseIds.includes(id))return null;
  requireValue(counselingAppointmentFixtureManifest.plannedCaseIds.includes(id),'invalid_case');
  const suffix=id.slice(prefix.length),compound=compounds.includes(suffix);
  const fixtureKey=suffix==='empty'?'empty:counselingAppointments':suffix==='capped-history'?'capped:counselingAppointments':suffix==='scheduled-time'?'scheduled:counselingAppointments':'counselingAppointments';
  return freeze({fixtureKey,metadataOnly:!compound,requiresAdditionalFixtures:compound?['charges']:[]});
}
function rowId(binding,family,role,index){
  const hash=createHash('sha256').update(JSON.stringify(['counseling-metadata-fixture-v1',binding.runId,binding.owners[role].id,family,index])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
}
function facts(family,role){
  const row=(kind,status,preferred_on,preferred_period,scheduled_at,updated_at)=>({kind,status,preferred_on,preferred_period,scheduled_at,updated_at,version:status==='requested'?1:3});
  if(role==='B')return [row('assessment','closed','2027-01-19','afternoon','2027-01-20T08:00:00Z','2027-01-21T04:00:00Z')];
  if(family==='empty:counselingAppointments')return [];
  if(family==='capped:counselingAppointments')return Array.from({length:50},(_,i)=>row('counseling','closed',new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),'morning',null,new Date(Date.UTC(2026,8,50-i)).toISOString()));
  const scheduled=family==='scheduled:counselingAppointments';
  return [row('counseling',scheduled?'scheduled':'requested','2026-11-25','morning',scheduled?'2026-11-27T02:30:00Z':null,'2026-11-18T03:00:00Z'),
    row('counseling','cancelled','2026-10-20','afternoon','2026-10-22T06:00:00Z','2026-11-17T03:00:00Z'),
    row('assessment','closed','2026-09-15','morning','2026-09-18T01:00:00Z','2026-10-01T03:00:00Z')];
}
export function buildCounselingAppointmentFixturePlan(input){
  requireValue(exact(input,['runId','owners','fixtureKey'])&&families.includes(input.fixtureKey),'invalid_plan');
  let binding;try{binding=validateAidPaymentFixtureOwners({runId:input.runId,owners:input.owners});}catch{fail('invalid_owners');}
  const family=input.fixtureKey,rows=[],expectedByOwner={};
  for(const role of roles){
    const owned=facts(family,role).map((value,index)=>({id:rowId(binding,family,role,index),user_id:binding.owners[role].id,...value,
      consent_version:'stu-best-2026-11-14',consent_at:'2026-08-01T00:00:00Z'}));
    requireValue(owned.filter(open).length<=1,'invalid_plan');rows.push(...owned);
    expectedByOwner[binding.owners[role].id]={userId:binding.owners[role].id,rows:nativeRows(owned)};
  }
  const recordIds=rows.map(row=>row.id);requireValue(new Set(recordIds).size===recordIds.length&&!recordIds.some(id=>[binding.runId,...roles.map(role=>binding.owners[role].id)].includes(id)),'invalid_plan');
  return freeze({version:1,kind:'counseling-appointment-metadata-fixture-plan',fixtureKey:family,...binding,table,rows:{[table]:rows},recordIds,expectedByOwner,
    setup:[{kind:'persist-exact-metadata-intent',recordIds},{kind:'assert-current-lease-fresh-identities-and-protected-owner'},
      {kind:'read-complete-owned-and-global-reserved-union'},{kind:'require-empty-or-exact-previous-state'},
      {kind:'begin-owned-transaction'},{kind:'delete-exact-reconciled-metadata-targets'},{kind:'verify-empty-owned-and-reserved-state'},
      {kind:'insert-exact-metadata-rows',table,rows:copy(rows)},{kind:'verify-canonical-state-before-commit'},
      {kind:'commit-with-uncertain-outcome-tracked'},{kind:'verify-both-caller-native-mine'}],
    cleanup:[{kind:'assert-current-lease-fresh-identities-and-protected-owner'},{kind:'reconcile-complete-previous-next-or-empty-state'},
      {kind:'begin-owned-transaction'},{kind:'delete-exact-recorded-targets',targets:rows.map(row=>({table,id:row.id,userId:row.user_id}))},
      {kind:'verify-owned-and-global-reserved-zero-state'},{kind:'commit-with-uncertain-outcome-tracked'},{kind:'return-to-existing-auth-cleanup'}]});
}
function checked(plan){
  requireValue(exact(plan,['version','kind','fixtureKey','runId','owners','table','rows','recordIds','expectedByOwner','setup','cleanup']),'invalid_plan');
  const expected=buildCounselingAppointmentFixturePlan({runId:plan.runId,owners:plan.owners,fixtureKey:plan.fixtureKey});
  requireValue(isDeepStrictEqual(plan,expected),'invalid_plan');return expected;
}
export function assertCounselingAppointmentFixtureIdentities(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities'])&&Array.isArray(proof.identities)&&proof.identities.length===2,'identity_mismatch');
  for(const role of roles){const owner=plan.owners[role],matches=proof.identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===owner.id);
    requireValue(matches.length===1&&isDeepStrictEqual(matches[0],owner),'identity_mismatch');}return true;
}
export function counselingAppointmentFixtureSqlReadContract(plan){
  plan=checked(plan);return freeze({table,columns:[...columns],dateColumns:['preferred_on'],timestampColumns:[...timestamps],
    anyOf:[{column:'user_id',values:roles.map(role=>plan.owners[role].id)},{column:'id',values:[...plan.recordIds]}],order:['id']});
}
export function counselingAppointmentFixtureReadContract(plan,options){
  plan=checked(plan);requireValue(exact(options,['role'])&&roles.includes(options.role),'invalid_request');
  const ownerId=plan.owners[options.role].id;
  return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope,view:'mine'},rpc:{name:'affairs_read_counseling',body:{p_view:'mine'}},
    localUrl:path,expected:copy(plan.expectedByOwner[ownerId]),observedBooleanFields:['available','canCoordinate']});
}
function canonicalRows(rows,keys,code){
  requireValue(Array.isArray(rows)&&rows.length<=200&&Object.keys(rows).length===rows.length
    &&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(item=>item&&Object.hasOwn(item,'value')),code);
  const ids=new Set();return rows.map(row=>{
    requireValue(exact(row,keys)&&typeof row.id==='string'&&!ids.has(row.id),code);ids.add(row.id);
    const result={...row};for(const key of timestamps.filter(key=>keys.includes(key))){if(key==='scheduled_at'&&row[key]===null)continue;
      const normalized=instant(row[key]);requireValue(normalized!==null,code);result[key]=normalized;}return result;
  });
}
function canonical(value){requireValue(exact(value,[table]),'rows_mismatch');return {[table]:byId(canonicalRows(value[table],columns,'rows_mismatch'))};}
export function counselingAppointmentCancellationTarget(plan){
  plan=checked(plan);
  const eligible=plan.rows[table].filter(row=>row.user_id===plan.owners.A.id&&open(row));
  requireValue(plan.fixtureKey==='scheduled:counselingAppointments'&&eligible.length===1
    &&eligible[0].status==='scheduled'&&eligible[0].version>1,'invalid_cancellation_target');
  return eligible[0];
}
function expectedRows(plan,cancellation){
  if(cancellation===undefined)return plan.rows;
  const target=counselingAppointmentCancellationTarget(plan);
  requireValue(exact(cancellation,['id','updatedAt'])&&cancellation.id===target.id&&instant(cancellation.updatedAt)!==null,'invalid_cancellation_result');
  return {[table]:plan.rows[table].map(row=>row.id===target.id?
    {...row,status:'cancelled',updated_at:cancellation.updatedAt,version:target.version+1}:row)};
}
export function assertCounselingAppointmentFixtureRows(plan,value,{cancellation}={}){
  plan=checked(plan);requireValue(isDeepStrictEqual(canonical(value),canonical(expectedRows(plan,cancellation))),'rows_mismatch');return true;
}
export function verifyCounselingAppointmentFixtureReadback(plan,options,actual){
  const {cancellation,...readOptions}=options;
  const expected=counselingAppointmentFixtureReadContract(plan,readOptions).expected;
  const rows=cancellation===undefined?expected.rows:nativeRows(expectedRows(plan,cancellation)[table].filter(row=>row.user_id===expected.userId));
  requireValue(exact(actual,['userId','available','canCoordinate','rows'])&&typeof actual.available==='boolean'&&typeof actual.canCoordinate==='boolean','readback_mismatch');
  requireValue(isDeepStrictEqual({userId:actual.userId,rows:canonicalRows(actual.rows,nativeColumns,'readback_mismatch')},
    {userId:expected.userId,rows:canonicalRows(rows,nativeColumns,'readback_mismatch')}),'readback_mismatch');return true;
}
/** Only complete exact previous/new states or total absence grant deletion targets. */
export function reconcileCounselingAppointmentFixturePlans({previous=null,next=null,actual}={}){
  requireValue(previous!==null||next!==null,'invalid_plan');previous=previous===null?null:checked(previous);next=next===null?null:checked(next);
  if(previous&&next)requireValue(previous.runId===next.runId&&isDeepStrictEqual(previous.owners,next.owners),'invalid_plan');
  const observed=canonical(actual);if(!observed[table].length)return freeze({state:'empty',deleteTargets:[]});
  for(const [state,plan]of [['previous',previous],['next',next]])if(plan&&isDeepStrictEqual(observed,canonical(plan.rows)))
    return freeze({state,deleteTargets:copy(plan.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets)});
  fail('rows_mismatch');
}
export function assertCounselingAppointmentFixtureCleanup(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities','remainingByOwner','reservedRemaining']),'rows_remain');
  assertCounselingAppointmentFixtureIdentities(plan,{identities:proof.identities});
  requireValue(proof.reservedRemaining===0&&Array.isArray(proof.remainingByOwner)&&proof.remainingByOwner.length===2,'rows_remain');
  for(const role of roles){const matches=proof.remainingByOwner.filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);
    requireValue(matches.length===1&&matches[0].count===0,'rows_remain');}return true;
}
