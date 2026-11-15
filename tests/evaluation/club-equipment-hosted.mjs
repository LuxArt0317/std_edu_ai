import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {clubEquipmentPath as route} from '../../server/clubEquipmentIntent.js';
import {readReply} from './run.mjs';

export const clubEquipmentFixtureMode='club-equipment-only';
export const clubEquipmentFamily='club-equipment';
export const clubEquipmentRequirement='club_equipment_disposable';
const sourceId='account:clubEquipment';
const roles=['A','B'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error=()=>new Error('Club equipment fixture identity, saved records, or protected response did not match.');
const keys=['id','user_id','club_id','student_number','student_name','club_name','phone','pickup_on','return_on',
  'purpose','other_purpose','items','collateral','status','version','updated_at'];
const fixed=[
  {role:'A',label:'QA Stereo Projector',status:'approved',pickup:'2026-11-24',returnDate:'2026-11-26',updated:'2026-11-15T06:30:02Z'},
  {role:'A',label:'QA USB Capture Kit',status:'declined',pickup:'2026-11-18',returnDate:'2026-11-20',updated:'2026-11-15T06:30:01Z'},
  {role:'B',label:'QA Wireless Mixer',status:'submitted',pickup:'2026-11-27',returnDate:'2026-11-30',updated:'2026-11-15T06:30:03Z'},
];
const privateText=['QA Private Student A','QA Private Student B','QA Private Purpose','QA Private Collateral','+886 777 1234','+886 777 5678','QA-STUDENT-A','QA-STUDENT-B'];
const cases=[
  {id:'a-status-dates',actor:'A',mode:'read',question:'What is the status of my latest club equipment request and when do I return the items?'},
  {id:'a-list',actor:'A',mode:'read',question:'列出我的社團器材借用紀錄。'},
  {id:'a-count',actor:'A',mode:'read',question:'How many approved club equipment requests have I saved?'},
  {id:'a-exact',actor:'A',mode:'read',question:'What equipment and return date are on my club equipment request {aOlder}?'},
  {id:'b-isolation',actor:'B',mode:'read',question:'Show my saved club equipment requests.'},
  {id:'a-b-request',actor:'A',mode:'read',question:'Show my club equipment request {bRequest}.'},
  {id:'foreign',actor:'A',mode:'foreign',question:'Show another student’s club equipment requests.'},
  {id:'guest-routing',actor:'guest',mode:'guest',question:'What is the status of my club equipment request?'},
  {id:'guest-denial',actor:'guest',mode:'unauthorized',question:'What is the status of my club equipment request?'},
];
export function clubEquipmentHostedCases(){
  return cases.map(item=>({...item,id:'account:club-equipment-'+item.id,route,domain:'clubEquipment',fixtureRequirement:clubEquipmentRequirement}));
}
export function validateClubEquipmentHostedCases(value){
  if(!isDeepStrictEqual(value,clubEquipmentHostedCases()))throw error();
}

function reserveId(runId,part){
  const hash=digest([clubEquipmentFixtureMode,runId,part]);
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
}
export function buildClubEquipmentHostedPlan({runId,owners}){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  const club={id:reserveId(runId,'club'),name:'QA Equipment Club '+runId.slice(0,8),active:false};
  const rows=fixed.map(({role,label,status,pickup,returnDate,updated},index)=>({
    id:reserveId(runId,'request-'+index),user_id:owners[role].id,club_id:club.id,student_number:'QA-STUDENT-'+role,
    student_name:'QA Private Student '+role,club_name:club.name,phone:role==='A'?'+886 777 1234':'+886 777 5678',
    pickup_on:pickup,return_on:returnDate,purpose:'other',other_purpose:'QA Private Purpose',
    items:[{id:reserveId(runId,'item-'+index),label}],collateral:'QA Private Collateral',status,version:2,updated_at:updated,
  }));
  const ids=[club.id,...rows.flatMap(row=>[row.id,row.items[0].id])];
  if(new Set([...ids,runId,...roles.map(role=>owners[role].id)]).size!==ids.length+3)throw error();
  return {...binding,club,rows,ids};
}
function assertPlan(plan){
  if(!isDeepStrictEqual(plan,buildClubEquipmentHostedPlan(plan)))throw error();
}
const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
function instant(value){
  const match=typeof value==='string'&&/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/u.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))return null;
  const fraction=(match[2]||'').replace(/0+$/u,'');
  return match[1]+(fraction?'.'+fraction:'')+'Z';
}
const normalizedRows=rows=>ordered(rows.map(row=>({...row,updated_at:instant(row.updated_at)})));
const empty={club:[],rows:[],dependents:[],operations:[]};
const ownIds=plan=>roles.map(role=>plan.owners[role].id);

