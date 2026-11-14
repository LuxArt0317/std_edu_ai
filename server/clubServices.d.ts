import type { verifyAffairsToken } from './affairsWorkspace.js';
import type { ClubWorkspace,ClubReceipt } from './clubServicesContract.js';
type Account = Awaited<ReturnType<typeof verifyAffairsToken>> & {requestDeadline?:number};
export function readClubServices(account:Account,query:Record<string,string|string[]|undefined>):Promise<ClubWorkspace>;
export function changeClubEquipment(account:Account,kind:string,payload:unknown,manager?:boolean):Promise<ClubReceipt>;

export function readClubOfficer(account:Account,query:Record<string,string|string[]|undefined>):Promise<import('./clubOfficerContract.js').OfficerWorkspace>;
export function changeClubOfficer(account:Account,kind:string,payload:unknown,manager?:boolean):Promise<import('./clubOfficerContract.js').OfficerReceipt>;

export function clubRpc(account:Account,name:string,body:unknown,messages:Record<number,string>):Promise<unknown>;
