/** Ordered references to existing local activities; never a new quiz or submission. */
export const dtmCourseContentKinds=Object.freeze(['save_dtm_course_content','delete_dtm_course_content']);
export const dtmCourseContentMaxPayloadBytes=131072;
export const dtmCourseContentMaxResponseBytes=196608;
export const dtmCourseContentMaxReferences=1000;
const targetKeys=['id','user_id','course_id','request_id','expected_version'];
const recordKeys=['id','userId','courseId','sourceMode','version','createdAt','updatedAt','references'];
const kinds=['assignment','material'],sections=['assignments','quizzes','materials'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const unicode=value=>[...value].every(char=>{const point=char.codePointAt(0);return point!==0&&!(point>=0xd800&&point<=0xdfff);});
const text=(value,max,required=false)=>value===null?!required:typeof value==='string'&&unicode(value)&&[...value].length<=max&&(!required||value.trim().length>0);
const copy=value=>JSON.parse(JSON.stringify(value));
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
/** Match PostgreSQL JSONB spacing and UTF-8 bytes for validated finite numbers.
 * Content bounds reject exponential numbers before this budget is relied on. */
export function dtmCourseContentPayloadBytes(value){
  const seen=new Set();
  function encode(item){
    if(item===null)return 'null';
    if(typeof item==='string'){if(!unicode(item))throw Error();return JSON.stringify(item);}
    if(typeof item==='number'){if(!Number.isFinite(item))throw Error();return JSON.stringify(item);}
    if(typeof item==='boolean')return String(item);
    if(typeof item!=='object'||seen.has(item))throw Error();seen.add(item);
    let result;
    if(Array.isArray(item))result='['+Array.from(item,encode).join(', ')+']';
    else {if(!object(item))throw Error();result='{'+Object.entries(item).map(([key,entry])=>encode(key)+': '+encode(entry)).join(', ')+'}';}
    seen.delete(item);return result;
  }
  try{return new TextEncoder().encode(encode(value)).byteLength;}catch{return Infinity;}
}

export function validateDtmCourseContent(value){
  if(!exact(value,['references'])||!Array.isArray(value.references)||value.references.length>dtmCourseContentMaxReferences)return 'Use at most 1000 ordered activity references.';
  const seen=new Set();
  for(const row of value.references){
    if(!exact(row,['kind','id','section'])||!kinds.includes(row.kind)||!uuid(row.id)||!sections.includes(row.section))return 'Use a saved assignment or material ID and an observed course section.';
    const key=row.kind+':'+row.id;if(seen.has(key))return 'Each activity may be placed only once.';seen.add(key);
  }
  return dtmCourseContentPayloadBytes(value)>dtmCourseContentMaxPayloadBytes?'Course content exceeds the 131072-byte JSONB limit.':null;
}
export function validateDtmCourseContentPayload(kind,value){
  if(!dtmCourseContentKinds.includes(kind))return 'Invalid course content operation.';
  const saving=kind==='save_dtm_course_content';
  if(!exact(value,saving?[...targetKeys,'content']:targetKeys)||!['id','user_id','course_id','request_id'].every(key=>uuid(value[key]))
    ||!integer(value.expected_version,saving?0:1,999999998))return 'Use the exact course content target, request ID and expected version.';
  if(saving){const error=validateDtmCourseContent(value.content);if(error)return error;}
  return dtmCourseContentPayloadBytes(value)>dtmCourseContentMaxPayloadBytes?'The operation exceeds the 131072-byte JSONB limit.':null;
}
export class DtmCourseContentError extends Error{constructor(message,status=503){super(message);this.name='DtmCourseContentError';this.status=status;}}
const malformed=()=>new DtmCourseContentError('The course content could not be verified. No empty course or missing activities were inferred.');
const literal=value=>typeof value==='string'&&unicode(value);
const nullableInstant=value=>value===null||instant(value);
const cursorValid=value=>exact(value,['kind','id'])&&kinds.includes(value.kind)&&uuid(value.id);
const cursorKey=value=>value.kind+':'+value.id;
function responseBudget(value){try{if(new TextEncoder().encode(JSON.stringify(value)).byteLength<=dtmCourseContentMaxResponseBytes)return;}catch{/* Reject non-JSON DTOs. */}throw malformed();}
function courseValid(row,userId){return exact(row,['id','userId','title','code','term'])&&uuid(row.id)&&row.userId===userId&&['title','code','term'].every(key=>literal(row[key]));}
function recordValid(row,userId,courseId){return row===null||exact(row,recordKeys)&&uuid(row.id)&&row.userId===userId&&row.courseId===courseId&&row.sourceMode==='local_demo'
  &&integer(row.version,1,999999999)&&instant(row.createdAt)&&instant(row.updatedAt)&&validateDtmCourseContent({references:row.references})===null;}
function activityValid(row){
  if(row?.kind==='assignment')return exact(row,['kind','id','title','details','dueAt'])&&uuid(row.id)&&literal(row.title)&&literal(row.details)&&nullableInstant(row.dueAt);
  return row?.kind==='material'&&exact(row,['kind','id','title','materialKind','summary','position','sourceMode','sourceUrl'])&&uuid(row.id)&&literal(row.title)&&literal(row.summary)
    &&['page','file','assignment'].includes(row.materialKind)&&integer(row.position,1,2147483647)&&['sample','personal'].includes(row.sourceMode)
    &&(row.sourceUrl===null||typeof row.sourceUrl==='string'&&/^https:\/\/dtm[.]stu[.]edu[.]tw\/(course|mod\/[a-z_]+)\/view[.]php[?]id=[0-9]{1,12}$/.test(row.sourceUrl));
}
export function parseDtmCourseContentData(value,userId,courseId,cursor){
  responseBudget(value);
  if(!uuid(userId)||!uuid(courseId)||(cursor!==undefined&&!cursorValid(cursor))
    ||!exact(value,['course','content','activities','total','limit','nextCursor','revision','unavailableReferenceCount'])
    ||!courseValid(value.course,userId)||value.course.id!==courseId||!recordValid(value.content,userId,courseId)
    ||!Array.isArray(value.activities)||value.activities.length>100||value.limit!==100||!integer(value.total,0,Number.MAX_SAFE_INTEGER)
    ||value.total<value.activities.length||typeof value.revision!=='string'||! /^[0-9a-f]{64}$/.test(value.revision)
    ||!integer(value.unavailableReferenceCount,0,value.content?.references.length??0))throw malformed();
  let previous=cursor?cursorKey(cursor):'';
  for(const row of value.activities){if(!activityValid(row)||cursorKey(row)<=previous)throw malformed();previous=cursorKey(row);}
  if(value.nextCursor!==null&&(!cursorValid(value.nextCursor)||value.activities.length!==100||cursorKey(value.nextCursor)!==previous))throw malformed();
  if(!cursor&&(value.activities.length!==Math.min(100,value.total)||(value.nextCursor!==null)!==(value.total>100)))throw malformed();
  if(value.total===0&&(value.activities.length||value.nextCursor!==null))throw malformed();
  return copy(value);
}
export function parseDtmCourseContentCoursesData(value,userId,afterId){
  responseBudget(value);
  if(!uuid(userId)||(afterId!==undefined&&!uuid(afterId))||!exact(value,['courses','limit','nextCursor'])||value.limit!==100||!Array.isArray(value.courses)||value.courses.length>100)throw malformed();
  let previous=afterId??'';
  for(const row of value.courses){if(!courseValid(row,userId)||row.id<=previous)throw malformed();previous=row.id;}
  if(value.nextCursor!==null&&(!uuid(value.nextCursor)||value.courses.length!==100||value.nextCursor!==previous))throw malformed();return copy(value);
}
export function parseDtmCourseContentAssignmentData(value,userId,courseId,assignmentId){
  responseBudget(value);
  if(!uuid(userId)||!uuid(courseId)||!uuid(assignmentId)||!exact(value,['assignment']))throw malformed();
  if(value.assignment===null)return {assignment:null};const row=value.assignment;
  if(!exact(row,['id','userId','courseId','title','details','dueAt','status','submittedAt','sourceMode','meetingId','origin'])||row.id!==assignmentId||row.userId!==userId||row.courseId!==courseId
    ||!literal(row.title)||!literal(row.details)||!nullableInstant(row.dueAt)||!['open','submitted','graded'].includes(row.status)||!nullableInstant(row.submittedAt)
    ||(row.status==='open')!==(row.submittedAt===null)||!['sample','personal'].includes(row.sourceMode)||(row.meetingId!==null&&!uuid(row.meetingId))
    ||!['sample','manual','moodle_calendar'].includes(row.origin)||(row.sourceMode==='sample')!==(row.origin==='sample'))throw malformed();return copy(value);
}
export function parseDtmCourseContentReceipt(value,kind,payload){
  if(!exact(value,['id','userId','courseId','kind','version','summary'])||!dtmCourseContentKinds.includes(kind)||value.id!==payload.id||value.userId!==payload.user_id
    ||value.courseId!==payload.course_id||value.kind!==kind||value.version!==payload.expected_version+1||!integer(value.version,1,999999999)||!text(value.summary,200,true))throw malformed();return {...value};
}
const budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token
    ||typeof account.key!=='string'||!account.key||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new DtmCourseContentError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DtmCourseContentError('Invalid course content request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function boundedJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>dtmCourseContentMaxResponseBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>dtmCourseContentMaxResponseBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch{void reader.cancel().catch(()=>{});throw malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new DtmCourseContentError('Course content request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new DtmCourseContentError('Local course contents are temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new DtmCourseContentError(status===401?'Sign in to School Affairs again.':status===403?'This course content is not available to your account.':status===409?'This course content changed. Refresh and review your draft.':status===400?'Check the approved course content fields.':'Local course contents are temporarily unavailable. Retry the same operation.',status);}
  return boundedJson(response,signal);
}

async function requireAdmin(account){
  const access=await request(account,'dtm_course_content_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new DtmCourseContentError('School Affairs administrator access is required.',403);
}
function pageOptions(options,admin=false){
  const base=admin?['userId','courseId']:['courseId'];
  const paged=object(options)&&(Object.hasOwn(options,'afterKind')||Object.hasOwn(options,'afterId'));
  if(!exact(options,paged?[...base,'afterKind','afterId']:base)||!uuid(options.courseId)||(admin&&!uuid(options.userId))
    ||(paged&&(!kinds.includes(options.afterKind)||!uuid(options.afterId))))throw new DtmCourseContentError('Choose an owned course and both valid activity cursor fields, or neither.',400);
  return {...options};
}
export async function loadDtmCourseContent(account,options){
  const target=pageOptions(options);account=boundedAccount(account);
  const cursor=target.afterKind?{kind:target.afterKind,id:target.afterId}:undefined;
  return parseDtmCourseContentData(await request(account,'dtm_course_content_read',{body:{p_course_id:target.courseId,...(cursor?{p_after_kind:cursor.kind,p_after_id:cursor.id}:{})}}),account.user.id,target.courseId,cursor);
}
export async function loadDtmCourseContentAdmin(account,options){
  const target=pageOptions(options,true);account=boundedAccount(account);await requireAdmin(account);
  const cursor=target.afterKind?{kind:target.afterKind,id:target.afterId}:undefined;
  return parseDtmCourseContentData(await request(account,'dtm_course_content_admin',{body:{p_user_id:target.userId,p_course_id:target.courseId,...(cursor?{p_after_kind:cursor.kind,p_after_id:cursor.id}:{})}}),target.userId,target.courseId,cursor);
}
export async function loadDtmCourseContentCoursesAdmin(account,options){
  const keys=object(options)&&Object.hasOwn(options,'afterId')?['userId','afterId']:['userId'];
  if(!exact(options,keys)||!uuid(options.userId)||(keys.length===2&&!uuid(options.afterId)))throw new DtmCourseContentError('Choose one student and a valid optional course cursor.',400);
  const {userId,afterId}=options;account=boundedAccount(account);await requireAdmin(account);
  return parseDtmCourseContentCoursesData(await request(account,'dtm_grade_report_courses_admin',{body:{p_user_id:userId,...(afterId?{p_after_id:afterId}:{})}}),userId,afterId);
}
export async function loadDtmCourseContentAssignment(account,options){
  if(!exact(options,['courseId','assignmentId'])||!uuid(options.courseId)||!uuid(options.assignmentId))throw new DtmCourseContentError('Choose one owned course and assignment.',400);
  const {courseId,assignmentId}=options;account=boundedAccount(account);
  return parseDtmCourseContentAssignmentData(await request(account,'dtm_course_content_assignment',{body:{p_course_id:courseId,p_assignment_id:assignmentId}}),account.user.id,courseId,assignmentId);
}
export async function manageDtmCourseContent(account,kind,input){
  const invalid=validateDtmCourseContentPayload(kind,input);if(invalid)throw new DtmCourseContentError(invalid,400);
  const payload=copy(input);account=boundedAccount(account);await requireAdmin(account);
  return parseDtmCourseContentReceipt(await request(account,'dtm_manage_course_content',{body:{p_kind:kind,p_payload:payload}}),kind,payload);
}
