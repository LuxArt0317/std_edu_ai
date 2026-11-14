export class AffairsWorkspaceError extends Error { status:number; constructor(message:string,status?:number); }
export type AffairsAccount = {user:{id:string;email?:string};token:string;url:string;key:string};
export function schoolAffairsDatabaseConfiguration(): {url:string;key:string};
export function verifyAffairsToken(token:string):Promise<AffairsAccount>;
export function loadAffairsSnapshot(account:AffairsAccount,includeAdmin?:boolean,options?:{initialize?:boolean;deadline?:number;includeServiceRecords?:boolean}):Promise<Record<string,unknown>>;
export type AffairsCharge={id:string;label:string;amountDue:number;amountPaid:number;currency:string;dueOn:string|null;sourceMode:string;
  occurrenceOn:string|null;category:string|null;contactUnit:string|null;contactExtension:string|null;paymentUnit:string|null};
export function loadOwnAffairsCharges(account:AffairsAccount&{requestDeadline?:number},options?:{deadline?:number}):Promise<{
  checkedAt:string;profile:{userId:string};studentRecordFound:boolean;charges:AffairsCharge[];
}>;
export function executeAffairsAction(account:AffairsAccount,kind:string,payload:unknown,requestId?:string):Promise<Record<string,unknown>>;
export function manageAffairsRecord(account:AffairsAccount,kind:string,payload:unknown):Promise<Record<string,unknown>>;

export type OwnServiceNote={id:string;serviceKey:string;recordType:'note';title:string;notes:string;status:'draft'|'filed'|'withdrawn';updatedAt:string;userId:string};
export function loadOwnServiceNotes(account:AffairsAccount&{requestDeadline?:number},keys:string[],options?:{deadline?:number}):Promise<OwnServiceNote[]>;
