import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {assertVenueCaseDefinition,venueFixture,venueRunnerCases} from './venue-native-runner.mjs';

export const venueProtectedFixtureMode='venue-protected-read-only';
const route='/school-affairs/services/44-1';
const source='account:venueRequests';
const stamp='2001-01-03T01:00:00+00:00';
const foreignRequest='ad100000-2026-4000-8000-000000000003';
const room={A:'QAVENUE-A',B:'QAVENUE-B'};
const date={A:'2001-01-08',B:'2001-01-09'};
const target={A:venueFixture.requestId,B:foreignRequest};
const fixtures=new Map(venueRunnerCases().map(row=>[row.id,row]));
const existing=id=>{
  const fixture=fixtures.get('account:venue-native-'+id);
  assertVenueCaseDefinition(fixture);
  return structuredClone(fixture);
};
const bound=(role,testCase,scope)=>({role,testCase,scope});
const fact=(label,value,kind='text')=>({label,kind,values:[value],exclusive:true});
const protectedPrefix='account:venue-protected-';
const baseExpected={noAction:true,forbidPublicResearch:true,localLinksOnly:true};
const readExpected={...baseExpected,behavior:'answer',requiredTools:['venueRequests'],
  allowedTools:['venueRequests'],requiredAttemptedTools:['venueRequests'],maxDistinctAttemptedTools:1,
  requireToolExecution:true,verification:'verified',requiredLinks:[route],
  requiredSourceBindings:[{sourceId:source,url:route}]};
const custom=(id,question,mode,expected)=>({id:protectedPrefix+id,domain:'venueRequests',routeFamily:'school-services',
  route,endpoint:'/api/affairs-assistant',mode,language:'en',fixtureKey:'live:venue-pending:'+id,question,history:[],expected});
const exactRequest=(role,expectedRows)=>({id:target[role],room:null,range:null,status:null,rows:expectedRows,countOnly:false});
const own=(role)=>bound(role,custom('pending-'+role.toLowerCase(),'Show the status of my venue request ID '+target[role]+'.','record',
  {...readExpected,facts:[fact('Room',room[role]),fact('Booking date',date[role],'date'),fact('Saved local status','Submitted')]}),exactRequest(role,1));

export function venueProtectedCases(){
  return structuredClone([
    own('A'),own('B'),
    bound('A',custom('pending-count','How many pending venue requests do I have for room code '+room.A+' on '+date.A+'?','record',
      {...readExpected,facts:[fact('Matching saved venue requests',1,'number')]}),
    {id:null,room:room.A,range:{from:date.A,through:date.A},status:'submitted',rows:1,countOnly:true}),
    bound('B',existing('empty'),exactRequest('A',0)),
    bound('A',existing('foreign'),null),
    bound('A',existing('unsupported-companion'),null),
    bound('guest',custom('guest','Show the status of my venue request ID '+target.A+'.','boundary',
      {...baseExpected,behavior:'denial',requiredText:['Sign in'],requiredLinks:['/school-affairs/login?next='+encodeURIComponent(route)]}),null),
  ]);
}

export function venueProtectedGaps(){
  const mounted=new Set(venueProtectedCases().map(row=>row.testCase.id));
  return [
    ...venueRunnerCases().filter(row=>!mounted.has(row.id)).map(row=>({caseId:row.id,
      reason:row.mode==='partial'?'controlled_reader_outage':'approved_slot_requires_isolated_database'})),
    ...['record','empty','action-boundary'].map(mode=>({caseId:'service:44-1:'+mode,reason:'legacy_generic_note_rebind'})),
  ];
}

export function buildVenueProtectedPlan(runId,owners){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  const rows=['A','B'].map(role=>({id:target[role],user_id:binding.owners[role].id,venue:room[role],booking_date:date[role],
    period:'2',purpose:'QA DISPOSABLE VENUE ONLY '+runId+' '+role,status:'submitted',
    review_note:'QA DISPOSABLE REVIEW FIELD '+runId+' '+role,version:1,created_at:stamp,updated_at:stamp}));
  if(rows.some(row=>[runId,...Object.values(binding.owners).map(owner=>owner.id)].includes(row.id)))
    throw new Error('Venue fixture record IDs overlap the caller binding.');
  return {...binding,rows};
}

function assertPlan(plan){
  if(!isDeepStrictEqual(plan,buildVenueProtectedPlan(plan.runId,plan.owners)))throw new Error('Venue fixture changed after ownership binding.');
}

const sort=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
function assertRows(actual,expected){
  if(!Array.isArray(actual)||!isDeepStrictEqual(sort(actual),sort(expected)))throw new Error('Venue rows do not match the exact owned fixtures.');
}