async function readTargets(sql,plan){
  const ids=plan.rows.map(row=>row.id),owners=ownIds(plan);
  const club=await sql`select id,name,active from public.affairs_clubs where id=${plan.club.id} or name=${plan.club.name} limit 2`;
  const rows=await sql`select id,user_id,club_id,student_number,student_name,club_name,phone,
    pickup_on::text,return_on::text,purpose,other_purpose,items,collateral,status,version,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from public.affairs_club_equipment_requests where id in ${sql(ids)} or club_id=${plan.club.id} or user_id in ${sql(owners)} limit 4`;
  const dependents=await sql`select 'club-membership' as kind from public.affairs_club_memberships where club_id=${plan.club.id} or user_id in ${sql(owners)}
    union all select 'activity' from public.affairs_club_activities where club_id=${plan.club.id}
    union all select 'profile' from public.affairs_student_profiles where user_id in ${sql(owners)}
    union all select 'application' from public.affairs_club_applications where club_id=${plan.club.id} or applicant_id in ${sql(owners)}
    union all select 'foundation' from private.affairs_club_foundations where club_id=${plan.club.id} limit 1`;
  const operations=await sql`select actor,request_id,encode(digest,'hex') as digest,receipt
    from private.affairs_club_equipment_operations where actor in ${sql(owners)} limit 2`;
  return {club:[...club],rows:normalizedRows(rows),dependents:[...dependents],operations:[...operations]};
}
const expectedRows=plan=>({club:[plan.club],rows:normalizedRows(plan.rows),dependents:[],operations:[]});

function cancelledRows(actual,plan,operation){
  if(!operation||!isDeepStrictEqual(actual.operations,[operation]))return null;
  const changed=actual.rows.find(row=>row.id===operation.receipt.id);
  const original=plan.rows[2];
  if(!changed?.updated_at||!(Date.parse(changed.updated_at)>Date.parse(original.updated_at)))return null;
  const rows=plan.rows.map(row=>row.id===original.id?{...row,status:'cancelled',version:row.version+1,updated_at:changed.updated_at}:row);
  return isDeepStrictEqual(actual,{...expectedRows(plan),rows:normalizedRows(rows),operations:[operation]})?rows:null;
}

