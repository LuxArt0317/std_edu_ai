/** Literal local conduct records only. No merits calculation, detail or document capability. */
import {studentConductMaxRecords} from './studentConductContract.js';
export {studentConductMaxRecords,studentConductPath} from './studentConductContract.js';
export const studentConductMaxPayloadBytes=16000;
export const studentConductKinds=['save_student_conduct','delete_student_conduct'];
export const studentConductTextLimits={occurred_on_text:40,student_number:80,student_name:160,academic_year_text:40,
  semester_text:40,year_level_text:40,reason_text:2000,conduct_code:80,conduct_name:160,quantity_text:80,void_status_text:160};
export const studentConductFields={save_student_conduct:[...Object.keys(studentConductTextLimits),'row_order'],delete_student_conduct:[]};
const envelopeColumns=['id','user_id','source_mode','version','created_at','updated_at','deleted_at'];
const columns=[...envelopeColumns,...studentConductFields.save_student_conduct];
export const studentConductReadSource={table:'affairs_student_conduct',select:columns.join(','),order:'id.asc'};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const n=char.codePointAt(0);return n!==0&&!(n>=0xd800&&n<=0xdfff);});
const commonFields=['id','user_id','request_id','expected_version'];
function instant(value){
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:0[0-9]|1[0-5]):[0-5][0-9])$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
/** PostgreSQL JSONB spacing, for the approved flat scalar payload only. */
export function studentConductPayloadBytes(value){
  try{
    if(!object(value)||Object.values(value).some(item=>item!==null&&!['string','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)))return Infinity;
    return new TextEncoder().encode('{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}').byteLength;
  }catch{return Infinity;}
}
export function validateStudentConductPayload(kind,value){
  if(typeof kind!=='string'||!Object.hasOwn(studentConductFields,kind)||!studentConductKinds.includes(kind))return 'Invalid student conduct operation.';
  if(!exact(value,[...commonFields,...studentConductFields[kind]]))return 'Use exactly the approved conduct fields, including nullable fields.';
  if(!['id','user_id','request_id'].every(key=>uuid(value[key]))||!integer(value.expected_version,kind==='delete_student_conduct'?1:0,999999998))return 'Invalid conduct identifier or expected version.';
  if(kind==='save_student_conduct'){
    for(const [field,limit] of Object.entries(studentConductTextLimits))if(value[field]!==null&&!text(value[field],limit))return 'Conduct cells must be bounded literal text or null.';
    if(!integer(value.row_order,0,10000))return 'Invalid conduct display order.';
  }
  return studentConductPayloadBytes(value)>studentConductMaxPayloadBytes?'Conduct payload exceeds the 16000-byte JSONB limit.':null;
}
export class StudentConductError extends Error{constructor(message,status=503){super(message);this.name='StudentConductError';this.status=status;}}
const malformed=()=>new StudentConductError('Local conduct records could not be verified. No partial records were returned.');
const pageSize=200,budgetMs=12000;
function boundedAccount(account){
  if(!object(account)||!object(account.user)||!Object.hasOwn(account.user,'id')||!uuid(account.user.id)||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new StudentConductError('Sign in to School Affairs again.',401);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new StudentConductError('Invalid conduct request deadline.');
  return {...account,user:{...account.user},requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
function within(task,signal){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response,signal,maximum){
  if(!response.body||Number(response.headers.get('content-length'))>maximum){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maximum)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});throw error instanceof StudentConductError?error:malformed();}finally{reader.releaseLock();}
}
async function request(account,name,{query={},body,exactCount=false}={}){
  const remaining=Math.floor(account.requestDeadline-Date.now());if(remaining<=0)throw new StudentConductError('Conduct request timed out. Retry the same operation.');
  const url=new URL(account.url.replace(/\/$/,'')+'/rest/v1/'+(body?'rpc/':'')+name),signal=AbortSignal.timeout(Math.min(budgetMs,remaining));
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  let response;
  try{response=await within(()=>fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{apikey:account.key,Authorization:'Bearer '+account.token,
    ...(body?{'Content-Type':'application/json'}:{}),...(exactCount?{Prefer:'count=exact'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal}),signal);}
  catch{throw new StudentConductError('Local conduct records are temporarily unavailable. Retry the same operation.');}
  if(!response.ok){void response.body?.cancel().catch(()=>{});const status=[400,401,403,409].includes(response.status)?response.status:[413,422].includes(response.status)?400:503;
    throw new StudentConductError(status===401?'Sign in to School Affairs again.':status===403?'This conduct operation is not available to your account.':status===409?'This conduct record changed. Refresh before saving.':status===400?'Check the approved conduct fields and account record limit.':'Local conduct records are temporarily unavailable. Retry the same operation.',status);}
  const value=await jsonWithin(response,signal,body||exactCount?4096:4*1024*1024);
  if(!exactCount)return value;
  const range=/^(\*|0-0)\/(0|[1-9]\d*)$/u.exec(response.headers.get('Content-Range')??'');
  const count=Number(range?.[2]);
  if(![200,206].includes(response.status)||!integer(count,0,studentConductMaxRecords)
    ||range[1]!==(count===0?'*':'0-0')||!Array.isArray(value)||value.length!==Math.min(1,count))throw malformed();
  return {count,rows:value};
}
async function requireAdmin(account){
  const access=await request(account,'affairs_student_conduct_access',{body:{}});
  if(!exact(access,['userId','canManage'])||access.userId!==account.user.id||access.canManage!==true)throw new StudentConductError('School Affairs administrator access is required.',403);
}
function validRow(row){
  if(!exact(row,columns)||row.source_mode!=='local_demo'||row.deleted_at!==null||!integer(row.version,1,999999999)||!instant(row.created_at)||!instant(row.updated_at))return false;
  const payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0};
  for(const field of studentConductFields.save_student_conduct)payload[field]=row[field];
  return validateStudentConductPayload('save_student_conduct',payload)===null;
}
const mapped=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,
  occurredOnText:row.occurred_on_text,studentNumber:row.student_number,studentName:row.student_name,academicYearText:row.academic_year_text,
  semesterText:row.semester_text,yearLevelText:row.year_level_text,reasonText:row.reason_text,conductCode:row.conduct_code,
  conductName:row.conduct_name,quantityText:row.quantity_text,voidStatusText:row.void_status_text,rowOrder:row.row_order});
async function readRows(account,ownerId){
  const rows=[];let cursor;
  for(;;){
    const page=await request(account,studentConductReadSource.table,{query:{select:studentConductReadSource.select,order:studentConductReadSource.order,limit:pageSize,deleted_at:'is.null',user_id:'eq.'+ownerId,...(cursor?{id:'gt.'+cursor}:{})}});
    if(!Array.isArray(page)||page.length>pageSize)throw malformed();
    for(const row of page){if(!validRow(row)||row.user_id!==ownerId||cursor&&row.id<=cursor)throw malformed();rows.push(row);cursor=row.id;if(rows.length>studentConductMaxRecords)throw new StudentConductError('Local conduct records exceed the complete-read limit. No partial records were returned.');}
    if(page.length<pageSize)return {records:rows.map(mapped).sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id))};
  }
}
/** Personal reads always constrain the caller, including when the caller is an administrator. */
export async function loadStudentConduct(account){account=boundedAccount(account);return readRows(account,account.user.id);}
/** Count the current caller's saved report rows in one exact read. Only a
 * minimal sample is used to confirm ownership; no conduct cells are fetched. */
