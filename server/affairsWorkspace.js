/** Private, account-scoped School Affairs data access. Never imports Nexus data. */
import {mapScholarshipRecords} from './scholarshipRecords.js';
import {mapStudentAidRecords} from './studentAidRecords.js';
import {mapHousingRecords} from './housingRecords.js';
import {mapCreditLoadHistory} from './creditLoadHistory.js';
import {mapCourseSelection} from './courseSelection.js';
import {serviceNoteKeys} from './serviceNoteIntent.js';
import {loadNativeAcademicRecords,loadNativeGradeView,loadNativeAttendanceView} from './nativeAcademicWorkspace.js';
import {graduationReviewMaxPayloadBytes,graduationReviewReadSource,isGraduationReviewKind,projectGraduationReviewDetail} from './graduationReview.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
export class AffairsWorkspaceError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
// A read outage can be reported alongside independent evidence. Invalid or
// unauthorized responses retain their own error path even when returned as 503.
export class AffairsWorkspaceReadUnavailableError extends AffairsWorkspaceError {}

export function schoolAffairsDatabaseConfiguration() {
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
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
  const {url,key}=schoolAffairsDatabaseConfiguration();
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
  const {rpc=false,body,query={},exactCount=false,readJson,errorMessages,observeRead}=options;
  const target=new URL(`${account.url}/rest/v1/${rpc?'rpc/':''}${table}`);
  for (const [name,value] of Object.entries(query)) if (value !== undefined) target.searchParams.set(name,String(value));
  const networkError='The School Affairs database did not respond. Please try again.';
  const remaining=account.requestDeadline===undefined?12000:account.requestDeadline-Date.now();
  if(remaining<=0)throw new AffairsWorkspaceError(networkError);
  let response;
  try {
    response=await fetch(target,{method:rpc?'POST':'GET',headers:{...headers(account.token,account.key,rpc),...(exactCount?{Prefer:'count=exact'}:{})},redirect:'error',...(rpc?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(Math.min(12000,remaining))});
  } catch {
    const ErrorType=rpc?AffairsWorkspaceError:AffairsWorkspaceReadUnavailableError;
    throw new ErrorType(networkError);
  }
  if (!response.ok) {
    if (errorMessages) {
      void response.body?.cancel().catch(()=>{});
      if (Object.hasOwn(errorMessages,response.status)) throw new AffairsWorkspaceError(errorMessages[response.status],response.status);
      throw new AffairsWorkspaceError('School Affairs records could not be loaded. Please try again.');
    }
    if (response.status===401 || response.status===403) throw new AffairsWorkspaceError('This School Affairs action is not allowed for your account.',403);
    if (response.status===400) throw new AffairsWorkspaceError('The School Affairs request was invalid. Check the fields and try again.',400);
    if (response.status===409) throw new AffairsWorkspaceError(['affairs_scholarship_action','affairs_manage_student_aid_record','affairs_housing_action','affairs_manage_credit_load_history','affairs_manage_course_selection','affairs_manage_academic_grades','affairs_manage_graduation_review','affairs_manage_academic_attendance'].includes(table)
      ? 'This record or its application period changed. Refresh and try again.'
      : 'A matching School Affairs record already exists.',409);
    if (!rpc&&(response.status>=500||response.status===408||response.status===429)) {
      void response.body?.cancel().catch(()=>{});
      throw new AffairsWorkspaceReadUnavailableError('School Affairs records could not be loaded. Please try again.');
    }
    throw new AffairsWorkspaceError('School Affairs records could not be loaded. Please try again.');
  }
  if (readJson) {
    try { return await readJson(response); }
    catch { throw new AffairsWorkspaceError('School Affairs returned an invalid record.'); }
  }
  const raw=await response.text().catch(()=>{throw new AffairsWorkspaceError('School Affairs returned an unreadable record.');});
  if (!raw && rpc) return null; // PostgREST void RPCs may return 204 without JSON.
  try {
    const value=JSON.parse(raw);
    if(!exactCount){
      observeRead?.({method:'GET',url:target.href,ownerId:account.user.id,rows:value});
      return value;
    }
    const range=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(response.headers.get('content-range')||'');
    if(!range||!Array.isArray(value)||query.offset!==undefined
      ||(value.length?Number(range[1])!==0||Number(range[2])!==value.length-1:range[1]!==undefined)
      ||Number(range[3])!==value.length)throw new Error('The count and selected rows differ.');
    return value;
  }
  catch { throw new AffairsWorkspaceError('School Affairs returned an invalid record.'); }
}

export function requestAffairsRpc(account,name,body,{readJson,errorMessages}={}) {
  return request(account,name,{rpc:true,body,readJson,errorMessages});
}

const own=(userId,limit=50)=>({select:'*',user_id:`eq.${userId}`,limit});
const byIds=(ids)=>ids.length?`in.(${ids.join(',')})`:'eq.00000000-0000-0000-0000-000000000000';
// PostgREST caps each response. A student's past terms can span many pages.
async function readAccountRows(account, table, query, observeRead) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(account, table, {query:{...query,limit:pageSize,offset},observeRead});
    if (!Array.isArray(page)) throw new AffairsWorkspaceError('School Affairs returned invalid records.');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
/** Read only the owned fields needed to review a learning-support withdrawal. */
export async function loadOwnLearningSupportWithdrawalContext(account,selection,deadline){
  const exact=selection.mode==='exact',unique=selection.mode==='unique';
  const validUuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
  const malformed=()=>new AffairsWorkspaceError('The learning-support withdrawal target could not be checked.');
  if(!validUuid.test(account.user.id)||!['exact','latest','unique'].includes(selection.mode)
    ||(exact?!validUuid.test(selection.id):selection.id!==''))throw malformed();
  const query={select:'id,user_id,status,version,submitted_at',user_id:'eq.'+account.user.id,limit:exact?1:2,
    ...(exact?{id:'eq.'+selection.id}:{order:'submitted_at.desc,id.asc'}),
    ...(unique?{status:'in.(submitted,in_review)'}:{})};
  const rows=await request({...account,requestDeadline:deadline},'affairs_learning_support_requests',{
    query,readJson:response=>readFeeRemissionJson(response,4096),
  });
  const versions={submitted:[1],in_review:[2],reviewed:[3],withdrawn:[2,3]};
  if(!Array.isArray(rows)||rows.length>query.limit)throw malformed();
  for(const row of rows){
    if(!row||Object.keys(row).sort().join()!=='id,status,submitted_at,user_id,version'||!validUuid.test(row.id)
      ||row.user_id!==account.user.id||exact&&row.id!==selection.id||!Object.hasOwn(versions,row.status)
      ||!versions[row.status].includes(row.version)||unique&&!['submitted','in_review'].includes(row.status)
      ||typeof row.submitted_at!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(row.submitted_at)
      ||!Number.isFinite(Date.parse(row.submitted_at)))throw malformed();
  }
  if(rows.length===2&&(rows[0].id===rows[1].id||Date.parse(rows[0].submitted_at)<Date.parse(rows[1].submitted_at)))
    throw malformed();
  const row=rows[0];
  return {ambiguous:rows.length===2&&(unique||Date.parse(row.submitted_at)===Date.parse(rows[1].submitted_at)),
    row:row?{id:row.id,status:row.status,version:row.version,submittedAt:row.submitted_at}:null};
}

const chargeOrder = 'occurrence_on.desc.nullslast,id.asc';
const chargeUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
function ownChargeAmount(value){
  if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/u.test(value)))return false;
  const amount=Number(value);
  return Number.isFinite(amount)&&amount>=0&&amount<=9999999999.99&&Number(amount.toFixed(2))===amount;
}
function validExactOwnCharge(row){
  const validText=value=>typeof value==='string'&&!/[\0\ud800-\udfff]/u.test(value);
  return ['sample','verified'].includes(row.source_mode)&&[row.amount_due,row.amount_paid].every(ownChargeAmount)
    &&Number(row.amount_paid)<=Number(row.amount_due)&&validText(row.label)
    &&row.currency.length<=32&&!/[\p{Cc}\ud800-\udfff]/u.test(row.currency)
    &&['due_on','occurrence_on','category','contact_unit','contact_extension','payment_unit'].every(key=>row[key]==null||validText(row[key]));
}
function mapAffairsCharge(row) {
  return {id:row.id,label:row.label,amountDue:Number(row.amount_due),amountPaid:Number(row.amount_paid),
    currency:row.currency,dueOn:row.due_on,sourceMode:row.source_mode,occurrenceOn:row.occurrence_on??null,
    category:row.category??null,contactUnit:row.contact_unit??null,contactExtension:row.contact_extension??null,
    paymentUnit:row.payment_unit??null};
}

