/** Unmounted, offline fixture composition. This module never creates an Auth
 * user, opens a connection, invokes fetch, or executes a mutation. The reviewed
 * browser harness still needs a separately reviewed lifecycle/session adapter.
 * Aid observations describe the old direct-client transport only; they do not
 * establish acceptance of the upcoming account-graph aid implementation. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {buildAidPaymentFixturePlan,validateAidPaymentFixtureOwners,verifyAidPaymentFixtureReadback,
  assertAidPaymentFixtureCleanup,assertAidPaymentFixtureIdentities,assertAidPaymentFixtureRowTargets} from './aid-payment-fixture-plan.mjs';
import {bindNativeBrowserCases,nativeEvidenceDigest} from '../integration/assistant-client-dispatch-browser.mjs';

const PROJECT='xiftudmvxphxcjtmfmib';
const TABLES=['affairs_aid_payment_claims','affairs_aid_salary_records','elearning_enrollments','elearning_course_access'];
const ENROLLMENT=9718,OUTLINE=9408;
const exact=(value,keys)=>value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const integer=(value,min=1,max=2147483647)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
function check(value,code){assert.ok(value,code);}
function same(actual,expected,code){check(isDeepStrictEqual(actual,expected),code);}
function timestamp(value){
  check(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/u.test(value)
    &&Number.isFinite(Date.parse(value)),'native-fixture-time');
  return new Date(value).toISOString();
}
function unique(rows,key){check(new Set(rows.map(row=>row[key])).size===rows.length,'native-fixture-duplicate-'+key);}

/** The future adapter must execute precisely these complete, read-only public
 * selections. A caller-supplied `complete:true` is not evidence of execution.
 * These descriptors are not SQL identifiers accepted from a question. */
export const nativeBrowserPublishedSelection=freeze({
  categories:{table:'elearning_categories',all:true,order:['position']},
  courses:{table:'elearning_courses',where:{category_id:41,or_ids:[ENROLLMENT,OUTLINE]},order:['category_id','position']},
  notices:{table:'elearning_notices',all:true,order:['position']},
  sections:{table:'elearning_sections',where:{course_id:OUTLINE},order:['position']},
  activities:{table:'elearning_activities',where:{course_id:OUTLINE},order:['section_position','position']},
});

export function validateNativeBrowserPublished(input){
  check(exact(input,['selection','categories','courses','notices','sections','activities']),'native-fixture-public-shape');
  check(Buffer.byteLength(JSON.stringify(input),'utf8')<=128000,'native-fixture-public-bound');
  same(input.selection,nativeBrowserPublishedSelection,'native-fixture-public-selection');
  const value=clone(input);
  const limits={categories:100,courses:100,notices:100,sections:64,activities:6400};
  for(const [key,limit] of Object.entries(limits))check(Array.isArray(value[key])&&value[key].length<=limit,'native-fixture-public-list');
  for(const row of value.categories)check(exact(row,['id','parent_id','title','source_count','position'])&&integer(row.id)
    &&(row.parent_id===null||integer(row.parent_id))&&text(row.title,200)&&(row.source_count===null||integer(row.source_count,0))&&integer(row.position),'native-fixture-category');
  unique(value.categories,'id');unique(value.categories,'position');
  const categoryIds=new Set(value.categories.map(row=>row.id));
  check(value.categories.every(row=>row.parent_id===null||categoryIds.has(row.parent_id)),'native-fixture-category-parent');
  for(const row of value.courses)check(exact(row,['id','category_id','title','self_enroll','position'])&&integer(row.id)
    &&categoryIds.has(row.category_id)&&text(row.title,200)&&typeof row.self_enroll==='boolean'&&integer(row.position)
    &&(row.category_id===41||[ENROLLMENT,OUTLINE].includes(row.id)),'native-fixture-course');
  unique(value.courses,'id');
  check(new Set(value.courses.map(row=>row.category_id+':'+row.position)).size===value.courses.length,'native-fixture-course-position');
  check(value.courses.some(row=>row.id===ENROLLMENT&&row.category_id===41&&row.self_enroll)
    &&value.courses.some(row=>row.id===OUTLINE),'native-fixture-required-published-courses');
  for(const row of value.notices)check(exact(row,['id','kind','title','local_body','position'])&&integer(row.id)
    &&['page','resource','url','folder'].includes(row.kind)&&text(row.title,240)&&(row.local_body===null||text(row.local_body,4000))&&integer(row.position),'native-fixture-notice');
  unique(value.notices,'id');unique(value.notices,'position');
  for(const row of value.sections)check(exact(row,['course_id','position','title'])&&row.course_id===OUTLINE&&integer(row.position,1,64)&&text(row.title,200),'native-fixture-section');
  unique(value.sections,'position');
  const positions=new Set(value.sections.map(row=>row.position));
  for(const row of value.activities)check(exact(row,['id','course_id','section_position','position','kind','title','purpose'])&&integer(row.id)
    &&row.course_id===OUTLINE&&positions.has(row.section_position)&&integer(row.position,1,100)&&text(row.title,240)
    &&(row.kind==='url'?['link','video','slides','feedback'].includes(row.purpose):row.kind==='attendanceregister'&&['link','attendance'].includes(row.purpose)),'native-fixture-activity');
  unique(value.activities,'id');
  check(new Set(value.activities.map(row=>row.section_position+':'+row.position)).size===value.activities.length,'native-fixture-activity-position');
  check(value.activities.some(row=>row.purpose==='video')&&value.activities.some(row=>row.purpose==='attendance'),'native-fixture-required-activities');
  value.categories.sort((a,b)=>a.position-b.position);value.courses.sort((a,b)=>a.category_id-b.category_id||a.position-b.position);
  value.notices.sort((a,b)=>a.position-b.position);value.sections.sort((a,b)=>a.position-b.position);
  value.activities.sort((a,b)=>a.section_position-b.section_position||a.position-b.position);
  return freeze(value);
}

