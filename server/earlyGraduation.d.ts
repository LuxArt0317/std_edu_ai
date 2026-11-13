import type {AffairsAccount} from './affairsWorkspace.js';
type Account=AffairsAccount & {requestDeadline?:number};
export function readEarlyGraduation(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeEarlyGraduation(account:Account,kind:string,payload:unknown):Promise<unknown>;
