import {affairsClient} from '@/features/public/affairs/authClient';
import {clearanceScope,clearanceSubmit,parseClearance,parseClearanceReceipt,type ClearanceAction} from '../../server/graduationClearanceContract.js';

export class ClearanceError extends Error {
  readonly status:number;
  constructor(status:number){super('Graduation clearance request failed.');this.status=status;}
}
async function accessToken(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!result||result.error||result.data.session?.user.id!==userId)throw new ClearanceError(401);
  return result.data.session.access_token;
}
async function request(userId:string,path:string,signal?:AbortSignal,action?:ClearanceAction){
  const timeout=AbortSignal.timeout(20000),bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const token=await accessToken(userId,bounded);
  const response=await fetch(path,{method:action?'POST':'GET',signal:bounded,cache:'no-store',credentials:'omit',redirect:'error',
    headers:{Authorization:'Bearer '+token,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{})});
  if(!response.ok)throw new ClearanceError(response.status);
  const value:unknown=await response.json();
  await accessToken(userId,bounded);
  return value;
}
const path=(view:'student'|'manage',filters:Record<string,string>={})=>'/api/affairs-data?'+new URLSearchParams({scope:clearanceScope,view,...filters});
export async function loadGraduationClearance(userId:string,view:'student'|'manage',signal:AbortSignal,term?:string,target?:string){
  return parseClearance(await request(userId,path(view,{...(term?{term}:{}),...(target?{user_id:target}:{})}),signal),userId,view,term||undefined,target||undefined);
}
export async function writeGraduationClearance(userId:string,action:ClearanceAction,signal:AbortSignal){
  const endpoint=action.kind===clearanceSubmit?'/api/affairs-action':'/api/affairs-manage';
  return parseClearanceReceipt(await request(userId,endpoint,signal,action),action.kind,action.payload);
}
export function readGraduationClearanceAnswer(userId:string,question:string,signal?:AbortSignal){
  return request(userId,path('student',{answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}),signal);
}
