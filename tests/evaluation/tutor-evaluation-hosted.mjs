import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {buildPlannedTutorEvaluationCases,buildTutorEvaluationCases,tutorEvaluationFixtureForCase,
  tutorEvaluationVisibleChecks} from './tutor-evaluation-cases.mjs';
import {gradeCase} from './grading.mjs';
import {readReply} from './run.mjs';

export const tutorEvaluationFixtureMode='tutor-evaluation-only';
export const tutorEvaluationFamily='tutor-evaluation';
const prefix='account:tutor-evaluation-';
const project='xiftudmvxphxcjtmfmib';
const table='affairs_tutor_evaluations';
const columns=['user_id','questionnaire_version','ratings','comment','request_id','submitted_at'];
const roles=['A','B'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// PostgreSQL jsonb and the independent fixtures may enumerate the same
// fields differently. Hash the validated DTO in this fixed schema order.
function evaluationDigest(evaluation){
  if(evaluation===null)return digest(null);
  const {ratings,comment,submittedAt}=evaluation;
  return digest({ratings,comment,submittedAt});
}
const offline=new Map(buildTutorEvaluationCases().map(item=>[item.id,item]));
const sources={tutorEvaluation:'status','blank:tutorEvaluation':'blank-comment','empty:tutorEvaluation':'unsaved'};
const mounted=new Set([
  'status','submitted-time','all-ratings','selected-ratings','chinese-ratings','comment','blank-comment',
  'without-comment','no-student-profile','unsaved','history-followup',
]);
const planned=buildPlannedTutorEvaluationCases();

export function tutorEvaluationHostedCases(){
  return structuredClone(planned.filter(row=>mounted.has(row.id.slice(prefix.length)))).map(({plannedFixture,...row})=>{
    const usesTime=row.id.endsWith('-submitted-time')||row.id.endsWith('-history-followup');
    if(usesTime){
      const [fact]=row.expected.facts;
      const [time]=fact.values;
      // PostgreSQL's JSON UTC rendering uses an offset for the same instant.
      fact.values=[{anyOf:[time,time.replace(/Z$/u,'+00:00')]}];
    }
    return {...row,fixtureRequirement:'tutor_evaluation_disposable',fixtureKey:'live:'+plannedFixture.family,
      capability:{level:'native',gap:false}};
  });
}

export function validateTutorEvaluationHostedCases(cases){
  if(!isDeepStrictEqual(cases,tutorEvaluationHostedCases()))throw new Error('Tutor evaluation requires the exact owned read-only packet.');
}

export function tutorEvaluationHostedGaps(){
  return planned.filter(row=>!mounted.has(row.id.slice(prefix.length))).map(row=>{
    const suffix=row.id.slice(prefix.length);
    const reason=row.plannedFixture.requiresAdditionalFixtures.length?'separate_charge_fixture_required'
      :suffix.startsWith('write-')?'write_boundary_requires_separate_observation'
        :['foreign-account','anonymous','public-guide'].includes(suffix)?'no_native_owned_read'
          :'saved_questionnaire_has_no_requested_detail';
    return {caseId:row.id,reason};
  });
}

function requestKey(runId,ownerId,family){
  const hex=digest([table,runId,ownerId,family]);
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}

export function buildTutorEvaluationHostedFixture({runId,owners,fixtureKey}){
  if(!Object.hasOwn(sources,fixtureKey))throw new Error('Unknown tutor evaluation fixture family.');
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  const source=tutorEvaluationFixtureForCase(offline.get(prefix+sources[fixtureKey]));
  const recorded=[source.native.evaluation,source.foreign.evaluation];
  const expected=Object.fromEntries(roles.map((role,index)=>[
    role,{userId:binding.owners[role].id,student:null,evaluation:structuredClone(recorded[index])},
  ]));
  const rows=roles.flatMap((role,index)=>{
    const data=recorded[index],user_id=binding.owners[role].id;
    return data===null?[]:[{user_id,questionnaire_version:1,ratings:[...data.ratings],comment:data.comment,
      request_id:requestKey(runId,user_id,fixtureKey),submitted_at:data.submittedAt}];
  });
  const keys=rows.map(row=>row.request_id);
  if(new Set(keys).size!==keys.length||keys.some(key=>[runId,expected.A.userId,expected.B.userId].includes(key)))
    throw new Error('Tutor evaluation fixture reserves invalid request IDs.');
  return {...binding,fixtureKey,expected,rows,keys};
}

function assertPlan(plan){
  if(!isDeepStrictEqual(plan,buildTutorEvaluationHostedFixture(plan)))throw new Error('Tutor evaluation fixture changed after binding.');
}

function exact(value,keys){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort());
}

function normalizedInstant(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.0{1,6})?(?:Z|[+-]\d\d:\d\d)$/u.test(value)
    ||!Number.isFinite(Date.parse(value)))throw new Error('Tutor evaluation fixture returned an invalid saved instant.');
  return new Date(value).toISOString().replace('.000Z','Z');
}

