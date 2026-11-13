import {affairsClient} from '../features/public/affairs/authClient';
import {programRegistrationAction,programRegistrationScope,parseProgramRegistrationReceipt,parseProgramRegistrations,
  type ProgramRegistrationAction} from '../../server/programRegistrationContract.js';

export class ProgramRegistrationError extends Error {
  readonly status:number;
  constructor(status:number) {
    super('Program registration request failed.');
    this.status=status;
  }
}

async function token(userId:string,signal:AbortSignal) {
  signal.throwIfAborted();
  const result = await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if (!result || result.error || result.data.session?.user.id !== userId) throw new ProgramRegistrationError(401);
  return result.data.session.access_token;
}

async function request(userId:string,signal:AbortSignal|undefined,suffix='',action?:ProgramRegistrationAction) {
  const timeout = AbortSignal.timeout(20000);
  const bounded = signal ? AbortSignal.any([signal,timeout]) : timeout;
  const access = await token(userId,bounded);
  const response = await fetch(action ? '/api/affairs-action' : '/api/affairs-data?scope='+programRegistrationScope+suffix,{
    method:action?'POST':'GET',headers:{Authorization:`Bearer ${access}`,...(action?{'Content-Type':'application/json'}:{})},
    ...(action?{body:JSON.stringify({kind:programRegistrationAction,payload:action})}:{}),
    credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
  });
  if (!response.ok) throw new ProgramRegistrationError(response.status);
  const data = await response.json();
  await token(userId,bounded);
  return data;
}

export async function readProgramRegistrations(userId:string,signal:AbortSignal) {
  const data = await request(userId,signal);
  if (data?.userId !== userId) throw new ProgramRegistrationError(503);
  return parseProgramRegistrations(data.records,userId);
}

export async function saveProgramRegistration(userId:string,payload:ProgramRegistrationAction,signal:AbortSignal) {
  return parseProgramRegistrationReceipt(await request(userId,signal,'',payload),userId,payload);
}

export function readProgramRegistrationAnswer(userId:string,question:string,signal?:AbortSignal) {
  return request(userId,signal,/[\u3400-\u9fff]/u.test(question)?'&answer=zh':'&answer=en');
}
