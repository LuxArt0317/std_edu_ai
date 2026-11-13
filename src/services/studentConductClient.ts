import {validateStudentConductPayload,studentConductMaxRecords,type StudentConductReceipt,type StudentConductKind} from '../../server/studentConduct.js';
import type {StudentConductRecord,StudentConductRecords} from './studentConduct';

export type {StudentConductRecord,StudentConductRecords,StudentConductReceipt};
export const studentConductFieldMap=[
  {field:'occurred_on_text',key:'occurredOnText'},{field:'student_number',key:'studentNumber'},{field:'student_name',key:'studentName'},
  {field:'academic_year_text',key:'academicYearText'},{field:'semester_text',key:'semesterText'},{field:'year_level_text',key:'yearLevelText'},
  {field:'reason_text',key:'reasonText'},{field:'conduct_code',key:'conductCode'},{field:'conduct_name',key:'conductName'},
  {field:'quantity_text',key:'quantityText'},{field:'void_status_text',key:'voidStatusText'},
] as const;
export type StudentConductCell=typeof studentConductFieldMap[number]['field'];
export type StudentConductEnvelope={id:string;user_id:string;request_id:string;expected_version:number};
export type StudentConductSavePayload=StudentConductEnvelope & Record<StudentConductCell,string|null> & {row_order:number};
export type StudentConductAction={kind:'save_student_conduct';payload:StudentConductSavePayload}|{kind:'delete_student_conduct';payload:StudentConductEnvelope};
export type StudentConductClient={
  load:(userId:string,signal?:AbortSignal)=>Promise<StudentConductRecords>;
  loadAdmin:(managerId:string,userId:string,signal?:AbortSignal)=>Promise<StudentConductRecords>;
  manage:(managerId:string,action:StudentConductAction,signal?:AbortSignal)=>Promise<StudentConductReceipt>;
};
export type StudentConductSessionReader=()=>Promise<{userId:string;token:string}|null>;
export class StudentConductClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='StudentConductClientError';this.status=status;}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const malformed=()=>new StudentConductClientError('站內獎懲資料未通過完整性檢查，請重新載入。');
function valid(condition:unknown):asserts condition{if(!condition)throw malformed();}
function instant(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
/** Complete selected-owner projection; malformed or partial data never becomes an empty history. */
export function parseStudentConduct(value:unknown,userId:string):StudentConductRecords{
  valid(uuid(userId)&&exact(value,['records'])&&Array.isArray(value.records)&&value.records.length<=studentConductMaxRecords);
  const seen=new Set<string>(),records:StudentConductRecord[]=[];
  for(const row of value.records){
    valid(exact(row,['id','userId','sourceMode','version','createdAt','updatedAt','rowOrder',...studentConductFieldMap.map(item=>item.key)]));
    valid(uuid(row.id)&&!seen.has(row.id)&&row.userId===userId&&row.sourceMode==='local_demo'&&Number.isSafeInteger(row.version)&&Number(row.version)>=1&&Number(row.version)<=999999999&&instant(row.createdAt)&&instant(row.updatedAt));
    const payload={id:row.id,user_id:userId,request_id:row.id,expected_version:0,row_order:row.rowOrder,...Object.fromEntries(studentConductFieldMap.map(item=>[item.field,row[item.key]]))};
    valid(validateStudentConductPayload('save_student_conduct',payload)===null);seen.add(row.id);records.push({...row} as StudentConductRecord);
  }
  return {records:records.sort((a,b)=>a.rowOrder-b.rowOrder||a.id.localeCompare(b.id))};
}
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response:Response,signal:AbortSignal,maxBytes:number):Promise<unknown>{
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode()) as unknown;}
  catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw malformed();}finally{reader.releaseLock();}
}
export function createStudentConductClient(readSession:StudentConductSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):StudentConductClient{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Conduct timeout must be between1 and30000ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:StudentConductAction){
    if(!uuid(callerId))throw new StudentConductClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Conduct request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const session=async()=>{
      let current:Awaited<ReturnType<StudentConductSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new StudentConductClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new StudentConductClientError('登入帳戶已變更，請重新登入校務系統。',401);return current;
    };
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new StudentConductClientError('站內獎懲資料暫時無法連線，請保留內容並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new StudentConductClientError(status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此獎懲資料操作。':status===409?'這筆站內紀錄已變更，請重新載入後比較再儲存。':status===400?'請檢查獎懲資料欄位及帳戶紀錄上限。':'站內獎懲資料暫時無法確認，請保留內容並重試。',status);}
      const result=await jsonWithin(response,bounded,action?4096:20*1024*1024);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new StudentConductClientError('站內獎懲資料查詢逾時，請保留內容並重試。',504);throw error;}finally{clearTimeout(timer);}
  }
  return {
    load:async(userId,signal)=>parseStudentConduct(await request(userId,'/api/affairs-data?scope=student-conduct',signal),userId),
    loadAdmin:async(managerId,userId,signal)=>{
      if(!uuid(userId))throw new StudentConductClientError('請選擇有效的學生帳戶。',400);
      return parseStudentConduct(await request(managerId,'/api/affairs-data?scope=student-conduct-admin&user_id='+userId,signal),userId);
    },
    manage:async(managerId,input,signal)=>{
      const invalid=validateStudentConductPayload(input?.kind,input?.payload);if(invalid)throw new StudentConductClientError(invalid,400);
      const action={kind:input.kind,payload:{...input.payload}} as StudentConductAction;
      const receipt=await request(managerId,'/api/affairs-manage',signal,action);
      valid(exact(receipt,['id','kind','version','summary'])&&receipt.id===action.payload.id&&receipt.kind===action.kind&&receipt.version===action.payload.expected_version+1
        &&typeof receipt.summary==='string'&&[...receipt.summary].length<=200&&![...receipt.summary].some(char=>{const value=char.codePointAt(0)!;return value===0||value>=0xd800&&value<=0xdfff;}));
      return {id:action.payload.id,kind:action.kind as StudentConductKind,version:Number(receipt.version),summary:receipt.summary};
    },
  };
}
export const studentConductClient=createStudentConductClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
