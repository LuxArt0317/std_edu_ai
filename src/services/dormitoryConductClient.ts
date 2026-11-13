import {parseDormitoryConductData,parseDormitoryConductAdminData,validateDormitoryConductPayload,type DormitoryConductReceipt} from '../../server/dormitoryConduct.js';
import type {DormitoryConductData,DormitoryConductAdminData,DormitoryConductResult} from './dormitoryConduct';

export type {DormitoryConductData,DormitoryConductAdminData,DormitoryConductReceipt};
export type DormitoryConductEnvelope={id:string;user_id:string;request_id:string;expected_version:number};
export type DormitoryConductAction={kind:'save_dormitory_conduct';payload:DormitoryConductEnvelope & {result:DormitoryConductResult}}|{kind:'delete_dormitory_conduct';payload:DormitoryConductEnvelope};
export type DormitoryConductClient={
  load:(userId:string,signal?:AbortSignal)=>Promise<DormitoryConductData>;
  loadAdmin:(managerId:string,userId:string,signal?:AbortSignal)=>Promise<DormitoryConductAdminData>;
  manage:(managerId:string,action:DormitoryConductAction,signal?:AbortSignal)=>Promise<DormitoryConductReceipt>;
};
export type DormitoryConductSessionReader=()=>Promise<{userId:string;token:string}|null>;
export class DormitoryConductClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='DormitoryConductClientError';this.status=status;}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const malformed=()=>new DormitoryConductClientError('站內住宿獎懲資料未通過完整性檢查，請重新載入。');
export function parseDormitoryConduct(value:unknown,userId:string):DormitoryConductData{
  try{return parseDormitoryConductData(value,userId);}catch{throw malformed();}
}
export function parseDormitoryConductAdmin(value:unknown,userId:string):DormitoryConductAdminData{
  try{return parseDormitoryConductAdminData(value,userId);}catch{throw malformed();}
}
export function parseDormitoryConductReceipt(value:unknown,action:DormitoryConductAction):DormitoryConductReceipt{
  if(!exact(value,['id','kind','version','summary'])||value.id!==action.payload.id||value.kind!==action.kind||value.version!==action.payload.expected_version+1
    ||typeof value.summary!=='string'||[...value.summary].length>200||[...value.summary].some(char=>{const point=char.codePointAt(0)!;return point===0||point>=0xd800&&point<=0xdfff;}))throw malformed();
  return {id:action.payload.id,kind:action.kind,version:Number(value.version),summary:value.summary};
}
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response:Response,signal:AbortSignal):Promise<unknown>{
  const maxBytes=4096;
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw malformed();value+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(value+decoder.decode()) as unknown;}
  catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw malformed();}finally{reader.releaseLock();}
}
export function createDormitoryConductClient(readSession:DormitoryConductSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):DormitoryConductClient{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Dormitory conduct timeout must be between 1 and 30000ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:DormitoryConductAction){
    if(!uuid(callerId))throw new DormitoryConductClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Dormitory conduct request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const session=async()=>{
      let current:Awaited<ReturnType<DormitoryConductSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new DormitoryConductClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new DormitoryConductClientError('登入帳戶已變更，請重新登入校務系統。',401);
      return current.token; // Capture the verified primitive before any further await.
    };
    try{
      const token=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new DormitoryConductClientError('站內住宿獎懲資料暫時無法連線，請保留內容並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new DormitoryConductClientError(status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此住宿獎懲資料操作。':status===409?'此帳戶的站內資料已變更，請重新載入後比較再儲存。':status===400?'請檢查住宿獎懲資料欄位。':'站內住宿獎懲資料暫時無法確認，請保留內容並重試。',status);}
      const result=await jsonWithin(response,bounded);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DormitoryConductClientError('站內住宿獎懲資料查詢逾時，請保留內容並重試。',504);throw error;}finally{clearTimeout(timer);}
  }
  return {
    load:async(userId,signal)=>parseDormitoryConduct(await request(userId,'/api/affairs-data?scope=dormitory-conduct',signal),userId),
    loadAdmin:async(managerId,userId,signal)=>{
      if(!uuid(userId))throw new DormitoryConductClientError('請選擇有效的學生帳戶。',400);
      return parseDormitoryConductAdmin(await request(managerId,'/api/affairs-data?scope=dormitory-conduct-admin&user_id='+userId,signal),userId);
    },
    manage:async(managerId,input,signal)=>{
      if(!exact(input,['kind','payload']))throw new DormitoryConductClientError('請使用完整的站內資料操作。',400);
      const invalid=validateDormitoryConductPayload(input.kind,input.payload);if(invalid)throw new DormitoryConductClientError(invalid,400);
      const action={kind:input.kind,payload:{...input.payload}} as DormitoryConductAction;
      return parseDormitoryConductReceipt(await request(managerId,'/api/affairs-manage',signal,action),action);
    },
  };
}
export const dormitoryConductClient=createDormitoryConductClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
