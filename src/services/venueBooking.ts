import {affairsClient} from '@/features/public/affairs/authClient';
import type {AssistantResponse} from './researchAssistant';

export type Venue={code:string;label:string;description:string};
export type VenueSchedule={venue:string;week:string;label:string;description:string;occupied:string[];local:string[];checked_at:string;fresh:boolean};
export type VenueStatus='submitted'|'approved'|'declined'|'cancelled';
export type VenueRequest={id:string;user_id:string;venue:string;booking_date:string;period:string;purpose:string;status:VenueStatus;review_note:string;version:number};
type Action={kind:'submit_venue_request';payload:{request_id:string;venue:string;booking_date:string;period:string;purpose:string;confirmed:true}}
  |{kind:'cancel_venue_request';payload:{request_id:string;id:string;version:number}}
  |{kind:'review_venue_request';payload:{request_id:string;id:string;version:number;status:'approved'|'declined';note:string}};
export type VenueAction=Action;

async function session(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const state=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!state||state.error||state.data.session?.user.id!==userId)throw Error('請重新登入校務系統。');
  return state.data.session.access_token;
}
async function request<T>(path:string,signal?:AbortSignal,userId?:string,action?:Action){
  const timeout=AbortSignal.timeout(20000),bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const token=userId?await session(userId,bounded):null;
  const result=await fetch(path,{signal:bounded,method:action?'POST':'GET',cache:'no-store',credentials:'omit',redirect:'error',
    headers:{...(token?{Authorization:'Bearer '+token}:{}),...(action?{'Content-Type':'application/json'}:{})},
    ...(action?{body:JSON.stringify(action)}:{})});
  const body=await result.json().catch(()=>null);
  if(userId)await session(userId,bounded);
  if(!result.ok||!body)throw Error(typeof body?.error==='string'?body.error:'場地資料暫時無法載入。');
  return body as T;
}
function path(scope:string,values:Record<string,string>){
  return '/api/affairs-data?'+new URLSearchParams({scope,...values});
}
export const searchVenues=(term:string,signal:AbortSignal)=>request<{venues:Venue[]}>(path('venue-search',{term}),signal);
export const loadVenueWeek=(code:string,week:string,signal:AbortSignal)=>request<VenueSchedule>(path('venue-schedule',{code,week}),signal);
export async function loadVenueRequests(userId:string,manage:boolean,signal:AbortSignal){
  const result=await request<{userId:string;rows:VenueRequest[]}>(path('venue-requests',{view:manage?'manage':'mine'}),signal,userId);
  if(result.userId!==userId||!Array.isArray(result.rows)||(!manage&&result.rows.some(row=>row.user_id!==userId)))throw Error('場地申請資料無法確認。');
  return result.rows;
}
export async function writeVenueRequest(userId:string,action:Action,signal:AbortSignal){
  const endpoint=action.kind==='review_venue_request'?'/api/affairs-manage':'/api/affairs-action';
  const result=await request<{id:string;version:number;status:VenueStatus}>(endpoint,signal,userId,action);
  const expected=action.kind==='submit_venue_request'?'submitted':action.kind==='cancel_venue_request'?'cancelled':action.payload.status;
  if(typeof result.id!=='string'||result.status!==expected||
    (action.kind==='submit_venue_request'?result.version!==1:result.id!==action.payload.id||result.version!==action.payload.version+1))
    throw Error('場地申請結果無法確認。');
  return result;
}
export function readVenueAnswer(userId:string,question:string,signal?:AbortSignal){
  return request<AssistantResponse>(path('venue-requests',{view:'mine',answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}),signal,userId);
}
