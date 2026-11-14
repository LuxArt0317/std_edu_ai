import type {VerificationEvidence} from './answerVerification.js';

export const tutorEvaluationEvidenceMaxBytes:26000;
export type TutorEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type TutorEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type TutorEvaluationEvidenceResult={
  readState:'ok'|'empty'|'unavailable';reason:string|null;
  evidence:VerificationEvidence&{id:'account:tutorEvaluation';provenance:'saved_local'};
};
export function unavailableTutorEvaluationEvidence(reason:string):TutorEvaluationEvidenceResult;
export function readTutorEvaluationEvidence(account:TutorEvidenceAccount,options?:TutorEvidenceOptions,dependencies?:{
  read?:(account:TutorEvidenceAccount)=>Promise<unknown>;
}):Promise<TutorEvaluationEvidenceResult>;
