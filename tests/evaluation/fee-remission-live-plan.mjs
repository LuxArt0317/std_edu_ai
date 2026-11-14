import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';

// Pure plan only: no SQL, fetch, credentials, identity creation or authorization.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const copy=value=>structuredClone(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const roles=['A','B'],remission='affairs_fee_remission',charges='affairs_charges',operations='private.affairs_fee_remission_operations',audit='affairs_agent_audit';
const tables=[remission,charges,operations,audit],stamp='2026-11-14T00:00:00.000Z';
const cells=['academic_year_text','semester_text','student_number','category_text','amount_text','check_status_text','notes_text'];
const remissionFields=['id','user_id',...cells,'row_order','version','updated_at','deleted_at'];
const chargeFields=['id','student_id','label','amount_due','amount_paid','currency','due_on','source_mode','occurrence_on','category','contact_unit','contact_extension','payment_unit'];
const eligible=['all-history','historical-period','zero-amount','null-not-zero','blank-not-null','leading-zero-period','exact-period-absent','current-term-not-designated',
  'student-number-explicit','student-number-not-requested','payout-not-proved','eligibility-not-proved','document-not-created','write-boundary','mixed-tuition','mixed-reversed',
  'empty','bounded-omission','foreign-account','anonymous'];
const offlineOnly=['read-unavailable','missing-collection','wrong-owner-response','malformed-amount','mixed-remission-unavailable','mixed-charges-unavailable','policy-separate-from-record'];
const literalA=[
  ['114','2','PRIVATE STUDENT NUMBER A','QA Historical Support',' 001,000 ','Reviewed locally','Historical private note'],
  ['115','1','PRIVATE STUDENT NUMBER A','QA Zero Support','0','Awaiting local review','Zero is a saved literal'],
  ['115','2','PRIVATE STUDENT NUMBER A','QA Null Support',null,null,null],
  ['001','01','PRIVATE STUDENT NUMBER A','QA Blank Support','','',''],
  ['0115','01','PRIVATE STUDENT NUMBER A','QA Text Period Support','0.00','unclassified literal','Preserve literal text'],
];
const literalB=[['115','1','FOREIGN STUDENT NUMBER','FOREIGN REMISSION CATEGORY','99009','FOREIGN REVIEW','FOREIGN REMISSION NOTE']];
export const feeRemissionLivePlanManifest=freeze({version:1,kind:'offline-plan',mounted:false,liveAcceptance:false,
  projectRef:'xiftudmvxphxcjtmfmib',sourceMigrations:['20261114030000_fee_remission.sql','20261105010000_school_affairs_workspace.sql','20261112080000_pending_fees.sql'],
  families:['feeRemission','empty:feeRemission','large:feeRemission'],tables:[...tables],remissionFields:[...remissionFields],chargeFields:[...chargeFields],stamp,
  eligibleCaseIds:eligible.map(id=>'account:fee-remission-'+id),offlineOnlyCaseIds:offlineOnly.map(id=>'account:fee-remission-'+id),
  boundaries:['This plan grants no live lease, credentials, identity creation, administrator role or write authority.',
    'An executor must prove two fresh disposable Google-linked student identities, exact student bindings and protected-owner preservation.',
    'Only separately authorized direct fixture SQL may insert these rows. No management RPC, operation receipt, audit event or university action is generated.',
    'Every pre/post read covers all rows for both owners and students, including tombstones, plus reserved IDs across all owners. Unknown initializer or third-party rows must not be deleted.',
    'Charges are a separate sample numeric ledger in TWD. Fee remission is literal local text with no currency or payment/eligibility implication.',
    'Before uncertainty recovery, acquire the same run lease and revalidate identities and complete before/after/empty state. Never infer commit success from a timeout.',
    'A scoped charge reader exists; no dedicated charges-only /api/affairs-data scope is claimed. Full workspace HTTP must not silently initialize accounts during this read proof.'],
});
const codes=new Set(['invalid_plan','invalid_owners','invalid_students','invalid_case','invalid_request','fixture_identity_mismatch','fixture_rows_mismatch','readback_mismatch','fixture_rows_remain']);
const fail=code=>{code=codes.has(code)?code:'invalid_plan';throw Object.assign(new Error('Fee remission fixture '+code+'.'),{name:'FeeRemissionFixturePlanError',code});};
const requireValue=(value,code)=>{if(!value)fail(code);};
const id=(runId,ownerId,family,kind,index)=>{const hash=createHash('sha256').update(JSON.stringify(['fee-remission-fixture-v1',runId,ownerId,family,kind,index])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);};
const sortRows=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));

