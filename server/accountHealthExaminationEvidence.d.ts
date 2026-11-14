import type {VerificationEvidence} from './answerVerification.js';
export {isHealthExaminationEvidenceQuestion} from './healthExaminationEvidenceIntent.js';
export const healthExaminationEvidenceMaxBytes:12000;
export type HealthExaminationEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type HealthExaminationEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type HealthExaminationEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:healthExaminations';provenance:'saved_local'}};
export function unavailableHealthExaminationEvidence(reason:string):HealthExaminationEvidenceResult;
export function readHealthExaminationEvidence(account:HealthExaminationEvidenceAccount,options?:HealthExaminationEvidenceOptions,dependencies?:{
  read?:(account:HealthExaminationEvidenceAccount,query:{scope:'health-examinations';page:string})=>Promise<unknown>;
}):Promise<HealthExaminationEvidenceResult>;
