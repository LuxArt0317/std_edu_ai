/** Private, account-scoped School Affairs data access. Never imports Nexus data. */
export class AffairsWorkspaceError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

function configuration() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(url))
    throw new AffairsWorkspaceError('The client School Affairs database is unavailable.');
  return {url:url.replace(/\/$/,''),key};
}

function headers(token, key, body = false) {
  return {apikey:key,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})};
}

export async function verifyAffairsToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 4096)
    throw new AffairsWorkspaceError('Sign in to School Affairs again.',401);
  const {url,key}=configuration();
  let response;
  try { response=await fetch(`${url}/auth/v1/user`,{headers:headers(token,key),signal:AbortSignal.timeout(8000)}); }
  catch { throw new AffairsWorkspaceError('School Affairs sign-in could not be checked.'); }
  if (!response.ok) throw new AffairsWorkspaceError('Your School Affairs session expired. Please sign in again.',401);
  const user=await response.json().catch(()=>null);
  if (!user?.id || !Array.isArray(user.identities) || !user.identities.some(item=>item.provider==='google'))
    throw new AffairsWorkspaceError('Sign in to School Affairs with Google.',401);
  return {user,token,url,key};
}

async function request(account, table, options = {}) {
  const {rpc=false,body,query={}}=options;
  const target=new URL(`${account.url}/rest/v1/${rpc?'rpc/':''}${table}`);
  for (const [name,value] of Object.entries(query)) if (value !== undefined) target.searchParams.set(name,String(value));
  let response;
  try {
    response=await fetch(target,{method:rpc?'POST':'GET',headers:headers(account.token,account.key,rpc),...(rpc?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(12000)});
  } catch { throw new AffairsWorkspaceError('The School Affairs database did not respond. Please try again.'); }
  if (!response.ok) {
    if (response.status===401 || response.status===403) throw new AffairsWorkspaceError('This School Affairs action is not allowed for your account.',403);
    if (response.status===400) throw new AffairsWorkspaceError('The School Affairs request was invalid. Check the fields and try again.',400);
    throw new AffairsWorkspaceError('School Affairs records could not be loaded. Please try again.');
  }
  return response.json().catch(()=>{throw new AffairsWorkspaceError('School Affairs returned an invalid record.');});
}

const own=(userId,limit=50)=>({select:'*',user_id:`eq.${userId}`,limit});
const byIds=(ids)=>ids.length?`in.(${ids.join(',')})`:'eq.00000000-0000-0000-0000-000000000000';
export async function loadAffairsSnapshot(account, includeAdmin = false) {
  await request(account,'affairs_initialize_account',{rpc:true});
  const userId=account.user.id;
  const [profiles,students,terms,programs,courses,sections,announcements,tasks,requests,adminProfiles,adminRequests]=await Promise.all([
    request(account,'affairs_profiles',{query:own(userId,1)}),
    request(account,'affairs_students',{query:own(userId,1)}),
    request(account,'affairs_terms',{query:{select:'*',limit:30}}),
    request(account,'affairs_programs',{query:{select:'*',limit:100}}),
    request(account,'affairs_courses',{query:{select:'*',limit:200}}),
    request(account,'affairs_sections',{query:{select:'*',limit:300}}),
    request(account,'affairs_announcements',{query:{select:'*',order:'published_at.desc',limit:30}}),
    request(account,'affairs_tasks',{query:{...own(userId),order:'created_at.desc'}}),
    request(account,'affairs_service_requests',{query:{...own(userId),order:'created_at.desc'}}),
    includeAdmin?request(account,'affairs_profiles',{query:{select:'user_id,email,display_name,role,created_at',order:'created_at.desc',limit:100}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_service_requests',{query:{select:'id,user_id,request_type,title,status,created_at',order:'created_at.desc',limit:100}}):Promise.resolve([]),
  ]);
  const profile=profiles[0];
  if (!profile || (includeAdmin && profile.role!=='admin')) throw new AffairsWorkspaceError('Administrator access is required.',403);
  const student=students[0]||null;
  const enrollments=student?await request(account,'affairs_enrollments',{query:{select:'*',student_id:`eq.${student.id}`,limit:100}}):[];
  const enrollmentIds=enrollments.map(item=>item.id);
  const [grades,attendance,charges]=await Promise.all([
    request(account,'affairs_grade_items',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    request(account,'affairs_attendance',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    student?request(account,'affairs_charges',{query:{select:'*',student_id:`eq.${student.id}`,limit:100}}):Promise.resolve([]),
  ]);
  const courseById=new Map(courses.map(row=>[row.id,row]));
  const termById=new Map(terms.map(row=>[row.id,row]));
  const sectionById=new Map(sections.map(row=>[row.id,row]));
  return {
    checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,
    profile:{userId:profile.user_id,email:profile.email,displayName:profile.display_name,role:profile.role},
    student:student?{id:student.id,studentNumber:student.student_number,fullName:student.full_name,yearLevel:student.year_level,status:student.status,sourceMode:student.source_mode,program:programs.find(row=>row.id===student.program_id)?.name||null}:null,
    courses:enrollments.map(enrollment=>{
      const section=sectionById.get(enrollment.section_id);const course=courseById.get(section?.course_id);const term=termById.get(section?.term_id);
      return {enrollmentId:enrollment.id,status:enrollment.status,sourceMode:enrollment.source_mode,
        code:course?.code||'',title:course?.title||'',credits:course?.credits||0,
        term:term?.label||'',instructor:section?.instructor||'',weekday:section?.weekday||null,
        startsAt:section?.starts_at||'',endsAt:section?.ends_at||'',room:section?.room||'',
        grades:grades.filter(row=>row.enrollment_id===enrollment.id && row.released_at).map(row=>({label:row.label,score:row.score,maximum:row.maximum,sourceMode:row.source_mode})),
        attendance:attendance.filter(row=>row.enrollment_id===enrollment.id).map(row=>({date:row.meeting_on,status:row.status,sourceMode:row.source_mode}))};
    }),
    charges:charges.map(row=>({label:row.label,amountDue:row.amount_due,amountPaid:row.amount_paid,currency:row.currency,dueOn:row.due_on,sourceMode:row.source_mode})),
    announcements:announcements.map(row=>({id:row.id,title:row.title,body:row.body,publishedAt:row.published_at,sourceMode:row.source_mode})),
    tasks:tasks.map(row=>({id:row.id,title:row.title,dueAt:row.due_at,completedAt:row.completed_at,sourceMode:row.source_mode})),
    requests:requests.map(row=>({id:row.id,type:row.request_type,title:row.title,details:row.details,status:row.status,createdAt:row.created_at})),
    ...(includeAdmin?{admin:{profiles:adminProfiles,requests:adminRequests}}:{}),
  };
}

export async function executeAffairsAction(account,kind,payload) {
  if (!['create_task','complete_task','create_service_request','publish_announcement','resolve_service_request'].includes(kind)
    || !payload || typeof payload!=='object' || Array.isArray(payload))
    throw new AffairsWorkspaceError('Unsupported School Affairs action.',400);
  return request(account,'affairs_execute_action',{rpc:true,body:{p_kind:kind,p_payload:payload}});
}