/** Minimal state used to prepare a reviewed action, using the caller's RLS.
 * The reviewed RPC independently checks state and ownership again on confirmation. */
export async function loadOwnAffairsActionContext(account,selection,{deadline=Date.now()+8000,onRead=()=>{}}={}){
  const userId=account?.user?.id;
  if(typeof userId!=='string'||!chargeUuid.test(userId)||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||!Number.isFinite(deadline))
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  const scoped={user:{id:userId},url:account.url,token:account.token,key:account.key,requestDeadline:Math.min(deadline,Date.now()+8000)};
  const {kind,target}=selection;
  const accountFields=kind==='update_display_name'?'user_id,preferred_name,display_name'
    :kind==='publish_announcement'?'user_id,role':'user_id';
  const invalid=()=>new AffairsWorkspaceError('The saved action context could not be verified.');
  const readTools={affairs_profiles:'profile',affairs_tasks:'tasks',affairs_assignments:'assignments',dtm_courses:'dtm'};
  const lookup=async(table,select,filters)=> {
    const tool=readTools[table];
    if(tool)onRead(tool,'running');
    try{
      const rows=await request(scoped,table,{query:{select,...filters,limit:2}});
      if(!Array.isArray(rows)||rows.length>2)throw invalid();
      if(tool)onRead(tool,'complete');
      return rows;
    }catch(error){
      if(tool)onRead(tool,'unavailable');
      throw error;
    }
  };
  const profiles=await lookup('affairs_profiles',accountFields,{user_id:'eq.'+userId});
  if(profiles.length>1||profiles.some(row=>row?.user_id!==userId))throw invalid();
  const profile=profiles[0];
  if(!profile)return {profileFound:false};
  const context={profileFound:true,profile:{userId}};
  if(kind==='update_display_name'){
    const displayName=profile.preferred_name??profile.display_name;
    if(typeof displayName!=='string'||displayName.length>300)throw invalid();
    context.profile.displayName=displayName;
  }
  if(kind==='publish_announcement'){
    if(!['admin','student'].includes(profile.role))throw invalid();
    context.profile.role='student';
    if(profile.role==='admin'){
      const access=await request(scoped,'dtm_course_content_access',{rpc:true,body:{}});
      if(access?.userId!==userId||typeof access.canManage!=='boolean'||Object.keys(access).length!==2)throw invalid();
      if(access.canManage)context.profile.role='admin';
    }
  }
  if(kind==='complete_task'&&target){
    const tasks=await lookup('affairs_tasks','id,user_id,title,completed_at',{user_id:'eq.'+userId,title:'eq.'+target,completed_at:'is.null'});
    if(tasks.some(row=>row?.user_id!==userId||typeof row.id!=='string'||!chargeUuid.test(row.id)||row.title!==target||row.completed_at!==null)
      ||new Set(tasks.map(row=>row.id)).size!==tasks.length)throw invalid();
    context.tasks=tasks.map(row=>({id:row.id,title:row.title,completedAt:null}));
  }
  if(kind==='set_assignment_status'&&target){
    const students=await lookup('affairs_students','id,user_id',{user_id:'eq.'+userId});
    if(students.length>1||students.some(row=>row?.user_id!==userId||typeof row.id!=='string'||!chargeUuid.test(row.id)))throw invalid();
    context.assignments=[];
    const student=students[0];
    if(!student)return context;
    const matches=await lookup('affairs_assignments','id,student_id,dtm_course_id,title,status,source_mode',
      {student_id:'eq.'+student.id,title:'eq.'+target});
    if(matches.some(row=>row?.student_id!==student.id||typeof row.id!=='string'||!chargeUuid.test(row.id)||row.title!==target
      ||typeof row.dtm_course_id!=='string'&&row.dtm_course_id!==null||typeof row.dtm_course_id==='string'&&!chargeUuid.test(row.dtm_course_id)
      ||!['open','submitted','graded'].includes(row.status)||!['sample','personal'].includes(row.source_mode))
      ||new Set(matches.map(row=>row.id)).size!==matches.length)throw invalid();
    const found=matches[0];
    if(!found||matches.length>1)return context;
    if(found.source_mode==='personal'&&found.dtm_course_id){
      const courses=await lookup('dtm_courses','id,user_id,source_mode',{id:'eq.'+found.dtm_course_id,user_id:'eq.'+userId});
      if(courses.length!==1||courses[0]?.user_id!==userId||courses[0].id!==found.dtm_course_id
        ||!['personal','sample'].includes(courses[0].source_mode))throw invalid();
      if(courses[0].source_mode!=='personal')return context;
    }
    context.assignments.push({id:found.id,title:found.title,status:found.status,sourceMode:found.source_mode,dtmCourseId:found.dtm_course_id});
  }
  return context;
}

