import type {verifyAffairsToken} from './affairsWorkspace.js';
import type {ElearningCatalog,ElearningEnrollment,ElearningWorkspace} from './elearningContract.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readElearning(account:Account,query:Record<string,string|string[]|undefined>):Promise<ElearningWorkspace>;
export function enrollElearning(account:Account,payload:unknown):Promise<ElearningEnrollment>;
export function readElearningCatalog(account:Account,query:Record<string,string|string[]|undefined>):Promise<ElearningCatalog>;