function expectedElearning(published,owners,now){
  const sections=published.sections.map(row=>({position:row.position,title:row.title,activities:published.activities
    .filter(activity=>activity.section_position===row.position).map(({id,title,kind,purpose})=>({id,title,kind,purpose}))}));
  return Object.fromEntries(['A','B'].map(key=>[key,{
    workspace:{userId:owners[key].id,categories:clone(published.categories),courses:clone(published.courses.filter(row=>row.category_id===41)),
      notices:clone(published.notices),enrollments:key==='A'?[{courseId:ENROLLMENT,joinedAt:now}]:[]},
    outline:{userId:owners[key].id,courseId:OUTLINE,sections:key==='A'?clone(sections):[]},
  }]));
}

export function buildNativeBrowserFixturePlan({runId,sourceRevision,owners,now,published}={}){
  check(/^[a-f0-9]{40}$/u.test(sourceRevision||''),'native-fixture-revision');
  const identity=validateAidPaymentFixtureOwners({runId,owners}),when=timestamp(now),source=validateNativeBrowserPublished(published);
  const aid=buildAidPaymentFixturePlan({runId,owners:identity.owners,fixtureKey:'browser:aidPayments'});
  const expected=expectedElearning(source,identity.owners,when);
  const rows={...clone(aid.rows),elearning_enrollments:[{user_id:identity.owners.A.id,course_id:ENROLLMENT,joined_at:when}],
    elearning_course_access:[{course_id:OUTLINE,user_id:identity.owners.A.id,created_at:when}]};
  same(Object.keys(rows).sort(),[...TABLES].sort(),'native-fixture-row-tables');
  const binding={runId,projectRef:PROJECT,sourceRevision,owners:Object.fromEntries(['A','B'].map(key=>[key,{
    userId:identity.owners[key].id,aid:{salary:clone(aid.expectedByOwner[identity.owners[key].id].salary.rows),
      claims:clone(aid.expectedByOwner[identity.owners[key].id].claims.rows)},...expected[key],
  }]))};
  const bound=bindNativeBrowserCases(binding);
  const plan={version:1,kind:'native-browser-fixture-plan-v1',targetLayer:'browser-client-dispatch-baseline',liveAdapterReady:false,
    runId,projectRef:PROJECT,sourceRevision,now:when,owners:identity.owners,published:source,publishedDigest:nativeEvidenceDigest(source),
    aid,rows,binding:bound.binding,bindingDigest:bound.bindingDigest};
  return freeze({...plan,planDigest:nativeEvidenceDigest(plan)});
}

