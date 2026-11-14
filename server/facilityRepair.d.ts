import type {AffairsAccount} from './affairsWorkspace.js';
type RepairAccount=AffairsAccount & {requestDeadline?:number};
export function readFacilityRepairs(account:RepairAccount,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeFacilityRepair(account:RepairAccount,action:string,payload:unknown):Promise<unknown>;
