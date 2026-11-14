import type {AffairsAccount} from './affairsWorkspace.js';
import type {StudentProfileReceipt} from './studentProfileContract.js';
type Account=AffairsAccount&{requestDeadline?:number};
export function readStudentProfile(account:Account,query:Record<string,unknown>):Promise<unknown>;
export function changeStudentProfile(account:Account,operation:'save'|'confirm',payload:unknown):Promise<StudentProfileReceipt>;
