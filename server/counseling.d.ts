import type {verifyAffairsToken} from './affairsWorkspace.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readCounseling(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeCounseling(account:Account,kind:string,payload:unknown,manager?:boolean):Promise<unknown>;
