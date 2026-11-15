import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildPlannedCounselingAppointmentCases} from './counseling-appointment-cases.mjs';
import {assertCounselingAppointmentFixtureIdentities,assertCounselingAppointmentFixtureRows,
  counselingAppointmentFixtureCaseBinding,counselingAppointmentFixtureReadContract,counselingAppointmentFixtureSqlReadContract,
  reconcileCounselingAppointmentFixturePlans,verifyCounselingAppointmentFixtureReadback} from './counseling-appointment-fixture-plan.mjs';
import {gradeCase} from './grading.mjs';
import {readReply} from './run.mjs';

export const counselingFixtureMode='counseling-appointments-only';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const suffixes=new Set(['history','requested-date','scheduled-time','assessment-kind','cancelled-history','closed-history',
  'empty','capped-history','history-followup']);
const prefix='account:counseling-appointments-';
const roles=['A','B'];
const table='affairs_counseling_appointments';

export function counselingHostedCases(){
  return structuredClone(buildPlannedCounselingAppointmentCases().filter(row=>suffixes.has(row.id.slice(prefix.length))))
    .map(({plannedFixture,...row})=>({...row,fixtureRequirement:'counseling_appointments_disposable',
      fixtureKey:'live:'+plannedFixture.family,capability:{level:'native',gap:false}}));
}

export function validateCounselingHostedCases(cases){
  if(!isDeepStrictEqual(cases,counselingHostedCases()))
    throw new Error('Counseling evaluation requires the exact read-only appointment packet.');
  return true;
}

async function readRows(sql,plan,ids){
  const {anyOf}=counselingAppointmentFixtureSqlReadContract(plan);
  const rows=await sql`select id,user_id,kind,preferred_on::text,preferred_period,status,
    to_char(scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as scheduled_at,
    consent_version,to_char(consent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as consent_at,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at,version
    from public.affairs_counseling_appointments where user_id in ${sql(anyOf[0].values)} or id in ${sql(ids)}
    order by id limit 201`;
  return {[table]:Array.from(rows)};
}

/** Operates only on verified disposable owners and known row IDs, inside a
 * transaction supplied by the evaluation lease. Partial snapshots fail closed. */