async function verifyIdentity(sql,plan){
  assertPlan(plan);
  const recorded=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users where id in ${sql(ownIds(plan))} limit 3 for key share`;
  if(recorded.length!==2||!roles.every(role=>recorded.some(row=>isDeepStrictEqual(row,plan.owners[role]))))throw error();
}

export function createClubEquipmentFixture({sql,plan,assertLease,persist,transaction}){
  assertPlan(plan);
  let journaled=false,active=false,operation;
  const envelope=state=>({state,clubId:plan.club.id,rows:plan.rows.map(({id,user_id})=>({id,user_id})),...(operation?{operation}:{})});
  async function cleanup(){
    if(!journaled)return;
    await assertLease({cleanup:true});
    await transaction(async()=>{
      await verifyIdentity(sql,plan);
      const actual=await readTargets(sql,plan);
      // A failed setup transaction can leave the journal in place with no rows.
      if(isDeepStrictEqual(actual,empty))return;
      if(!isDeepStrictEqual(actual,expectedRows(plan))){
        if(!cancelledRows(actual,plan,operation))throw error();
        const removed=await sql`delete from private.affairs_club_equipment_operations
          where actor=${operation.actor} and request_id=${operation.request_id} and encode(digest,'hex')=${operation.digest}
          returning actor,request_id`;
        if(!isDeepStrictEqual([...removed],[{actor:operation.actor,request_id:operation.request_id}]))throw error();
      }
      for(const row of plan.rows){
        const removed=await sql`delete from public.affairs_club_equipment_requests where id=${row.id} and user_id=${row.user_id}
          and club_id=${plan.club.id} returning id`;
        if(!isDeepStrictEqual([...removed],[{id:row.id}]))throw error();
      }
      const removed=await sql`delete from public.affairs_clubs where id=${plan.club.id} and name=${plan.club.name} and not active returning id`;
      if(!isDeepStrictEqual([...removed],[{id:plan.club.id}])||!isDeepStrictEqual(await readTargets(sql,plan),empty))throw error();
    });
    active=false;
    await persist(envelope('rows-removed'));
  }
  return {cleanup,async setup(){
    if(journaled)throw error();
    await assertLease({cleanup:false});
    await verifyIdentity(sql,plan);
    if(!isDeepStrictEqual(await readTargets(sql,plan),empty))throw error();
    await persist(envelope('setup-pending'));
    journaled=true;
    await transaction(async()=>{
      await verifyIdentity(sql,plan);
      if(!isDeepStrictEqual(await readTargets(sql,plan),empty))throw error();
      await sql`insert into public.affairs_clubs ${sql(plan.club,'id','name','active')}`;
      const rows=plan.rows.map(row=>({...row,items:sql.json(row.items)}));
      await sql`insert into public.affairs_club_equipment_requests ${sql(rows,...keys)}`;
      if(!isDeepStrictEqual(await readTargets(sql,plan),expectedRows(plan)))throw error();
    });
    active=true;
    await persist(envelope('ready'));
  },async markCancellation(payload){
    const target=plan.rows[2];
    if(!active||operation||!uuid.test(payload?.request_id)||plan.ids.includes(payload.request_id)||ownIds(plan).includes(payload.request_id)
      ||payload.request_id===plan.runId||!isDeepStrictEqual(payload,{request_id:payload.request_id,id:target.id,expected_version:target.version}))throw error();
    await assertLease({cleanup:false});
    await verifyIdentity(sql,plan);
    if(!isDeepStrictEqual(await readTargets(sql,plan),expectedRows(plan)))throw error();
    const hashes=await sql`select encode(extensions.digest('cancel:'||${sql.json(payload)}::jsonb::text,'sha256'),'hex') as digest`;
    if(hashes.length!==1||!/^[a-f0-9]{64}$/u.test(hashes[0].digest??''))throw error();
    operation={actor:target.user_id,request_id:payload.request_id,digest:hashes[0].digest,
      receipt:{id:target.id,status:'cancelled',version:target.version+1}};
    await persist(envelope('cancel-pending'));
  },async observeCancelled(){
    if(!active||!operation)throw error();
    await assertLease({cleanup:false});
    await verifyIdentity(sql,plan);
    const actual=await readTargets(sql,plan);
    const rows=cancelledRows(actual,plan,operation);
    if(!rows)throw error();
    return {rows,rowsDigest:digest(actual)};
  },async observe(){
    if(!active)throw error();
    await assertLease({cleanup:false});
    await verifyIdentity(sql,plan);
    const actual=await readTargets(sql,plan);
    if(!isDeepStrictEqual(actual,expectedRows(plan)))throw error();
    return digest(actual);
  },async verifyAbsent(){
    if(active||journaled&&!isDeepStrictEqual(await readTargets(sql,plan),empty))throw error();
  }};
}

export async function observeClubEquipmentCallers(plan,{users,origin,previewFetch,readResponse,signal,expectedRows=plan.rows}){
  assertPlan(plan);
  if(users.length!==2||users.some((user,index)=>user.id!==ownIds(plan)[index]||typeof user.token!=='string'||!user.token)
    ||users[0].token===users[1].token)throw error();
  const proofs=[];
  for(const [index,role] of roles.entries()){
    const user=users[index];
    const url=new URL('/api/affairs-data?scope=student-clubs&view=equipment',origin);
    const init={method:'GET',headers:{Authorization:'Bearer '+user.token},signal};
    const actual=await readResponse(await previewFetch(url,init),url,32768);
    const owned=expectedRows.filter(row=>row.user_id===user.id).map(({user_id,...row})=>row);
    if(Object.keys(actual??{}).sort().join(',')!=='clubs,equipment,manager,rows,student,today,userId,view'
      ||actual.userId!==user.id||actual.view!=='equipment'||actual.manager!==false||actual.student!==null
      ||!/^\d{4}-\d\d-\d\d$/u.test(actual.today)||!isDeepStrictEqual(actual.clubs,[])||!isDeepStrictEqual(actual.equipment,[])
      ||!Array.isArray(actual.rows)||!isDeepStrictEqual(actual.rows.map(row=>({...row,updated_at:instant(row.updated_at)})),owned))throw error();
    const review=new URL('/api/affairs-data?scope=student-clubs&view=review',origin);
    await readResponse(await previewFetch(review,init),review,4096,403);
    proofs.push({role,visibleRows:owned.length,eligibleToRequest:false,managerReviewDenied:true,projectionDigest:digest(owned)});
  }
  return proofs;
}

export async function requestClubEquipment({testCase,plan,origin,token,fetchImpl,signal,privateMarkers,correlationIds}){
  if(!clubEquipmentHostedCases().some(row=>isDeepStrictEqual(row,testCase)))throw error();
  const protectedRead=testCase.actor!=='guest',denied=testCase.mode==='unauthorized';
  const endpoint=new URL(testCase.mode==='guest'?'/api/research-assistant':'/api/affairs-assistant',origin);
  const question=testCase.question.replace('{aOlder}',plan.rows[1].id).replace('{bRequest}',plan.rows[2].id);
  const body={question,route,stream:!denied,consentedResearchUse:false};
  const headers={'Content-Type':'application/json',Accept:denied?'application/json':'text/event-stream',...(protectedRead?{Authorization:'Bearer '+token}:{})};
  const response=await fetchImpl(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal});
  const status=response.status,correlationId=response.headers.get('X-Assistant-Request-Id');
  const expectedType=denied?'application/json':'text/event-stream';
  if(status!==(denied?401:200)||response.redirected||response.url&&response.url!==endpoint.href
    ||response.headers.get('content-type')?.split(';')[0]!==expectedType
    ||protectedRead&&(!uuid.test(correlationId??'')||correlationIds.has(correlationId))) {
    await response.body?.cancel();throw error();
  }
  const envelope=await readReply(response);
  const emitted=JSON.stringify(envelope).toLowerCase();
  const excluded=[...plan.ids,...ownIds(plan),...roles.map(role=>plan.owners[role].email),...privateMarkers,...privateText];
  if(excluded.some(marker=>marker&&emitted.includes(marker.toLowerCase())))throw error();
  if(protectedRead)correlationIds.add(correlationId);
  return {envelope,status,correlationId:protectedRead?correlationId:null,requestDigest:digest(body)};
}

export function gradeClubEquipmentHosted(testCase,result,before,after){
  const {status,envelope:{body,events}}=result;
  const normalize=value=>JSON.stringify(value).toLowerCase();
  const accountRead=events.filter(step=>String(step?.kind).startsWith('account-read:'));
  const answer=body?.answer??'',visible=normalize([answer,body?.views]),citations=body?.citations??[];
  const text=(...literal)=>literal.every(item=>visible.includes(item.toLowerCase()));
  const allLabels=fixed.map(row=>row.label),none=labels=>labels.every(label=>!text(label));
  const read=testCase.mode==='read';
  const facts={
    'a-status-dates':()=>text('Saved status: Approved','Scheduled return date: 2026-11-26')&&none(allLabels),
    'a-list':()=>body?.views?.length===1&&Array.isArray(body.views[0].rows)
      &&isDeepStrictEqual(body.views[0].rows.map(row=>row.slice(1)),[
        ['已核准','2026-11-24','2026-11-26','QA Stereo Projector'],['未核准','2026-11-18','2026-11-20','QA USB Capture Kit'],
      ])&&none(['QA Wireless Mixer']),
    'a-count':()=>/requests: 1\./u.test(answer)&&none(allLabels)&&!body.views,
    'a-exact':()=>text('QA USB Capture Kit','2026-11-20')&&none(['QA Stereo Projector','QA Wireless Mixer']),
    'b-isolation':()=>text('QA Wireless Mixer','Awaiting review','2026-11-27','2026-11-30')&&none(['QA Stereo Projector','QA USB Capture Kit']),
    'a-b-request':()=>text('No saved club equipment requests matched')&&none(allLabels)&&!body.views,
    foreign:()=>body?.status==='handoff'&&text('your own account')&&citations.length===0,
    'guest-routing':()=>body?.status==='handoff'&&citations.length===1&&citations[0].url==='/school-affairs/login?next='+encodeURIComponent(route),
    'guest-denial':()=>status===401&&Boolean(body?.error)&&!('answer' in body),
  }[testCase.id.replace(/^account:club-equipment-/u,'')];
  const failures=[];
  if(!isDeepStrictEqual(before,after)||!/^[a-f0-9]{64}$/u.test(before.rowsDigest??'')
    ||!isDeepStrictEqual(before.callers.map(row=>[row.role,row.visibleRows,row.eligibleToRequest,row.managerReviewDenied]),[['A',2,false,true],['B',1,false,true]]))failures.push('equipment.readback');
  if(!facts?.()||!read&&!none(allLabels))failures.push('equipment.facts');
  if(body?.proposedAction||body?.grounding?.webSearched||events.some(step=>/approve|cancel|confirmed.action|upload|download|model/iu.test(String(step.kind))))
    failures.push('equipment.unexpected_action');
  if(read){
    if(status!==200||body?.status!=='answered'||body?.grounding?.source!=='account'
      ||!isDeepStrictEqual(body?.verification,{status:'verified',attempts:1})||citations.length!==1||citations[0].chunkId!==sourceId||citations[0].url!==route
      ||!isDeepStrictEqual(accountRead.map(({kind,status})=>[kind,status]),[['account-read:clubEquipment:1','complete']])
      ||!events.some(step=>step.kind==='verification-1'&&step.status==='complete'))failures.push('equipment.verification');
  }else if(accountRead.length||body?.verification||citations.some(citation=>citation.chunkId===sourceId))failures.push('equipment.boundary_read');
  return {caseId:testCase.id,passed:!failures.length,failures,callerCounts:before.callers.map(row=>row.visibleRows),recordsDigest:before.rowsDigest};
}
