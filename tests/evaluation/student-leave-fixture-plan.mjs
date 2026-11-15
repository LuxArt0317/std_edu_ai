import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {leaveFixtureForeign,leaveFixtureOtherRow,leaveFixtureRow} from './student-leave-native-cases.mjs';
import {markLegacyStudentLeaveFixture,nativeStudentLeaveSetupRequired,studentLeaveRunnerCases} from './student-leave-runner.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';

export const leaveFixtureProject='xiftudmvxphxcjtmfmib';
export const leaveFixtureRoles=Object.freeze(['A','B']);
export const leaveFixtureTables=Object.freeze({
  forms:'affairs_service_records',reviews:'affairs_service_requests',audit:'affairs_agent_audit',
});
export const leaveFixtureFamilies=Object.freeze(['ordinary','archive','today','sibling','prior-date','month-count','category-count','named']);
const {forms,reviews,audit}=leaveFixtureTables;
const stamp='2026-11-14T17:00:00.000Z';
const storageColumns={
  [forms]:['id','user_id','service_key','record_type','title','notes','status','starts_on','ends_on','leave_category','periods',
    'review_request_id','contact_phone','leave_time_period','created_at','updated_at'],
  [reviews]:['id','user_id','request_type','title','details','status','created_at','updated_at'],
  [audit]:['id','user_id','action_kind','target_id','summary','created_at'],
};
const visibleColumns={
  [forms]:['id','user_id','service_key','record_type','starts_on','ends_on','status','leave_category','periods','review_request_id'],
  [reviews]:['id','user_id','request_type','status'],
};

export function freezeLeaveFixture(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))freezeLeaveFixture(child);Object.freeze(value);}
  return value;
}
const clone=value=>structuredClone(value);
export const leaveFixtureExact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length
  &&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)??{},'value'));
const sha=(value,length=64)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$','u').test(value);
const hasPreview=origin=>typeof origin==='string'&&/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(origin);
export class StudentLeaveFixtureError extends Error{
  constructor(code){
    const known=['invalid_binding','invalid_plan','invalid_case_definition','invalid_case_binding','row_state_mismatch','native_readback_mismatch',
      'invalid_journal_binding','journal_drift','unsafe_journal','invalid_dependencies','identity_mismatch','lease_unavailable','release_unavailable',
      'protected_owner_changed','journal_failed','read_failed','native_readback_failed','transaction_failed','transaction_uncertain',
      'mutation_readback_mismatch','busy','closed','state_mismatch','not_ready','invalid_recovery','recovery_required'];
    const safe=known.includes(code)?code:'state_mismatch';
    super('Student Leave fixture '+safe+'.');this.name='StudentLeaveFixtureError';this.code=safe;
  }
}
export function assertLeaveFixture(condition,code){if(!condition)throw new StudentLeaveFixtureError(code);}
export const leaveFixtureDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function checkedStudentLeaveFixtureBinding(raw){
  assertLeaveFixture(leaveFixtureExact(raw,['runId','owners','projectRef','origin','sourceRevision','suiteHash'])
    &&raw.projectRef===leaveFixtureProject&&hasPreview(raw.origin)&&sha(raw.sourceRevision,40)&&sha(raw.suiteHash),'invalid_binding');
  let identity;
  try{identity=validateAidPaymentFixtureOwners({runId:raw.runId,owners:raw.owners});}
  catch{assertLeaveFixture(false,'invalid_binding');}
  return freezeLeaveFixture({runId:identity.runId,owners:identity.owners,projectRef:raw.projectRef,
    origin:raw.origin,sourceRevision:raw.sourceRevision,suiteHash:raw.suiteHash});
}

