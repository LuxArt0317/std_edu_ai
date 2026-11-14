import {affairsClient} from '@/features/public/affairs/authClient';
import {
  announcementEmailScope,announcementEmailAction,parseAnnouncementEmail,type AnnouncementEmailChange,
} from '../../server/announcementEmailContract.js';
import type {AssistantResponse} from './researchAssistant';

export class AnnouncementEmailError extends Error{
  readonly status:number;
  constructor(status:number){super('Announcement email request failed.');this.status=status;}
}
async function access(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(result?.error||result?.data.session?.user.id!==userId)throw new AnnouncementEmailError(401);
  return result.data.session.access_token;
}
async function request(userId:string,signal:AbortSignal|undefined,path:string,body?:object){
  const timeout=AbortSignal.timeout(18000),bounded=signal?AbortSignal.any([timeout,signal]):timeout;
  const token=await access(userId,bounded);
  const result=await fetch(path,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
  if(!result.ok){void result.body?.cancel().catch(()=>{});throw new AnnouncementEmailError(result.status);}
  const value=await result.json();
  await access(userId,bounded);
  return value;
}
const path='/api/affairs-data?scope='+announcementEmailScope;

export async function loadAnnouncementEmail(userId:string,signal:AbortSignal){
  const value=await request(userId,signal,path);
  if(typeof value?.deliveryConfigured!=='boolean')throw new AnnouncementEmailError(503);
  const {deliveryConfigured,...preference}=value;
  return {...parseAnnouncementEmail(preference,userId),deliveryConfigured};
}
export async function saveAnnouncementEmail(userId:string,payload:AnnouncementEmailChange,signal:AbortSignal){
  return parseAnnouncementEmail(await request(userId,signal,'/api/affairs-action',{kind:announcementEmailAction,payload}),userId,payload);
}
export async function readAnnouncementEmailAnswer(userId:string,question:string,signal?:AbortSignal):Promise<AssistantResponse>{
  const result=await request(userId,signal,path+'&answer='+(/[\u3400-\u9fff]/u.test(question)?'zh':'en'));
  if(typeof result?.answer!=='string'||result.grounding?.source!=='account')throw new AnnouncementEmailError(503);
  return result;
}
