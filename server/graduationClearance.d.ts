import type {AffairsAccount} from './affairsWorkspace.js';
type Account=AffairsAccount & {requestDeadline?:number};
export function readGraduationClearance(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeGraduationClearance(account:Account,kind:string,payload:unknown):Promise<unknown>;
