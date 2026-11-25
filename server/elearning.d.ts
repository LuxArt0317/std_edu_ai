import type {verifyAffairsToken} from './affairsWorkspace.js';
import type {ElearningCatalog,ElearningEnrollment,ElearningOutline,ElearningWorkspace} from './elearningContract.js';
import type {ElearningMetadataRoute} from './elearningMetadataIntent.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readElearning(account:Account,query:Record<string,string|string[]|undefined>):Promise<ElearningWorkspace>;
export function enrollElearning(account:Account,payload:unknown):Promise<ElearningEnrollment>;
export function readElearningCatalog(account:Account,query:Record<string,string|string[]|undefined>):Promise<ElearningCatalog>;
export function readElearningOutline(account:Account,query:Record<string,string|string[]|undefined>):Promise<ElearningOutline>;
export function readElearningPageMetadata(account:Account,target:{view:ElearningMetadataRoute['view']|'category_title';id:number|null}):Promise<unknown>;