function owners(plan){return ['A','B'].map(role=>plan.owners[role]);}
async function assertIdentities(sql,plan){
  const rows=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",
    email_confirmed_at is not null and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where id in ${sql(owners(plan).map(row=>row.id))} limit 3`;
  if(rows.length!==2||owners(plan).some(owner=>!rows.some(({google,...row})=>google===true&&isDeepStrictEqual(row,owner))))
    throw new Error('Venue callers are outside the recorded disposable Google identity lease.');
}

async function readVenueState(sql,plan,locked=false){
  const userIds=owners(plan).map(row=>row.id),ids=plan.rows.map(row=>row.id),rooms=plan.rows.map(row=>row.venue);
  if(locked){
    for(const id of userIds.slice().sort())
      await sql`select pg_advisory_xact_lock(hashtextextended('venue-actor:'||${id},0))`;
    await sql`select id from public.affairs_venue_requests where id in ${sql(ids)} or user_id in ${sql(userIds)} order by id for update`;
  }
  const [state]=await sql`select
    coalesce((select jsonb_agg(to_jsonb(r)) from (select * from public.affairs_venue_requests
      where id in ${sql(ids)} or user_id in ${sql(userIds)} limit 3) r),'[]'::jsonb) as rows,
    exists(select 1 from public.affairs_venue_weeks where venue in ${sql(rooms)}) as published,
    exists(select 1 from private.affairs_venue_receipts where actor in ${sql(userIds)}
      or payload->>'id' in ${sql(ids)} or result->>'id' in ${sql(ids)}) as receipt,
    exists(select 1 from public.affairs_agent_audit where user_id in ${sql(userIds)}) as audit`;
  if(!state||state.published!==false||state.receipt!==false||state.audit!==false)
    throw new Error('Venue fixture unexpectedly intersects a published schedule, receipt or audit row.');
  return state.rows;
}

export async function seedVenueProtectedFixture(sql,plan){
  assertPlan(plan);
  await assertIdentities(sql,plan);
  assertRows(await readVenueState(sql,plan,true),[]);
  await sql`insert into public.affairs_venue_requests ${sql(plan.rows)}`;
  assertRows(await readVenueState(sql,plan),plan.rows);
}

export async function observeVenueProtectedFixture(sql,plan){
  assertPlan(plan);
  await assertIdentities(sql,plan);
  const rows=await readVenueState(sql,plan);
  assertRows(rows,plan.rows);
  return digest(sort(rows));
}

export async function deleteVenueProtectedFixture(sql,plan){
  assertPlan(plan);
  await assertIdentities(sql,plan);
  const rows=await readVenueState(sql,plan,true);
  if(!rows.length)return;
  assertRows(rows,plan.rows);
  for(const row of rows){
    const removed=await sql`delete from public.affairs_venue_requests where id=${row.id} and user_id=${row.user_id} and status='submitted' returning id`;
    if(removed.length!==1||removed[0].id!==row.id)throw new Error('Could not delete the exact pending venue record.');
  }
  assertRows(await readVenueState(sql,plan),[]);
}

export async function verifyVenueProtectedFixtureAbsent(sql,plan){
  assertPlan(plan);
  assertRows(await readVenueState(sql,plan),[]);
  const ids=owners(plan).map(row=>row.id);
  const [result]=await sql`select (exists(select 1 from auth.users where id in ${sql(ids)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids)})) as remains`;
  if(result?.remains!==false)throw new Error('A venue fixture identity remains after cleanup.');
  return true;
}

export function expectedVenueProtectedRead(plan,{role,scope}){
  assertPlan(plan);
  if(!scope)return null;
  const ownerId=plan.owners[role].id;
  const url=new URL('/rest/v1/affairs_venue_requests','https://xiftudmvxphxcjtmfmib.supabase.co');
  const fields=['id','user_id','venue','booking_date','period','status','created_at'];
  const range=scope.range;
  url.search=new URLSearchParams({select:fields.join(','),user_id:'eq.'+ownerId,
    ...(scope.id?{id:'eq.'+scope.id}:{}),...(scope.room?{venue:'eq.'+scope.room}:{}),
    ...(scope.status?{status:'eq.'+scope.status}:{}),order:'created_at.desc,id.asc',limit:'1',
    ...(range?{and:'(booking_date.gte.'+range.from+',booking_date.lte.'+range.through+')'}:{})});
  const records=plan.rows.filter(row=>row.user_id===ownerId&&(!scope.id||row.id===scope.id)&&(!scope.room||row.venue===scope.room)
    &&(!range||row.booking_date>=range.from&&row.booking_date<=range.through)&&(!scope.status||row.status===scope.status));
  if(records.length!==scope.rows)throw new Error('Venue persisted count disagrees with the independent scope.');
  const rows=records.map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));
  const selection={reason:null,id:scope.id,room:scope.room,range,period:null,status:scope.status,countOnly:scope.countOnly,latest:false,submittedAt:false};
  const evidence={sourceId:source,selection,total:scope.rows,rows:scope.countOnly?[]:records.map(item=>({
    venue:item.venue,date:item.booking_date,period:item.period,status:item.status,
  }))};
  return {readDigest:digest({method:'GET',url:url.href,ownerId,total:scope.rows,rows}),evidenceDigest:digest(evidence)};
}
