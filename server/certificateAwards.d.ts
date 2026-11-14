import type {verifyAffairsToken} from './affairsWorkspace.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readCertificateAward(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeCertificateAward(account:Account,operation:string,payload:unknown,admin?:boolean):Promise<unknown>;
export function certificateAwardGuide(question:string,intent:'guide'|'status'):unknown;
