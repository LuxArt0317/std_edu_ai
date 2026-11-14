export const tutorEvaluationKind: 'submit_tutor_evaluation';
export const tutorEvaluationMaxBytes: number;
export const tutorEvaluationEvidenceMaxBytes:26000;
export {tutorEvaluationPath} from '../src/features/public/affairs/studentServices.js';
export type TutorEvaluationSubmission = {request_id:string;ratings:number[];comment:string};
export type TutorEvaluationData = {
  userId:string;
  student:{number:string;name:string;department:string;year:number}|null;
  evaluation:{ratings:number[];comment:string;submittedAt:string}|null;
};
export type TutorEvaluationReceipt = {userId:string;requestId:string;submittedAt:string};
export function validTutorEvaluation(value:unknown):value is TutorEvaluationSubmission;
export function parseTutorEvaluation(value:unknown,userId:string):TutorEvaluationData;
export function parseTutorEvaluationReceipt(value:unknown,userId:string,requestId:string):TutorEvaluationReceipt;