function idFor(binding,role,family,key){
  const text=leaveFixtureDigest(['stu-best-leave-fixture-v1',binding.runId,binding.owners[role].id,family,key]);
  return text.slice(0,8)+'-'+text.slice(8,12)+'-4'+text.slice(13,16)+'-a'+text.slice(17,20)+'-'+text.slice(20,32);
}
const form=(key,starts_on,ends_on,fields={})=>({
  key,starts_on,ends_on,title:'Evaluation leave '+key,leave_category:'personal',status:'filed',periods:'週一08:10、週二09:10',
  localReview:null,...fields,
});
function primary(){return form('primary','2026-11-09','2026-11-10',{localReview:'resolved'});}
function aRows(family){
  switch(family){
    case 'archive':
      return [form('primary','2019-07-30','2019-07-31',{status:'draft'}),form('cutoff','2019-08-01','2019-08-01')];
    case 'today':
      return [form('primary','2026-11-15','2026-11-15',{periods:'週日08:10'}),form('past','2026-11-14','2026-11-14')];
    case 'sibling':
      return [primary(),form('sibling','2026-11-11','2026-11-12')];
    case 'prior-date':
      return [form('primary','2026-11-01','2026-11-01',{status:'draft'}),form('next-day','2026-11-02','2026-11-02')];
    case 'month-count':
      return [...Array.from({length:17},(_,index)=>{
        const day='2026-11-'+String(index+1).padStart(2,'0');
        return form('month-'+String(index+1),day,day);
      }),form('outside-month','2026-12-01','2026-12-01')];
    case 'category-count':
      return [form('primary','2026-11-07','2026-11-07',{leave_category:'sick',status:'draft'}),
        form('draft-sick-2','2026-11-08','2026-11-08',{leave_category:'sick',status:'draft'}),
        form('draft-sick-3','2026-11-09','2026-11-09',{leave_category:'sick',status:'draft'}),
        form('filed-sick','2026-11-10','2026-11-10',{leave_category:'sick'}),
        form('other-category','2026-11-11','2026-11-11',{status:'draft'}),
        form('outside-month','2026-12-01','2026-12-01',{leave_category:'sick',status:'draft'})];
    case 'named':
      return [form('primary','2026-11-10','2026-11-10',{title:'Clinic leave',status:'draft',localReview:'in_review'}),
        form('other-form','2026-11-10','2026-11-10',{title:'Uniquely different leave',status:'withdrawn',localReview:'open'})];
    default:
      return [primary()];
  }
}
function bRows(family){
  return [form('foreign',family==='archive'?'2019-07-30':'2026-11-09',family==='archive'?'2019-07-31':'2026-11-12',
    {title:'FOREIGN PRIVATE SENTINEL',periods:'FOREIGN PRIVATE SENTINEL',status:'withdrawn',leave_category:'bereavement',localReview:'open'})];
}
function leaveForms(role,family){
  const rows=role==='A'?aRows(family):bRows(family);
  // Keep a linked request under both callers, even in states that do not
  // request review evidence. An empty source cannot prove crossed rejection.
  if(!rows.some(row=>row.localReview))rows[0]={...rows[0],localReview:'resolved'};
  return rows;
}

export function buildStudentLeaveFixturePlan({binding,family}={}){
  binding=checkedStudentLeaveFixtureBinding(binding);
  assertLeaveFixture(leaveFixtureFamilies.includes(family),'invalid_plan');
  const rows={[forms]:[],[reviews]:[],[audit]:[]};
  const rowsByHandle={A:{},B:{}};
  for(const role of leaveFixtureRoles){
    const user_id=binding.owners[role].id;
    for(const {key,localReview,...values} of leaveForms(role,family)){
      const id=idFor(binding,role,family,'form:'+key);
      const review_request_id=localReview?idFor(binding,role,family,'review:'+key):null;
      rows[forms].push({id,user_id,service_key:'leave',record_type:'leave',...values,
        review_request_id,notes:'STUDENT_PRIVATE_REASON',contact_phone:'000-000-0000',leave_time_period:null,created_at:stamp,updated_at:stamp});
      if(review_request_id)rows[reviews].push({id:review_request_id,user_id,request_type:'general',title:'Evaluation local review '+key,
        details:'Synthetic local request used to bind an exact saved form.',status:localReview,created_at:stamp,updated_at:stamp});
      rowsByHandle[role][key]=id;
    }
  }
  for(const value of Object.values(rows))value.sort((a,b)=>a.id.localeCompare(b.id));
  const recordIds=[...rows[forms],...rows[reviews]].map(row=>row.id).sort();
  const exclusions=[binding.runId,...leaveFixtureRoles.map(role=>binding.owners[role].id)];
  assertLeaveFixture(new Set(recordIds).size===recordIds.length&&recordIds.every(id=>!exclusions.includes(id)),'invalid_plan');
  return freezeLeaveFixture({version:1,binding,family,rows,recordIds,rowsByHandle});
}

export function checkedStudentLeaveFixturePlan(raw){
  assertLeaveFixture(leaveFixtureExact(raw,['version','binding','family','rows','recordIds','rowsByHandle']),'invalid_plan');
  const expected=buildStudentLeaveFixturePlan({binding:raw.binding,family:raw.family});
  assertLeaveFixture(isDeepStrictEqual(raw,expected),'invalid_plan');
  return expected;
}

