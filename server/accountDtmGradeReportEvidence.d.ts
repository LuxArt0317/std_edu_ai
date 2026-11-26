import type {DtmGradeOverviewObservation,DtmGradeReportAccount} from './dtmGradeReport.js';
import type {VerificationEvidence} from './answerVerification.js';
export const dtmGradeReportEvidenceMaxBytes:16000;
export type DtmGradeReportEvidenceOptions={question?:string;route?:string;history?:{role:string;content:string}[];deadline?:number};
export type DtmGradeReportEvidenceResult={readState:'ok'|'empty'|'unavailable';reason:string|null;evidence:VerificationEvidence&{provenance:'local_demo'|'imported'}};
export function isDtmGradeReportEvidenceQuestion(question:unknown,route?:string,history?:{role:string;content:string}[]):boolean;
export function readDtmGradeReportEvidence(account:DtmGradeReportAccount,options?:DtmGradeReportEvidenceOptions,dependencies?:{
  loadOverview?:(account:DtmGradeReportAccount,options:{afterId?:string})=>Promise<unknown>;
  observeOverview?:(read:DtmGradeOverviewObservation)=>void;
  loadReport?:(account:DtmGradeReportAccount,options:{courseId:string})=>Promise<unknown>;
}):Promise<DtmGradeReportEvidenceResult>;
export function unavailableDtmGradeReportEvidence(reason:string):DtmGradeReportEvidenceResult;