function validatedPlan(plan){
  const rebuilt=buildNativeBrowserFixturePlan(plan);same(plan,rebuilt,'native-fixture-plan-tampered');return rebuilt;
}
function normalizedWorkspace(value){
  const result=clone(value);check(Array.isArray(result?.enrollments),'native-fixture-workspace-enrollments');
  result.enrollments=result.enrollments.map(row=>({...row,joinedAt:timestamp(row.joinedAt)}));return result;
}
function verifyOwnedRead(plan,key,name,body){
  if(['salary','claims','salarySummary','claimsSummary'].includes(name)){
    verifyAidPaymentFixtureReadback(plan.aid,{role:key,view:name.startsWith('salary')?'salary':'claims',page:1,summary:name.endsWith('Summary')},body);
  }else if(name==='workspace')same(normalizedWorkspace(body),plan.binding.owners[key].workspace,'native-fixture-'+key+'-workspace');
  else same(body,plan.binding.owners[key].outline,'native-fixture-'+key+'-outline');
}

/** A full read is compared against independently planned SQL fields. Summary
 * totals alone cannot certify salary amounts, tax, enrollment or access. */
export function verifyNativeBrowserFixtureReadback(plan,input){
  const checked=validatedPlan(plan);check(exact(input,['published','owners'])&&exact(input.owners,['A','B']),'native-fixture-readback-shape');
  same(validateNativeBrowserPublished(input.published),checked.published,'native-fixture-published-drift');
  for(const key of ['A','B']){
    const actual=input.owners[key];
    check(exact(actual,['salary','claims','salarySummary','claimsSummary','workspace','outline']),'native-fixture-owner-readback');
    for(const view of ['salary','claims']){
      verifyAidPaymentFixtureReadback(checked.aid,{role:key,view,page:1,summary:false},actual[view]);
      verifyAidPaymentFixtureReadback(checked.aid,{role:key,view,page:1,summary:true},actual[view+'Summary']);
    }
    same(normalizedWorkspace(actual.workspace),checked.binding.owners[key].workspace,'native-fixture-'+key+'-workspace');
    same(actual.outline,checked.binding.owners[key].outline,'native-fixture-'+key+'-outline');
  }
  return freeze({verified:true,planDigest:checked.planDigest,bindingDigest:checked.bindingDigest,publishedDigest:checked.publishedDigest});
}

const READS=freeze([
  ['salary',{scope:'aid-payments',view:'salary',page:'1'}],['claims',{scope:'aid-payments',view:'claims',page:'1'}],
  ['salarySummary',{scope:'aid-payments',view:'salary',page:'1',summary:'1'}],['claimsSummary',{scope:'aid-payments',view:'claims',page:'1',summary:'1'}],
  ['workspace',{scope:'elearning-workspace'}],['outline',{scope:'elearning-course-outline',course:String(OUTLINE)}],
]);

/** Explicitly injected I/O, with immutable selectors and no default transport.
 * The lifecycle supplies exact fresh-owner JWTs; secrets never enter this plan.
 * This helper proves readback only, not fixture creation or cleanup. */
export async function readNativeBrowserFixture(plan,{readOwned,readPublished},{signal,timeoutMs=15000}={}){
  const checked=validatedPlan(plan);check(typeof readOwned==='function'&&typeof readPublished==='function','native-fixture-readers');
  check(integer(timeoutMs,1,15000),'native-fixture-timeout');
  const deadline=new AbortController(),combined=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal;
  const timer=setTimeout(()=>deadline.abort(),timeoutMs);let cancel;
  const aborted=new Promise((_,reject)=>{cancel=()=>reject(new Error('native-fixture-read-aborted'));combined.addEventListener('abort',cancel,{once:true});});
  try{
    combined.throwIfAborted();
    const result={published:null,owners:{A:{},B:{}}};
    result.published=await Promise.race([Promise.resolve().then(()=>readPublished(clone(nativeBrowserPublishedSelection),{signal:combined})),aborted]);
    same(validateNativeBrowserPublished(result.published),checked.published,'native-fixture-published-drift');
    for(const key of ['A','B'])for(const [name,query] of READS){
      combined.throwIfAborted();const response=await Promise.race([Promise.resolve().then(()=>readOwned({ownerKey:key,userId:checked.owners[key].id,
        path:'/api/affairs-data',query:clone(query)},{signal:combined})),aborted]);
      check(exact(response,['status','body'])&&response.status===200,'native-fixture-read-unavailable');
      verifyOwnedRead(checked,key,name,response.body);result.owners[key][name]=clone(response.body);
    }
    same(validateNativeBrowserPublished(await Promise.race([Promise.resolve().then(()=>readPublished(clone(nativeBrowserPublishedSelection),{signal:combined})),aborted])),
      checked.published,'native-fixture-published-drift');
    return verifyNativeBrowserFixtureReadback(checked,result);
  }finally{clearTimeout(timer);combined.removeEventListener('abort',cancel);}
}