function rowList(value){
  if(!Array.isArray(value)||value.length>2||!value.every(row=>exact(row,columns)))throw new Error('Tutor evaluation fixture returned unexpected persisted rows.');
  return value.map(row=>Object.fromEntries(columns.map(key=>[key,key==='submitted_at'?normalizedInstant(row[key]):row[key]])))
    .sort((left,right)=>left.user_id.localeCompare(right.user_id));
}

function assertRows(actual,expected){
  if(!isDeepStrictEqual(rowList(actual),rowList(expected)))throw new Error('Tutor evaluation rows differ from the exact disposable fixture.');
}

async function readRows(sql,ownerIds,keys,locked=false){
  return sql`select user_id,questionnaire_version,ratings,comment,request_id,
    to_char(submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as submitted_at
    from public.affairs_tutor_evaluations where user_id in ${sql(ownerIds)} or request_id in ${sql(keys)}
    order by user_id,questionnaire_version limit 3 ${locked?sql`for update`:sql``}`;
}

async function assertFreshIdentity(sql,plan){
  const owners=roles.map(role=>plan.owners[role]);
  const rows=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users where id in ${sql(owners.map(owner=>owner.id))} order by id for key share`;
  if(rows.length!==2||owners.some(owner=>!rows.some(row=>isDeepStrictEqual(row,owner))))
    throw new Error('Tutor evaluation callers are outside the recorded fixture lease.');
}

export function createTutorEvaluationFixture({sql,runId,owners,assertLease,persist,transaction}){
  let previous=null,pending=null;
  const reserved=new Set(),ownerIds=roles.map(role=>owners[role].id);
  const save=()=>persist({activeFamily:previous?.fixtureKey??null,pendingFamily:pending?.fixtureKey??null,requestIds:[...reserved].sort()});

  async function transition(family){
    const cleanup=family===null;
    if(!cleanup&&pending)throw new Error('A tutor evaluation transition needs cleanup reconciliation.');
    if(cleanup&&!previous&&!pending)return;
    const next=cleanup?null:buildTutorEvaluationHostedFixture({runId,owners,fixtureKey:family});
    if(next&&previous?.fixtureKey===family)return;
    await assertLease({cleanup});
    const anchor=previous??pending??next;
    if(next){
      const keys=[...new Set([...reserved,...next.keys])];
      await assertFreshIdentity(sql,anchor);
      assertRows(await readRows(sql,ownerIds,keys),previous?.rows??[]);
      pending=next;
      for(const key of next.keys)reserved.add(key);
      await save();
    }
    const keys=[...reserved];
    await transaction(async()=>{
      await assertFreshIdentity(sql,anchor);
      const actual=rowList(await readRows(sql,ownerIds,keys,true));
      const candidates=cleanup?[[],previous?.rows,pending?.rows].filter(Boolean):[previous?.rows??[]];
      if(!candidates.some(rows=>isDeepStrictEqual(rowList(rows),actual)))
        throw new Error('Tutor evaluation rows could not be safely reconciled for cleanup.');
      for(const row of actual){
        const removed=await sql`delete from public.affairs_tutor_evaluations
          where user_id=${row.user_id} and questionnaire_version=${row.questionnaire_version} and request_id=${row.request_id}
          returning request_id`;
        if(removed.length!==1||removed[0].request_id!==row.request_id)
          throw new Error('A reserved tutor evaluation row was not deleted exactly.');
      }
      assertRows(await readRows(sql,ownerIds,keys),[]);
      if(next){
        await sql`insert into public.affairs_tutor_evaluations ${sql(next.rows,...columns)}`;
        assertRows(await readRows(sql,ownerIds,keys),next.rows);
      }
    });
    previous=next;
    pending=null;
    await save();
  }

  return {transition,cleanup:()=>transition(null),current:()=>previous,
    async observe(){
      if(!previous||pending)throw new Error('No established tutor evaluation fixture state.');
      await assertLease({cleanup:false});
      await assertFreshIdentity(sql,previous);
      const rows=await readRows(sql,ownerIds,[...reserved]);
      assertRows(rows,previous.rows);
      return digest(rowList(rows));
    },
    async verifyAbsent(){
      if(previous||pending)throw new Error('Tutor evaluation cleanup was not reconciled.');
      if(reserved.size)assertRows(await readRows(sql,ownerIds,[...reserved]),[]);
    }};
}

export async function observeTutorEvaluationCallers(plan,{users,publishable,origin,previewFetch,directFetch,readResponse,signal}){
  assertPlan(plan);
  if(!Array.isArray(users)||users.length!==2||!users.every((user,index)=>user.id===plan.owners[roles[index]].id
    &&typeof user.token==='string'&&user.token)||users[0].token===users[1].token)
    throw new Error('Tutor evaluation needs two distinct verified disposable caller sessions.');
  const both='in.('+users.map(user=>user.id).join(',')+')';
  const proofs=[];
  for(const [index,role] of roles.entries()){
    const {id,token}=users[index],expected=plan.expected[role];
    const scoped=new URL('/api/affairs-data?scope=tutor-evaluation',origin);
    const rawUrl=new URL('/rest/v1/'+table,'https://'+project+'.supabase.co');
    rawUrl.search=new URLSearchParams({select:columns.join(','),user_id:both,order:'user_id.asc',limit:'3'});
    const init={method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token},signal};
    const native=await readResponse(await previewFetch(scoped,init),scoped,16384);
    if(!exact(native,['userId','student','evaluation'])||native.userId!==id||native.student!==null
      ||native.evaluation!==null&&!exact(native.evaluation,['ratings','comment','submittedAt']))
      throw new Error('Tutor evaluation readback exposed an unexpected owner or profile.');
    const projected=native.evaluation===null?null:{...native.evaluation,submittedAt:normalizedInstant(native.evaluation.submittedAt)};
    if(!isDeepStrictEqual(projected,expected.evaluation))throw new Error('Tutor evaluation DTO differs from the independent owned oracle.');
    const actual=await readResponse(await directFetch(rawUrl,{...init,headers:{...init.headers,apikey:publishable}}),rawUrl,16384);
    const owned=plan.rows.filter(row=>row.user_id===id);
    assertRows(actual,owned);
    proofs.push({role,visibleRows:owned.length,projectionSha256:evaluationDigest(projected)});
  }
  return proofs;
}

export async function requestTutorEvaluation({testCase,origin,token,signal,fetchImpl,privateMarkers,correlationIds}){
  const endpoint=new URL('/api/affairs-assistant',origin);
  const draft={question:testCase.question,route:testCase.route,history:testCase.history||[],stream:true,consentedResearchUse:false};
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(draft),signal});
  const correlationId=response.headers.get('X-Assistant-Request-Id');
  if(response.status!==200||response.redirected||response.url&&response.url!==endpoint.href||!uuid.test(correlationId)
    ||!/^text\/event-stream(?:\s*;|$)/iu.test(response.headers.get('content-type')??'')||correlationIds.has(correlationId)){
    await response.body?.cancel();
    throw new Error('Tutor evaluation assistant did not return a distinct pinned stream.');
  }
  const envelope={...await readReply(response),statusCode:response.status,fixtureKey:testCase.fixtureKey,
    execution:testCase.executionContract==='live-native'?'live-native':'live-model'};
  const raw=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
  if(privateMarkers.some(marker=>marker&&raw.includes(marker.toLowerCase()))
    ||/"(?:user_id|userid|request_id|requestid|student_number|studentnumber|signedurl)"\s*:|foreign tutor comment|storage\/v1\/|object\/sign\//u.test(raw))
    throw new Error('Tutor evaluation assistant exposed an excluded field.');
  correlationIds.add(correlationId);
  return {envelope,correlationId,requestSha256:digest(draft)};
}

export function gradeHostedTutorEvaluation(testCase,envelope,before,after){
  const owned=offline.get(testCase.id);
  const fixtures=tutorEvaluationFixtureForCase(owned);
  const recordProof=roles.map(role=>({role,visibleRows:role==='A'&&fixtures.native.evaluation===null?0:1,
    projectionSha256:evaluationDigest(role==='A'?fixtures.native.evaluation:fixtures.foreign.evaluation)}));
  const rowsUnchanged=isDeepStrictEqual(before,after)&&isDeepStrictEqual(before.callers,recordProof);
  const enriched={...envelope,stateBefore:{ownedRecordsDigest:before.rowsDigest},stateAfterProposal:{ownedRecordsDigest:after.rowsDigest},
    fixtureReadback:{verified:rowsUnchanged,independentGolden:rowsUnchanged}};
  const failures=[...gradeCase(testCase,enriched).failures,...tutorEvaluationVisibleChecks(owned,envelope.body).filter(check=>!check.passed)].map(check=>check.id);
  const events=envelope.events??[],reader=events.filter(step=>String(step?.kind).startsWith('account-read:'));
  const completed=reader.filter(step=>step.status==='complete');
  const expectedEvents=completed.flatMap((_,index)=>[
    ['account-read:tutorEvaluation:'+(index+1),'running'],['account-read:tutorEvaluation:'+(index+1),'complete'],
  ]);
  const attempts=envelope.body?.verification?.attempts;
  const finalCheck=events.some(step=>step?.kind==='verification-'+attempts&&step.status==='complete');
  if(!rowsUnchanged||!/^[a-f0-9]{64}$/u.test(before.rowsDigest))failures.push('tutor.readback');
  if(!Number.isInteger(attempts)||attempts<1||attempts>3||envelope.body.verification.status!=='verified'
    ||!completed.length||completed.length>attempts||!isDeepStrictEqual(reader.map(({kind,status})=>[kind,status]),expectedEvents)||!finalCheck)
    failures.push('tutor.request_activity');
  if(events.some(step=>/storage|submit.tutor|approve.tutor|download|upload|confirmed.action/iu.test(String(step?.kind))))
    failures.push('tutor.unexpected_activity');
  return {caseId:testCase.id,passed:failures.length===0,failures,attempts:attempts??null,completedReads:completed.length,
    callerCounts:before.callers.map(row=>row.visibleRows),recordDigest:before.rowsDigest};
}
