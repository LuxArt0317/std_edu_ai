import type { verifyAffairsToken } from './affairsWorkspace.js';
import type { ClubStudentWorkspace,FoundationReceipt } from './clubStudentContract.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readClubStudent(account:Account,query:Record<string,string|string[]|undefined>,observeRequest?:(status:number|'network-error')=>void):Promise<ClubStudentWorkspace>;
export function writeClubFoundation(account:Account,kind:string,payload:unknown,manager?:boolean):Promise<FoundationReceipt>;
