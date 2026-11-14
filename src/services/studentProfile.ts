import {affairsClient} from '@/features/public/affairs/authClient';
import {
  parseProfileReceipt,parseStudentProfile,studentProfileScope,type ConfirmStudentProfile,
  type SaveStudentProfile,type StudentProfileReceipt,
} from '../../server/studentProfileContract.js';
import type {AssistantResponse} from './researchAssistant';

export class StudentProfileError extends Error {
  readonly status:number;
  constructor(status:number){super('Student profile request failed.');this.status=status;}
}

async function session(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(result?.error||result?.data.session?.user.id!==userId)throw new StudentProfileError(401);
  return result.data.session.access_token;
}

async function request(userId:string,path:string,signal?:AbortSignal,body?:object){
  const timeout=AbortSignal.timeout(18000),bounded=signal?AbortSignal.any([timeout,signal]):timeout;
  const serialized=body?JSON.stringify(body):undefined;
  const token=await session(userId,bounded);
  const response=await fetch(path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    body:serialized,cache:'no-store',redirect:'error',credentials:'omit',signal:bounded,
  });
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw new StudentProfileError(response.status);}
  const result=await response.json();
  await session(userId,bounded);
  return result;
}

function readPath(view:'mine'|'manage',extra:Record<string,string>={}){
  return '/api/affairs-data?'+new URLSearchParams({scope:studentProfileScope,view,...extra});
}

export async function loadStudentProfile(userId:string,signal:AbortSignal,target?:string){
  return parseStudentProfile(await request(userId,readPath(target?'manage':'mine',target?{user_id:target}:{}),signal),target??userId);
}

export async function confirmStudentProfile(userId:string,payload:ConfirmStudentProfile,signal:AbortSignal):Promise<StudentProfileReceipt>{
  return parseProfileReceipt(await request(userId,'/api/affairs-action',signal,{kind:'confirm_student_profile',payload}),
    userId,payload.expected_version,'confirm');
}

export async function saveStudentProfile(userId:string,payload:SaveStudentProfile,signal:AbortSignal):Promise<StudentProfileReceipt>{
  return parseProfileReceipt(await request(userId,'/api/affairs-manage',signal,{kind:'save_student_profile',payload}),
    payload.user_id,payload.expected_version,'save');
}

export async function readStudentProfileAnswer(userId:string,question:string,signal?:AbortSignal):Promise<AssistantResponse>{
  const reply=await request(userId,readPath('mine',{answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}),signal);
  if(typeof reply?.answer!=='string'||reply.grounding?.source!=='account')throw new StudentProfileError(503);
  return reply;
}
