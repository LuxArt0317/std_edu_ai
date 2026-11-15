import type {AffairsAccount} from './affairsWorkspace.js';
import type {ClubEquipmentPlan} from './clubEquipmentIntent.js';
import type {VerificationProgress} from './answerVerification.js';
export function answerClubEquipment(options:{account:AffairsAccount;question:string;route:string;history:Array<{role:string;content:string}>;
  plan:ClubEquipmentPlan;deadline:number;onProgress?:(step:VerificationProgress)=>void}):Promise<Record<string,unknown>>;

export function readClubEquipmentCancellationContext(account:AffairsAccount,deadline:number):Promise<{today:string;capped:boolean;
  rows:Array<{id:string;club:string;status:string;pickup:string;version:number;items:string[]}>}>;
