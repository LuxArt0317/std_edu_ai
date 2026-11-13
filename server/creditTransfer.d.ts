import type {AffairsAccount} from './affairsWorkspace.js';
import type {CreditTransferRow} from './creditTransferContract.js';
type Account=AffairsAccount & {requestDeadline?:number};
export function readCreditTransfer(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function changeCreditTransfer(account:Account,kind:string,payload:unknown):Promise<CreditTransferRow>;