/** Exact rows read under the existing lease before any cleanup mutation. No
 * table, ID or broader disposable-owner prefix is accepted from a question. */
export function assertNativeBrowserOwnedTargets(plan,{identities,rows}){
  const checked=validatedPlan(plan);check(exact(rows,TABLES),'native-fixture-target-tables');
  assertAidPaymentFixtureIdentities(checked.aid,identities);
  assertAidPaymentFixtureRowTargets(checked.aid,Object.fromEntries(Object.values(checked.aid.tables).map(table=>[table,rows[table]])));
  for(const table of ['elearning_enrollments','elearning_course_access'])same(rows[table],checked.rows[table],'native-fixture-target-'+table);
  return true;
}

/** Public cleanup proof supplements, never replaces, the existing Auth ledger
 * and aid owner checks. Its zero counts must come from all-owned-row queries,
 * not merely the rows remembered by this plan. Auth deletion is not authorized
 * by this helper; the original lifecycle must reconcile exact run identities. */
export function verifyNativeBrowserCleanupProof(plan,proof){
  const checked=validatedPlan(plan);
  check(exact(proof,['runId','projectRef','planDigest','fenced','drained','sessionsCleared','unresolved','ledgerOwned','leaseHeld',
    'aidCleanup','remaining','sharedPublished','protectedOwnerUnchanged']),'native-fixture-cleanup-shape');
  check(proof.runId===checked.runId&&proof.projectRef===PROJECT&&proof.planDigest===checked.planDigest,'native-fixture-cleanup-lineage');
  check(proof.fenced===true&&proof.drained===true&&proof.sessionsCleared===true&&proof.unresolved===0&&proof.ledgerOwned===true
    &&proof.leaseHeld===true&&proof.protectedOwnerUnchanged===true,'native-fixture-cleanup-unverified');
  assertAidPaymentFixtureCleanup(checked.aid,proof.aidCleanup);
  same(validateNativeBrowserPublished(proof.sharedPublished),checked.published,'native-fixture-cleanup-shared-drift');
  check(exact(proof.remaining,['A','B']),'native-fixture-cleanup-owners');
  for(const key of ['A','B']){
    const value=proof.remaining[key];check(exact(value,['userId','auth','enrollments','courseAccess','conversations','storageObjects'])
      &&value.userId===checked.owners[key].id&&['auth','enrollments','courseAccess','conversations','storageObjects'].every(field=>value[field]===0),'native-fixture-cleanup-residue');
  }
  return freeze({verified:true,planDigest:checked.planDigest,remainingRows:0,protectedOwnerUnchanged:true,scope:'provided-independent-proof-only'});
}

export const nativeBrowserLifecycleRequirements=freeze({
  ready:false,targetLayer:'browser-client-dispatch-baseline',
  reason:'Existing Auth/session/intent state is private; no complete safe lifecycle adapter is exported.',
  reuse:{lease:'tests/integration/dormitory-conduct-rls-live.mjs#reserveDormitoryConductLease',
    recovery:'tests/evaluation/live-fixtures.mjs#reconcileFixtureIdentity',
    fingerprint:'tests/evaluation/live-fixtures.mjs#readProtectedOwnerFingerprint',
    conversation:'tests/integration/assistant-conversation-http-live.mjs#reconcileConversationWrite'},
  requiredSeam:['exclusive-recovery-ledger-before-auth','fresh-ordinary-two-owner-session-access','journal-before-owned-insert',
    'exact-published-baseline-and-full-owned-readback','journal-before-browser-conversation-write','synchronous-fence-and-abort',
    'drain-and-reconcile-in-flight-outcomes','clear-all-session-secrets-before-cleanup-io','tokenless-exact-owner-cleanup-and-cascade-proof'],
  forbidden:['admin-promotion','shared-catalog-writes','university-access','unscoped-delete','implicit-network-on-import','model-acceptance-claim'],
});
