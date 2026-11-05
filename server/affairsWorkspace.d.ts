export class AffairsWorkspaceError extends Error { status:number; constructor(message:string,status?:number); }
export type AffairsAccount = {user:{id:string;email?:string};token:string;url:string;key:string};
export function verifyAffairsToken(token:string):Promise<AffairsAccount>;
export function loadAffairsSnapshot(account:AffairsAccount,includeAdmin?:boolean):Promise<Record<string,unknown>>;
export function executeAffairsAction(account:AffairsAccount,kind:string,payload:unknown):Promise<Record<string,unknown>>;
