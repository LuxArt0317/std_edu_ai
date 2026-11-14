import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';

// Pure, unmounted fixture plan. No identity creation, SQL, HTTP, credentials or
// shared-course mutation. The future adapter must prove a disposable two-user
// lifecycle, persist intent before writes, and reconcile uncertain transactions.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const roles=['A','B'],table='dtm_grade_reports';
const courseKeys=['id','userId','code','title','term','role','sourceMode'];
const cellKeys=['score','maximum','gradeText','rangeText','percentageText','weightText','weightNote','rankText','feedbackText','contributionText'];
const cells=value=>({...Object.fromEntries(cellKeys.map(key=>[key,null])),...value});
const firstItem={label:'Native Database Quiz',activityKind:'assignment',...cells({score:0,maximum:10,gradeText:'0',rangeText:'0–10',weightText:'0.00 %',weightNote:'',feedbackText:'Explain the index choice'})};
export const dtmGradeReportFixtureManifest=freeze({
  version:1,sourceMigration:'20261114000000_dtm_grade_reports.sql',table,
  families:['dtmGradeReport','empty:dtmGradeReport','full:dtmGradeReport'],timestamp:'2026-11-14T00:00:00.000Z',
  A:{course:{id:'10000000-0000-4000-8000-000000000101',code:'DTM301',title:'Learning Research',term:'115學年度第1學期',role:'student',sourceMode:'personal'},
    item:firstItem,total:null},
  fullA:{items:[clone(firstItem),...Array.from({length:18},(_,index)=>({label:'Native Report Item '+String(index+2).padStart(2,'0'),activityKind:'assignment',
    ...cells({score:1,maximum:10,gradeText:'1',weightText:'5.00 %',feedbackText:'Saved item feedback '+String(index+2).padStart(2,'0')})})),
    {label:'Native Report Tail Assessment',activityKind:'assignment',...cells({score:7,maximum:10,gradeText:'7',weightText:'5.00 %',feedbackText:'Explain the tail assessment'})}],
    total:cells({score:73.5,maximum:100,gradeText:'73.50',percentageText:'73.50 %',feedbackText:'FULL REPORT TOTAL SENTINEL'})},
  B:{course:{code:'FOREIGN-EVAL',title:'FOREIGN PRIVATE SENTINEL',term:'Synthetic private term',role:'student',sourceMode:'personal'},
    item:{label:'FOREIGN NATIVE DTM REPORT',activityKind:'assignment',...cells({score:9,maximum:10,gradeText:'9',rangeText:'0–10',percentageText:'90 %',weightText:'25.00 %',feedbackText:'FOREIGN REPORT FEEDBACK'})},
    total:cells({score:91,maximum:100,gradeText:'91',feedbackText:'FOREIGN REPORT TOTAL'})},
  boundaries:['Reports are literal local_demo records, separate from dtm_grade_items and submission reviews.',
    'An absent report is distinct from a saved report with a null total; item zero does not calculate a course total.',
    'Selected owned course bindings are prerequisites, not permission to create or delete courses or a complete course overview.',
    'This plan cannot establish fresh identities, Google sessions, official grades, administrator access or execution authority.'],
});
const errors=new Set(['invalid_plan','invalid_owners','course_binding_mismatch','invalid_request','fixture_identity_mismatch','fixture_rows_mismatch','fixture_rows_remain','readback_mismatch']);
const fail=code=>{const safe=errors.has(code)?code:'invalid_plan';throw Object.assign(new Error('DTM grade report fixture '+safe+'.'),{name:'DtmGradeReportFixturePlanError',code:safe});};
const requireValue=(condition,code)=>{if(!condition)fail(code);};
export function validateDtmGradeReportFixtureOwners(input){
  try{return validateAidPaymentFixtureOwners(input);}catch{fail('invalid_owners');}
}
function courseBindings(value,owners){
  requireValue(exact(value,roles),'course_binding_mismatch');
  for(const role of roles){const row=value[role],expected=dtmGradeReportFixtureManifest[role].course;
    requireValue(exact(row,courseKeys)&&uuid(row.id)&&row.userId===owners[role].id
      &&Object.entries(expected).every(([key,entry])=>row[key]===entry),'course_binding_mismatch');
  }
  const ids=roles.map(role=>value[role].id);
  requireValue(new Set(ids).size===2&&!ids.some(id=>roles.some(role=>id===owners[role].id||id===owners[role].runMarker)),'course_binding_mismatch');
  return clone(value);
}
function idFor(runId,ownerId,fixtureKey,kind){
  const hash=createHash('sha256').update(JSON.stringify(['dtm-grade-report-fixture-v1',runId,ownerId,fixtureKey,kind])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
}
function build(input){
  requireValue(exact(input,['runId','owners','fixtureKey','courseBindings'])&&dtmGradeReportFixtureManifest.families.includes(input.fixtureKey),'invalid_plan');
  const receipt=validateDtmGradeReportFixtureOwners({runId:input.runId,owners:input.owners}),bindings=courseBindings(input.courseBindings,receipt.owners);
  const records=[],expectedByOwner={},itemIds=[];
  for(const role of roles){const owner=receipt.owners[role],course=bindings[role],golden=dtmGradeReportFixtureManifest[role];
    if(role==='A'&&input.fixtureKey==='empty:dtmGradeReport'){expectedByOwner[owner.id]={report:null};continue;}
    const id=idFor(receipt.runId,owner.id,input.fixtureKey,'report'),full=role==='A'&&input.fixtureKey==='full:dtmGradeReport';
    const itemValues=full?dtmGradeReportFixtureManifest.fullA.items:[golden.item];
    const items=itemValues.map((item,index)=>{const itemId=idFor(receipt.runId,owner.id,input.fixtureKey,index===0?'item':'item:'+String(index+1));itemIds.push(itemId);return {id:itemId,...clone(item)};});
    const report={items,total:clone(full?dtmGradeReportFixtureManifest.fullA.total:golden.total)},stamp=dtmGradeReportFixtureManifest.timestamp;
    records.push({id,user_id:owner.id,course_id:course.id,report,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null});
    expectedByOwner[owner.id]={report:{id,userId:owner.id,courseId:course.id,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,...clone(report)}};
  }
  const recordIds=records.map(row=>row.id),allIds=[...recordIds,...itemIds],reserved=[receipt.runId,...roles.flatMap(role=>[receipt.owners[role].id,bindings[role].id])];
  requireValue(new Set(allIds).size===allIds.length&&!allIds.some(id=>reserved.includes(id)),'invalid_plan');
  const setup=[{kind:'persist-intent',tables:[table],recordIds:[...recordIds]},
    {kind:'assert-owned-identities'},{kind:'assert-existing-course-bindings'},{kind:'assert-owned-report-table-empty'},
    {kind:'insert-exact-rows',table,rows:clone(records)},{kind:'verify-both-caller-readbacks'}];
  const cleanup=[{kind:'assert-owned-identities'},{kind:'assert-exact-owned-row-targets'},
    {kind:'delete-exact-rows',table,targets:records.map(row=>({id:row.id,userId:row.user_id,courseId:row.course_id}))},
    {kind:'verify-owned-report-table-empty'},{kind:'verify-course-bindings-unchanged'},{kind:'return-to-existing-auth-cleanup'}];
  return freeze({version:1,kind:'dtm-grade-report-fixture-plan',runId:receipt.runId,fixtureKey:input.fixtureKey,owners:receipt.owners,
    courseBindings:bindings,table,rows:{[table]:records},recordIds,itemIds,expectedByOwner,setup,cleanup});
}
export function buildDtmGradeReportFixturePlan(input){return build(input);}
function checkedPlan(plan){
  try{requireValue(exact(plan,['version','kind','runId','fixtureKey','owners','courseBindings','table','rows','recordIds','itemIds','expectedByOwner','setup','cleanup']),'invalid_plan');
    const expected=build({runId:plan.runId,owners:plan.owners,fixtureKey:plan.fixtureKey,courseBindings:plan.courseBindings});
    requireValue(isDeepStrictEqual(plan,expected),'invalid_plan');return expected;
  }catch{fail('invalid_plan');}
}
/** The eventual adapter supplies the caller's JWT separately. This contract has
 * no owner selector, administrator route, overview completeness or write RPC. */
export function dtmGradeReportFixtureReadContract(plan,options){
  plan=checkedPlan(plan);requireValue(exact(options,['role'])&&roles.includes(options.role),'invalid_request');
  const ownerId=plan.owners[options.role].id,courseId=plan.courseBindings[options.role].id;
  return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope:'dtm-grade-report',course_id:courseId},
    localUrl:'/dtm/course/'+courseId+'/grades',expected:clone(plan.expectedByOwner[ownerId])});
}
function samePlannedInstant(value,expected){
  if(typeof value!=='string')return false;
  const parts=/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/u.exec(value);
  if(!parts)return false;
  const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  // Postgres may serialize an offset or omit zero fractions. Reject invalid
  // dates and nonzero microseconds rather than letting Date.parse round them.
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]
    &&!/[1-9]/u.test((parts[4]??'').slice(3))&&Date.parse(value)===Date.parse(expected);
}
export function verifyDtmGradeReportFixtureReadback(plan,options,actual){
  const expected=dtmGradeReportFixtureReadContract(plan,options).expected;
  if(expected.report===null){requireValue(isDeepStrictEqual(actual,expected),'readback_mismatch');return true;}
  requireValue(exact(actual,['report'])&&exact(actual.report,Object.keys(expected.report))
    &&samePlannedInstant(actual.report.createdAt,expected.report.createdAt)
    &&samePlannedInstant(actual.report.updatedAt,expected.report.updatedAt),'readback_mismatch');
  const comparable={report:{...actual.report,createdAt:expected.report.createdAt,updatedAt:expected.report.updatedAt}};
  requireValue(isDeepStrictEqual(comparable,expected),'readback_mismatch');return true;
}
/** These selected rows must come from an authoritative ownership-scoped read;
 * the function checks their exact content, not the authority of their source. */
