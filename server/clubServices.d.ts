import type { verifyAffairsToken } from './affairsWorkspace.js';
import type { ClubWorkspace,ClubReceipt } from './clubServicesContract.js';
type Account = Awaited<ReturnType<typeof verifyAffairsToken>> & {requestDeadline?:number};
export function readClubServices(account:Account,query:Record<string,string|string[]|undefined>):Promise<ClubWorkspace>;
export function changeClubEquipment(account:Account,kind:string,payload:unknown,manager?:boolean):Promise<ClubReceipt>;
