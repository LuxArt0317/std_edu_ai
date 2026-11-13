import {affairsClient} from '@/features/public/affairs/authClient';
import {earlyGraduationScope,earlyGraduationManagerActions,parseEarlyGraduation,parseEarlyGraduationReceipt,
  type GraduationTerm,type GraduationAction} from '../../server/earlyGraduationContract.js';

export class EarlyGraduationError extends Error {
  readonly status:number;
  constructor(status:number){super('Early graduation request failed.');this.status=status;}
}
async function token(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const response=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!response||response.error||response.data.session?.user.id!==userId)throw new EarlyGraduationError(401);
  return response.data.session.access_token;
}
async function request(userId:string,path:string,signal?:AbortSignal,action?:GraduationAction){
  const timeout=AbortSignal.timeout(20000),bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const access=await token(userId,bounded);
  const response=await fetch(path,{
    method:action?'POST':'GET',headers:{Authorization:'Bearer '+access,...(action?{'Content-Type':'application/json'}:{})},
    ...(action?{body:JSON.stringify(action)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:bounded,
  });
  if(!response.ok)throw new EarlyGraduationError(response.status);
  const result:unknown=await response.json();
  await token(userId,bounded);
  return result;
}
const dataPath='/api/affairs-data?scope='+earlyGraduationScope;
export async function loadEarlyGraduation(userId:string,signal:AbortSignal,term?:GraduationTerm,target?:string){
  const query=term?dataPath+'-admin&'+new URLSearchParams({year:String(term.academicYear),semester:String(term.semester),...(target?{user_id:target}:{})}):dataPath;
  return parseEarlyGraduation(await request(userId,query,signal),term?target??null:userId,term);
}
export async function writeEarlyGraduation(userId:string,signal:AbortSignal,action:GraduationAction){
  const path=earlyGraduationManagerActions.includes(action.kind)?'/api/affairs-manage':'/api/affairs-action';
  const result=await request(userId,path,signal,action);
  return parseEarlyGraduationReceipt(result,action.kind,action.payload,'user_id' in action.payload?action.payload.user_id:userId);
}
export function readEarlyGraduationAnswer(userId:string,question:string,signal?:AbortSignal){
  return request(userId,dataPath+'&answer='+(/[\u3400-\u9fff]/u.test(question)?'zh':'en'),signal);
}