/** Eligibility is a plan mapping, not executed coverage. Anonymous stays tokenless. */
export function feeRemissionLiveFamilyForCase(testCase){
  const caseId=typeof testCase==='string'?testCase:testCase?.id;
  if(feeRemissionLivePlanManifest.offlineOnlyCaseIds.includes(caseId))return null;
  requireValue(feeRemissionLivePlanManifest.eligibleCaseIds.includes(caseId),'invalid_case');
  return caseId.endsWith('-empty')?'empty:feeRemission':caseId.endsWith('-bounded-omission')?'large:feeRemission':'feeRemission';
}
function ownerBinding(input){
  let binding;try{binding=validateAidPaymentFixtureOwners({runId:input.runId,owners:input.owners});}catch{fail('invalid_owners');}
  requireValue(exact(input.students,roles),'invalid_students');
  const excluded=[binding.runId,...roles.map(role=>binding.owners[role].id)],studentIds=[];
  for(const role of roles){const row=input.students[role];requireValue(exact(row,['id','user_id'])&&uuid(row.id)&&row.user_id===binding.owners[role].id&&!excluded.includes(row.id),'invalid_students');studentIds.push(row.id);}
  requireValue(new Set(studentIds).size===2,'invalid_students');
  return {...binding,students:copy(input.students)};
}
function chargeRow(binding,role,family){const foreign=role==='B';
  return {id:id(binding.runId,binding.owners[role].id,family,'charge',0),student_id:binding.students[role].id,
    label:foreign?'FOREIGN TUITION CONTROL':'QA Tuition instalment',amount_due:foreign?99009:28000,amount_paid:foreign?101:5000,
    currency:'TWD',due_on:'2026-11-30',source_mode:'sample',occurrence_on:'2026-09-01',category:'Tuition',
    contact_unit:foreign?'FOREIGN CASHIER':'QA Cashier',contact_extension:foreign?'9090':'2042',payment_unit:foreign?'FOREIGN COUNTER':'QA Cashier counter'};
}
function projectedCharge(row){return {id:row.id,label:row.label,amountDue:row.amount_due,amountPaid:row.amount_paid,currency:row.currency,dueOn:row.due_on,
  sourceMode:row.source_mode,occurrenceOn:row.occurrence_on,category:row.category,contactUnit:row.contact_unit,contactExtension:row.contact_extension,paymentUnit:row.payment_unit};}
