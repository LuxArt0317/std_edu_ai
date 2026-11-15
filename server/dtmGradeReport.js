/** Literal local Moodle-shaped reports. Pure validators are also used by the
 * browser; numeric metadata is never converted into displayed grade cells. */
export const dtmGradeReportKinds=Object.freeze(['save_dtm_grade_report','delete_dtm_grade_report']);
export const dtmGradeReportMaxPayloadBytes=131072;
export const dtmGradeReportMaxResponseBytes=196608;
export const dtmGradeReportMaxItems=500;
const targetKeys=['id','user_id','course_id','request_id','expected_version'];
const textKeys=['gradeText','rangeText','percentageText','weightText','weightNote','rankText','feedbackText','contributionText'];
const cellKeys=['score','maximum',...textKeys],itemKeys=['id','label','activityKind',...cellKeys];
const recordKeys=['id','userId','courseId','sourceMode','version','createdAt','updatedAt','items','total'];
const columns=['id','user_id','course_id','source_mode','version','created_at','updated_at','deleted_at','report'];
export const dtmGradeReportReadSource=Object.freeze({table:'dtm_grade_reports',select:columns.join(','),order:'id.asc'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const unicode=value=>[...value].every(char=>{const point=char.codePointAt(0);return point!==0&&!(point>=0xd800&&point<=0xdfff);});
const text=(value,max,required=false)=>value===null?!required:typeof value==='string'&&unicode(value)&&[...value].length<=max&&(!required||value.trim().length>0);
const number=(value,positive=false)=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&(!positive||value>0)&&value<=1000000&&Number(value.toFixed(2))===value;
const copy=value=>JSON.parse(JSON.stringify(value));
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
/** Match PostgreSQL JSONB spacing and UTF-8 bytes for validated finite numbers.
 * Content bounds reject exponential numbers before this budget is relied on. */
export function dtmGradeReportPayloadBytes(value){
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
function validCells(value,item=false){
  return exact(value,item?itemKeys:cellKeys)&&number(value.score)&&number(value.maximum,true)
    &&(value.score===null||value.maximum===null||value.score<=value.maximum)
    &&textKeys.every(key=>text(value[key],key==='feedbackText'?2000:80))
    &&(!item||uuid(value.id)&&text(value.label,160,true)&&(value.activityKind===null||value.activityKind==='assignment'));
}
export function validateDtmGradeReportContent(value){
  if(!exact(value,['items','total'])||!Array.isArray(value.items)||value.items.length>dtmGradeReportMaxItems)return 'Use ordered items (at most 500) and an explicit nullable total.';
  if(!Array.from(value.items).every(row=>validCells(row,true))||new Set(value.items.map(row=>row.id)).size!==value.items.length)return 'Grade items require unique UUIDs, labels and explicit valid nullable cells.';
  if(value.total!==null&&!validCells(value.total))return 'The total must be null or explicit valid grade cells; totals are never calculated.';
  return dtmGradeReportPayloadBytes(value)>dtmGradeReportMaxPayloadBytes?'The grade report exceeds the 131072-byte JSONB limit.':null;
}
export function validateDtmGradeReportPayload(kind,value){
  if(typeof kind!=='string'||!dtmGradeReportKinds.includes(kind))return 'Invalid grade report operation.';
  const saving=kind==='save_dtm_grade_report';
  if(!exact(value,saving?[...targetKeys,'report']:targetKeys)||!['id','user_id','course_id','request_id'].every(key=>uuid(value[key]))
    ||!integer(value.expected_version,saving?0:1,999999998))return 'Use exactly the approved grade report target, request ID and expected version.';
  if(saving){const invalid=validateDtmGradeReportContent(value.report);if(invalid)return invalid;}
  return dtmGradeReportPayloadBytes(value)>dtmGradeReportMaxPayloadBytes?'The operation exceeds the 131072-byte JSONB limit.':null;
}
export class DtmGradeReportError extends Error{constructor(message,status=503){super(message);this.name='DtmGradeReportError';this.status=status;}}
const malformed=()=>new DtmGradeReportError('The local grade report could not be verified. No missing grades or totals were inferred.');
export function parseDtmGradeReportData(value,userId,courseId){
  if(!uuid(userId)||!uuid(courseId)||!exact(value,['report']))throw malformed();
  if(value.report===null)return {report:null};const row=value.report;
  if(!exact(row,recordKeys)||!uuid(row.id)||row.userId!==userId||row.courseId!==courseId||row.sourceMode!=='local_demo'
    ||!integer(row.version,1,999999999)||!instant(row.createdAt)||!instant(row.updatedAt)
    ||validateDtmGradeReportContent({items:row.items,total:row.total})!==null)throw malformed();
  return copy(value);
}
function parseCourses(value,userId,afterId,overview){
  if(!uuid(userId)||(afterId!==undefined&&!uuid(afterId))||!exact(value,['courses','limit','nextCursor'])||value.limit!==100
    ||!Array.isArray(value.courses)||value.courses.length>100)throw malformed();
  let previous=afterId??'';
  for(const row of value.courses){
    if(!exact(row,overview?['id','userId','title','code','term','gradeText']:['id','userId','title','code','term'])||!uuid(row.id)||row.userId!==userId||row.id<=previous
      ||!['title','code','term'].every(key=>typeof row[key]==='string'&&unicode(row[key]))||(overview&&!text(row.gradeText,80)))throw malformed();previous=row.id;
  }
  if(value.nextCursor!==null&&(!uuid(value.nextCursor)||value.courses.length!==100||value.nextCursor!==previous))throw malformed();
  // Existing course columns have no schema length/nonblank constraints. Keep
  // historical metadata literal, bounded by the response budget, not new writes.
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>dtmGradeReportMaxResponseBytes)throw malformed();
  return copy(value);
}
export function parseDtmGradeReportCoursesData(value,userId,afterId){return parseCourses(value,userId,afterId,false);}
export function parseDtmGradeReportOverviewData(value,userId,afterId){return parseCourses(value,userId,afterId,true);}
export function parseDtmGradeReportReceipt(value,kind,payload){
  if(!exact(value,['id','userId','courseId','kind','version','summary'])||!dtmGradeReportKinds.includes(kind)
    ||value.id!==payload.id||value.userId!==payload.user_id||value.courseId!==payload.course_id||value.kind!==kind
    ||value.version!==payload.expected_version+1||!integer(value.version,1,999999999)||!text(value.summary,200,true))throw malformed();
  return {...value};
}
const budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token
    ||typeof account.key!=='string'||!account.key||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new DtmGradeReportError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DtmGradeReportError('Invalid grade report request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function boundedJson(response,signal){
  if(!response.body||Number(response.headers.get('content-length'))>dtmGradeReportMaxResponseBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>dtmGradeReportMaxResponseBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch{void reader.cancel().catch(()=>{});throw malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new DtmGradeReportError('Grade report request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new DtmGradeReportError('Local grade reports are temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new DtmGradeReportError(status===401?'Sign in to School Affairs again.':status===403?'This grade report is not available to your account.':status===409?'This grade report changed. Refresh and review your draft.':status===400?'Check the approved grade report fields.':'Local grade reports are temporarily unavailable. Retry the same operation.',status);}
  return boundedJson(response,signal);
}
async function requireAdmin(account){
  const access=await request(account,'dtm_grade_report_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new DtmGradeReportError('School Affairs administrator access is required.',403);
}
async function readReport(account,userId,courseId,admin=false){
  if(admin){
    // Existing personal-course RLS intentionally denies a blanket admin read.
    // The dedicated RPC exposes only this selected owner's minimal metadata.
    const data=parseDtmGradeReportCoursesData(await request(account,'dtm_grade_report_courses_admin',{body:{p_user_id:userId,p_course_id:courseId}}),userId);
    if(data.courses.length>1||data.nextCursor!==null)throw malformed();
    if(!data.courses.length)throw new DtmGradeReportError('This course is not available to your account.',403);
    if(data.courses[0].id!==courseId)throw malformed();
  }else{
    const courses=await request(account,'dtm_courses',{query:{select:'id,user_id',id:'eq.'+courseId,user_id:'eq.'+userId,limit:2}});
    if(!Array.isArray(courses)||courses.length>1)throw malformed();
    if(!courses.length)throw new DtmGradeReportError('This course is not available to your account.',403);
    if(!exact(courses[0],['id','user_id'])||courses[0].id!==courseId||courses[0].user_id!==userId)throw malformed();
  }
  const rows=await request(account,dtmGradeReportReadSource.table,{query:{select:dtmGradeReportReadSource.select,order:'id.asc',limit:2,deleted_at:'is.null',user_id:'eq.'+userId,course_id:'eq.'+courseId}});
  if(!Array.isArray(rows)||rows.length>1)throw malformed();if(!rows.length)return {report:null};const row=rows[0];
  if(!exact(row,columns)||row.deleted_at!==null||!exact(row.report,['items','total']))throw malformed();
  return parseDtmGradeReportData({report:{...row.report,id:row.id,userId:row.user_id,courseId:row.course_id,sourceMode:row.source_mode,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}},userId,courseId);
}
export async function loadDtmGradeReport(account,options){
  if(!exact(options,['courseId'])||!uuid(options.courseId))throw new DtmGradeReportError('Choose one course for the grade report.',400);
  const courseId=options.courseId;account=boundedAccount(account);return readReport(account,account.user.id,courseId);
}
export async function loadDtmGradeReportAdmin(account,options){
  if(!exact(options,['userId','courseId'])||!uuid(options.userId)||!uuid(options.courseId))throw new DtmGradeReportError('Choose one student and their course for grade maintenance.',400);
  const {userId,courseId}=options;account=boundedAccount(account);await requireAdmin(account);return readReport(account,userId,courseId,true);
}
export async function loadDtmGradeReportCoursesAdmin(account,options){
  const keys=object(options)&&Object.hasOwn(options,'afterId')?['userId','afterId']:['userId'];
  if(!exact(options,keys)||!uuid(options.userId)||(keys.length===2&&!uuid(options.afterId)))throw new DtmGradeReportError('Choose one student and a valid optional course cursor.',400);
  const {userId,afterId}=options;account=boundedAccount(account);await requireAdmin(account);
  return parseDtmGradeReportCoursesData(await request(account,'dtm_grade_report_courses_admin',{body:{p_user_id:userId,...(afterId?{p_after_id:afterId}:{})}}),userId,afterId);
}
export async function loadDtmGradeReportOverview(account,options={},observeRead){
  const keys=object(options)&&Object.hasOwn(options,'afterId')?['afterId']:[];
  if(!exact(options,keys)||(keys.length&&!uuid(options.afterId)))throw new DtmGradeReportError('Use a valid optional grade overview cursor.',400);
  const {afterId}=options;account=boundedAccount(account);
  const body=afterId?{p_after_id:afterId}:{};
  const raw=await request(account,'dtm_grade_report_overview',{body});
  const parsed=parseDtmGradeReportOverviewData(raw,account.user.id,afterId);
  observeRead?.({callerId:account.user.id,method:'POST',path:'/rest/v1/rpc/dtm_grade_report_overview',body,raw});
  return parsed;
}
export async function manageDtmGradeReport(account,kind,input){
  const invalid=validateDtmGradeReportPayload(kind,input);if(invalid)throw new DtmGradeReportError(invalid,400);
  const payload=copy(input);account=boundedAccount(account);await requireAdmin(account);
  return parseDtmGradeReportReceipt(await request(account,'dtm_manage_grade_report',{body:{p_kind:kind,p_payload:payload}}),kind,payload);
}
