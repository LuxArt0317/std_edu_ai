import type {VerificationEvidence} from './answerVerification.js';
export {isDormitoryConductEvidenceQuestion} from './dormitoryConductEvidenceIntent.js';
export const dormitoryConductEvidenceMaxBytes:6000;
export type DormitoryConductEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type DormitoryConductEvidenceOptions={question?:string;route?:string;history?:Array<{role:string;content:string}>;deadline?:number};
export type DormitoryConductEvidenceResult={readState:'ok'|'unavailable';reason:string|null;evidence:VerificationEvidence&{id:'account:dormitoryConduct';provenance:'local_demo'}};
export function unavailableDormitoryConductEvidence(reason:string):DormitoryConductEvidenceResult;
export function readDormitoryConductEvidence(account:DormitoryConductEvidenceAccount,options?:DormitoryConductEvidenceOptions,dependencies?:{
  load?:(account:DormitoryConductEvidenceAccount)=>Promise<unknown>;
}):Promise<DormitoryConductEvidenceResult>;
