import {parseDtmCourseResourceData,dtmCourseResourceMaxResponseBytes} from '../../server/dtmCourseResource.js';
import type {DtmCourseResourceData} from '../../server/dtmCourseResource.js';
export {parseDtmCourseResourceData,validateDtmMaterialTargetUrl,dtmMaterialTargetUrlMaxLength} from '../../server/dtmCourseResource.js';
export type {DtmCourseResourceData,DtmCourseResourceCourse,DtmCourseResourceMaterial} from '../../server/dtmCourseResource.js';

export class DtmCourseResourceClientError extends Error {
  status:number;
  constructor(message:string,status=503){super(message);this.name='DtmCourseResourceClientError';this.status=status;}
}
export type DtmCourseResourceClient={load:(userId:string,courseId:string,materialId:string,signal?:AbortSignal)=>Promise<DtmCourseResourceData>};
export type DtmCourseResourceSessionReader=()=>Promise<{userId:string;token:string}|null>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const unavailable=()=>new DtmCourseResourceClientError('教材資源暫時無法確認，請重新載入。');
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{
      signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);
    },error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function readJson(response:Response,signal:AbortSignal):Promise<unknown>{
  if(!response.body||Number(response.headers.get('content-length'))>dtmCourseResourceMaxResponseBytes){void response.body?.cancel().catch(()=>{});throw unavailable();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{
    for(;;){const chunk=await within(()=>reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;
      if(bytes>dtmCourseResourceMaxResponseBytes)throw unavailable();text+=decoder.decode(chunk.value,{stream:true});}
    return JSON.parse(text+decoder.decode()) as unknown;
  }catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw unavailable();}
  finally{reader.releaseLock();}
}

/** Only the authenticated exact-course reader is called; destination URLs are never fetched. */
export function createDtmCourseResourceClient(readSession:DtmCourseResourceSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):DtmCourseResourceClient {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Resource timeout must be between 1 and 30000ms.');
  return {load:async(userId,courseId,materialId,signal)=>{
    if(!uuid(userId)||!uuid(courseId)||!uuid(materialId))throw new DtmCourseResourceClientError('請選擇有效的課程與教材。',400);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Resource request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    async function session(){
      let current:Awaited<ReturnType<DtmCourseResourceSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw unavailable();}
      if(!current||current.userId!==userId||typeof current.token!=='string'||!current.token)throw new DtmCourseResourceClientError('登入帳戶已變更，請重新登入。',401);
      return current;
    }
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher('/api/affairs-data?scope=dtm-course-resource&course_id='+courseId+'&material_id='+materialId,{
        method:'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json'},credentials:'omit',cache:'no-store',redirect:'error',signal:bounded,
      }),bounded);}catch(error){if(bounded.aborted)throw error;throw unavailable();}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();
        const status=[400,401,403].includes(response.status)?response.status:503;
        throw new DtmCourseResourceClientError(status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法查看此教材資源。':'教材資源暫時無法確認，請重新載入。',status);}
      const raw=await readJson(response,bounded);await session();bounded.throwIfAborted();
      try{return parseDtmCourseResourceData(raw,userId,courseId,materialId);}catch{throw unavailable();}
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DtmCourseResourceClientError('教材資源查詢逾時，請重試。',504);throw error;}
    finally{clearTimeout(timer);}
  }};
}
export const dtmCourseResourceClient=createDtmCourseResourceClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