const knownNative=studentLeaveRunnerCases();
const knownLegacy=[...buildServiceCases(),...buildAccountCases()].filter(nativeStudentLeaveSetupRequired).map(markLegacyStudentLeaveFixture);
const archiveCases=new Set(['archive','archive-route','archived-english-dates']);
const familyByCase={
  'taipei-today':'today','exact-sibling':'sibling','date-from-history':'prior-date','count-only':'month-count','category-status-count':'category-count',
};
function classify(row){
  if(row.fixtureRequirement==='legacy_student_leave_rebind'){
    const named=row.id==='account:leave-history'||/^service:(?:20-1|33-1):record$/u.test(row.id);
    return {caseId:row.id,availability:'legacy_rebind_required',family:named?'named':null,
      additionallyRequired:['legacy_oracle_rebind',...(row.id==='account:cross-domain-absence-work-leave'?['missed_dtm_lesson_and_assignment']:[])]};
  }
  const short=row.id.slice('account:student-leave-native-'.length);
  const companion=row.expected.requiredTools.filter(tool=>tool!=='leaveRecords');
  const family=archiveCases.has(short)?'archive':familyByCase[short]??'ordinary';
  if(short==='read-unavailable'||short==='review-unavailable')
    return {caseId:row.id,availability:'failure_injection_required',family,additionallyRequired:[short==='read-unavailable'?'exact_form_failure':'exact_linked_review_failure']};
  if(companion.length)
    return {caseId:row.id,availability:'companion_fixture_required',family:row.nativeLeaveContract.requiresScopedRecordRead?family:null,additionallyRequired:companion};
  if(!row.nativeLeaveContract.requiresScopedRecordRead)
    return {caseId:row.id,availability:'boundary_setup_available',family,additionallyRequired:[]};
  if(['taipei-today','count-only','category-status-count'].includes(short))
    return {caseId:row.id,availability:'request_clock_required',family,additionallyRequired:['trusted_taipei_request_clock']};
  return {caseId:row.id,availability:'leave_state_available',family,additionallyRequired:[]};
}
export const studentLeaveFixtureManifest=freezeLeaveFixture({
  version:1,kind:'credential-free-fixture-plan',baseRevision:'93b579e745a0ed24b1e5fd490fc62e43316e75eb',projectRef:leaveFixtureProject,
  sourceMigrations:['20261105010000_school_affairs_workspace.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql'],
  families:[...leaveFixtureFamilies],cases:[...knownNative,...knownLegacy].map(classify),mounted:false,liveAcceptance:false,
});

function translateText(value,plan){
  if(typeof value!=='string')return value;
  const pairs=[[leaveFixtureRow,plan.rowsByHandle.A.primary],[leaveFixtureOtherRow,plan.rowsByHandle.A.sibling],
    [leaveFixtureForeign,plan.binding.owners.B.id]];
  for(const [from,to] of pairs)if(value.includes(from)){
    assertLeaveFixture(typeof to==='string','invalid_case_binding');
    value=value.replaceAll(from,to);
  }
  return value;
}
export function bindStudentLeaveFixtureCase(plan,testCase){
  plan=checkedStudentLeaveFixturePlan(plan);
  const row=knownNative.find(candidate=>candidate.id===testCase?.id);
  assertLeaveFixture(row&&isDeepStrictEqual(testCase,row),'invalid_case_definition');
  const scope=classify(row);
  assertLeaveFixture(scope.family===plan.family&&['leave_state_available','boundary_setup_available','request_clock_required'].includes(scope.availability),'invalid_case_binding');
  const {question,route,history,expected}=row;
  const boundExpected={
    ...clone(expected),
    requiredLinks:expected.requiredLinks.map(url=>translateText(url,plan)),
    requiredSourceBindings:expected.requiredSourceBindings.map(source=>({...source,url:translateText(source.url,plan)})),
  };
  return freezeLeaveFixture({caseId:row.id,fixtureKey:row.fixtureKey,runId:plan.binding.runId,
    ownerId:plan.binding.owners.A.id,sourceRevision:plan.binding.sourceRevision,origin:plan.binding.origin,suiteHash:plan.binding.suiteHash,
    route:translateText(route,plan),question:translateText(question,plan),history:history.map(entry=>({...entry,content:translateText(entry.content,plan)})),
    plannedRead:{...clone(row.nativeLeaveContract),
      recordId:row.nativeLeaveContract.recordId?translateText(row.nativeLeaveContract.recordId,plan):null},expected:boundExpected,
    requestClockRequired:scope.availability==='request_clock_required',requestObservationRequired:true,liveAcceptance:false});
}