/** Read only the caller's charges. Exact paired answers require evidence that
 * satisfies the charge formatter before it can reach fallback composition. */
export async function loadOwnAffairsCharges(account,{deadline=Date.now()+12000,observeRead,requireExactProjection=false}={}) {
  const userId=account?.user?.id;
  if(typeof userId!=='string'||!chargeUuid.test(userId)||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  if(!Number.isFinite(deadline)||account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))
    throw new AffairsWorkspaceError('Invalid School Affairs read deadline.');
  const scoped={user:{id:userId},url:account.url,token:account.token,key:account.key,
    requestDeadline:Math.min(deadline,account.requestDeadline??Infinity,Date.now()+12000)};
  const students=await request(scoped,'affairs_students',{query:{select:'id,user_id',user_id:`eq.${userId}`,limit:1},observeRead});
  if(!Array.isArray(students)||students.length>1||students.some(row=>row?.user_id!==userId||typeof row.id!=='string'||!chargeUuid.test(row.id)))
    throw new AffairsWorkspaceError('The student record could not be verified.');
  const student=students[0];
  if(!student)return {checkedAt:new Date().toISOString(),profile:{userId},studentRecordFound:false,charges:[]};
  const fields='id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit';
  const rows=await readAccountRows(scoped,'affairs_charges',{select:fields,student_id:`eq.${student.id}`,order:chargeOrder},observeRead);
  const ids=new Set();
  for(const row of rows){
    if(row?.student_id!==student.id||typeof row.id!=='string'||!chargeUuid.test(row.id)||ids.has(row.id)
      ||typeof row.label!=='string'||!row.label.trim()||typeof row.currency!=='string'||!row.currency.trim()
      ||![row.amount_due,row.amount_paid].every(amount=>(typeof amount==='number'||typeof amount==='string'&&amount.trim())&&Number.isFinite(Number(amount)))
      ||requireExactProjection&&!validExactOwnCharge(row))
      throw new AffairsWorkspaceError('The fee records could not be verified.');
    ids.add(row.id);
  }
  return {checkedAt:new Date().toISOString(),profile:{userId},studentRecordFound:true,charges:rows.map(mapAffairsCharge)};
}

