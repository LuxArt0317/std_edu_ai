import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {clubAttendancePayloads} from './club-attendance-cases.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const projectPreview=/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u;
const fail=()=>{throw new Error('Club attendance fixture ownership, rows or readback could not be verified.');};
const keyOrders={clubs:['id'],applications:['id'],attendance:['application_id','student_id']};
const rowKey=(row,keys)=>keys.map(key=>row[key]).join(':');
const ordered=(rows,keys)=>[...rows].sort((first,second)=>rowKey(first,keys).localeCompare(rowKey(second,keys)));
const same=(left,right)=>isDeepStrictEqual(left,right);
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};

// Values expected by the model grader are explicit and separate from random
// SQL IDs. Use a private inactive club with no public calendar entry.
export function buildClubAttendancePlan({runId,owners,ids}){
  if(!uuid.test(runId??'')||!Array.isArray(owners)||owners.length!==2||owners.some(id=>!uuid.test(id))||owners[0]===owners[1])fail();
  const {clubName,excludedTitle,A,B}=clubAttendancePayloads();
  const count=2+A.length+B.length;
  const generated=ids??Array.from({length:count},()=>randomUUID());
  if(!Array.isArray(generated)||generated.length!==count||generated.some(id=>!uuid.test(id)||owners.includes(id)||id===runId)
    ||new Set(generated).size!==count)fail();
  const [clubId,...applicationIds]=generated;
  const clubs=[{id:clubId,name:clubName,active:false,location:'',advisor:'',lead_name:null,lead_email:null,
    lead_phone:null,lead_mobile:null,review_status:null,lending_status:null,academic_year:null,term:null}];
  const eventRows=[...A,...B,{...A[0],title:excludedTitle}];
  const applications=eventRows.map((row,index)=>({id:applicationIds[index],club_id:clubId,applicant_id:owners[0],title:row.title,
    organizer:'QA synthetic',starts_at:row.starts_at,ends_at:row.starts_at.replace(/T\d{2}/u,'T'+String(Number(row.starts_at.slice(11,13))+1).padStart(2,'0')),
    hours:'1.00',location:row.location,details:{assistant_evaluation_run:runId},status:index<eventRows.length-1?'completed':'submitted',
    academic_year:row.academic_year,term:row.term,calendar_activity_id:null,review_note:'QA Officer Review Sentinel',
    completion_note:'QA Officer Completion Sentinel',version:1,updated_at:'2026-11-29T00:00:00Z'}));
  // The second caller's visible row was applied for by caller A. A read must
  // follow attendance.student_id, not the club application creator.
  const attendance=eventRows.map((row,index)=>({application_id:applicationIds[index],student_id:owners[index===A.length?1:0],recorded_at:row.recorded_at}));
  return freeze({runId,owners:[...owners],ids:[...generated],clubName,clubs,applications,attendance});
}

function instant(value){
  if(typeof value!=='string')fail();
  const parts=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
  const parsed=Date.parse(value);
  if(!parts||!Number.isFinite(parsed))fail();
  const fraction=(parts[1]??'').replace(/0+$/u,'');
  return new Date(parsed).toISOString().slice(0,19)+(fraction?'.'+fraction:'')+'Z';
}
const dbRows=(rows,kind)=>ordered(rows, keyOrders[kind]).map(row=>{
  if(kind==='clubs')return row;
  if(kind==='attendance')return {...row,recorded_at:instant(row.recorded_at)};
  return {...row,starts_at:instant(row.starts_at),ends_at:instant(row.ends_at),updated_at:instant(row.updated_at)};
});
function verifyPlan(plan){
  if(!same(plan,buildClubAttendancePlan({runId:plan?.runId,owners:plan?.owners,ids:plan?.ids})))fail();
}

export async function readClubAttendanceTargets(sql,plan){
  const [clubId,...applicationIds]=plan.ids;
  // Include unexpected edges that refer to these fixture IDs and owners. They
  // must block cleanup rather than becoming cascade targets.
  const clubs=await sql`select id,name,active,location,advisor,lead_name,lead_email,lead_phone,lead_mobile,review_status,lending_status,academic_year,term
    from public.affairs_clubs where id=${clubId} or name=${plan.clubs[0].name} limit 2`;
  const applications=await sql`select id,club_id,applicant_id,title,organizer,to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as starts_at,
    to_char(ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ends_at,hours::text,location,details,status,
    academic_year,term,calendar_activity_id,review_note,completion_note,version,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at from public.affairs_club_applications
    where id in ${sql(applicationIds)} or club_id=${clubId} or applicant_id in ${sql(plan.owners)} limit 31`;
  const attendance=await sql`select application_id,student_id,to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as recorded_at
    from public.affairs_club_attendance where application_id in ${sql(applicationIds)} or student_id in ${sql(plan.owners)} limit 31`;
  const dependencies=await sql`select 'activity' as kind from public.affairs_club_activities where club_id=${clubId}
    union all select 'membership' from public.affairs_club_memberships where club_id=${clubId}
    union all select 'equipment' from public.affairs_club_equipment_requests where club_id=${clubId}
    union all select 'foundation' from private.affairs_club_foundations where club_id=${clubId}
    union all select 'officer-operation' from private.affairs_club_officer_operations where actor in ${sql(plan.owners)} limit 1`;
  return {clubs,applications,attendance,dependencies};
}
const allAbsent=actual=>Object.values(actual).every(rows=>rows.length===0);
function assertRows(plan,actual){
  if(actual.dependencies.length||Object.keys(keyOrders).some(kind=>!same(dbRows(plan[kind],kind),dbRows(actual[kind],kind))))fail();
}

