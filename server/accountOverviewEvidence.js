/** Read-only seven-source account overview. This is not a workspace initializer
 * or a general record loader. Counts deliberately do not retrieve private text. */
import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {loadOwnAffairsTimetable} from './ownAffairsTimetable.js';

export const accountOverviewLimits=Object.freeze({deadlineMs:12000,responseBytes:24576,readBytes:262144,dtmCourses:200});
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\p{Cc}\p{Cs}]/u.test(value);
const fail=(reason='invalid_records')=>{throw Object.assign(new AffairsWorkspaceError('The account overview source could not be verified.'),{safeReason:reason});};
const cancel=response=>{void response?.body?.cancel().catch(()=>{});};
const state=(readState,total=null,included=0,reason=null)=>({readState,total,included,complete:!['partial','unavailable'].includes(readState),reason});
const unavailable=reason=>state('unavailable',null,0,reason);
const reasonOf=error=>['invalid_records','access_denied','read_failed','deadline_exceeded'].includes(error?.safeReason)?error.safeReason:'read_failed';

async function bodyJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>accountOverviewLimits.readBytes){cancel(response);fail();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,result='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      if(signal.aborted)fail('deadline_exceeded');
      const next=await reader.read();if(signal.aborted)fail('deadline_exceeded');
      if(next.done)return JSON.parse(result+decoder.decode());
      bytes+=next.value.byteLength;if(bytes>accountOverviewLimits.readBytes)fail();
      result+=decoder.decode(next.value,{stream:true});
    }
  }catch(error){void reader.cancel().catch(()=>{});if(error?.safeReason)throw error;fail();}
  finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}

function countRange(response){
  const match=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(response.headers.get('content-range')||'');
  if(!match||!Number.isSafeInteger(Number(match[3])))fail();
  return {start:match[1]===undefined?null:Number(match[1]),end:match[2]===undefined?null:Number(match[2]),total:Number(match[3])};
}

async function read(captured,fetchImpl,table,query,head=false){
  const remaining=captured.deadline-Date.now();if(remaining<=0)fail('deadline_exceeded');
  const target=new URL('/rest/v1/'+table,origin);
  for(const [key,value]of Object.entries(query))target.searchParams.set(key,String(value));
  const controller=new AbortController();let timer,response;
  try{return await Promise.race([
    Promise.resolve().then(async()=>{
      if(controller.signal.aborted)fail('deadline_exceeded');
      response=await fetchImpl(target,{method:head?'HEAD':'GET',redirect:'error',headers:{apikey:captured.key,Authorization:'Bearer '+captured.token,Prefer:'count=exact'},signal:controller.signal});
      if(controller.signal.aborted||Date.now()>=captured.deadline){cancel(response);fail('deadline_exceeded');}
      if(!response.ok){cancel(response);fail([401,403].includes(response.status)?'access_denied':'read_failed');}
      if(![200,206].includes(response.status)){cancel(response);fail();}
      const range=countRange(response);
      if(head){
        // limit=0 selects no representation. A success must still prove an
        // exact cardinality, not a wildcard total or an arbitrary page count.
        if(range.start!==null||range.end!==null||response.body!==null){cancel(response);fail();}
        return {total:range.total};
      }
      const rows=await bodyJson(response,controller.signal);
      if(controller.signal.aborted||Date.now()>=captured.deadline)fail('deadline_exceeded');
      if(!Array.isArray(rows)||rows.length>query.limit||range.total<rows.length
        ||(rows.length?range.start!==0||range.end!==rows.length-1:range.start!==null||range.total!==0)
        ||rows.length!==Math.min(range.total,query.limit))fail();
      return {rows,total:range.total};
    }),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new AffairsWorkspaceError('The account overview read deadline expired.'),{safeReason:'deadline_exceeded'}));},remaining);}),
  ]);}catch(error){cancel(response);if(error?.safeReason)throw error;fail('read_failed');}finally{clearTimeout(timer);}
}

