export const creditTransferPath:'/school-affairs/services/7-2';
export const creditTransferScope:'credit-transfer';
export const creditTransferSave:'save_credit_transfer';
export const creditTransferSubmit:'submit_credit_transfer';
export const creditTransferReview:'review_credit_transfer';
export const creditTransferReasons:{external_transfer:string;department_transfer:string;returning_transfer:string;minor:string;double_major:string;freshman:string};
export const creditTransferDecisions:{transferred:string;waived:string;rejected:string};
export type CreditTransferReason=keyof typeof creditTransferReasons;
export type CreditTransferDecision=keyof typeof creditTransferDecisions;
export type CreditTransferCourse={
  previous_title:string;previous_credits:number;requested_title:string;requested_credits:number;course_kind:'required'|'elective';
};
export type CreditTransferRow={
  id:string;user_id:string;reason:CreditTransferReason;previous_school:string;courses:CreditTransferCourse[];
  status:'draft'|'submitted'|'reviewed';decisions:CreditTransferDecision[]|null;version:number;
  submitted_at:string|null;reviewed_at:string|null;
};
export type CreditTransferBase={id:string;expected_version:number;request_id:string};
export type CreditTransferWrite=
  | {kind:typeof creditTransferSave;payload:CreditTransferBase & Pick<CreditTransferRow,'reason'|'previous_school'|'courses'>}
  | {kind:typeof creditTransferSubmit;payload:CreditTransferBase}
  | {kind:typeof creditTransferReview;payload:CreditTransferBase & {decisions:CreditTransferDecision[]}};
export function validCreditTransferAction(kind:unknown,payload:unknown):boolean;
export function parseCreditTransferRow(row:unknown,userId:string):CreditTransferRow;
export function parseCreditTransferRows(rows:unknown,userId:string):CreditTransferRow[];
export function creditTransferQuestion(question:string):boolean;