async function verifiedIdentities(sql,plan,identities){
  verifyPlan(plan);
  const rows=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id from auth.users where id in ${sql(plan.owners)} limit 3`;
  if(rows.length!==2||rows.some(row=>{
    const request=identities.find(item=>item.id===row.id&&item.state==='created');
    return !request||request.runId!==plan.runId||row.run_id!==plan.runId||row.email!==request.email||!request.email.endsWith('@example.invalid');
  }))fail();
}

// Called inside the fixture coordinator's reserved SQL transaction. Setup
// never adopts pre-existing rows. Cleanup accepts only the exact committed
// state or no rows after an uncertain setup, then checks all dependencies.
export async function changeClubAttendanceFixture(sql,plan,identities,{cleanup=false}={}){
  await verifiedIdentities(sql,plan,identities);
  const [clubId,...ids]=plan.ids;
  if(cleanup){
    // Prevent concurrent FK checks from inserting an unexpected descendant
    // between the exact dependency read and deletion of a verified parent.
    await sql`select id from public.affairs_clubs where id=${clubId} and name=${plan.clubs[0].name} and not active for update`;
    await sql`select id from public.affairs_club_applications where club_id=${clubId} and id in ${sql(ids)} and applicant_id=${plan.owners[0]} for update`;
  }
  const observed=await readClubAttendanceTargets(sql,plan);
  if(cleanup){
    if(allAbsent(observed))return;
    assertRows(plan,observed);
    await sql`delete from public.affairs_club_attendance where application_id in ${sql(ids)} and student_id in ${sql(plan.owners)}`;
    await sql`delete from public.affairs_club_applications where club_id=${clubId} and id in ${sql(ids)} and applicant_id=${plan.owners[0]}`;
    await sql`delete from public.affairs_clubs where id=${clubId} and name=${plan.clubs[0].name} and not active`;
    if(!allAbsent(await readClubAttendanceTargets(sql,plan)))fail();
    return;
  }
  if(!allAbsent(observed))fail();
  await sql`insert into public.affairs_clubs ${sql(plan.clubs)}`;
  const applications=plan.applications.map(row=>({...row,details:sql.json(row.details)}));
  await sql`insert into public.affairs_club_applications ${sql(applications)}`;
  await sql`insert into public.affairs_club_attendance ${sql(plan.attendance)}`;
  assertRows(plan,await readClubAttendanceTargets(sql,plan));
}

export function expectedClubAttendancePage(plan,owner,page){
  if(!plan.owners.includes(owner)||!Number.isInteger(page)||page<1||page>1000)fail();
  const attendees=new Map(plan.attendance.filter(row=>row.student_id===owner).map(row=>[row.application_id,row.recorded_at]));
  // The fixture builders generated the two sub-millisecond starts in stable
  // descending order. Use the declared source order, not the app formatter.
  const selected=plan.applications.filter(row=>attendees.has(row.id)&&row.status==='completed');
  const start=(page-1)*25;
  return {userId:owner,view:'my-attendance',page,eligible:false,hasMore:page<1000&&selected.length>start+25,
    rows:selected.slice(start,start+25).map(({id,title,starts_at,location,academic_year,term})=>
      ({id,title,club_name:plan.clubs[0].name,starts_at:instant(starts_at),location,academic_year,term,recorded_at:instant(attendees.get(id))}))};
}

export async function observeClubAttendanceFixture({sql,plan,identities,users,origin,page,read,signal}){
  await verifiedIdentities(sql,plan,identities);
  if(!projectPreview.test(origin??'')||users.length!==2||!plan.owners.every(id=>users.some(user=>user.id===id)))fail();
  const persisted=await readClubAttendanceTargets(sql,plan);
  assertRows(plan,persisted);
  const observations=[];
  for(const owner of plan.owners){
    const user=users.find(candidate=>candidate.id===owner);
    await user.renewSession?.({signal});
    if(typeof user.token!=='string'||!user.token)fail();
    // Always check page one as a crossed-account sentinel, even for empty pages.
    for(const selectedPage of new Set([1,page])){
      const url=new URL('/api/affairs-data',origin);
      url.search=new URLSearchParams({scope:'club-student',view:'my-attendance',page:String(selectedPage)}).toString();
      const actual=await read(url,user.token,signal);
      if(!actual||!Array.isArray(actual.rows))fail();
      const normalized={...actual,rows:actual.rows.map(row=>({...row,starts_at:instant(row.starts_at),recorded_at:instant(row.recorded_at)}))};
      if(!same(normalized,expectedClubAttendancePage(plan,owner,selectedPage)))fail();
      observations.push(normalized);
    }
  }
  // JSONB member order is irrelevant. Preserve row order, literal fields and
  // nulls while making the digest stable across separately obtained responses.
  const stable=Object.fromEntries(Object.keys(keyOrders).map(kind=>[kind,dbRows(persisted[kind],kind)]));
  const digest=createHash('sha256').update(JSON.stringify({persisted:stable,observations},(_key,value)=>
    value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)).digest('hex');
  return digest;
}
