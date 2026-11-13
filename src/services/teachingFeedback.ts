import {affairsClient} from '@/features/public/affairs/authClient';
import {parseTeachingFeedback,parseTeachingFeedbackReceipt,teachingFeedbackManagerActions,type FeedbackAction,type FeedbackScope,type FeedbackStudentScope} from '../../server/teachingFeedbackContract.js';

export class TeachingFeedbackError extends Error {
  readonly status:number;
  constructor(status:number){super('Teaching feedback request failed.');this.status=status;}
}
async function token(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const session=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(!session||session.error||session.data.session?.user.id!==userId)throw new TeachingFeedbackError(401);
  return session.data.session.access_token;
}
async function request(userId:string,path:string,signal?:AbortSignal,action?:FeedbackAction){
  const timeout=AbortSignal.timeout(20000),bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const access=await token(userId,bounded);
  const response=await fetch(path,{method:action?'POST':'GET',signal:bounded,cache:'no-store',credentials:'omit',redirect:'error',
    headers:{Authorization:'Bearer '+access,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{})});
  if(!response.ok)throw new TeachingFeedbackError(response.status);
  const value:unknown=await response.json();
  await token(userId,bounded);
  return value;
}
const url=(view:FeedbackScope,filters:Record<string,string>={})=>'/api/affairs-data?'+new URLSearchParams({scope:'teaching-feedback',view,...filters});
export async function loadTeachingFeedback(userId:string,view:FeedbackScope,signal:AbortSignal,filters?:Record<string,string>){
  return parseTeachingFeedback(await request(userId,url(view,filters),signal),userId,view);
}
export async function writeTeachingFeedback(userId:string,action:FeedbackAction,signal:AbortSignal){
  const path=teachingFeedbackManagerActions.includes(action.kind)?'/api/affairs-manage':'/api/affairs-action';
  return parseTeachingFeedbackReceipt(await request(userId,path,signal,action),action.kind,action.payload);
}
export function readTeachingFeedbackAnswer(userId:string,view:FeedbackStudentScope,question:string,signal?:AbortSignal){
  return request(userId,url(view,{answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}),signal);
}