export async function loadStudentConductCount(account){
  account=boundedAccount(account);
  const owner=account.user.id;
  const {count,rows}=await request(account,studentConductReadSource.table,{exactCount:true,
    query:{select:'id,user_id',order:studentConductReadSource.order,limit:1,deleted_at:'is.null',user_id:'eq.'+owner}});
  if(rows.some(row=>!exact(row,['id','user_id'])||!uuid(row.id)||row.user_id!==owner))throw malformed();
  return {count};
}
/** Explicit trusted-admin read of one account, never an automatic personal-page fallback. */
export async function loadStudentConductAdmin(account,options){
  if(!exact(options,['userId'])||!uuid(options.userId))throw new StudentConductError('Select one student account for conduct administration.',400);
  const ownerId=options.userId;account=boundedAccount(account);await requireAdmin(account);return readRows(account,ownerId);
}
/** SQL repeats trusted authorization, owner, receipt, version and tombstone checks. */
export async function manageStudentConductRecord(account,kind,input){
  const error=validateStudentConductPayload(kind,input);if(error)throw new StudentConductError(error,400);
  const payload={...input};account=boundedAccount(account);await requireAdmin(account);
  const receipt=await request(account,'affairs_manage_student_conduct',{body:{p_kind:kind,p_payload:payload}});
  if(!exact(receipt,['id','kind','version','summary'])||receipt.id!==payload.id||receipt.kind!==kind||receipt.version!==payload.expected_version+1||!text(receipt.summary,200))throw malformed();
  return receipt;
}
