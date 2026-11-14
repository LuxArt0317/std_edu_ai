import type { verifyAffairsToken } from './affairsWorkspace.js';
type Account=Awaited<ReturnType<typeof verifyAffairsToken>>&{requestDeadline?:number};
export const clubDocumentScope:'club-activity-documents';
export const clubDocumentLimit:2097152;
export const clubDocumentJsonLimit:2797200;
export const clubDocumentActions:readonly string[];
export function readClubDocuments(account:Account,query:Record<string,string|string[]|undefined>):Promise<
  {filename:string;bytes:Buffer}|{userId:string;applicationId:string;applicationVersion:number;rows:unknown[]}
>;
export function writeClubDocument(account:Account,kind:string,payload:unknown):Promise<unknown>;
