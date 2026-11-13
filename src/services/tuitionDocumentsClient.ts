import {validateTuitionDocumentPayload,type TuitionDocumentKind,type TuitionDocumentReceipt,type TuitionDocumentsRecords,type TuitionDocumentsAdminRecords,type TuitionSettlement,type TuitionDocumentMetadata} from '../../server/tuitionDocuments.js';

export type {TuitionDocumentsRecords,TuitionDocumentsAdminRecords,TuitionSettlement,TuitionDocumentMetadata};
type Envelope={id:string;user_id:string;request_id:string;expected_version:number};
export type TuitionSettlementPayload=Envelope & {period_label:string;statement_text:string|null;row_order:number};
export type TuitionMetadataPayload=Envelope & {kind:'summer'|'evening';period_label:string|null;note_text:string|null;status:'metadata_only'|'revoked';issuer:'stu.best'};
export type TuitionDocumentsAction={kind:'save_tuition_settlement';payload:TuitionSettlementPayload}|{kind:'save_tuition_document_metadata';payload:TuitionMetadataPayload}|{kind:'delete_tuition_settlement'|'delete_tuition_document_metadata';payload:Envelope};
export type TuitionDocumentsClient={
  load:(userId:string,signal?:AbortSignal)=>Promise<TuitionDocumentsRecords>;
  loadAdmin:(managerId:string,userId:string,signal?:AbortSignal)=>Promise<TuitionDocumentsAdminRecords>;
  manage:(managerId:string,action:TuitionDocumentsAction,signal?:AbortSignal)=>Promise<TuitionDocumentReceipt>;
};
export type TuitionSessionReader=()=>Promise<{userId:string;token:string}|null>;
export class TuitionDocumentsClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='TuitionDocumentsClientError';this.status=status;}
}
export const validTuitionAccount=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const malformed=()=>new TuitionDocumentsClientError('站內繳費資料未通過完整性檢查，請重新載入。');
function valid(condition:unknown):asserts condition{if(!condition)throw malformed();}
const envelope=['id','userId','sourceMode','version','createdAt','updatedAt'];
function instant(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value))return false;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(Date.parse(value));
}
function validEnvelope(row:Record<string,unknown>,userId:string){
  valid(validTuitionAccount(row.id)&&row.userId===userId&&row.sourceMode==='local_demo'&&Number.isSafeInteger(row.version)&&Number(row.version)>=1&&Number(row.version)<=999999999&&instant(row.createdAt)&&instant(row.updatedAt));
}
/** Strict selected-account projection. Metadata can never become a file capability. */
export function parseTuitionDocuments(value:unknown,userId:string):TuitionDocumentsRecords;
export function parseTuitionDocuments(value:unknown,userId:string,admin:true):TuitionDocumentsAdminRecords;
export function parseTuitionDocuments(value:unknown,userId:string,admin=false):TuitionDocumentsRecords|TuitionDocumentsAdminRecords{
  valid(validTuitionAccount(userId)&&exact(value,admin?['periods','settlements','documents','documentMetadata']:['periods','settlements','documents'])&&Array.isArray(value.documents)&&value.documents.length===0&&Array.isArray(value.settlements)&&value.settlements.length<=1000&&Array.isArray(value.periods)&&value.periods.length===value.settlements.length);
  const settlements:TuitionSettlement[]=[],seen=new Set<string>();
  for(const row of value.settlements){
    valid(exact(row,[...envelope,'periodId','periodLabel','text','rowOrder']));validEnvelope(row,userId);
    valid(row.periodId===row.id&&!seen.has(String(row.id))&&validateTuitionDocumentPayload('save_tuition_settlement',{id:row.id,user_id:userId,request_id:row.id,expected_version:0,period_label:row.periodLabel,statement_text:row.text,row_order:row.rowOrder})===null);
    seen.add(String(row.id));settlements.push({...row} as TuitionSettlement);
  }
  const periods=value.periods.map((row,index)=>{
    const match=settlements[index];valid(exact(row,['id','userId','label'])&&row.userId===userId&&row.id===match.id&&row.label===match.periodLabel);
    return {id:match.id,userId,label:match.periodLabel};
  });
  if(!admin)return {periods,settlements,documents:[]};
  valid(Array.isArray(value.documentMetadata)&&value.documentMetadata.length<=2);
  const documentMetadata:TuitionDocumentMetadata[]=[],kinds=new Set<string>(),documentIds=new Set<string>();
  for(const row of value.documentMetadata){
    valid(exact(row,[...envelope,'kind','periodLabel','noteText','status','issuer']));validEnvelope(row,userId);
    valid(!documentIds.has(String(row.id))&&!kinds.has(String(row.kind))&&validateTuitionDocumentPayload('save_tuition_document_metadata',{id:row.id,user_id:userId,request_id:row.id,expected_version:0,kind:row.kind,period_label:row.periodLabel,note_text:row.noteText,status:row.status,issuer:row.issuer})===null);
    documentIds.add(String(row.id));kinds.add(String(row.kind));documentMetadata.push({...row} as TuitionDocumentMetadata);
  }
  return {periods,settlements,documents:[],documentMetadata};
}
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response:Response,signal:AbortSignal,maxBytes:number):Promise<unknown>{
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw malformed();text+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(text+decoder.decode()) as unknown;}
  catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw malformed();}finally{reader.releaseLock();}
}
export function createTuitionDocumentsClient(readSession:TuitionSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):TuitionDocumentsClient{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Tuition timeout must be between 1 and 30000 ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:TuitionDocumentsAction){
    if(!validTuitionAccount(callerId))throw new TuitionDocumentsClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Tuition request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const session=async()=>{
      let current:Awaited<ReturnType<TuitionSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new TuitionDocumentsClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new TuitionDocumentsClientError('登入帳戶已變更，請重新登入校務系統。',401);return current;
    };
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new TuitionDocumentsClientError('站內繳費資料暫時無法連線，請保留內容並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new TuitionDocumentsClientError(status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此繳費資料操作。':status===409?'這筆站內紀錄已變更，請重新載入後比較再儲存。':status===400?'請檢查站內繳費資料欄位。':'站內繳費資料暫時無法確認，請保留內容並重試。',status);}
      const result=await jsonWithin(response,bounded,action?4096:20*1024*1024);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new TuitionDocumentsClientError('站內繳費資料查詢逾時，請保留內容並重試。',504);throw error;}finally{clearTimeout(timer);}
  }
  return {
    load:async(userId,signal)=>parseTuitionDocuments(await request(userId,'/api/affairs-data?scope=tuition-documents',signal),userId),
    loadAdmin:async(managerId,userId,signal)=>{
      if(!validTuitionAccount(userId))throw new TuitionDocumentsClientError('請選擇有效的學生帳戶。',400);
      return parseTuitionDocuments(await request(managerId,'/api/affairs-data?scope=tuition-documents-admin&user_id='+userId,signal),userId,true);
    },
    manage:async(managerId,input,signal)=>{
      const invalid=validateTuitionDocumentPayload(input?.kind,input?.payload);if(invalid)throw new TuitionDocumentsClientError(invalid,400);
      const action={kind:input.kind,payload:{...input.payload}} as TuitionDocumentsAction;
      const receipt=await request(managerId,'/api/affairs-manage',signal,action);
      valid(exact(receipt,['id','kind','version','summary'])&&receipt.id===action.payload.id&&receipt.kind===action.kind&&receipt.version===action.payload.expected_version+1&&typeof receipt.summary==='string'&&[...receipt.summary].length<=200);
      return {id:action.payload.id,kind:action.kind as TuitionDocumentKind,version:Number(receipt.version),summary:receipt.summary};
    },
  };
}
export const tuitionDocumentsClient=createTuitionDocumentsClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