async function settle(fn){try{return {ok:true,value:await fn()};}catch(error){return {ok:false,reason:reasonOf(error)};}}
function profileRow(result,owner){
  if(result.total>1)fail();const row=result.rows[0];if(!row)return null;
  if(!exact(row,['user_id','display_name','preferred_name'])||row.user_id!==owner||!text(row.display_name,600)
    ||row.preferred_name!==null&&(!text(row.preferred_name,160)||!row.preferred_name.length||[...row.preferred_name].length>80))fail();
  return {displayName:row.preferred_name||row.display_name};
}
function studentRow(result,owner){
  if(result.total>1)fail();const row=result.rows[0];if(!row)return null;
  if(!exact(row,['id','user_id','year_level','source_mode','program_id','program'])||!uuid(row.id)||row.user_id!==owner
    ||!Number.isInteger(row.year_level)||row.year_level<1||row.year_level>8||!['sample','verified'].includes(row.source_mode)||!uuid(row.program_id)
    ||!exact(row.program,['id','name','source_mode'])||row.program.id!==row.program_id||!text(row.program.name,600)||!['sample','verified'].includes(row.program.source_mode))fail();
  return {id:row.id,yearLevel:row.year_level,sourceMode:row.source_mode,program:row.program.name,programSourceMode:row.program.source_mode};
}
function dtmRows(result,owner){
  let previous='';const courses=result.rows.map(row=>{
    if(!exact(row,['id','user_id','code','title','term','source_mode'])||!uuid(row.id)||row.id<=previous||row.user_id!==owner
      ||!text(row.code,80)||!text(row.title,600)||!text(row.term,200)||!['sample','personal'].includes(row.source_mode))fail();
    previous=row.id;return {id:row.id,code:row.code,title:row.title,term:row.term,sourceMode:row.source_mode};
  });
  return {courses,total:result.total};
}

function captureAccountRead(account,options,dependencies){
  if(!object(options)||Object.keys(options).some(key=>key!=='deadline')||!object(dependencies)||Object.keys(dependencies).some(key=>key!=='fetchImpl')
    ||dependencies.fetchImpl!==undefined&&typeof dependencies.fetchImpl!=='function')fail('invalid_records');
  if(!object(account)||!object(account.user)||!uuid(account.user.id)||account.url!==origin
    ||typeof account.token!=='string'||!account.token.trim()||typeof account.key!=='string'||!account.key.trim()||/\p{Cc}/u.test(account.token+account.key))
    throw new AffairsWorkspaceError('Verified School Affairs access is required.',403);
  if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))fail();
  const captured=Object.freeze({userId:account.user.id,token:account.token,key:account.key,deadline:Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+accountOverviewLimits.deadlineMs)});
  const fetchImpl=dependencies.fetchImpl??globalThis.fetch;if(typeof fetchImpl!=='function')fail();
  return {captured,fetchImpl};
}

async function readOwnProfile(captured,fetchImpl){
  return profileRow(await read(captured,fetchImpl,'affairs_profiles',{
    select:'user_id,display_name,preferred_name',user_id:'eq.'+captured.userId,limit:1,
  }),captured.userId);
}

/** Same owned profile projection as the overview, without its other sources. */
export async function loadOwnAffairsDisplayName(account,options={},dependencies={}){
  const {captured,fetchImpl}=captureAccountRead(account,options,dependencies);
  const profile=await readOwnProfile(captured,fetchImpl);
  if(!profile?.displayName.trim())return null;
  if(/[\u2028\u2029]/u.test(profile.displayName))fail();
  return profile.displayName;
}

/** Only the already verified caller can be selected. No initializer, POST, RPC,
 * role lookup, shared catalog scan, grade/material/note read, or private request
 * payload is allowed. Every source has explicit completeness and failure state.
 * Counts are separate from arrays: consumers MUST NOT infer them from .length. */
