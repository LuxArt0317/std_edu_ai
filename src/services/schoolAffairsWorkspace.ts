import { affairsClient } from '@/features/public/affairs/authClient';

export type AffairsAction = {kind:'create_task'|'complete_task'|'create_service_request'|'publish_announcement'|'resolve_service_request';payload:Record<string,string>};
export type AffairsSnapshot = {
  checkedAt:string;officialUniversityData:false;
  profile:{userId:string;email:string;displayName:string;role:'student'|'admin'};
  student:{id:string;studentNumber:string;fullName:string;yearLevel:number;status:string;sourceMode:string;program:string|null}|null;
  courses:Array<{enrollmentId:string;status:string;sourceMode:string;code:string;title:string;credits:number;term:string;instructor:string;weekday:number|null;startsAt:string;endsAt:string;room:string;grades:Array<{label:string;score:number;maximum:number;sourceMode:string}>;attendance:Array<{date:string;status:string;sourceMode:string}>}>;
  charges:Array<{label:string;amountDue:number;amountPaid:number;currency:string;dueOn:string|null;sourceMode:string}>;
  announcements:Array<{id:string;title:string;body:string;publishedAt:string;sourceMode:string}>;
  tasks:Array<{id:string;title:string;dueAt:string|null;completedAt:string|null;sourceMode:string}>;
  requests:Array<{id:string;type:string;title:string;details:string;status:string;createdAt:string}>;
  admin?:{profiles:Array<{user_id:string;email:string;display_name:string;role:string;created_at:string}>;requests:Array<{id:string;user_id:string;request_type:string;title:string;status:string;created_at:string}>};
};

async function token() {
  if (!affairsClient) throw new Error('School Affairs sign-in is unavailable.');
  const {data,error}=await affairsClient.auth.getSession();
  if (error || !data.session) throw new Error('Sign in to School Affairs again.');
  return data.session.access_token;
}
async function call<T>(path:string,init?:RequestInit):Promise<T> {
  const accessToken=await token();
  const response=await fetch(path,{...init,headers:{Authorization:`Bearer ${accessToken}`,...init?.headers}});
  const payload=await response.json().catch(()=>null);
  if (!response.ok || !payload) throw new Error(typeof payload?.error==='string'?payload.error:'School Affairs is temporarily unavailable.');
  return payload as T;
}
export function loadSchoolAffairsData(admin=false) { return call<AffairsSnapshot>(`/api/affairs-data${admin?'?scope=admin':''}`); }
export function performSchoolAffairsAction(action:AffairsAction) {
  return call<{id:string;kind:string;summary:string}>('/api/affairs-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});
}
