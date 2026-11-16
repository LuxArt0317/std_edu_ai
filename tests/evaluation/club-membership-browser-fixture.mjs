import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {certificateAwardPreviewHash as digest} from './certificate-award-preview.mjs';
import {buildStudentProfileBrowserFixture,deleteStudentProfileBrowserFixture,
  observeStudentProfileBrowserFixture,seedStudentProfileBrowserFixture,verifyStudentProfileBrowserFixtureAbsent} from './student-profile-browser-fixture.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const roles=['A','B'];
const migrations=['20261115070000','20261115080000','20261115100000'];
const need=value=>check(value,'club membership fixture mismatch');

function clubId(value){
  const hash=digest(value);
  return [hash.slice(0,8),hash.slice(8,12),'4'+hash.slice(13,16),'8'+hash.slice(17,20),hash.slice(20,32)].join('-');
}
export function buildClubMembershipFixture(runId,owners,testCase){
  const scope=validateAidPaymentFixtureOwners({runId,owners});
  const mode=testCase.mode;
  need(['record','multipart','empty','foreign'].includes(mode));
  const prefix=runId.slice(0,12);
  const clubs=roles.map(role=>({id:clubId({runId,role,scope:'club-membership'}),name:'QA Membership '+prefix+' '+role,active:false}));
  const memberships=roles.flatMap((role,index)=>role==='B'&&mode==='empty'?[]:[{
    user_id:owners[role].id,club_id:clubs[index].id,role_label:'QA Role '+prefix+' '+role,academic_year:115,term:1,
  }]);
  const ids=clubs.map(row=>row.id);
  need(new Set([...ids,runId,...roles.map(role=>owners[role].id)]).size===5);
  return {...scope,mode,clubs,memberships,...(mode==='multipart'?{courseFixture:buildStudentProfileBrowserFixture(runId,owners)}:{})};
}

export async function assertClubMembershipFixtureSchema(sql){
  const [state]=await sql`select
    (select count(*)::int from supabase_migrations.schema_migrations where version in ${sql(migrations)}) as versions,
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.affairs_read_club_student(text,text,integer)'),'EXECUTE'),false) as executable,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.affairs_club_memberships')),false) as membership_rls`;
  need(state?.versions===migrations.length&&state.executable===true&&state.membership_rls===true);
}

function scope(plan){
  need(isDeepStrictEqual(plan,buildClubMembershipFixture(plan.runId,plan.owners,plan)));
  return {people:roles.map(role=>plan.owners[role].id),clubs:plan.clubs.map(row=>row.id)};
}
async function confirmOwners(sql,plan,people){
  const users=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users u where u.id in ${sql(people)}
      and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
    limit 3 for key share`;
  need(users.length===2&&roles.every(role=>users.some(row=>isDeepStrictEqual(row,plan.owners[role]))));
}
async function records(sql,{clubs,people}){
  const clubRows=await sql`select id,name,active from public.affairs_clubs where id in ${sql(clubs)} order by name,id limit 3`;
  const memberRows=await sql`select user_id,club_id,role_label,academic_year,term
    from public.affairs_club_memberships where club_id in ${sql(clubs)} or user_id in ${sql(people)} limit 3`;
  return {clubRows:[...clubRows],memberRows:[...memberRows].sort((a,b)=>a.role_label.localeCompare(b.role_label))};
}
const empty=rows=>rows.clubRows.length===0&&rows.memberRows.length===0;
function matches(plan,rows){
  return isDeepStrictEqual(rows.clubRows,plan.clubs)&&isDeepStrictEqual(rows.memberRows,plan.memberships);
}

export async function seedClubMembershipFixture(sql,plan){
  const ids=scope(plan);
  await confirmOwners(sql,plan,ids.people);
  need(empty(await records(sql,ids)));
  if(plan.courseFixture){
    await seedStudentProfileBrowserFixture(sql,plan.courseFixture);
  }
  await sql`insert into public.affairs_clubs ${sql(plan.clubs)}`;
  await sql`insert into public.affairs_club_memberships ${sql(plan.memberships)}`;
  need(matches(plan,await records(sql,ids)));
}

export async function observeClubMembershipFixture(sql,plan){
  const ids=scope(plan),rows=await records(sql,ids);
  need(matches(plan,rows));
  return digest({rows,student:plan.courseFixture?await observeStudentProfileBrowserFixture(sql,plan.courseFixture):null});
}

export async function deleteClubMembershipFixture(sql,plan){
  const ids=scope(plan);
  await confirmOwners(sql,plan,ids.people);
  const before=await records(sql,ids);
  if(empty(before)){
    if(plan.courseFixture)await deleteStudentProfileBrowserFixture(sql,plan.courseFixture);
    return;
  }
  need(matches(plan,before));
  for(const row of plan.memberships){
    const removed=await sql`delete from public.affairs_club_memberships where user_id=${row.user_id} and club_id=${row.club_id}
      and role_label=${row.role_label} returning club_id`;
    need(removed.length===1&&removed[0].club_id===row.club_id);
  }
  const removed=await sql`delete from public.affairs_clubs where id in ${sql(ids.clubs)} and active=false returning id`;
  need(removed.length===ids.clubs.length&&ids.clubs.every(id=>removed.some(row=>row.id===id)));
  if(plan.courseFixture)await deleteStudentProfileBrowserFixture(sql,plan.courseFixture);
  need(empty(await records(sql,ids)));
}

export async function verifyClubMembershipFixtureAbsent(sql,plan){
  const ids=scope(plan);
  const [state]=await sql`select exists(select 1 from auth.users where id in ${sql(ids.people)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids.people)})
    or exists(select 1 from auth.sessions where user_id in ${sql(ids.people)})
    or exists(select 1 from public.affairs_profiles where user_id in ${sql(ids.people)}) as remains`;
  return state?.remains===false&&empty(await records(sql,ids))
    &&(!plan.courseFixture||await verifyStudentProfileBrowserFixtureAbsent(sql,plan.courseFixture));
}

export function expectedClubMembershipWorkspace(plan,ownerId){
  need(scope(plan).people.includes(ownerId));
  const rows=plan.memberships.filter(row=>row.user_id===ownerId).map(({club_id,role_label,academic_year,term})=>{
    const club=plan.clubs.find(row=>row.id===club_id);
    return {...club,role_label,academic_year,term};
  });
  return {userId:ownerId,view:'my-memberships',page:1,eligible:false,hasMore:false,rows};
}

/** Independent SQL projection for comparison with authenticated course reads. */
export async function observeClubMembershipTimetable(sql,plan){
  need(plan.courseFixture);
  const {id,user_id}=plan.courseFixture.student;
  const rows=await sql`select e.id,e.student_id,c.code,c.title,t.label as term,t.starts_on::text as "termStartsOn",
    t.ends_on::text as "termEndsOn",e.source_mode as "sourceMode"
    from public.affairs_enrollments e join public.affairs_sections s on s.id=e.section_id
    join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
    join public.affairs_students st on st.id=e.student_id
    where st.user_id=${user_id} and e.student_id=${id} and e.status='enrolled' order by e.id limit 13`;
  need(rows.length>0&&rows.length<=12);
  return [...rows];
}