export async function loadOwnAcademicGrades(account,view,{deadline=Date.now()+12000}={}){
  const userId=account?.user?.id;
  if(!chargeUuid.test(userId??'')||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  if(!['transcript','warning','ranking','english','gpa','current','transfer','cycle'].includes(view)||!Number.isFinite(deadline))
    throw new AffairsWorkspaceError('Invalid academic grades inquiry.',400);
  const scoped={user:{id:userId},url:account.url,key:account.key,token:account.token,requestDeadline:Math.min(deadline,Date.now()+12000)};
  const academicGrades=await loadNativeGradeView(userId,view,(table,query)=>readAccountRows(scoped,table,query));
  return {checkedAt:new Date().toISOString(),profile:{userId},academicGrades,academicGradesOnly:true,academicGradesView:view};
}

export async function loadOwnAcademicAttendance(account,question,route,{deadline=Date.now()+12000}={}){
  const userId=account?.user?.id;
  if(!chargeUuid.test(userId??'')||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  if(!Number.isFinite(deadline)||account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))
    throw new AffairsWorkspaceError('Invalid academic attendance inquiry.',400);
  const scoped={user:{id:userId},url:account.url,key:account.key,token:account.token,
    requestDeadline:Math.min(deadline,account.requestDeadline??Infinity,Date.now()+12000)};
  const read=(table,query)=>request(scoped,table,{query:{...query,limit:100},exactCount:true});
  return await loadNativeAttendanceView(userId,question,route,read);
}

/** Projects only the requested fields from one caller-owned report kind. */
export async function loadOwnGraduationReviewAnswer(account,selection,{deadline=Date.now()+12000}={}){
  const {kind,view}=selection;
  const userId=account?.user?.id;
  if(!chargeUuid.test(userId??'')||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  const detail=view==='credits'||view==='matchedCourse';
  if(!isGraduationReviewKind(kind)||!Number.isFinite(deadline)||!(detail||view==='status'||view==='eligibility')
    ||detail&&(typeof selection.name!=='string'||!selection.name.trim()||selection.name.length>100))
    throw new AffairsWorkspaceError('Invalid graduation report inquiry.',400);
  const scoped={user:{id:userId},url:account.url,key:account.key,token:account.token,requestDeadline:Math.min(deadline,Date.now()+12000)};
  const field=detail?'categories':'review_status';
  const projection=detail?'categories:report->categories':'review_status:report->graduationReview->>text';
  const rows=await request(scoped,graduationReviewReadSource.table,{exactCount:true,query:{
    select:'user_id,report_kind,source_mode,'+projection,
    user_id:'eq.'+userId,report_kind:'eq.'+kind,limit:2,
  },readJson:async response=>{
    const limit=detail?graduationReviewMaxPayloadBytes+4096:4096;
    const value=await readFeeRemissionJson(response,limit);
    if(!Array.isArray(value)||value.length>1||response.headers.get('content-range')!==(value.length?'0-0/1':'*/0'))
      throw new Error('Unverified selected report count.');
    return value;
  }});
  const row=rows[0],expectedFields=[field,'report_kind','source_mode','user_id'].sort().join(',');
  const checkedAt=new Date().toISOString();
  if(!rows.length)return {reportKind:kind,view,found:false,checkedAt};
  if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!==expectedFields
    ||row.user_id!==userId||row.report_kind!==kind||row.source_mode!=='local_demo')
    throw new AffairsWorkspaceError('The selected graduation report could not be verified.');
  const value=row[field];
  if(detail)return {reportKind:kind,view,found:true,detail:projectGraduationReviewDetail(value,selection),checkedAt};
  if(value!==null&&(typeof value!=='string'||[...value].length>160||/[\u0000\ud800-\udfff]/u.test(value)))
    throw new AffairsWorkspaceError('The selected graduation review status could not be verified.');
  return {reportKind:kind,view,found:true,statusText:value,checkedAt};
}

/** Narrow read for explicitly selected private notes. A capped, inconsistent
 * or unauthorized result is unavailable rather than an empty note collection. */
export async function loadOwnServiceNotes(account,keys,{deadline=Date.now()+12000}={}) {
  const userId=account?.user?.id;
  if(typeof userId!=='string'||!chargeUuid.test(userId)||account.url!=='https://xiftudmvxphxcjtmfmib.supabase.co'
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim())
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  if(!Array.isArray(keys)||!keys.length||keys.length>serviceNoteKeys.length||new Set(keys).size!==keys.length||keys.some(key=>!serviceNoteKeys.includes(key))
    ||!Number.isFinite(deadline)||account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))
    throw new AffairsWorkspaceError('Invalid private note scope.');
  const scoped={user:{id:userId},url:account.url,token:account.token,key:account.key,
    requestDeadline:Math.min(deadline,account.requestDeadline??Infinity,Date.now()+12000)};
  const fields='id,user_id,service_key,record_type,title,notes,status,updated_at';
  const limit=201;
  const rows=await request(scoped,'affairs_service_records',{exactCount:true,query:{select:fields,user_id:'eq.'+userId,record_type:'eq.note',
    service_key:keys.length===1?'eq.'+keys[0]:'in.('+keys.join(',')+')',order:'updated_at.desc,id.asc',limit}});
  const seen=new Set();
  if(!Array.isArray(rows)||rows.length>=limit)throw new AffairsWorkspaceError('The selected notes exceed the verified read limit.');
  return rows.map(row=>{
    if(row?.user_id!==userId||!keys.includes(row.service_key)||row.record_type!=='note'
      ||typeof row.id!=='string'||!chargeUuid.test(row.id)||seen.has(row.id)
      ||typeof row.title!=='string'||![...row.title].length||[...row.title].length>160
      ||typeof row.notes!=='string'||[...row.notes].length>2000
      ||!['draft','filed','withdrawn'].includes(row.status)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))
      throw new AffairsWorkspaceError('The selected note records could not be verified.');
    seen.add(row.id);
    return {id:row.id,serviceKey:row.service_key,recordType:'note',title:row.title,notes:row.notes,status:row.status,updatedAt:row.updated_at,userId};
  });
}

