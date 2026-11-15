import type {ExplicitAccountAction} from './accountActionIntent.js';
import type {GraduationReviewAnswerSelection} from './graduationReview.js';
export class AffairsWorkspaceError extends Error { status:number; constructor(message:string,status?:number); }
export class AffairsWorkspaceReadUnavailableError extends AffairsWorkspaceError {}
export type AffairsAccount = {user:{id:string;email?:string};token:string;url:string;key:string};
export function schoolAffairsDatabaseConfiguration(): {url:string;key:string};
export function verifyAffairsToken(token:string):Promise<AffairsAccount&{user:{user_metadata?:Record<string,unknown>}}>;
export function requestAffairsRpc(account:AffairsAccount&{requestDeadline?:number},name:string,body:unknown,
  options?:{readJson?:(response:Response)=>Promise<unknown>;errorMessages?:Record<number,string>}):Promise<unknown>;
export function loadAffairsSnapshot(account:AffairsAccount,includeAdmin?:boolean,options?:{initialize?:boolean;deadline?:number;includeServiceRecords?:boolean}):Promise<Record<string,unknown>>;
export type AffairsCharge={id:string;label:string;amountDue:number;amountPaid:number;currency:string;dueOn:string|null;sourceMode:string;
  occurrenceOn:string|null;category:string|null;contactUnit:string|null;contactExtension:string|null;paymentUnit:string|null};
export function loadOwnAffairsCharges(account:AffairsAccount&{requestDeadline?:number},options?:{deadline?:number;observeRead?:(read:unknown)=>void;requireExactProjection?:boolean}):Promise<{
  checkedAt:string;profile:{userId:string};studentRecordFound:boolean;charges:AffairsCharge[];
}>;
export function loadOwnAcademicGrades(account:AffairsAccount,view:string,options?:{deadline?:number}):Promise<Record<string,unknown>>;
export function loadOwnGraduationReviewAnswer(account:AffairsAccount,selection:GraduationReviewAnswerSelection,options?:{deadline?:number}):Promise<Record<string,unknown>>;
export function loadOwnAffairsActionContext(account:AffairsAccount,selection:ExplicitAccountAction,options?:{deadline?:number;onRead?:(tool:string,status:'running'|'complete'|'unavailable')=>void}):Promise<Record<string,unknown>>;
export function executeAffairsAction(account:AffairsAccount,kind:string,payload:unknown,requestId?:string):Promise<Record<string,unknown>>;
export function manageAffairsRecord(account:AffairsAccount,kind:string,payload:unknown):Promise<Record<string,unknown>>;

export type OwnServiceNote={id:string;serviceKey:string;recordType:'note';title:string;notes:string;status:'draft'|'filed'|'withdrawn';updatedAt:string;userId:string};
export function loadOwnServiceNotes(account:AffairsAccount&{requestDeadline?:number},keys:string[],options?:{deadline?:number}):Promise<OwnServiceNote[]>;
