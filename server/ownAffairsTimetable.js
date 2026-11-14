/** Caller-only enrollment timetable. No initializers, grades, DTM, profile
 * fields or broad course/term catalog reads belong in this path. */
import {AffairsWorkspaceError} from './affairsWorkspace.js';

export const ownAffairsTimetableLimits=Object.freeze({rows:200,pageRows:100,responseBytes:131072,deadlineMs:12000});
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const enrollmentSelect='id,student_id,section_id,status,source_mode,student:affairs_students!affairs_enrollments_student_id_fkey(id,user_id),section:affairs_sections!affairs_enrollments_section_id_fkey(id,course_id,term_id,weekday,starts_at,ends_at,room,course:affairs_courses!affairs_sections_course_id_fkey(id,code,title),term:affairs_terms!affairs_sections_term_id_fkey(id,label,starts_on,ends_on))';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,fields)=>object(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const text=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0)&&!/[\p{Cc}\ud800-\udfff]/u.test(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&!value.startsWith('0000')
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const time=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0{1,6})?)?$/u.test(value);
const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
const fail=(message='The saved enrollment timetable could not be verified.',status=503)=>{throw new AffairsWorkspaceError(message,status);};
const cancelled=response=>{void response?.body?.cancel().catch(()=>{});};

async function boundedJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>ownAffairsTimetableLimits.responseBytes){cancelled(response);fail();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,json='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      if(signal.aborted)fail();
      const {done,value}=await reader.read();
      if(signal.aborted)fail();
      if(done)return JSON.parse(json+decoder.decode());
      size+=value.byteLength;if(size>ownAffairsTimetableLimits.responseBytes)fail();
      json+=decoder.decode(value,{stream:true});
    }
  }catch{void reader.cancel().catch(()=>{});fail();}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}

async function read(account,table,query,fetchImpl){
  const remaining=account.deadline-Date.now();if(remaining<=0)fail('The saved timetable read deadline expired.');
  const target=new URL('/rest/v1/'+table,origin);
  for(const [key,value]of Object.entries(query))target.searchParams.set(key,String(value));
  const controller=new AbortController();let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(async()=>{
        if(controller.signal.aborted)fail();
        const response=await fetchImpl(target,{method:'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(table==='affairs_enrollments'?{Prefer:'count=exact'}:{})},signal:controller.signal});
        if(controller.signal.aborted||Date.now()>=account.deadline){cancelled(response);fail();}
        if(!response.ok){cancelled(response);fail('The saved timetable read was not available.',[401,403].includes(response.status)?403:503);}
        const rows=await boundedJson(response,controller.signal);
        if(table!=='affairs_enrollments')return rows;
        const range=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/u.exec(response.headers.get('content-range')||'');
        const total=range?Number(range[3]):NaN;
        if(!range||!Number.isSafeInteger(total)||total<0||!Array.isArray(rows)||rows.length>query.limit
          ||(rows.length?(Number(range[1])!==query.offset||Number(range[2])!==query.offset+rows.length-1||total<query.offset+rows.length)
            :range[1]!==undefined||total>query.offset))fail();
        return {rows,total};
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AffairsWorkspaceError('The saved timetable read deadline expired.'));},remaining);}),
    ]);
  }catch(error){if(error instanceof AffairsWorkspaceError)throw error;fail();}finally{clearTimeout(timer);}
}

function snapshot(userId,studentRecordFound,courses){
  return {profile:{userId},checkedAt:new Date().toISOString(),source:'stu.best School Affairs',officialUniversityData:false,studentRecordFound,courses,
    completeness:{courses:{scope:'owned_enrolled_timetable',returned:courses.length,complete:studentRecordFound,cap:ownAffairsTimetableLimits.rows,
      reason:studentRecordFound?null:'student_unlinked',
      meaning:'Only the caller’s saved enrolled rows and their section/course/term relationships were read. Enrollment sourceMode is not course/section/term provenance or official synchronization. Historical completed/withdrawn enrollments, grades and attendance were not read. No atomic multi-request snapshot or university-wide completeness is claimed.'}}};
}

