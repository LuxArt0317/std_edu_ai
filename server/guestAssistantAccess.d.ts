import type {verificationModelCall} from './answerVerificationModel.js';
import type {AssistantResponse} from '../src/services/researchAssistant';
export type GuestAccess={access:'public'|'personal'|'unclear';publicQuestion:string};
export function guestAssistantAccess(question:string,history?:Array<{role:string;content:string}>,dependencies?:{decide?:typeof verificationModelCall}):Promise<GuestAccess>;
export function guestSignInAnswer(question:string):AssistantResponse;