export function assertDtmGradeReportFixtureCourseBindings(plan,actual){
  plan=checkedPlan(plan);const value=courseBindings(actual,plan.owners);
  requireValue(isDeepStrictEqual(value,plan.courseBindings),'course_binding_mismatch');return true;
}
export function assertDtmGradeReportFixtureIdentities(plan,identities){
  plan=checkedPlan(plan);requireValue(Array.isArray(identities)&&identities.length===2,'fixture_identity_mismatch');
  for(const role of roles){const expected=plan.owners[role],matches=identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===expected.id);
    requireValue(matches.length===1&&isDeepStrictEqual(matches[0],expected),'fixture_identity_mismatch');}
  return true;
}
/** Include all report rows for both owners, including tombstones. Unexpected
 * records cannot be deleted by claiming that their course or owner is similar. */
export function assertDtmGradeReportFixtureRowTargets(plan,actual){
  plan=checkedPlan(plan);requireValue(exact(actual,[table])&&Array.isArray(actual[table]),'fixture_rows_mismatch');
  const keys=['id','user_id','course_id','deleted_at'],expected=plan.rows[table].map(row=>Object.fromEntries(keys.map(key=>[key,row[key]])));
  requireValue(actual[table].length===expected.length&&actual[table].every(row=>exact(row,keys)),'fixture_rows_mismatch');
  const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  requireValue(isDeepStrictEqual(sorted(actual[table]),sorted(expected)),'fixture_rows_mismatch');return true;
}
export function assertDtmGradeReportFixtureEmpty(plan,counts){
  plan=checkedPlan(plan);requireValue(exact(counts,[table])&&Array.isArray(counts[table])&&counts[table].length===2,'fixture_rows_remain');
  for(const role of roles){const matches=counts[table].filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);
    requireValue(matches.length===1&&matches[0].count===0,'fixture_rows_remain');}
  return true;
}
export function assertDtmGradeReportFixtureCleanup(plan,proof){
  requireValue(exact(proof,['identities','remainingByTable','courseBindings']),'fixture_rows_remain');
  assertDtmGradeReportFixtureIdentities(plan,proof.identities);assertDtmGradeReportFixtureEmpty(plan,proof.remainingByTable);
  assertDtmGradeReportFixtureCourseBindings(plan,proof.courseBindings);return true;
}