export async function loadAccountOverviewSnapshot(account,options={},dependencies={}){
  const {captured,fetchImpl}=captureAccountRead(account,options,dependencies);
  const scoped=Object.freeze({user:Object.freeze({id:captured.userId}),url:origin,token:captured.token,key:captured.key,requestDeadline:captured.deadline});
  const own=(fields,limit)=>({select:fields,user_id:'eq.'+captured.userId,limit});
  const count=(table,field,id)=>settle(async()=>{
    const value=await read(captured,fetchImpl,table,{select:'id',[field]:'eq.'+id,limit:0},true);
    return state(value.total?'ok':'empty',value.total,0);
  });
  const studentPromise=settle(async()=>studentRow(await read(captured,fetchImpl,'affairs_students',own('id,user_id,year_level,source_mode,program_id,program:affairs_programs!affairs_students_program_id_fkey(id,name,source_mode)',1)),captured.userId));
  const dependentCount=async table=>{
    const student=await studentPromise;
    if(!student.ok)return {ok:false,reason:'student_lookup_unavailable'};
    if(!student.value)return {ok:false,reason:'student_unlinked'};
    return count(table,'student_id',student.value.id);
  };
  const [profile,student,timetable,dtm,assignments,charges,tasks,requests]=await Promise.all([
    settle(()=>readOwnProfile(captured,fetchImpl)),
    studentPromise,
    settle(async()=>{
      const verifiedStudent=await studentPromise;
      if(!verifiedStudent.ok&&verifiedStudent.reason==='deadline_exceeded')fail('deadline_exceeded');
      return loadOwnAffairsTimetable(scoped,{deadline:captured.deadline,...(verifiedStudent.ok?{expectedStudentId:verifiedStudent.value?.id??null}:{})},{fetchImpl});
    }),
    settle(async()=>dtmRows(await read(captured,fetchImpl,'dtm_courses',{...own('id,user_id,code,title,term,source_mode',accountOverviewLimits.dtmCourses),order:'id.asc'}),captured.userId)),
    dependentCount('affairs_assignments'),dependentCount('affairs_charges'),count('affairs_tasks','user_id',captured.userId),count('affairs_service_requests','user_id',captured.userId),
  ]);
  const profileState=profile.ok&&student.ok?(profile.value||student.value?state('ok'):state('empty'))
    :profile.ok||student.ok?state('partial',null,0,'partial_read'):unavailable(profile.reason);
  const courseState=timetable.ok?(student.ok&&Boolean(student.value)!==timetable.value.studentRecordFound?unavailable('student_changed'):
    !timetable.value.studentRecordFound?unavailable('student_unlinked'):state(timetable.value.courses.length?'ok':'empty',timetable.value.courses.length,timetable.value.courses.length))
    :unavailable(timetable.reason);
  const result={checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,overviewScope:true,
    profile:{userId:captured.userId,...(profile.ok&&profile.value?profile.value:{})},
    student:student.ok&&student.value?{yearLevel:student.value.yearLevel,sourceMode:student.value.sourceMode,program:student.value.program,programSourceMode:student.value.programSourceMode}:null,
    profileRecordFound:profile.ok?Boolean(profile.value):null,studentRecordFound:student.ok?Boolean(student.value):null,
    courses:courseState.readState==='unavailable'?[]:timetable.value.courses,
    dtm:{courses:dtm.ok?dtm.value.courses:[]},
    overview:{profile:profileState,courses:courseState,dtm:dtm.ok?state(dtm.value.total>dtm.value.courses.length?'partial':dtm.value.total?'ok':'empty',dtm.value.total,dtm.value.courses.length,dtm.value.total>dtm.value.courses.length?'row_limit':null):unavailable(dtm.reason),
      ...Object.fromEntries(Object.entries({assignments,charges,tasks,requests}).map(([key,value])=>[key,value.ok?value.value:unavailable(value.reason)]))},
    meaning:'Only seven overview sources were checked. Tracker counts are not submitted files, official invoices, service approval, or university-wide history. DTM has no current-term designation. Separate reads are not an atomic database snapshot.',
  };
  while(Buffer.byteLength(JSON.stringify(result),'utf8')>accountOverviewLimits.responseBytes){
    const key=Buffer.byteLength(JSON.stringify(result.courses),'utf8')>=Buffer.byteLength(JSON.stringify(result.dtm.courses),'utf8')?'courses':'dtm';
    const rows=key==='courses'?result.courses:result.dtm.courses;if(!rows.length)fail();
    rows.pop();result.overview[key]={...result.overview[key],readState:'partial',included:rows.length,complete:false,reason:'response_budget'};
  }
  return result;
}