export function buildFeeRemissionFixturePlan(input){
  requireValue(exact(input,['runId','owners','students','fixtureKey'])&&feeRemissionLivePlanManifest.families.includes(input.fixtureKey),'invalid_plan');
  const binding=ownerBinding(input),family=input.fixtureKey,rows=Object.fromEntries(tables.map(table=>[table,[]])),expectedByOwner={};
  for(const role of roles){const owner=binding.owners[role];let values=copy(role==='A'?literalA:literalB);
    if(role==='A'&&family==='empty:feeRemission')values=[];
    if(role==='A'&&family==='large:feeRemission')values=Array.from({length:30},(_,index)=>[
      '115','1','PRIVATE STUDENT NUMBER A','QA Bounded Record '+String(index+1).padStart(2,'0'),'0','Awaiting local review',
      index===29?'OMITTED TAIL PRIVATE SENTINEL':('QA literal note '+String(index+1)+' ').padEnd(1900,'x')]);
    const records=values.map((value,index)=>({id:id(binding.runId,owner.id,family,'remission',index),user_id:owner.id,...Object.fromEntries(cells.map((field,i)=>[field,value[i]])),
      row_order:index,version:1,updated_at:stamp,deleted_at:null}));
    const charge=chargeRow(binding,role,family);rows[remission].push(...records);rows[charges].push(charge);
    expectedByOwner[owner.id]={feeRemission:{userId:owner.id,records:records.map(row=>({id:row.id,version:row.version,...Object.fromEntries(cells.map(field=>[field,row[field]])),row_order:row.row_order}))},
      charges:{profile:{userId:owner.id},studentRecordFound:true,charges:[projectedCharge(charge)]}};
  }
  const recordIds=[...rows[remission],...rows[charges]].map(row=>row.id);
  requireValue(new Set(recordIds).size===recordIds.length&&!recordIds.some(value=>[binding.runId,...roles.flatMap(role=>[binding.owners[role].id,binding.students[role].id])].includes(value)),'invalid_plan');
  const targets=[...rows[remission].map(row=>({table:remission,id:row.id,userId:row.user_id})),...rows[charges].map(row=>({table:charges,id:row.id,studentId:row.student_id}))];
  return freeze({version:1,kind:'fee-remission-fixture-plan',fixtureKey:family,...binding,tables:[...tables],rows,recordIds,expectedByOwner,
    setup:[{kind:'persist-intent',recordIds,tables:[...tables]},{kind:'assert-run-lease-identities-students-and-protected-owner'},
      {kind:'assert-complete-empty-or-exact-previous-state-and-unclaimed-reserved-ids'},
      {kind:'begin-owned-transaction'},{kind:'delete-only-exact-reconciled-previous-targets'},{kind:'verify-complete-owned-tables-empty'},
      ...([remission,charges].map(table=>({kind:'insert-exact-rows',table,rows:copy(rows[table])}))),
      {kind:'verify-canonical-state-before-commit'},{kind:'commit-with-uncertain-outcome-tracked'},{kind:'verify-both-caller-native-readbacks'}],
    cleanup:[{kind:'assert-run-lease-identities-students-and-protected-owner'},{kind:'reconcile-complete-recorded-plans-or-empty'},
      {kind:'begin-owned-transaction'},{kind:'delete-exact-recorded-targets',targets},{kind:'verify-all-owned-tables-empty-before-commit'},
      {kind:'commit-with-uncertain-outcome-tracked'},{kind:'verify-both-owner-and-global-reserved-id-zero-counts'},{kind:'return-to-existing-auth-cleanup'}]});
}
function checked(plan){
  requireValue(exact(plan,['version','kind','fixtureKey','runId','owners','students','tables','rows','recordIds','expectedByOwner','setup','cleanup']),'invalid_plan');
  const expected=buildFeeRemissionFixturePlan({runId:plan.runId,owners:plan.owners,students:plan.students,fixtureKey:plan.fixtureKey});
  requireValue(isDeepStrictEqual(plan,expected),'invalid_plan');return expected;
}
export function assertFeeRemissionFixtureIdentities(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities','students'])&&Array.isArray(proof.identities)&&proof.identities.length===2
    &&Array.isArray(proof.students)&&proof.students.length===2,'fixture_identity_mismatch');
  for(const role of roles){const owner=plan.owners[role],identities=proof.identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===owner.id);
    const students=proof.students.filter(row=>exact(row,['id','user_id'])&&row.user_id===owner.id);
    requireValue(identities.length===1&&isDeepStrictEqual(identities[0],owner)&&students.length===1&&isDeepStrictEqual(students[0],plan.students[role]),'fixture_identity_mismatch');}
  return true;
}
/** Descriptive SQL read predicates only; includes globally reserved IDs. */
export function feeRemissionFixtureSqlReadContract(plan){
  plan=checked(plan);const ownerIds=roles.map(role=>plan.owners[role].id),studentIds=roles.map(role=>plan.students[role].id);
  return freeze([
    {table:remission,columns:[...remissionFields],anyOf:[{column:'user_id',values:ownerIds},{column:'id',values:plan.rows[remission].map(row=>row.id)}],includeDeleted:true},
    {table:charges,columns:[...chargeFields],anyOf:[{column:'student_id',values:studentIds},{column:'id',values:plan.rows[charges].map(row=>row.id)}]},
    {table:operations,columns:['actor_id','user_id','request_id','kind','payload','result'],anyOf:[{column:'actor_id',values:ownerIds},{column:'user_id',values:ownerIds}]},
    {table:audit,columns:['id','user_id','action_kind','target_id','summary','created_at'],anyOf:[{column:'user_id',values:ownerIds},{column:'target_id',values:plan.recordIds}]},
  ]);
}
export function feeRemissionFixtureReadContract(plan,options){
  plan=checked(plan);requireValue(exact(options,['role','view'])&&roles.includes(options.role)&&['feeRemission','charges'].includes(options.view),'invalid_request');
  const ownerId=plan.owners[options.role].id,studentId=plan.students[options.role].id;
  if(options.view==='feeRemission')return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope:'fee-remission'},
    rpc:{name:'affairs_read_fee_remission',body:{}},expected:copy(plan.expectedByOwner[ownerId].feeRemission)});
  return freeze({ownerId,api:null,reader:'loadOwnAffairsCharges',native:[
    {method:'GET',table:'affairs_students',query:{select:'id,user_id',user_id:'eq.'+ownerId,limit:1},expected:[copy(plan.students[options.role])]},
    {method:'GET',table:charges,query:{select:chargeFields.join(','),student_id:'eq.'+studentId,order:'occurrence_on.desc.nullslast,id.asc',limit:500,offset:0},expected:copy(plan.rows[charges].filter(row=>row.student_id===studentId))},
  ],expected:copy(plan.expectedByOwner[ownerId].charges),dynamicFields:['checkedAt']});
}
function sameStamp(value){
  if(value instanceof Date)return Date.prototype.getTime.call(value)===Date.parse(stamp);
  return typeof value==='string'&&/^2026-11-(?:13|14|15)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.0{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/u.test(value)&&Date.parse(value)===Date.parse(stamp);
}
function decimal(value){
  requireValue(typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/u.test(value),'fixture_rows_mismatch');
  return Number(value);
}
function canonical(actual){
  requireValue(exact(actual,tables)&&tables.every(table=>Array.isArray(actual[table]))&&actual[remission].length<=500&&actual[charges].length<=2
    &&actual[operations].length===0&&actual[audit].length===0,'fixture_rows_mismatch');
  const feeRows=actual[remission].map(row=>{requireValue(exact(row,remissionFields)&&sameStamp(row.updated_at),'fixture_rows_mismatch');return {...row,updated_at:stamp};});
  const chargeRows=actual[charges].map(row=>{requireValue(exact(row,chargeFields),'fixture_rows_mismatch');return {...row,amount_due:decimal(row.amount_due),amount_paid:decimal(row.amount_paid)};});
  return {[remission]:sortRows(feeRows),[charges]:sortRows(chargeRows),[operations]:[],[audit]:[]};
}
export function assertFeeRemissionFixtureRows(plan,actual){plan=checked(plan);requireValue(isDeepStrictEqual(canonical(actual),canonical(plan.rows)),'fixture_rows_mismatch');return true;}
export function verifyFeeRemissionFixtureReadback(plan,options,actual){
  requireValue(exact(options,['role','view'])||exact(options,['role','view','readStartedAt','readFinishedAt']),'invalid_request');
  const contract=feeRemissionFixtureReadContract(plan,{role:options.role,view:options.view});
  if(options.view==='feeRemission'){requireValue(exact(options,['role','view'])&&isDeepStrictEqual(actual,contract.expected),'readback_mismatch');return true;}
  requireValue(exact(options,['role','view','readStartedAt','readFinishedAt'])&&Number.isSafeInteger(options.readStartedAt)&&Number.isSafeInteger(options.readFinishedAt)
    &&options.readFinishedAt>=options.readStartedAt&&options.readFinishedAt-options.readStartedAt<=12000
    &&exact(actual,['checkedAt','profile','studentRecordFound','charges'])&&typeof actual.checkedAt==='string'
    &&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(actual.checkedAt),'readback_mismatch');
  const checkedAt=Date.parse(actual.checkedAt);requireValue(Number.isFinite(checkedAt)&&checkedAt>=options.readStartedAt&&checkedAt<=options.readFinishedAt,'readback_mismatch');
  const {checkedAt:_stamp,...body}=actual;requireValue(isDeepStrictEqual(body,contract.expected),'readback_mismatch');return true;
}
/** Partial/mixed commits or unplanned mutations are not cleanup authority. */
export function reconcileFeeRemissionFixturePlans({previous=null,next=null,actual}={}){
  requireValue(previous!==null||next!==null,'invalid_plan');previous=previous===null?null:checked(previous);next=next===null?null:checked(next);
  if(previous&&next)requireValue(previous.runId===next.runId&&isDeepStrictEqual(previous.owners,next.owners)&&isDeepStrictEqual(previous.students,next.students),'invalid_plan');
  const observed=canonical(actual);if(!observed[remission].length&&!observed[charges].length)return freeze({state:'empty',deleteTargets:[]});
  for(const [state,plan]of [['previous',previous],['next',next]])if(plan&&isDeepStrictEqual(observed,canonical(plan.rows)))
    return freeze({state,deleteTargets:copy(plan.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets)});
  fail('fixture_rows_mismatch');
}
export function assertFeeRemissionFixtureCleanup(plan,proof){
  plan=checked(plan);requireValue(exact(proof,['identities','students','remainingByTable','reservedByTable']),'fixture_rows_remain');
  assertFeeRemissionFixtureIdentities(plan,{identities:proof.identities,students:proof.students});
  requireValue(exact(proof.reservedByTable,[remission,charges])&&proof.reservedByTable[remission]===0&&proof.reservedByTable[charges]===0,'fixture_rows_remain');
  requireValue(exact(proof.remainingByTable,tables),'fixture_rows_remain');
  for(const table of tables){const rows=proof.remainingByTable[table];requireValue(Array.isArray(rows)&&rows.length===2,'fixture_rows_remain');
    for(const role of roles){const matches=rows.filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);requireValue(matches.length===1&&matches[0].count===0,'fixture_rows_remain');}}
  return true;
}
