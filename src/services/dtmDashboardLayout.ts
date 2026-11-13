import {dtmDashboardLayoutDefaults,parseDtmDashboardLayout,validateDtmDashboardLayoutPayload,type DtmDashboardLayoutAction,type DtmDashboardLayoutSnapshot} from '../../server/dtmDashboardLayout.js';

export {dtmDashboardLayoutDefaults};
export type {DtmDashboardLayoutAction,DtmDashboardLayoutBlock,DtmDashboardLayoutSnapshot} from '../../server/dtmDashboardLayout.js';
export type DtmDashboardLayoutSessionReader=()=>Promise<{userId:string;token:string}|null>;
export type DtmDashboardLayoutClient={load:(userId:string,signal?:AbortSignal)=>Promise<DtmDashboardLayoutSnapshot>;write:(userId:string,action:DtmDashboardLayoutAction,signal?:AbortSignal)=>Promise<DtmDashboardLayoutSnapshot>};
export class DtmDashboardLayoutError extends Error {
  status:number;
  constructor(message:string,status=503){super(message);this.name='DtmDashboardLayoutError';this.status=status;}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function readJson(response:Response,signal:AbortSignal):Promise<unknown>{
  if(!response.body||Number(response.headers.get('content-length'))>4096){void response.body?.cancel().catch(()=>{});throw new DtmDashboardLayoutError('Dashboard settings could not be verified.');}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
  try{for(;;){const part=await within(()=>reader.read(),signal);if(part.done)break;size+=part.value.byteLength;if(size>4096)throw new Error('Response too large.');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw new DtmDashboardLayoutError('Dashboard settings could not be verified.');}finally{reader.releaseLock();}
}
export function createDtmDashboardLayoutClient(readSession:DtmDashboardLayoutSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):DtmDashboardLayoutClient {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Invalid dashboard request timeout.');
  async function request(userId:string,signal?:AbortSignal,input?:DtmDashboardLayoutAction){
    if(!uuid(userId))throw new DtmDashboardLayoutError('Sign in again to load your dashboard.',401);
    if(input&&(!Object.hasOwn(input,'kind')||!Object.hasOwn(input,'payload')||Reflect.ownKeys(input).length!==2))throw new DtmDashboardLayoutError('Use only the approved dashboard action fields.',400);
    const action=input?structuredClone(input):undefined;
    if(action){const invalid=validateDtmDashboardLayoutPayload(action.kind,action.payload);if(invalid)throw new DtmDashboardLayoutError(invalid,400);}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Dashboard request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    async function session(){const current=await within(readSession,bounded);if(!current||current.userId!==userId||typeof current.token!=='string'||!current.token)throw new DtmDashboardLayoutError('Your account changed. Sign in again.',401);return current.token;}
    try{
      const token=await session();const response=await within(()=>fetcher(action?'/api/affairs-action':'/api/affairs-data?scope=dtm-dashboard-layout',{
        method:action?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},
        ...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded,
      }),bounded);
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new DtmDashboardLayoutError(status===409?'Dashboard settings changed. Reload before saving your changes.':status===401?'Sign in again to load your dashboard.':status===403?'This dashboard is not available to your account.':status===400?'Check the dashboard settings.':'Dashboard settings could not be confirmed. Retry the same operation.',status);}
      const value=await readJson(response,bounded);await session();bounded.throwIfAborted();
      let result:DtmDashboardLayoutSnapshot;try{result=parseDtmDashboardLayout(value);}catch{throw new DtmDashboardLayoutError('Dashboard settings could not be verified.');}
      if(action){const expected=action.kind==='reset_dtm_dashboard_layout'?dtmDashboardLayoutDefaults().blocks:'blocks' in action.payload?action.payload.blocks:[];
        if(result.version!==action.payload.expected_version+1||result.blocks.length!==expected.length||result.blocks.some((block,index)=>['id','visible','region','weight'].some(key=>block[key as keyof typeof block]!==expected[index][key as keyof typeof block])))throw new DtmDashboardLayoutError('The saved dashboard settings could not be verified. Retry the same operation.');}
      return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DtmDashboardLayoutError('Dashboard settings timed out. Retry the same operation.',504);if(error instanceof DtmDashboardLayoutError)throw error;throw new DtmDashboardLayoutError('Dashboard settings could not be confirmed. Retry the same operation.');}finally{clearTimeout(timer);}
  }
  return {load:(userId,signal)=>request(userId,signal),write:(userId,action,signal)=>{
    if(!action||typeof action!=='object'||Array.isArray(action))return Promise.reject(new DtmDashboardLayoutError('Use a valid dashboard action.',400));
    return request(userId,signal,action);
  }};
}
export const dtmDashboardLayoutClient=createDtmDashboardLayoutClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
