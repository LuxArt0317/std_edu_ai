import type {AnnouncementEmailReceipt} from './announcementEmailContract.js';
import type {verifyAffairsToken} from './affairsWorkspace.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export function readAnnouncementEmail(account:Account,query:Record<string,string|string[]|undefined>):Promise<unknown>;
export function saveAnnouncementEmail(account:Account,payload:unknown):Promise<AnnouncementEmailReceipt>;
export function announcementEmailGuide(question:string,intent:'guide'|'status'):unknown;
