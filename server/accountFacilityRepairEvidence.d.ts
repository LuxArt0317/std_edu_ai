import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationEvidence} from './answerVerification.js';
export {isFacilityRepairEvidenceQuestion,isForeignFacilityRepairQuestion} from './facilityRepairEvidenceIntent.js';
export const facilityRepairEvidenceMaxBytes:16000;
export type FacilityRepairEvidenceAccount=AffairsAccount&{requestDeadline?:number};
export type FacilityRepairEvidenceOptions={question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number};
export type FacilityRepairEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'saved_local'}};
export function unavailableFacilityRepairEvidence(reason?:string):FacilityRepairEvidenceResult;
export function readFacilityRepairEvidence(account:FacilityRepairEvidenceAccount,options?:FacilityRepairEvidenceOptions,dependencies?:{read?:(account:FacilityRepairEvidenceAccount,query:Record<string,string>)=>Promise<unknown>}):Promise<FacilityRepairEvidenceResult>;
export function readFacilityRepairCancellationContext(account:FacilityRepairEvidenceAccount,id:string,deadline:number):
  Promise<{id:string;version:number;status:'submitted'|'in_progress'|'resolved'|'cancelled';createdAt:string}|null>;
