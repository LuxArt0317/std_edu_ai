import {parseStudentLoanSnapshot,validateStudentLoanPayload,type StudentLoanKind,type StudentLoanReceipt,type StudentLoanSnapshot} from '../../server/studentLoan.js';
import type {StudentLoanRecord} from './studentLoan';

export type {StudentLoanRecord,StudentLoanReceipt,StudentLoanSnapshot};
export const studentLoanFieldMap=[
  {field:'current_term_label',key:'currentTermLabel',label:'當期學期原文'},
  {field:'current_application_text',key:'currentApplicationText',label:'當期申請狀態原文'},
  {field:'progress_text',key:'progressText',label:'當期進度原文'},
  {field:'history_text',key:'historyText',label:'歷年申請原文'},
] as const;
export type StudentLoanCell=typeof studentLoanFieldMap[number]['field'];
export type StudentLoanEnvelope={id:string;user_id:string;request_id:string;expected_version:number};
export type StudentLoanSavePayload=StudentLoanEnvelope & Record<StudentLoanCell,string|null> & {current_application_state:StudentLoanRecord['currentApplicationState'];history_count:number|null};
export type StudentLoanAction={kind:'save_student_loan';payload:StudentLoanSavePayload}|{kind:'delete_student_loan';payload:StudentLoanEnvelope};
export type StudentLoanClient={
  load:(userId:string,signal?:AbortSignal)=>Promise<StudentLoanSnapshot>;
  loadAdmin:(managerId:string,userId:string,signal?:AbortSignal)=>Promise<StudentLoanSnapshot>;
  manage:(managerId:string,action:StudentLoanAction,signal?:AbortSignal)=>Promise<StudentLoanReceipt>;
};
export type StudentLoanSessionReader=()=>Promise<{userId:string;token:string}|null>;
export class StudentLoanClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='StudentLoanClientError';this.status=status;}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const malformed=()=>new StudentLoanClientError('站內就學貸款資料未通過完整性檢查，請重新載入。');
/** Null is an absent snapshot, never an inferred negative application or zero history. */
export function parseStudentLoan(value:unknown,userId:string):StudentLoanSnapshot{
  try{return parseStudentLoanSnapshot(value,userId);}catch{throw malformed();}
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
export function createStudentLoanClient(readSession:StudentLoanSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):StudentLoanClient{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Loan timeout must be between 1 and 30000ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:StudentLoanAction){
    if(!uuid(callerId))throw new StudentLoanClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Loan request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const session=async()=>{
      let current:Awaited<ReturnType<StudentLoanSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new StudentLoanClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new StudentLoanClientError('登入帳戶已變更，請重新登入校務系統。',401);return current;
    };
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new StudentLoanClientError('站內就學貸款資料暫時無法連線，請保留內容並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new StudentLoanClientError(status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此就學貸款資料操作。':status===409?'此帳戶的站內紀錄已變更，請重新載入後比較再儲存。':status===400?'請檢查就學貸款原文資料欄位。':'站內就學貸款資料暫時無法確認，請保留內容並重試。',status);}
      const result=await jsonWithin(response,bounded,action?4096:65536);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new StudentLoanClientError('站內就學貸款資料查詢逾時，請保留內容並重試。',504);throw error;}finally{clearTimeout(timer);}
  }
  return {
    load:async(userId,signal)=>parseStudentLoan(await request(userId,'/api/affairs-data?scope=student-loan',signal),userId),
    loadAdmin:async(managerId,userId,signal)=>{
      if(!uuid(userId))throw new StudentLoanClientError('請選擇有效的學生帳戶。',400);
      return parseStudentLoan(await request(managerId,'/api/affairs-data?scope=student-loan-admin&user_id='+userId,signal),userId);
    },
    manage:async(managerId,input,signal)=>{
      if(!exact(input,['kind','payload']))throw new StudentLoanClientError('請使用完整的站內紀錄操作。',400);
      const invalid=validateStudentLoanPayload(input.kind,input.payload);if(invalid)throw new StudentLoanClientError(invalid,400);
      const action={kind:input.kind,payload:{...input.payload}} as StudentLoanAction;
      const receipt=await request(managerId,'/api/affairs-manage',signal,action);
      if(!exact(receipt,['id','kind','version','summary'])||receipt.id!==action.payload.id||receipt.kind!==action.kind||receipt.version!==action.payload.expected_version+1
        ||typeof receipt.summary!=='string'||[...receipt.summary].length>200||[...receipt.summary].some(char=>{const value=char.codePointAt(0)!;return value===0||value>=0xd800&&value<=0xdfff;}))throw malformed();
      return {id:action.payload.id,kind:action.kind as StudentLoanKind,version:Number(receipt.version),summary:receipt.summary};
    },
  };
}
export const studentLoanClient=createStudentLoanClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