export async function loadAffairsSnapshot(account, includeAdmin = false, options = {}) {
  account={...account,...(Number.isFinite(options.deadline)?{requestDeadline:options.deadline}:{})};
  if(options.initialize!==false) {
    await request(account,'affairs_initialize_account',{rpc:true});
    await request(account,'dtm_initialize_account',{rpc:true});
  }
  const userId=account.user.id;
  const [profiles,students,terms,programs,courses,sections,announcements,tasks,requests,adminProfiles,adminStudents,adminEnrollments,adminRequests,dtmCourses,dtmNotices,serviceRecords]=await Promise.all([
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
    includeAdmin?request(account,'affairs_students',{query:{select:'id,user_id,student_number,full_name',limit:100}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_enrollments',{query:{select:'id,student_id,section_id,status',limit:500}}):Promise.resolve([]),
    includeAdmin?request(account,'affairs_service_requests',{query:{select:'id,user_id,request_type,title,details,status,created_at',order:'created_at.desc',limit:100}}):Promise.resolve([]),
    readAccountRows(account,'dtm_courses',{...own(userId),order:'created_at.desc,id.asc'}),
    request(account,'dtm_notices',{query:{select:'*',order:'published_at.desc',limit:30}}),
    options.includeServiceRecords===false?Promise.resolve([]):readAccountRows(account,'affairs_service_records',{...own(userId),select:'*,affairs_service_requests(status)',order:'updated_at.desc,id.asc'}),
  ]);
  const profile=profiles[0];
  if (!profile || (includeAdmin && profile.role!=='admin')) throw new AffairsWorkspaceError('Administrator access is required.',403);
  const [scholarshipPeriods,scholarshipApplications,adminScholarshipApplications,studentAidRows,adminStudentAidRows,housingPeriods,housingApplications,housingAssignments,adminHousingApplications,adminHousingAssignments,creditLoadRows,adminCreditLoadRows,selectionRows,adminSelectionRows,nativeAcademic]=await Promise.all([
    readAccountRows(account,'affairs_scholarship_periods',{select:'*',...(includeAdmin?{}:{published:'eq.true'}),order:'opens_at.desc,id.asc'}),
    readAccountRows(account,'affairs_scholarship_applications',{...own(userId),order:'submitted_at.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_scholarship_applications',{select:'*',order:'submitted_at.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_student_aid_records',{...own(userId),order:'academic_year.desc,semester.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_student_aid_records',{select:'*',order:'academic_year.desc,semester.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_housing_periods',{select:'*',order:'opens_at.desc,id.asc'}),
    readAccountRows(account,'affairs_housing_applications',{...own(userId),order:'submitted_at.desc,id.asc'}),
    readAccountRows(account,'affairs_housing_assignments',{...own(userId),order:'period_id.asc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_housing_applications',{select:'*',order:'submitted_at.desc,id.asc'}):Promise.resolve([]),
    includeAdmin?readAccountRows(account,'affairs_housing_assignments',{select:'*',order:'period_id.asc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_credit_load_history',{...own(userId),order:'academic_year.desc,semester.desc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_credit_load_history',{select:'*',order:'academic_year.desc,semester.desc,id.asc'}):Promise.resolve([]),
    readAccountRows(account,'affairs_course_selection_records',{...own(userId),order:'academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc'}),
    includeAdmin?readAccountRows(account,'affairs_course_selection_records',{select:'*',order:'academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc'}):Promise.resolve([]),
    loadNativeAcademicRecords(userId,includeAdmin,(table,query)=>readAccountRows(account,table,query)),
  ]);
  // The generic manager lists its first 100 profiles. Scholarship history can contain
  // older applicants, so resolve every missing applicant rather than rendering anonymous rows.
  if (includeAdmin) {
    const known=new Set(adminProfiles.map(row=>row.user_id));
    const missing=[...new Set([...adminScholarshipApplications,...adminStudentAidRows,...adminHousingApplications,...adminHousingAssignments,...adminCreditLoadRows,...adminSelectionRows].map(row=>row.user_id).concat(nativeAcademic.adminUserIds).filter(id=>!known.has(id)))];
    for (let offset=0;offset<missing.length;offset+=100) {
      const applicants=await readAccountRows(account,'affairs_profiles',{
        select:'user_id,email,display_name,role,created_at',user_id:byIds(missing.slice(offset,offset+100)),order:'user_id.asc',
      });
      adminProfiles.push(...applicants);
    }
  }
  const student=students[0]||null;
  const enrollments=student?await request(account,'affairs_enrollments',{query:{select:'*',student_id:`eq.${student.id}`,limit:100}}):[];
  const enrollmentIds=enrollments.map(item=>item.id);
  const dtmRows = (table, order) => dtmCourses.length ? readAccountRows(account, table, {
    select:'*,dtm_courses!inner(user_id)', 'dtm_courses.user_id':`eq.${userId}`, order,
  }) : Promise.resolve([]);
  const [grades,attendance,charges,assignments,dtmMaterials,adminCharges,adminAssignments,adminDtmCourses,dtmMeetings,dtmGrades]=await Promise.all([
    request(account,'affairs_grade_items',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    request(account,'affairs_attendance',{query:{select:'*',enrollment_id:byIds(enrollmentIds),limit:200}}),
    student?readAccountRows(account,'affairs_charges',{select:'*',student_id:`eq.${student.id}`,order:chargeOrder}):Promise.resolve([]),
    student?readAccountRows(account,'affairs_assignments',{select:'*',student_id:`eq.${student.id}`,order:'due_at.asc.nullslast,id.asc'}):Promise.resolve([]),
    dtmRows('dtm_materials','position.asc,id.asc'),
    includeAdmin?readAccountRows(account,'affairs_charges',{select:'*',order:'occurrence_on.desc.nullslast,id.asc'}):Promise.resolve([]),
    includeAdmin?readAccountRows(account,'affairs_assignments',{select:'*',source_mode:'in.(sample,personal)',order:'student_id.asc,id.asc'}):Promise.resolve([]),
    includeAdmin?readAccountRows(account,'dtm_courses',{select:'id,user_id,code,title,term,source_mode',source_mode:'in.(sample,personal)',order:'user_id.asc,id.asc'}):Promise.resolve([]),
    dtmRows('dtm_meetings','meeting_on.desc,starts_at.desc,id.asc'),
    dtmRows('dtm_grade_items','graded_on.desc.nullslast,id.asc'),
  ]);
  if(includeAdmin){
    // The selector's initial account page may omit older owners. Resolve every
    // assignment's explicit student relation before exposing review choices.
    const knownStudents=new Set(adminStudents.map(row=>row.id));
    const missingStudents=[...new Set(adminAssignments.map(row=>row.student_id).filter(id=>id&&!knownStudents.has(id)))];
    for(let offset=0;offset<missingStudents.length;offset+=100)adminStudents.push(...await readAccountRows(account,'affairs_students',{
      select:'id,user_id,student_number,full_name',id:byIds(missingStudents.slice(offset,offset+100)),order:'id.asc',
    }));
    const studentsById=new Map(adminStudents.map(row=>[row.id,row])),coursesById=new Map(adminDtmCourses.map(row=>[row.id,row]));
    if(adminAssignments.some(row=>typeof studentsById.get(row.student_id)?.user_id!=='string'||!studentsById.get(row.student_id)?.user_id||row.dtm_course_id&&
      coursesById.get(row.dtm_course_id)?.user_id!==studentsById.get(row.student_id)?.user_id))
      throw new AffairsWorkspaceError('Assignment account relations changed. Refresh the administrator records.');
  }
  const courseById=new Map(courses.map(row=>[row.id,row]));
  const termById=new Map(terms.map(row=>[row.id,row]));
  const sectionById=new Map(sections.map(row=>[row.id,row]));
  return {
    checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,
    completeness:{...nativeAcademic.completeness,...Object.fromEntries([
      ['terms',terms,30],['programs',programs,100],['catalog',courses,200],['sections',sections,300],
      ['enrollments',enrollments,100],['grades',grades,200],['attendance',attendance,200],
      ['announcements',announcements,30],['dtmNotices',dtmNotices,30],['tasks',tasks,50],['requests',requests,50],
    ].map(([key,rows,cap])=>[key,{returned:rows.length,complete:rows.length<cap,cap}]))},
    ...nativeAcademic.own,
    scholarship:mapScholarshipRecords(scholarshipPeriods.filter(row=>row.published),scholarshipApplications),
    studentAid:mapStudentAidRecords(studentAidRows),
    creditLoadHistory:mapCreditLoadHistory(creditLoadRows),
    courseSelection:mapCourseSelection(selectionRows),
    housing:mapHousingRecords(housingPeriods.filter(row=>row.published || housingApplications.some(item=>item.period_id===row.id) || housingAssignments.some(item=>item.period_id===row.id)),housingApplications,housingAssignments),
    profile:{userId:profile.user_id,email:profile.email,displayName:profile.preferred_name || profile.display_name,role:profile.role},
    student:student?{id:student.id,studentNumber:student.student_number,fullName:student.full_name,yearLevel:student.year_level,status:student.status,sourceMode:student.source_mode,program:programs.find(row=>row.id===student.program_id)?.name||null}:null,
    courses:enrollments.map(enrollment=>{
      const section=sectionById.get(enrollment.section_id);const course=courseById.get(section?.course_id);const term=termById.get(section?.term_id);
      return {enrollmentId:enrollment.id,status:enrollment.status,sourceMode:enrollment.source_mode,
        code:course?.code||'',title:course?.title||'',credits:course?.credits||0,
        term:term?.label||'',termStartsOn:term?.starts_on||'',termEndsOn:term?.ends_on||'',instructor:section?.instructor||'',weekday:section?.weekday||null,
        startsAt:section?.starts_at||'',endsAt:section?.ends_at||'',room:section?.room||'',
        grades:grades.filter(row=>row.enrollment_id===enrollment.id && row.released_at).map(row=>({label:row.label,score:row.score,maximum:row.maximum,sourceMode:row.source_mode})),
        attendance:attendance.filter(row=>row.enrollment_id===enrollment.id).map(row=>({date:row.meeting_on,status:row.status,sourceMode:row.source_mode}))};
    }),
    charges:charges.map(mapAffairsCharge),
    assignments:assignments.map(row=>({id:row.id,title:row.title,details:row.details,dueAt:row.due_at,status:row.status,submittedAt:row.submitted_at,sourceMode:row.source_mode,
      enrollmentId:row.enrollment_id,dtmCourseId:row.dtm_course_id,meetingId:row.meeting_id ?? null,
      origin:row.import_key?'moodle_calendar':row.source_mode==='personal'?'manual':'sample',
      course:row.enrollment_id
        ? courseById.get(sectionById.get(enrollments.find(item=>item.id===row.enrollment_id)?.section_id)?.course_id)?.code||'School Affairs'
        : dtmCourses.find(item=>item.id===row.dtm_course_id)?.code||'DTM',
    })),
    announcements:announcements.map(row=>({id:row.id,title:row.title,body:row.body,publishedAt:row.published_at,sourceMode:row.source_mode})),
    tasks:tasks.map(row=>({id:row.id,title:row.title,dueAt:row.due_at,completedAt:row.completed_at,sourceMode:row.source_mode})),
    requests:requests.map(row=>({id:row.id,type:row.request_type,title:row.title,details:row.details,status:row.status,createdAt:row.created_at})),
    serviceRecords:serviceRecords.map(row=>({
      id:row.id, serviceKey:row.service_key, recordType:row.record_type, title:row.title, notes:row.notes,
      status:row.status, startsOn:row.starts_on, endsOn:row.ends_on, leaveCategory:row.leave_category,
      periods:row.periods, updatedAt:row.updated_at, reviewStatus:row.affairs_service_requests?.status ?? null,
      contactPhone:row.contact_phone ?? null, leaveTimePeriod:row.leave_time_period ?? null,
    })),
    dtm:{
      sourceMode:dtmCourses.some(row=>row.source_mode==='personal')?'personal':'sample',
      courses:dtmCourses.map(row=>({
        id:row.id,code:row.code,title:row.title,term:row.term,role:row.role,sourceMode:row.source_mode,
        materials:dtmMaterials.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,title:item.title,kind:item.kind,summary:item.summary,position:item.position,
          sourceMode:item.source_mode,sourceUrl:item.source_url ?? null,targetUrl:item.target_url ?? null,
        })),
        meetings:dtmMeetings.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,date:item.meeting_on,startsAt:item.starts_at,title:item.title,attendance:item.attendance,notes:item.notes,
        })),
        grades:dtmGrades.filter(item=>item.course_id===row.id).map(item=>({
          id:item.id,label:item.label,score:Number(item.score),maximum:Number(item.maximum),date:item.graded_on,feedback:item.feedback,
        })),
      })),
      notices:dtmNotices.map(row=>({id:row.id,title:row.title,body:row.body,publishedAt:row.published_at,sourceMode:row.source_mode})),
    },
    ...(includeAdmin?{admin:{...nativeAcademic.admin,courseSelection:mapCourseSelection(adminSelectionRows),creditLoadHistory:mapCreditLoadHistory(adminCreditLoadRows),scholarship:mapScholarshipRecords(scholarshipPeriods,adminScholarshipApplications),studentAid:mapStudentAidRecords(adminStudentAidRows),housing:mapHousingRecords(housingPeriods,adminHousingApplications,adminHousingAssignments),profiles:adminProfiles,students:adminStudents,sections:sections.map(row=>({id:row.id,code:courseById.get(row.course_id)?.code||'',term:termById.get(row.term_id)?.label||''})),enrollments:adminEnrollments.map(row=>({id:row.id,studentId:row.student_id,status:row.status,code:courseById.get(sectionById.get(row.section_id)?.course_id)?.code||''})),dtmCourses:adminDtmCourses,charges:adminCharges,assignments:adminAssignments,requests:adminRequests}}:{}),
  };
}

export async function executeAffairsAction(account,kind,payload,requestId) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload))
    throw new AffairsWorkspaceError('Unsupported School Affairs action.',400);
  const body={p_kind:kind,p_payload:payload};
  if (requestId !== undefined) {
    if (typeof requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      throw new AffairsWorkspaceError('Invalid action request identifier.',400);
    return request(account,'affairs_reviewed_action',{rpc:true,body:{...body,p_request_id:requestId}});
  }
  if (kind==='submit_housing_application') return request(account,'affairs_housing_action',{rpc:true,body});
  if (['apply_scholarship','cancel_scholarship'].includes(kind))
    return request(account,'affairs_scholarship_action',{rpc:true,body});
  if (['save_service_record','delete_service_record','submit_service_record_for_review'].includes(kind))
    return request(account,'affairs_manage_service_record',{rpc:true,body});
  if (/^(?:save|delete)_dtm_(?:course|meeting|assignment|grade|material)$/.test(kind) || kind==='import_dtm_deadlines')
    return request(account,'dtm_manage_record',{rpc:true,body});
  if (['create_task','complete_task','create_service_request','publish_announcement','resolve_service_request'].includes(kind))
    return request(account,'affairs_execute_action',{rpc:true,body});
  throw new AffairsWorkspaceError('Unsupported School Affairs action.',400);
}

export async function manageAffairsRecord(account,kind,payload) {
  if (['save_academic_grade_record','save_academic_term_summary','save_academic_ranking','save_academic_metadata'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_academic_grades',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_graduation_review' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_graduation_review',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_academic_attendance_statistic','save_academic_attendance_detail','save_academic_attendance_metadata'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_academic_attendance',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_course_selection' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_course_selection',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_credit_load_history' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_credit_load_history',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_housing_period','save_housing_assignment'].includes(kind) && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_housing_action',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (kind==='save_student_aid_record' && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_manage_student_aid_record',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (['save_scholarship_period','review_scholarship_application'].includes(kind)
    && payload && typeof payload==='object' && !Array.isArray(payload))
    return request(account,'affairs_scholarship_action',{rpc:true,body:{p_kind:kind,p_payload:payload}});
  if (!['save_enrollment','save_charge','delete_charge','save_assignment','delete_assignment'].includes(kind)
    || !payload || typeof payload!=='object' || Array.isArray(payload))
    throw new AffairsWorkspaceError('Unsupported manager action.',400);
  return request(account,'affairs_manage_record',{rpc:true,body:{p_kind:kind,p_payload:payload}});
}