function project(row,ownerId,studentId,seen){
  if(!exact(row,['id','student_id','section_id','status','source_mode','student','section'])||!uuid(row.id)||!uuid(row.section_id)
    ||row.student_id!==studentId||row.status!=='enrolled'||!['sample','verified'].includes(row.source_mode)
    ||seen.enrollments.has(row.id)||seen.sections.has(row.section_id)||seen.previous!==null&&row.id<=seen.previous
    ||!exact(row.student,['id','user_id'])||row.student.id!==studentId||row.student.user_id!==ownerId)fail();
  const section=row.section;
  if(!exact(section,['id','course_id','term_id','weekday','starts_at','ends_at','room','course','term'])||section.id!==row.section_id
    ||!uuid(section.course_id)||!uuid(section.term_id)||!Number.isInteger(section.weekday)||section.weekday<1||section.weekday>7
    ||!time(section.starts_at)||!time(section.ends_at)||minute(section.ends_at)<=minute(section.starts_at)||!text(section.room,240,true))fail();
  const course=section.course,term=section.term;
  if(!exact(course,['id','code','title'])||course.id!==section.course_id||!text(course.code,80)||!text(course.title,600)
    ||!exact(term,['id','label','starts_on','ends_on'])||term.id!==section.term_id||!text(term.label,200)
    ||!date(term.starts_on)||!date(term.ends_on)||term.ends_on<term.starts_on)fail();
  // A repeated related ID must not change facts halfway through pagination.
  for(const [map,related,fields]of [[seen.courses,course,['id','code','title']],[seen.terms,term,['id','label','starts_on','ends_on']]]){
    const serialized=JSON.stringify(fields.map(key=>related[key]));if(map.has(related.id)&&map.get(related.id)!==serialized)fail();map.set(related.id,serialized);
  }
  seen.enrollments.add(row.id);seen.sections.add(row.section_id);seen.previous=row.id;
  return {enrollmentId:row.id,status:'enrolled',sourceMode:row.source_mode,code:course.code,title:course.title,term:term.label,
    termStartsOn:term.starts_on,termEndsOn:term.ends_on,weekday:section.weekday,startsAt:section.starts_at.slice(0,5),endsAt:section.ends_at.slice(0,5),room:section.room};
}

/** Receives the existing verified account; never accepts another user/student
 * selector. Missing student is explicit. Failed, capped or inconsistent reads
 * throw instead of returning an apparently complete empty/partial timetable. */
export async function loadOwnAffairsTimetable(account,options={},dependencies={}){
  if(!object(options)||Object.keys(options).some(key=>key!=='deadline')||!object(dependencies)||Object.keys(dependencies).some(key=>key!=='fetchImpl')
    ||dependencies.fetchImpl!==undefined&&typeof dependencies.fetchImpl!=='function')fail('Invalid timetable read options.');
  if(!object(account)||!object(account.user)||!uuid(account.user.id)||account.url!==origin
    ||typeof account.key!=='string'||!account.key.trim()||typeof account.token!=='string'||!account.token.trim())fail('Verified School Affairs access is required.',403);
  if(![options.deadline,account.requestDeadline].every(value=>value===undefined||Number.isFinite(value)))fail('Invalid timetable read deadline.');
  const captured=Object.freeze({userId:account.user.id,key:account.key,token:account.token,
    deadline:Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+ownAffairsTimetableLimits.deadlineMs)});
  const fetchImpl=dependencies.fetchImpl??globalThis.fetch;
  const students=await read(captured,'affairs_students',{select:'id,user_id',user_id:'eq.'+captured.userId,limit:2},fetchImpl);
  if(!Array.isArray(students)||students.length>1||students.some(row=>!exact(row,['id','user_id'])||!uuid(row.id)||row.user_id!==captured.userId))fail();
  if(!students.length)return snapshot(captured.userId,false,[]);
  const studentId=students[0].id,courses=[],seen={enrollments:new Set(),sections:new Set(),courses:new Map(),terms:new Map(),previous:null};let expectedTotal;
  for(let offset=0;offset<=ownAffairsTimetableLimits.rows;offset+=ownAffairsTimetableLimits.pageRows){
    const limit=offset===ownAffairsTimetableLimits.rows?1:ownAffairsTimetableLimits.pageRows;
    const {rows,total}=await read(captured,'affairs_enrollments',{select:enrollmentSelect,student_id:'eq.'+studentId,status:'eq.enrolled',order:'id.asc',limit,offset},fetchImpl);
    if(total>ownAffairsTimetableLimits.rows)fail('The saved timetable exceeds the bounded read limit. A complete next class cannot be determined.');
    if(expectedTotal!==undefined&&total!==expectedTotal)fail();expectedTotal=total;
    for(const row of rows)courses.push(project(row,captured.userId,studentId,seen));
    if(rows.length<limit){if(courses.length!==total)fail();return snapshot(captured.userId,true,courses);}
  }
  fail();
}