export async function transitionCounselingFixtures(sql,{previous=null,next=null,recovering=false,knownIds=[]}){
  const plan=next??previous;
  const ownerIds=roles.map(role=>plan.owners[role].id);
  const identities=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users where id in ${sql(ownerIds)} order by id for key share`;
  assertCounselingAppointmentFixtureIdentities(plan,{identities:Array.from(identities)});
  const ids=[...new Set([...knownIds,...[previous,next].flatMap(item=>item?.recordIds??[])])];
  const proof=reconcileCounselingAppointmentFixturePlans({previous,next,actual:await readRows(sql,plan,ids)});
  if(!recovering&&proof.state!==(previous?'previous':'empty'))
    throw new Error('The previous disposable counseling fixture could not be reconciled.');
  for(const target of proof.deleteTargets){
    const removed=await sql`delete from public.affairs_counseling_appointments
      where id=${target.id} and user_id=${target.userId} returning id`;
    if(removed.length!==1||removed[0].id!==target.id)throw new Error('A disposable counseling row could not be reconciled.');
  }
  if((await readRows(sql,plan,ids))[table].length)throw new Error('Reserved counseling rows remain.');
  if(next&&!recovering){
    await sql`insert into public.affairs_counseling_appointments ${sql(next.rows[table])}`;
    assertCounselingAppointmentFixtureRows(next,await readRows(sql,next,ids));
  }
}

export async function observeCounselingFixture(plan,{sql,users,origin,fetchImpl,readResponse,signal,knownIds}){
  const ownerIds=roles.map(role=>plan.owners[role].id);
  if(users.length!==2||users.some((user,index)=>user.id!==ownerIds[index]||typeof user.token!=='string'||!user.token)
    ||users[0].token===users[1].token)throw new Error('Counseling requires two distinct disposable callers.');
  const rows=await readRows(sql,plan,knownIds);
  assertCounselingAppointmentFixtureRows(plan,rows);
  const extra=await sql`select user_id from private.affairs_counseling_coordinators where user_id in ${sql(ownerIds)}
    union all select actor from private.affairs_counseling_operations where actor in ${sql(ownerIds)} limit 1`;
  if(extra.length)throw new Error('Unexpected coordinator or counseling operation state.');
  const counts=[];
  for(const [index,role] of roles.entries()){
    const contract=counselingAppointmentFixtureReadContract(plan,{role});
    const url=new URL(contract.path,origin);url.search=new URLSearchParams(contract.query).toString();
    const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+users[index].token},signal});
    const reply=await readResponse(response,url,32768);
    verifyCounselingAppointmentFixtureReadback(plan,{role},reply);
    if(reply.canCoordinate)throw new Error('A disposable counseling caller unexpectedly has coordinator access.');
    counts.push(reply.rows.length);
  }
  return {counts,rowsDigest:digest(rows)};
}

export function redactCounselingReply(envelope,privateMarkers){
  const body=JSON.stringify([envelope.body,envelope.events]).toLowerCase();
  return privateMarkers.some(marker=>body.includes(marker.toLowerCase()))||
    /"(?:(?:consent|contact)_(?:version|at|email)|consentversion|consentat|contactemail|userid|can_coordinate|cancoordinate|clinicalnotes|counselorname|signedurl)"\s*:|storage\/v1\/|object\/sign\/|[?&]token=|2027-01-(?:19|20)/u.test(body);
}

/** The caller's separately verified mine projection and persisted unchanged
 * state complement server activity. Activity does not prove downstream egress. */
export function gradeHostedCounseling(testCase,envelope,before,after){
  const {fixtureKey}=counselingAppointmentFixtureCaseBinding(testCase);
  const expectedCount=fixtureKey.startsWith('empty:')?0:fixtureKey.startsWith('capped:')?50:3;
  const stream=Array.isArray(envelope.events)?envelope.events:[];
  const events=stream.filter(step=>String(step?.kind).startsWith('account-read:'));
  const reads=events.filter(step=>step.status==='complete');
  const answer=typeof envelope.body?.answer==='string'?envelope.body.answer:'';
  const checks=envelope.body?.verification?.attempts;
  const verification=Number.isInteger(checks)&&checks>=1&&checks<=3&&stream.some(step=>step?.kind==='verification-'+checks&&step.status==='complete');
  const acceptableReads=reads.length>=1&&reads.length<=2&&reads.every((step,index)=>step.kind==='account-read:counselingAppointments:'+(index+1))
    &&events.every(step=>/^account-read:counselingAppointments:[12]$/u.test(step.kind)&&['running','complete'].includes(step.status));
  // Bind the shared no-write check to the independently observed SQL and
  // two-caller mine snapshots. A response-supplied attestation has no authority.
  const pairedReadback=isDeepStrictEqual(before,after)&&isDeepStrictEqual(before?.counts,[expectedCount,1])
    &&typeof before?.rowsDigest==='string'&&/^[a-f0-9]{64}$/u.test(before.rowsDigest);
  const expectedOutput=gradeCase(testCase,{...envelope,
    stateBefore:{ownedRecordsDigest:before?.rowsDigest},stateAfterProposal:{ownedRecordsDigest:after?.rowsDigest},
    fixtureReadback:{verified:pairedReadback,independentGolden:pairedReadback}});
  const failures=expectedOutput.failures.map(row=>row.id);
  if(!pairedReadback)failures.push('counseling.readback');
  if(!acceptableReads||!verification||envelope.body?.verification?.status!=='verified')
    failures.push('counseling.request_activity');
  if(stream.some(step=>/storage|file.download|report.authoriz|download.report/iu.test(String(step?.kind))))
    failures.push('counseling.file_activity');
  if(/\b(?:diagnosis|clinical notes|counselor (?:name|email))\s*:\s*[^.\n]|\b(?:I|we) (?:have )?(?:booked|cancelled|canceled|rescheduled|downloaded)\b/iu.test(answer))
    failures.push('counseling.extra_claim');
  return {caseId:testCase.id,passed:failures.length===0,failures,attempts:checks??null,completedReads:reads.length,
    callerCounts:before?.counts??null,recordDigest:before?.rowsDigest??null};
}

export async function requestCounselingHostedCase({testCase,origin,token,signal,fetchImpl,privateMarkers,correlationIds}){
  const endpoint=new URL('/api/affairs-assistant',origin);
  const body=JSON.stringify({question:testCase.question,history:testCase.history||[],route:testCase.route,stream:true,consentedResearchUse:false});
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'text/event-stream',
  },body,signal});
  const correlationId=response.headers.get('X-Assistant-Request-Id');
  if(response.status!==200||response.redirected||response.url&&response.url!==endpoint.href||!uuid.test(correlationId)
    ||!/^text\/event-stream(?:\s*;|$)/iu.test(response.headers.get('content-type')??'')||correlationIds.has(correlationId)){
    await response.body?.cancel();throw new Error('Counseling assistant request did not return a distinct, successful stream.');
  }
  const envelope={...await readReply(response),statusCode:response.status,fixtureKey:testCase.fixtureKey,execution:'live-model'};
  if(redactCounselingReply(envelope,privateMarkers))
    throw new Error('Counseling assistant output contained excluded private fields.');
  correlationIds.add(correlationId);
  return {envelope,correlationId,requestSha256:digest(body)};
}