export function studentLeaveFixtureReadContracts(plans){
  assertLeaveFixture(Array.isArray(plans)&&plans.length>0&&plans.length<=leaveFixtureFamilies.length,'invalid_plan');
  const safe=plans.map(checkedStudentLeaveFixturePlan);
  const binding=safe[0].binding;
  assertLeaveFixture(safe.every(plan=>isDeepStrictEqual(plan.binding,binding))&&new Set(safe.map(plan=>plan.family)).size===safe.length,'invalid_plan');
  const owners=leaveFixtureRoles.map(role=>binding.owners[role].id);
  const ids=table=>[...new Set(safe.flatMap(plan=>plan.rows[table].map(row=>row.id)))].sort();
  const keys=(column,values)=>({column,values:[...values]});
  return freezeLeaveFixture([
    {table:forms,columns:[...storageColumns[forms]],anyOf:[keys('user_id',owners),keys('id',ids(forms)),keys('review_request_id',ids(reviews))]},
    {table:reviews,columns:[...storageColumns[reviews]],anyOf:[keys('user_id',owners),keys('id',ids(reviews))]},
    {table:audit,columns:[...storageColumns[audit]],anyOf:[keys('user_id',owners),keys('target_id',[...ids(forms),...ids(reviews)].sort())]},
  ]);
}
export function checkedStudentLeaveFixtureRows(value){
  assertLeaveFixture(leaveFixtureExact(value,[forms,reviews,audit]),'row_state_mismatch');
  const normalized={};
  for(const [table,columns] of Object.entries(storageColumns)){
    const rows=value[table];
    assertLeaveFixture(Array.isArray(rows)&&rows.length<=150&&rows.every(row=>leaveFixtureExact(row,columns)
      &&Object.values(row).every(cell=>cell===null||typeof cell==='string')),'row_state_mismatch');
    assertLeaveFixture(new Set(rows.map(row=>row.id)).size===rows.length,'row_state_mismatch');
    normalized[table]=[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  }
  return normalized;
}
export function assertStudentLeaveFixtureRows(plan,rows){
  plan=checkedStudentLeaveFixturePlan(plan);
  assertLeaveFixture(isDeepStrictEqual(checkedStudentLeaveFixtureRows(rows),plan.rows),'row_state_mismatch');
  return true;
}
export function assertStudentLeaveFixtureEmpty(rows){
  assertLeaveFixture(Object.values(checkedStudentLeaveFixtureRows(rows)).every(value=>value.length===0),'row_state_mismatch');
  return true;
}

/** Both directions intentionally send the target owner, not the authenticated caller,
 * as the filter. A crossed result cannot be explained by a mismatched WHERE clause. */
export function studentLeaveFixtureProbeContracts(plan){
  plan=checkedStudentLeaveFixturePlan(plan);
  const result=[];
  for(const caller of leaveFixtureRoles)for(const target of leaveFixtureRoles)for(const table of [forms,reviews]){
    const callerId=plan.binding.owners[caller].id;
    const targetId=plan.binding.owners[target].id;
    const source=plan.rows[table].filter(row=>row.user_id===targetId);
    assertLeaveFixture(source.length>0,'invalid_plan');
    const primaryFilters=table===forms?{service_key:'eq.leave',record_type:'eq.leave'}:{request_type:'eq.general'};
    const selected=caller===target?source.map(row=>Object.fromEntries(visibleColumns[table].map(field=>[field,row[field]]))):[];
    result.push({runId:plan.binding.runId,sourceRevision:plan.binding.sourceRevision,caller,callerId,target,targetId,table,
      method:'GET',path:'/rest/v1/'+table,prefer:'count=exact',query:{
        select:visibleColumns[table].join(','),user_id:'eq.'+targetId,...primaryFilters,
        ...(caller!==target&&source.length?{id:'in.('+source.map(row=>row.id).join(',')+')'}:{}),order:'id.asc',limit:'80',
      },
      expected:{callerId,statusCode:200,contentRange:selected.length?'0-'+(selected.length-1)+'/'+selected.length:'*/0',rows:selected},
    });
  }
  return freezeLeaveFixture(result);
}
export function verifyStudentLeaveFixtureProbe(expected,actual){
  assertLeaveFixture(leaveFixtureExact(actual,['callerId','statusCode','contentRange','rows'])&&isDeepStrictEqual(expected,actual),'native_readback_mismatch');
  return true;
}
